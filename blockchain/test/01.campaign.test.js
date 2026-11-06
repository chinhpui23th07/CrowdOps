const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { CampaignState, ONE_DAY, eth, campaignInput, deployFixture, createCampaign } = require("./helpers");

describe("CrowdOps - tạo chiến dịch, góp tiền, chốt kết quả", function () {
  describe("Triển khai", function () {
    it("CrowdOps là minter duy nhất của NFT và factory token", async function () {
      const { crowdOps, diamondNFT } = await loadFixture(deployFixture);
      const factory = await ethers.getContractAt("CampaignTokenFactory", await crowdOps.tokenFactory());
      expect(await diamondNFT.minter()).to.equal(await crowdOps.getAddress());
      expect(await factory.crowdOps()).to.equal(await crowdOps.getAddress());
    });

    it("từ chối deploy token từ factory nếu không phải CrowdOps", async function () {
      const { crowdOps, outsider } = await loadFixture(deployFixture);
      const factory = await ethers.getContractAt("CampaignTokenFactory", await crowdOps.tokenFactory());
      await expect(factory.connect(outsider).deploy("X", "X", 1)).to.be.revertedWithCustomError(factory, "OnlyCrowdOps");
    });

    it("từ chối ETH gửi thẳng vào contract", async function () {
      const { crowdOps, alice } = await loadFixture(deployFixture);
      await expect(
        alice.sendTransaction({ to: await crowdOps.getAddress(), value: eth(1) })
      ).to.be.revertedWithCustomError(crowdOps, "DirectPaymentNotAllowed");
    });
  });

  describe("createCampaign", function () {
    it("lưu đủ thông tin, CID và tạo token riêng cho chiến dịch", async function () {
      const { crowdOps, creator } = await loadFixture(deployFixture);
      const input = campaignInput();
      await expect(crowdOps.connect(creator).createCampaign(input))
        .to.emit(crowdOps, "CampaignCreated")
        .withArgs(1n, creator.address, anyValue, input.goal, anyValue, input.title);

      const c = await crowdOps.getCampaign(1);
      expect(c.creator).to.equal(creator.address);
      expect(c.state).to.equal(CampaignState.Fundraising);
      expect(c.goal).to.equal(input.goal);
      expect(c.deadline - c.createdAt).to.equal(BigInt(input.durationSeconds));
      expect(c.proposalCID).to.equal(input.proposalCID);
      expect(c.mediaCID).to.equal(input.mediaCID);
      expect(c.nftMetadataCID).to.equal(input.nftMetadataCID);

      const token = await ethers.getContractAt("CampaignToken", c.token);
      expect(await token.name()).to.equal("Crowd Ops Campaign #1");
      expect(await token.symbol()).to.equal("COP1");
      expect(await token.campaignId()).to.equal(1n);
      expect(await token.minter()).to.equal(await crowdOps.getAddress());
      expect(await token.transfersEnabled()).to.equal(false);
    });

    it("mỗi chiến dịch có token khác nhau", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const first = await createCampaign(crowdOps, creator);
      const second = await createCampaign(crowdOps, alice);
      expect(await first.token.getAddress()).to.not.equal(await second.token.getAddress());
      expect(await second.token.symbol()).to.equal("COP2");
    });

    const invalidCases = [
      ["tiêu đề rỗng", { title: "" }, "title"],
      ["mục tiêu = 0", { goal: 0n }, "goal"],
      ["thời hạn quá ngắn", { durationSeconds: 59 }, "duration"],
      ["thời hạn quá dài", { durationSeconds: 91 * ONE_DAY }, "duration"],
      ["ngưỡng Kim cương = 0", { diamondThreshold: 0n }, "diamondThreshold"],
      ["ngưỡng Kim cương > mục tiêu", { diamondThreshold: eth(11) }, "diamondThreshold"],
      ["thiếu CID proposal", { proposalCID: "" }, "proposalCID"],
      ["thiếu CID metadata NFT", { nftMetadataCID: "" }, "nftMetadataCID"],
    ];
    for (const [name, overrides, reason] of invalidCases) {
      it(`từ chối khi ${name}`, async function () {
        const { crowdOps, creator } = await loadFixture(deployFixture);
        await expect(crowdOps.connect(creator).createCampaign(campaignInput(overrides)))
          .to.be.revertedWithCustomError(crowdOps, "InvalidInput")
          .withArgs(reason);
      });
    }
  });

  describe("contribute", function () {
    it("ghi nhận ETH, cấp token 1:1 và token có quyền biểu quyết ngay (tự delegate)", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId, token } = await createCampaign(crowdOps, creator);

      const tx = crowdOps.connect(alice).contribute(campaignId, { value: eth(2) });
      await expect(tx).to.emit(crowdOps, "Contributed").withArgs(campaignId, alice.address, eth(2), eth(2));
      await expect(tx).to.changeEtherBalances([alice, crowdOps], [-eth(2), eth(2)]);

      expect(await crowdOps.contributions(campaignId, alice.address)).to.equal(eth(2));
      expect(await token.balanceOf(alice.address)).to.equal(eth(2));
      expect(await token.delegates(alice.address)).to.equal(alice.address);
      expect(await token.getVotes(alice.address)).to.equal(eth(2));
    });

    it("đếm backer duy nhất và cộng dồn nhiều lần góp", async function () {
      const { crowdOps, creator, alice, bob } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(1) });
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(1) });
      await crowdOps.connect(bob).contribute(campaignId, { value: eth(1) });
      const c = await crowdOps.getCampaign(campaignId);
      expect(c.backerCount).to.equal(2n);
      expect(c.totalRaised).to.equal(eth(3));
    });

    it("cho phép góp vượt mục tiêu trước hạn chót", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(12) });
      expect((await crowdOps.getCampaign(campaignId)).totalRaised).to.equal(eth(12));
    });

    it("từ chối góp 0 ETH", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await expect(crowdOps.connect(alice).contribute(campaignId, { value: 0 })).to.be.revertedWithCustomError(
        crowdOps,
        "ZeroContribution"
      );
    });

    it("từ chối góp sau hạn chót", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await time.increase(7 * ONE_DAY + 1);
      await expect(
        crowdOps.connect(alice).contribute(campaignId, { value: eth(1) })
      ).to.be.revertedWithCustomError(crowdOps, "DeadlinePassed");
    });

    it("từ chối chủ dự án tự góp vào chiến dịch của mình", async function () {
      const { crowdOps, creator } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await expect(
        crowdOps.connect(creator).contribute(campaignId, { value: eth(1) })
      ).to.be.revertedWithCustomError(crowdOps, "CreatorCannotParticipate");
    });

    it("từ chối chiến dịch không tồn tại", async function () {
      const { crowdOps, alice } = await loadFixture(deployFixture);
      await expect(crowdOps.connect(alice).contribute(0, { value: eth(1) })).to.be.revertedWithCustomError(
        crowdOps,
        "CampaignNotFound"
      );
      await expect(crowdOps.connect(alice).contribute(5, { value: eth(1) })).to.be.revertedWithCustomError(
        crowdOps,
        "CampaignNotFound"
      );
    });

    it("token KHÔNG chuyển nhượng được trong giai đoạn huy động", async function () {
      const { crowdOps, creator, alice, bob } = await loadFixture(deployFixture);
      const { campaignId, token } = await createCampaign(crowdOps, creator);
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(1) });
      await expect(token.connect(alice).transfer(bob.address, eth(1))).to.be.revertedWithCustomError(
        token,
        "TransfersDisabled"
      );
    });
  });

  describe("finalize", function () {
    it("từ chối chốt trước hạn chót (kể cả khi đã đạt mục tiêu)", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(10) });
      await expect(crowdOps.finalize(campaignId)).to.be.revertedWithCustomError(crowdOps, "DeadlineNotReached");
    });

    it("đạt mục tiêu => Thành công và bật chuyển nhượng token", async function () {
      const { crowdOps, creator, alice, outsider } = await loadFixture(deployFixture);
      const { campaignId, token } = await createCampaign(crowdOps, creator);
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(10) });
      await time.increase(7 * ONE_DAY + 1);
      await expect(crowdOps.connect(outsider).finalize(campaignId))
        .to.emit(crowdOps, "CampaignFinalized")
        .withArgs(campaignId, CampaignState.Successful, eth(10));
      expect((await crowdOps.getCampaign(campaignId)).state).to.equal(CampaignState.Successful);
      expect(await token.transfersEnabled()).to.equal(true);
    });

    it("không đạt mục tiêu => Thất bại, token vẫn khóa chuyển nhượng", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId, token } = await createCampaign(crowdOps, creator);
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(9) });
      await time.increase(7 * ONE_DAY + 1);
      await crowdOps.finalize(campaignId);
      expect((await crowdOps.getCampaign(campaignId)).state).to.equal(CampaignState.Failed);
      expect(await token.transfersEnabled()).to.equal(false);
    });

    it("không chốt được hai lần", async function () {
      const { crowdOps, creator } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await time.increase(7 * ONE_DAY + 1);
      await crowdOps.finalize(campaignId);
      await expect(crowdOps.finalize(campaignId))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Failed);
    });

    it("không góp được nữa sau khi đã chốt", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await time.increase(7 * ONE_DAY + 1);
      await crowdOps.finalize(campaignId);
      await expect(crowdOps.connect(alice).contribute(campaignId, { value: eth(1) }))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Failed);
    });
  });
});
