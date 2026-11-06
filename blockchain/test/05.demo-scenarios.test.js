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
} = require("./helpers");

// Ba kịch bản đúng như sẽ demo trước hội đồng, chạy trọn từ đầu tới cuối.
describe("Kịch bản demo đầu-cuối", function () {
  it("Kịch bản 1 - Gây quỹ thành công, yêu cầu chi hợp lệ được duyệt và giải ngân, nhận NFT", async function () {
    const { crowdOps, diamondNFT, creator, alice, bob, carol, vendor } = await loadFixture(deployFixture);
    const { campaignId, token } = await createCampaign(crowdOps, creator);

    await crowdOps.connect(alice).contribute(campaignId, { value: eth(6) });
    await crowdOps.connect(bob).contribute(campaignId, { value: eth(3) });
    await crowdOps.connect(carol).contribute(campaignId, { value: eth(1) });
    await time.increase(7 * ONE_DAY + 1);
    await crowdOps.finalize(campaignId);
    expect((await crowdOps.getCampaign(campaignId)).state).to.equal(CampaignState.Successful);

    await crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address }));
    await crowdOps.connect(carol).rejectRequest(campaignId, 0); // 1/10 chống
    await crowdOps.connect(alice).approveRequest(campaignId, 0); // 6/10 thuận > 50% => đã duyệt
    // Kết quả đã chắc chắn nên không nhận thêm phiếu.
    await expect(crowdOps.connect(bob).rejectRequest(campaignId, 0)).to.be.revertedWithCustomError(
      crowdOps,
      "VotingClosed"
    );
    expect(await crowdOps.getRequestStatus(campaignId, 0)).to.equal(RequestStatus.Approved);

    await expect(crowdOps.connect(creator).executeSpending(campaignId, 0)).to.changeEtherBalance(vendor, eth(4));
    expect((await crowdOps.getCampaign(campaignId)).state).to.equal(CampaignState.Active);

    await crowdOps.connect(alice).claimDiamondNFT(campaignId);
    expect(await diamondNFT.balanceOf(alice.address)).to.equal(1n);
    expect(await token.balanceOf(alice.address)).to.equal(eth(6));
  });

  it("Kịch bản 2 - Gây quỹ thất bại, mọi người được hoàn đúng số tiền", async function () {
    const { crowdOps, creator, alice, bob } = await loadFixture(deployFixture);
    const { campaignId, token } = await createCampaign(crowdOps, creator);

    await crowdOps.connect(alice).contribute(campaignId, { value: eth(1.5) });
    await crowdOps.connect(bob).contribute(campaignId, { value: eth(0.5) });
    await time.increase(7 * ONE_DAY + 1);
    await crowdOps.finalize(campaignId);
    expect((await crowdOps.getCampaign(campaignId)).state).to.equal(CampaignState.Failed);

    await expect(crowdOps.connect(alice).refund(campaignId)).to.changeEtherBalance(alice, eth(1.5));
    await expect(crowdOps.connect(bob).refund(campaignId)).to.changeEtherBalance(bob, eth(0.5));
    expect(await ethers.provider.getBalance(await crowdOps.getAddress())).to.equal(0n);
    expect(await token.totalSupply()).to.equal(0n);
  });

  it("Kịch bản 3 - Yêu cầu chi đáng ngờ bị bác bỏ, tiền vẫn an toàn trong quỹ", async function () {
    const { crowdOps, creator, alice, bob, carol, outsider } = await loadFixture(deployFixture);
    const { campaignId } = await createCampaign(crowdOps, creator);
    await crowdOps.connect(alice).contribute(campaignId, { value: eth(4) });
    await crowdOps.connect(bob).contribute(campaignId, { value: eth(4) });
    await crowdOps.connect(carol).contribute(campaignId, { value: eth(2) });
    await time.increase(7 * ONE_DAY + 1);
    await crowdOps.finalize(campaignId);

    // Rút 9/10 ETH về một ví lạ với "hóa đơn" mập mờ.
    await crowdOps.connect(creator).requestSpending(
      campaignId,
      requestInput({ description: "Chi phí marketing", recipient: outsider.address, amount: eth(9) })
    );
    await crowdOps.connect(alice).rejectRequest(campaignId, 0);
    await crowdOps.connect(bob).rejectRequest(campaignId, 0); // 8/10 chống
    expect(await crowdOps.getRequestStatus(campaignId, 0)).to.equal(RequestStatus.Rejected);

    await expect(crowdOps.connect(creator).executeSpending(campaignId, 0))
      .to.be.revertedWithCustomError(crowdOps, "RequestNotApproved")
      .withArgs(RequestStatus.Rejected);
    expect(await crowdOps.availableBalance(campaignId)).to.equal(eth(10));
  });

  it("Kịch bản 4 - Chủ dự án bỏ đi, người góp giải thể quỹ và chia lại phần còn lại", async function () {
    const { crowdOps, creator, alice, bob, carol, vendor } = await loadFixture(deployFixture);
    const { campaignId } = await createCampaign(crowdOps, creator, { goal: eth(4), diamondThreshold: eth(2) });
    await crowdOps.connect(alice).contribute(campaignId, { value: eth(2) });
    await crowdOps.connect(bob).contribute(campaignId, { value: eth(1) });
    await crowdOps.connect(carol).contribute(campaignId, { value: eth(1) });
    await time.increase(7 * ONE_DAY + 1);
    await crowdOps.finalize(campaignId);

    // Giải ngân đợt 1 hợp lệ rồi chủ dự án biến mất.
    await crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address, amount: eth(1) }));
    await crowdOps.connect(alice).approveRequest(campaignId, 0);
    await crowdOps.connect(bob).approveRequest(campaignId, 0);
    await crowdOps.connect(creator).executeSpending(campaignId, 0);

    await crowdOps.connect(bob).proposeDissolution(campaignId, "Chủ dự án không liên lạc được", 3 * ONE_DAY);
    await crowdOps.connect(alice).voteDissolution(campaignId, 0, true);
    await crowdOps.connect(bob).voteDissolution(campaignId, 0, true); // 3/4 > 50%
    expect((await crowdOps.getCampaign(campaignId)).state).to.equal(CampaignState.Dissolved);

    // Còn 3 ETH, chia theo 2 : 1 : 1.
    await expect(crowdOps.connect(alice).claimDissolutionRefund(campaignId)).to.changeEtherBalance(alice, eth("1.5"));
    await expect(crowdOps.connect(bob).claimDissolutionRefund(campaignId)).to.changeEtherBalance(bob, eth("0.75"));
    await expect(crowdOps.connect(carol).claimDissolutionRefund(campaignId)).to.changeEtherBalance(carol, eth("0.75"));
    expect(await ethers.provider.getBalance(await crowdOps.getAddress())).to.equal(0n);
  });
});
