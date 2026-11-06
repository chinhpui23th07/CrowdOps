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

async function openRequestFixture() {
  const base = await successfulCampaignFixture();
  const { crowdOps, creator, vendor, campaignId } = base;
  await crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address }));
  return { ...base, requestId: 0n };
}

describe("CrowdOps - yêu cầu chi tiêu, biểu quyết, giải ngân", function () {
  describe("requestSpending", function () {
    it("tạo yêu cầu, chụp snapshot và tổng quyền biểu quyết", async function () {
      const { crowdOps, creator, vendor, campaignId } = await loadFixture(successfulCampaignFixture);
      const input = requestInput({ recipient: vendor.address });
      await expect(crowdOps.connect(creator).requestSpending(campaignId, input)).to.emit(
        crowdOps,
        "SpendingRequested"
      );
      const [r, status] = await crowdOps.getRequest(campaignId, 0);
      expect(status).to.equal(RequestStatus.Voting);
      expect(r.recipient).to.equal(vendor.address);
      expect(r.amount).to.equal(eth(4));
      expect(r.evidenceCID).to.equal("bafybeiinvoice");
      expect(r.totalVotingPower).to.equal(eth(10));
      expect(r.snapshotBlock).to.equal(BigInt(await ethers.provider.getBlockNumber()) - 1n);
      expect(await crowdOps.hasOpenRequest(campaignId)).to.equal(true);
    });

    it("chỉ chủ dự án được tạo yêu cầu", async function () {
      const { crowdOps, alice, vendor, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(
        crowdOps.connect(alice).requestSpending(campaignId, requestInput({ recipient: vendor.address }))
      ).to.be.revertedWithCustomError(crowdOps, "NotCreator");
    });

    it("không tạo yêu cầu khi đang huy động hoặc đã thất bại", async function () {
      const { crowdOps, creator, vendor } = await loadFixture(deployFixture);
      const { campaignId } = await createCampaign(crowdOps, creator);
      await expect(crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address })))
        .to.be.revertedWithCustomError(crowdOps, "WrongState")
        .withArgs(CampaignState.Fundraising);

      const failed = await loadFixture(failedCampaignFixture);
      await expect(
        failed.crowdOps
          .connect(failed.creator)
          .requestSpending(failed.campaignId, requestInput({ recipient: failed.vendor.address }))
      )
        .to.be.revertedWithCustomError(failed.crowdOps, "WrongState")
        .withArgs(CampaignState.Failed);
    });

    it("không cho yêu cầu vượt số dư quỹ", async function () {
      const { crowdOps, creator, vendor, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(
        crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address, amount: eth(11) }))
      )
        .to.be.revertedWithCustomError(crowdOps, "AmountExceedsBalance")
        .withArgs(eth(11), eth(10));
    });

    const invalidCases = [
      ["số tiền = 0", { amount: 0n }, "amount"],
      ["thiếu mô tả", { description: "" }, "description"],
      ["thiếu chứng từ IPFS", { evidenceCID: "" }, "evidenceCID"],
      ["thời gian bỏ phiếu quá ngắn", { votingDurationSeconds: 59 }, "votingDuration"],
      ["thời gian bỏ phiếu quá dài", { votingDurationSeconds: 31 * ONE_DAY }, "votingDuration"],
    ];
    for (const [name, overrides, reason] of invalidCases) {
      it(`từ chối khi ${name}`, async function () {
        const { crowdOps, creator, vendor, campaignId } = await loadFixture(successfulCampaignFixture);
        await expect(
          crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address, ...overrides }))
        )
          .to.be.revertedWithCustomError(crowdOps, "InvalidInput")
          .withArgs(reason);
      });
    }

    it("từ chối ví nhận là address(0)", async function () {
      const { crowdOps, creator, campaignId } = await loadFixture(successfulCampaignFixture);
      await expect(crowdOps.connect(creator).requestSpending(campaignId, requestInput()))
        .to.be.revertedWithCustomError(crowdOps, "InvalidInput")
        .withArgs("recipient");
    });

    it("chỉ một yêu cầu mở tại một thời điểm; yêu cầu cũ bị bác thì mới tạo được yêu cầu mới", async function () {
      const { crowdOps, creator, vendor, campaignId } = await loadFixture(openRequestFixture);
      const input = requestInput({ recipient: vendor.address });
      await expect(crowdOps.connect(creator).requestSpending(campaignId, input)).to.be.revertedWithCustomError(
        crowdOps,
        "OpenRequestExists"
      );
      await time.increase(3 * ONE_DAY + 1); // hết hạn bỏ phiếu, chưa ai bỏ => Rejected
      expect(await crowdOps.getRequestStatus(campaignId, 0)).to.equal(RequestStatus.Rejected);
      await expect(crowdOps.connect(creator).requestSpending(campaignId, input)).to.not.be.reverted;
    });
  });

  describe("approveRequest / rejectRequest", function () {
    it("phiếu thuận > 50% TỔNG quyền => Approved", async function () {
      const { crowdOps, alice, bob, campaignId, requestId } = await loadFixture(openRequestFixture);
      await expect(crowdOps.connect(bob).approveRequest(campaignId, requestId))
        .to.emit(crowdOps, "Voted")
        .withArgs(campaignId, requestId, bob.address, true, eth(3));
      expect(await crowdOps.getRequestStatus(campaignId, requestId)).to.equal(RequestStatus.Voting);
      await crowdOps.connect(alice).approveRequest(campaignId, requestId); // 3 + 5 = 8/10
      expect(await crowdOps.getRequestStatus(campaignId, requestId)).to.equal(RequestStatus.Approved);
      const [r] = await crowdOps.getRequest(campaignId, requestId);
      expect(r.approveVotes).to.equal(eth(8));
      expect(r.approveCount).to.equal(2n);
    });

    it("đúng 50% là CHƯA đủ (cần lớn hơn 50%)", async function () {
      const { crowdOps, alice, campaignId, requestId } = await loadFixture(openRequestFixture);
      await crowdOps.connect(alice).approveRequest(campaignId, requestId); // 5/10 = 50%
      expect(await crowdOps.getRequestStatus(campaignId, requestId)).to.equal(RequestStatus.Voting);
      await time.increase(3 * ONE_DAY + 1);
      expect(await crowdOps.getRequestStatus(campaignId, requestId)).to.equal(RequestStatus.Rejected);
    });

    it("100% người ĐÃ bỏ phiếu đồng ý nhưng < 50% tổng quyền => hết hạn bị bác", async function () {
      const { crowdOps, bob, carol, campaignId, requestId } = await loadFixture(openRequestFixture);
      await crowdOps.connect(bob).approveRequest(campaignId, requestId);
      await crowdOps.connect(carol).approveRequest(campaignId, requestId); // 5/10, alice không bỏ phiếu
      await time.increase(3 * ONE_DAY + 1);
      expect(await crowdOps.getRequestStatus(campaignId, requestId)).to.equal(RequestStatus.Rejected);
    });

    it("phiếu chống >= 50% tổng => bác bỏ sớm, không cần đợi hết hạn", async function () {
      const { crowdOps, alice, bob, campaignId, requestId } = await loadFixture(openRequestFixture);
      await crowdOps.connect(alice).rejectRequest(campaignId, requestId); // 5/10 chống
      expect(await crowdOps.getRequestStatus(campaignId, requestId)).to.equal(RequestStatus.Rejected);
      await expect(crowdOps.connect(bob).approveRequest(campaignId, requestId)).to.be.revertedWithCustomError(
        crowdOps,
        "VotingClosed"
      );
    });

    it("mỗi ví chỉ bỏ phiếu một lần (không đổi phiếu)", async function () {
      const { crowdOps, carol, campaignId, requestId } = await loadFixture(openRequestFixture);
      await crowdOps.connect(carol).approveRequest(campaignId, requestId);
      await expect(crowdOps.connect(carol).approveRequest(campaignId, requestId)).to.be.revertedWithCustomError(
        crowdOps,
        "AlreadyVoted"
      );
      await expect(crowdOps.connect(carol).rejectRequest(campaignId, requestId)).to.be.revertedWithCustomError(
        crowdOps,
        "AlreadyVoted"
      );
    });

    it("ví không có token không được bỏ phiếu", async function () {
      const { crowdOps, outsider, campaignId, requestId } = await loadFixture(openRequestFixture);
      await expect(crowdOps.connect(outsider).approveRequest(campaignId, requestId)).to.be.revertedWithCustomError(
        crowdOps,
        "NoVotingPower"
      );
    });

    it("chủ dự án không được bỏ phiếu cho yêu cầu của mình", async function () {
      const { crowdOps, creator, campaignId, requestId } = await loadFixture(openRequestFixture);
      await expect(crowdOps.connect(creator).approveRequest(campaignId, requestId)).to.be.revertedWithCustomError(
        crowdOps,
        "CreatorCannotParticipate"
      );
    });

    it("không bỏ phiếu sau hạn", async function () {
      const { crowdOps, alice, campaignId, requestId } = await loadFixture(openRequestFixture);
      await time.increase(3 * ONE_DAY + 1);
      await expect(crowdOps.connect(alice).approveRequest(campaignId, requestId)).to.be.revertedWithCustomError(
        crowdOps,
        "VotingClosed"
      );
    });

    it("không bỏ phiếu cho yêu cầu không tồn tại", async function () {
      const { crowdOps, alice, campaignId } = await loadFixture(openRequestFixture);
      await expect(crowdOps.connect(alice).approveRequest(campaignId, 9)).to.be.revertedWithCustomError(
        crowdOps,
        "RequestNotFound"
      );
    });
  });

  describe("Snapshot & delegation - chống bỏ phiếu hai lần bằng chuyển token", function () {
    it("chuyển token SAU snapshot: người nhận không có phiếu, người gửi vẫn bỏ phiếu theo snapshot", async function () {
      const { crowdOps, token, bob, dave, campaignId, requestId } = await loadFixture(openRequestFixture);
      await crowdOps.connect(bob).approveRequest(campaignId, requestId); // 3 phiếu
      await token.connect(bob).transfer(dave.address, eth(3)); // bob chuyển hết cho dave
      await expect(crowdOps.connect(dave).approveRequest(campaignId, requestId)).to.be.revertedWithCustomError(
        crowdOps,
        "NoVotingPower"
      );
      const [r] = await crowdOps.getRequest(campaignId, requestId);
      expect(r.approveVotes).to.equal(eth(3));
    });

    it("chuyển token TRƯỚC khi tạo yêu cầu: người nhận tự có quyền biểu quyết", async function () {
      const { crowdOps, token, creator, vendor, carol, dave, campaignId } = await loadFixture(
        successfulCampaignFixture
      );
      await token.connect(carol).transfer(dave.address, eth(2));
      expect(await token.getVotes(dave.address)).to.equal(eth(2)); // tự delegate khi nhận
      await crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address }));
      expect(await crowdOps.votingPowerFor(campaignId, 0, dave.address)).to.equal(eth(2));
      expect(await crowdOps.votingPowerFor(campaignId, 0, carol.address)).to.equal(0n);
      await expect(crowdOps.connect(dave).approveRequest(campaignId, 0))
        .to.emit(crowdOps, "Voted")
        .withArgs(campaignId, 0n, dave.address, true, eth(2));
    });

    it("delegate cho người khác: người đại diện bỏ phiếu thay, người ủy quyền mất phiếu", async function () {
      const { crowdOps, token, creator, vendor, alice, dave, campaignId } = await loadFixture(
        successfulCampaignFixture
      );
      await token.connect(alice).delegate(dave.address);
      await crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address }));
      await expect(crowdOps.connect(alice).approveRequest(campaignId, 0)).to.be.revertedWithCustomError(
        crowdOps,
        "NoVotingPower"
      );
      await crowdOps.connect(dave).approveRequest(campaignId, 0);
      const [r] = await crowdOps.getRequest(campaignId, 0);
      expect(r.approveVotes).to.equal(eth(5));
    });
  });

  describe("executeSpending", function () {
    async function approvedFixture() {
      const base = await openRequestFixture();
      const { crowdOps, alice, bob, campaignId, requestId } = base;
      await crowdOps.connect(alice).approveRequest(campaignId, requestId);
      await crowdOps.connect(bob).approveRequest(campaignId, requestId);
      return base;
    }

    it("giải ngân yêu cầu đã duyệt cho đúng ví nhận, chuyển trạng thái Đang triển khai", async function () {
      const { crowdOps, creator, vendor, campaignId, requestId } = await loadFixture(approvedFixture);
      const tx = crowdOps.connect(creator).executeSpending(campaignId, requestId);
      await expect(tx).to.emit(crowdOps, "SpendingExecuted").withArgs(campaignId, requestId, vendor.address, eth(4));
      await expect(tx).to.changeEtherBalances([vendor, crowdOps], [eth(4), -eth(4)]);
      const c = await crowdOps.getCampaign(campaignId);
      expect(c.state).to.equal(CampaignState.Active);
      expect(c.totalDisbursed).to.equal(eth(4));
      expect(await crowdOps.availableBalance(campaignId)).to.equal(eth(6));
      expect(await crowdOps.getRequestStatus(campaignId, requestId)).to.equal(RequestStatus.Executed);
      expect(await crowdOps.hasOpenRequest(campaignId)).to.equal(false);
    });

    it("không giải ngân hai lần", async function () {
      const { crowdOps, creator, campaignId, requestId } = await loadFixture(approvedFixture);
      await crowdOps.connect(creator).executeSpending(campaignId, requestId);
      await expect(crowdOps.connect(creator).executeSpending(campaignId, requestId))
        .to.be.revertedWithCustomError(crowdOps, "RequestNotApproved")
        .withArgs(RequestStatus.Executed);
    });

    it("chỉ chủ dự án được giải ngân", async function () {
      const { crowdOps, alice, campaignId, requestId } = await loadFixture(approvedFixture);
      await expect(crowdOps.connect(alice).executeSpending(campaignId, requestId)).to.be.revertedWithCustomError(
        crowdOps,
        "NotCreator"
      );
    });

    it("không giải ngân yêu cầu đang bỏ phiếu hoặc bị bác", async function () {
      const { crowdOps, creator, alice, campaignId, requestId } = await loadFixture(openRequestFixture);
      await expect(crowdOps.connect(creator).executeSpending(campaignId, requestId))
        .to.be.revertedWithCustomError(crowdOps, "RequestNotApproved")
        .withArgs(RequestStatus.Voting);
      await crowdOps.connect(alice).rejectRequest(campaignId, requestId);
      await expect(crowdOps.connect(creator).executeSpending(campaignId, requestId))
        .to.be.revertedWithCustomError(crowdOps, "RequestNotApproved")
        .withArgs(RequestStatus.Rejected);
    });

    it("yêu cầu thứ hai bị giới hạn bởi số dư còn lại", async function () {
      const { crowdOps, creator, vendor, campaignId, requestId } = await loadFixture(approvedFixture);
      await crowdOps.connect(creator).executeSpending(campaignId, requestId);
      await expect(
        crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address, amount: eth(7) }))
      )
        .to.be.revertedWithCustomError(crowdOps, "AmountExceedsBalance")
        .withArgs(eth(7), eth(6));
      await expect(
        crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address, amount: eth(6) }))
      ).to.not.be.reverted;
    });

    it("ví nhận từ chối ETH => giao dịch revert, trạng thái không đổi", async function () {
      const { crowdOps, creator, alice, bob, campaignId } = await loadFixture(successfulCampaignFixture);
      const rejecting = await ethers.deployContract("RejectingReceiver");
      await crowdOps
        .connect(creator)
        .requestSpending(campaignId, requestInput({ recipient: await rejecting.getAddress() }));
      await crowdOps.connect(alice).approveRequest(campaignId, 0);
      await crowdOps.connect(bob).approveRequest(campaignId, 0);
      await expect(crowdOps.connect(creator).executeSpending(campaignId, 0)).to.be.revertedWithCustomError(
        crowdOps,
        "TransferFailed"
      );
      expect(await crowdOps.getRequestStatus(campaignId, 0)).to.equal(RequestStatus.Approved);
      expect(await crowdOps.availableBalance(campaignId)).to.equal(eth(10));
    });
  });

  describe("cancelRequest", function () {
    it("chủ dự án hủy yêu cầu đang mở rồi tạo yêu cầu mới", async function () {
      const { crowdOps, creator, vendor, campaignId, requestId } = await loadFixture(openRequestFixture);
      await expect(crowdOps.connect(creator).cancelRequest(campaignId, requestId))
        .to.emit(crowdOps, "RequestCancelled")
        .withArgs(campaignId, requestId);
      expect(await crowdOps.getRequestStatus(campaignId, requestId)).to.equal(RequestStatus.Cancelled);
      await expect(crowdOps.connect(creator).executeSpending(campaignId, requestId))
        .to.be.revertedWithCustomError(crowdOps, "RequestNotApproved")
        .withArgs(RequestStatus.Cancelled);
      await expect(crowdOps.connect(creator).requestSpending(campaignId, requestInput({ recipient: vendor.address })))
        .to.not.be.reverted;
    });

    it("người khác không hủy được; không hủy yêu cầu đã đóng", async function () {
      const { crowdOps, creator, alice, campaignId, requestId } = await loadFixture(openRequestFixture);
      await expect(crowdOps.connect(alice).cancelRequest(campaignId, requestId)).to.be.revertedWithCustomError(
        crowdOps,
        "NotCreator"
      );
      await crowdOps.connect(alice).rejectRequest(campaignId, requestId);
      await expect(crowdOps.connect(creator).cancelRequest(campaignId, requestId))
        .to.be.revertedWithCustomError(crowdOps, "RequestNotOpen")
        .withArgs(RequestStatus.Rejected);
    });
  });
});
