const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  CampaignState,
  RequestStatus,
  ONE_DAY,
  eth,
  requestInput,
  deployFixture,
  createCampaign,
  successfulCampaignFixture,
  failedCampaignFixture,
} = require("./helpers");

// Fixture chung: alice 5 ETH (50%), bob 3 ETH (30%), carol 2 ETH (20%) => tổng quyền = 10 token.
const REASON = "Chủ dự án không cập nhật tiến độ sau 2 tháng";
const VOTING = 3 * ONE_DAY;

async function openProposalFixture() {
  const base = await successfulCampaignFixture();
  const { crowdOps, bob, campaignId } = base;
  await crowdOps.connect(bob).proposeDissolution(campaignId, REASON, VOTING);
  return { ...base, proposalId: 0n };
}

/// Đã giải ngân 4 ETH cho vendor rồi mới giải thể => còn 6 ETH để chia lại.
async function dissolvedAfterSpendingFixture() {
  const base = await successfulCampaignFixture();
  const { crowdOps, creator, alice, bob, vendor, campaignId } = base;
  await crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address }));
  await crowdOps.connect(alice).approveRequest(campaignId, 0);
  await crowdOps.connect(bob).approveRequest(campaignId, 0);
  await crowdOps.connect(creator).executeSpending(campaignId, 0);
  await crowdOps.connect(bob).proposeDissolution(campaignId, REASON, VOTING);
  await crowdOps.connect(alice).voteDissolution(campaignId, 0, true);
  await crowdOps.connect(bob).voteDissolution(campaignId, 0, true);
  return base;
}

