const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  CampaignState,
  eth,
  deployFixture,
  createCampaign,
  successfulCampaignFixture,
  failedCampaignFixture,
} = require("./helpers");

describe("Token quản trị, NFT Kim cương, tài liệu IPFS", function () {
  describe("CampaignToken - quyền mint/burn", function () {
    it("chỉ CrowdOps được mint/burn/bật chuyển nhượng", async function () {
      const { crowdOps, creator, outsider } = await loadFixture(deployFixture);
      const { token } = await createCampaign(crowdOps, creator);
      await expect(token.connect(creator).mint(creator.address, 1)).to.be.revertedWithCustomError(token, "OnlyMinter");
      await expect(token.connect(outsider).burn(outsider.address, 1)).to.be.revertedWithCustomError(
        token,
        "OnlyMinter"
      );
      await expect(token.connect(creator).enableTransfers()).to.be.revertedWithCustomError(token, "OnlyMinter");
    });

    it("sau khi thành công token chuyển nhượng được", async function () {
      const { token, alice, dave } = await loadFixture(successfulCampaignFixture);
      await expect(token.connect(alice).transfer(dave.address, eth(1))).to.changeTokenBalances(
        token,
        [alice, dave],
        [-eth(1), eth(1)]
      );
    });

    it("chiến dịch thất bại: token vẫn khóa và bị burn khi hoàn tiền", async function () {
      const { crowdOps, token, alice, dave, campaignId } = await loadFixture(failedCampaignFixture);
      await expect(token.connect(alice).transfer(dave.address, eth(1))).to.be.revertedWithCustomError(
        token,
        "TransfersDisabled"
      );
      await crowdOps.connect(alice).refund(campaignId);
      expect(await token.balanceOf(alice.address)).to.equal(0n);
      expect(await token.getVotes(alice.address)).to.equal(0n);
    });
  });

  describe("claimDiamondNFT", function () {
    it("người góp >= ngưỡng nhận NFT với metadata IPFS của chiến dịch", async function () {
      const { crowdOps, diamondNFT, alice, campaignId } = await loadFixture(successfulCampaignFixture);
      expect(await crowdOps.isDiamondEligible(campaignId, alice.address)).to.equal(true);
      await expect(crowdOps.connect(alice).claimDiamondNFT(campaignId))
        .to.emit(crowdOps, "DiamondClaimed")
        .withArgs(campaignId, alice.address, 1n);
      expect(await diamondNFT.ownerOf(1)).to.equal(alice.address);
      expect(await diamondNFT.campaignOf(1)).to.equal(campaignId);
      expect(await diamondNFT.tokenURI(1)).to.equal("ipfs://bafybeinftmetadata");
      expect(await diamondNFT.hasDiamond(campaignId, alice.address)).to.equal(true);
    });

    it("đúng bằng ngưỡng cũng đủ điều kiện (bob góp đúng 3 ETH)", async function () {
      const { crowdOps, bob, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(crowdOps.connect(bob).claimDiamondNFT(campaignId)).to.not.be.reverted;
    });

    it("không mint trùng", async function () {
      const { crowdOps, alice, campaignId } = await loadFixture(successfulCampaignFixture);
      await crowdOps.connect(alice).claimDiamondNFT(campaignId);
      await expect(crowdOps.connect(alice).claimDiamondNFT(campaignId)).to.be.revertedWithCustomError(
        crowdOps,
        "DiamondAlreadyClaimed"
      );
    });

    it("dưới ngưỡng không được nhận", async function () {
      const { crowdOps, carol, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(crowdOps.connect(carol).claimDiamondNFT(campaignId))
        .to.be.revertedWithCustomError(crowdOps, "NotDiamondBacker")
        .withArgs(eth(2), eth(3));
    });

    it("không nhận NFT khi chiến dịch thất bại hoặc chưa chốt", async function () {
      const failed = await loadFixture(failedCampaignFixture);
      await expect(failed.crowdOps.connect(failed.alice).claimDiamondNFT(failed.campaignId))
        .to.be.revertedWithCustomError(failed.crowdOps, "WrongState")
        .withArgs(CampaignState.Failed);

      const { crowdOps, creator, alice } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await crowdOps.connect(alice).contribute(campaignId, { value: eth(5) });
      await expect(crowdOps.connect(alice).claimDiamondNFT(campaignId))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Fundraising);
    });

    it("không ai mint NFT trực tiếp ngoài CrowdOps", async function () {
      const { diamondNFT, outsider } = await loadFixture(deployFixture);
      await expect(diamondNFT.connect(outsider).mint(outsider.address, 1, "x")).to.be.revertedWithCustomError(
        diamondNFT,
        "OnlyMinter"
      );
    });
  });

  describe("addDocument", function () {
    it("chủ dự án thêm tài liệu công khai và tài liệu mã hóa", async function () {
      const { crowdOps, creator, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(crowdOps.connect(creator).addDocument(campaignId, "Báo cáo tiến độ", "bafyreport", false))
        .to.emit(crowdOps, "DocumentAdded")
        .withArgs(campaignId, 0n, "Báo cáo tiến độ", "bafyreport", false);
      await crowdOps.connect(creator).addDocument(campaignId, "Hợp đồng nhà cung cấp", "bafyencrypted", true);
      const docs = await crowdOps.getDocuments(campaignId);
      expect(docs.length).to.equal(2);
      expect(docs[1].encrypted).to.equal(true);
    });

    it("người khác không thêm được; thiếu CID bị từ chối", async function () {
      const { crowdOps, creator, alice, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(crowdOps.connect(alice).addDocument(campaignId, "x", "bafy", false)).to.be.revertedWithCustomError(
        crowdOps,
        "NotCreator"
      );
      await expect(crowdOps.connect(creator).addDocument(campaignId, "x", "", false))
        .to.be.revertedWithCustomError(crowdOps, "InvalidInput")
        .withArgs("cid");
    });
  });
});
