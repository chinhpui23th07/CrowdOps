const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  CampaignState,
  ONE_DAY,
  eth,
  deployFixture,
  createCampaign,
  successfulCampaignFixture,
  failedCampaignFixture,
} = require("./helpers");

describe("CrowdOps - hoàn tiền", function () {
  it("hoàn đúng số ETH đã góp và burn token tương ứng", async function () {
    const { crowdOps, alice, campaignId, token } = await loadFixture(failedCampaignFixture);
    const tx = crowdOps.connect(alice).refund(campaignId);
    await expect(tx).to.emit(crowdOps, "Refunded").withArgs(campaignId, alice.address, eth(2));
    await expect(tx).to.changeEtherBalances([alice, crowdOps], [eth(2), -eth(2)]);

    expect(await token.balanceOf(alice.address)).to.equal(0n);
    expect(await crowdOps.hasRefunded(campaignId, alice.address)).to.equal(true);
    // Lịch sử đóng góp vẫn giữ để hiển thị.
    expect(await crowdOps.contributions(campaignId, alice.address)).to.equal(eth(2));
    expect((await crowdOps.getCampaign(campaignId)).totalRefunded).to.equal(eth(2));
    expect(await crowdOps.availableBalance(campaignId)).to.equal(eth(1));
  });

  it("mọi người ủng hộ đều nhận lại đủ, quỹ về 0", async function () {
    const { crowdOps, alice, bob, campaignId, token } = await loadFixture(failedCampaignFixture);
    await crowdOps.connect(alice).refund(campaignId);
    await expect(crowdOps.connect(bob).refund(campaignId)).to.changeEtherBalance(bob, eth(1));
    expect(await crowdOps.availableBalance(campaignId)).to.equal(0n);
    expect(await ethers.provider.getBalance(await crowdOps.getAddress())).to.equal(0n);
    expect(await token.totalSupply()).to.equal(0n);
  });

  it("không nhận hoàn tiền hai lần", async function () {
    const { crowdOps, alice, campaignId } = await loadFixture(failedCampaignFixture);
    await crowdOps.connect(alice).refund(campaignId);
    await expect(crowdOps.connect(alice).refund(campaignId)).to.be.revertedWithCustomError(
      crowdOps,
      "AlreadyRefunded"
    );
  });

  it("ví chưa góp không được hoàn tiền", async function () {
    const { crowdOps, outsider, campaignId } = await loadFixture(failedCampaignFixture);
    await expect(crowdOps.connect(outsider).refund(campaignId)).to.be.revertedWithCustomError(
      crowdOps,
      "NothingToRefund"
    );
  });

  it("không hoàn tiền khi chiến dịch thành công", async function () {
    const { crowdOps, alice, campaignId } = await loadFixture(successfulCampaignFixture);
    await expect(crowdOps.connect(alice).refund(campaignId))
      .to.be.revertedWithCustomError(crowdOps, "WrongState")
      .withArgs(CampaignState.Successful);
  });

  it("không hoàn tiền khi chưa chốt (kể cả đã quá hạn)", async function () {
    const { crowdOps, creator, alice } = await loadFixture(deployFixture);
    const { campaignId } = await createCampaign(crowdOps, creator);
    await crowdOps.connect(alice).contribute(campaignId, { value: eth(1) });
    await time.increase(7 * ONE_DAY + 1);
    await expect(crowdOps.connect(alice).refund(campaignId))
      .to.be.revertedWithCustomError(crowdOps, "WrongState")
      .withArgs(CampaignState.Fundraising);
  });

  it("chặn tấn công re-entrancy: kẻ tấn công chỉ rút được đúng 1 lần", async function () {
    const { crowdOps, creator, alice } = await loadFixture(deployFixture);
    const { campaignId } = await createCampaign(crowdOps, creator);
    const attacker = await ethers.deployContract("ReentrancyAttacker", [await crowdOps.getAddress()]);
    await attacker.contribute(campaignId, { value: eth(1) });
    await crowdOps.connect(alice).contribute(campaignId, { value: eth(2) });
    await time.increase(7 * ONE_DAY + 1);
    await crowdOps.finalize(campaignId);

    await expect(attacker.attackRefund()).to.changeEtherBalances([attacker, crowdOps], [eth(1), -eth(1)]);
    expect(await attacker.reentryAttempts()).to.equal(1n);
    expect(await attacker.reentrySucceeded()).to.equal(0n);
    // Tiền của alice vẫn còn nguyên trong quỹ.
    expect(await crowdOps.availableBalance(campaignId)).to.equal(eth(2));
  });
});