describe("CrowdOps - giải thể quỹ khi chủ dự án bỏ đi", function () {
  describe("proposeDissolution", function () {
    it("người giữ token tạo đề xuất, chụp snapshot và tổng quyền", async function () {
      const { crowdOps, bob, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(crowdOps.connect(bob).proposeDissolution(campaignId, REASON, VOTING)).to.emit(
        crowdOps,
        "DissolutionProposed"
      );
      const [p, status] = await crowdOps.getDissolution(campaignId, 0);
      expect(status).to.equal(RequestStatus.Voting);
      expect(p.proposer).to.equal(bob.address);
      expect(p.reason).to.equal(REASON);
      expect(p.totalVotingPower).to.equal(eth(10));
      expect(p.snapshotBlock).to.equal(BigInt(await ethers.provider.getBlockNumber()) - 1n);
      expect(await crowdOps.getDissolutionCount(campaignId)).to.equal(1n);
    });

    it("chủ dự án và người không giữ token không được đề xuất", async function () {
      const { crowdOps, creator, outsider, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(
        crowdOps.connect(creator).proposeDissolution(campaignId, REASON, VOTING)
      ).to.be.revertedWithCustomError(crowdOps, "CreatorCannotParticipate");
      await expect(
        crowdOps.connect(outsider).proposeDissolution(campaignId, REASON, VOTING)
      ).to.be.revertedWithCustomError(crowdOps, "NoVotingPower");
    });

    it("chỉ đề xuất được khi chiến dịch Thành công hoặc Đang triển khai", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(1) });
      await expect(crowdOps.connect(alice).proposeDissolution(campaignId, REASON, VOTING))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Fundraising);

      const failed = await loadFixture(failedCampaignFixture);
      await expect(failed.crowdOps.connect(failed.alice).proposeDissolution(failed.campaignId, REASON, VOTING))
        .to.be.revertedWithCustomError(failed.crowdOps, "WrongState")
        .withArgs(CampaignState.Failed);
    });

    it("kiểm tra lý do và thời gian bỏ phiếu", async function () {
      const { crowdOps, bob, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(crowdOps.connect(bob).proposeDissolution(campaignId, "", VOTING))
        .to.be.revertedWithCustomError(crowdOps, "InvalidInput")
        .withArgs("reason");
      await expect(crowdOps.connect(bob).proposeDissolution(campaignId, REASON, 59))
        .to.be.revertedWithCustomError(crowdOps, "InvalidInput")
        .withArgs("votingDuration");
      await expect(crowdOps.connect(bob).proposeDissolution(campaignId, REASON, 31 * ONE_DAY))
        .to.be.revertedWithCustomError(crowdOps, "InvalidInput")
        .withArgs("votingDuration");
    });

    it("chỉ một đề xuất mở; đề xuất cũ kết thúc thì tạo được đề xuất mới", async function () {
      const { crowdOps, alice, carol, campaignId } = await loadFixture(openProposalFixture);
      await expect(
        crowdOps.connect(carol).proposeDissolution(campaignId, REASON, VOTING)
      ).to.be.revertedWithCustomError(crowdOps, "OpenProposalExists");

      await time.increase(VOTING + 1);
      expect((await crowdOps.getDissolution(campaignId, 0)).status).to.equal(RequestStatus.Rejected);
      await expect(crowdOps.connect(alice).proposeDissolution(campaignId, REASON, VOTING)).to.emit(
        crowdOps,
        "DissolutionProposed"
      );
      expect(await crowdOps.getDissolutionCount(campaignId)).to.equal(2n);
    });

    it("đề xuất không tồn tại thì báo lỗi", async function () {
      const { crowdOps, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(crowdOps.getDissolution(campaignId, 0)).to.be.revertedWithCustomError(crowdOps, "ProposalNotFound");
    });
  });

  describe("voteDissolution", function () {
    it("đúng 50% tổng quyền là CHƯA đủ, phải vượt 50%", async function () {
      const { crowdOps, alice, campaignId, proposalId } = await loadFixture(openProposalFixture);
      await crowdOps.connect(alice).voteDissolution(campaignId, proposalId, true); // 5/10 = 50%
      expect((await crowdOps.getDissolution(campaignId, proposalId)).status).to.equal(RequestStatus.Voting);
      expect((await crowdOps.getCampaign(campaignId)).state).to.equal(CampaignState.Successful);
    });

    it("vượt 50% thì chiến dịch chuyển sang Đã giải thể ngay", async function () {
      const { crowdOps, alice, carol, campaignId, proposalId } = await loadFixture(openProposalFixture);
      await crowdOps.connect(alice).voteDissolution(campaignId, proposalId, true);
      await expect(crowdOps.connect(carol).voteDissolution(campaignId, proposalId, true))
        .to.emit(crowdOps, "CampaignDissolved")
        .withArgs(campaignId, proposalId, eth(10));
      const [p, status] = await crowdOps.getDissolution(campaignId, proposalId);
      expect(status).to.equal(RequestStatus.Approved);
      expect(p.supportVotes).to.equal(eth(7));
      expect(p.supportCount).to.equal(2n);
      expect((await crowdOps.getCampaign(campaignId)).state).to.equal(CampaignState.Dissolved);
    });

    it("phiếu phản đối >= 50% thì đề xuất bị bác, quỹ vẫn hoạt động", async function () {
      const { crowdOps, alice, campaignId, proposalId } = await loadFixture(openProposalFixture);
      await crowdOps.connect(alice).voteDissolution(campaignId, proposalId, false);
      const [p, status] = await crowdOps.getDissolution(campaignId, proposalId);
      expect(status).to.equal(RequestStatus.Rejected);
      expect(p.opposeVotes).to.equal(eth(5));
      expect((await crowdOps.getCampaign(campaignId)).state).to.equal(CampaignState.Successful);
    });

    it("từ chối: chủ dự án bỏ phiếu, bỏ phiếu hai lần, người ngoài, sau hạn", async function () {
      const { crowdOps, creator, alice, bob, outsider, campaignId, proposalId } = await loadFixture(openProposalFixture);
      await expect(
        crowdOps.connect(creator).voteDissolution(campaignId, proposalId, false)
      ).to.be.revertedWithCustomError(crowdOps, "CreatorCannotParticipate");

      await crowdOps.connect(bob).voteDissolution(campaignId, proposalId, true);
      await expect(
        crowdOps.connect(bob).voteDissolution(campaignId, proposalId, true)
      ).to.be.revertedWithCustomError(crowdOps, "AlreadyVoted");

      await expect(
        crowdOps.connect(outsider).voteDissolution(campaignId, proposalId, true)
      ).to.be.revertedWithCustomError(crowdOps, "NoVotingPower");

      await time.increase(VOTING + 1);
      await expect(
        crowdOps.connect(alice).voteDissolution(campaignId, proposalId, true)
      ).to.be.revertedWithCustomError(crowdOps, "VotingClosed");
    });

    it("token nhận SAU snapshot không có phiếu (chống chuyển token bỏ phiếu hai lần)", async function () {
      const { crowdOps, token, alice, dave, campaignId, proposalId } = await loadFixture(openProposalFixture);
      await crowdOps.connect(alice).voteDissolution(campaignId, proposalId, true);
      await token.connect(alice).transfer(dave.address, eth(5));
      await expect(
        crowdOps.connect(dave).voteDissolution(campaignId, proposalId, true)
      ).to.be.revertedWithCustomError(crowdOps, "NoVotingPower");
      expect(await crowdOps.dissolutionVotingPowerFor(campaignId, proposalId, dave.address)).to.equal(0n);
    });
  });

  describe("sau khi giải thể", function () {
    it("chủ dự án không thể tạo yêu cầu chi hay giải ngân yêu cầu đã duyệt trước đó", async function () {
      const { crowdOps, creator, alice, bob, vendor, campaignId } = await loadFixture(successfulCampaignFixture);
      await crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address }));
      await crowdOps.connect(alice).approveRequest(campaignId, 0);
      await crowdOps.connect(bob).approveRequest(campaignId, 0);
      expect(await crowdOps.getRequestStatus(campaignId, 0)).to.equal(RequestStatus.Approved);

      await crowdOps.connect(bob).proposeDissolution(campaignId, REASON, VOTING);
      await crowdOps.connect(alice).voteDissolution(campaignId, 0, true);
      await crowdOps.connect(bob).voteDissolution(campaignId, 0, true);

      await expect(crowdOps.connect(creator).executeSpending(campaignId, 0))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Dissolved);
      await expect(crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address })))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Dissolved);
    });

    it("mỗi người nhận phần còn lại theo tỷ lệ token, contract về đúng 0", async function () {
      const { crowdOps, token, alice, bob, carol, campaignId } = await loadFixture(dissolvedAfterSpendingFixture);
      expect(await crowdOps.availableBalance(campaignId)).to.equal(eth(6));

      // 6 ETH chia theo 5 : 3 : 2
      await expect(crowdOps.connect(alice).claimDissolutionRefund(campaignId)).to.changeEtherBalances(
        [alice, crowdOps],
        [eth(3), -eth(3)]
      );
      await expect(crowdOps.connect(bob).claimDissolutionRefund(campaignId))
        .to.emit(crowdOps, "DissolutionRefunded")
        .withArgs(campaignId, bob.address, eth(3), eth("1.8"));
      await expect(crowdOps.connect(carol).claimDissolutionRefund(campaignId)).to.changeEtherBalance(carol, eth("1.2"));

      expect(await ethers.provider.getBalance(await crowdOps.getAddress())).to.equal(0n);
      expect(await crowdOps.availableBalance(campaignId)).to.equal(0n);
      expect(await token.totalSupply()).to.equal(0n);
    });

    it("người mua lại token sau khi chiến dịch thành công cũng được chia theo tỷ lệ", async function () {
      const { crowdOps, token, carol, dave, campaignId } = await loadFixture(dissolvedAfterSpendingFixture);
      await token.connect(carol).transfer(dave.address, eth(1));
      await expect(crowdOps.connect(dave).claimDissolutionRefund(campaignId)).to.changeEtherBalance(dave, eth("0.6"));
      await expect(crowdOps.connect(carol).claimDissolutionRefund(campaignId)).to.changeEtherBalance(carol, eth("0.6"));
    });

    it("không rút hai lần; người không giữ token không rút được", async function () {
      const { crowdOps, alice, outsider, campaignId } = await loadFixture(dissolvedAfterSpendingFixture);
      await crowdOps.connect(alice).claimDissolutionRefund(campaignId);
      await expect(crowdOps.connect(alice).claimDissolutionRefund(campaignId)).to.be.revertedWithCustomError(
        crowdOps,
        "NothingToRefund"
      );
      await expect(crowdOps.connect(outsider).claimDissolutionRefund(campaignId)).to.be.revertedWithCustomError(
        crowdOps,
        "NothingToRefund"
      );
    });

    it("chưa giải thể thì không rút được", async function () {
      const { crowdOps, alice, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(crowdOps.connect(alice).claimDissolutionRefund(campaignId))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Successful);
    });

    it("không thể bỏ phiếu hay đề xuất tiếp khi đã giải thể", async function () {
      const { crowdOps, carol, campaignId } = await loadFixture(dissolvedAfterSpendingFixture);
      await expect(crowdOps.connect(carol).voteDissolution(campaignId, 0, true))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Dissolved);
      await expect(crowdOps.connect(carol).proposeDissolution(campaignId, REASON, VOTING))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Dissolved);
    });

    it("chặn re-entrancy: contract tấn công chỉ rút được đúng một lần", async function () {
      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator, { goal: eth(4), diamondThreshold: eth(1) });
      const attacker = await ethers.deployContract("ReentrancyAttacker", [await crowdOps.getAddress()]);
      await attacker.contribute(campaignId, { value: eth(3) });
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(1) });
      await time.increase(7 * ONE_DAY + 1);
      await crowdOps.finalize(campaignId);

      await crowdOps.connect(alice).proposeDissolution(campaignId, REASON, VOTING);
      await attacker.voteDissolution(0); // 3/4 = 75% => giải thể

      await expect(attacker.attackDissolutionClaim()).to.changeEtherBalance(attacker, eth(3));
      expect(await attacker.reentryAttempts()).to.equal(1n);
      expect(await attacker.reentrySucceeded()).to.equal(0n);
      // Phần của alice vẫn còn nguyên trong quỹ.
      expect(await crowdOps.availableBalance(campaignId)).to.equal(eth(1));
    });
  });
});
