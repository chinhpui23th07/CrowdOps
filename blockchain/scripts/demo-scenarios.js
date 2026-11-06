// Chạy 3 kịch bản demo trên chain thật và lưu mọi transaction hash làm bằng chứng:
//   1. Gây quỹ thành công -> yêu cầu chi hợp lệ được duyệt -> giải ngân -> nhận NFT Kim cương
//   2. Gây quỹ thất bại -> hoàn tiền
//   3. Yêu cầu chi đáng ngờ bị bác bỏ
// Local:   npx hardhat run scripts/demo-scenarios.js --network localhost   (tự tua thời gian)
// Sepolia: npx hardhat run scripts/demo-scenarios.js --network sepolia     (chờ thời gian thật ~3-4 phút)
//   Sepolia cần BACKER1_PRIVATE_KEY, BACKER2_PRIVATE_KEY, BACKER3_PRIVATE_KEY trong .env (ví thử nghiệm có Sepolia ETH).
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { ethers, network } = hre;
const isLocal = network.name === "localhost" || network.name === "hardhat";

const CAMPAIGN_DURATION = isLocal ? 3600 : 120; // giây
const VOTING_DURATION = isLocal ? 3600 : 120;
const unit = isLocal ? "1" : "0.001"; // Sepolia: đơn vị nhỏ để tiết kiệm ETH thử nghiệm
const amount = (n) => ethers.parseEther(String(Number(unit) * n));

// CID thật lấy từ bước upload IPFS (server). Mặc định là placeholder để chạy local.
const cids = {
  proposal: process.env.DEMO_PROPOSAL_CID || "bafy-dev-placeholder-proposal",
  media: process.env.DEMO_MEDIA_CID || "",
  nftMetadata: process.env.DEMO_NFT_METADATA_CID || "bafy-dev-placeholder-nft",
  invoice: process.env.DEMO_INVOICE_CID || "bafy-dev-placeholder-invoice",
  suspiciousInvoice: process.env.DEMO_SUSPICIOUS_INVOICE_CID || "bafy-dev-placeholder-suspicious",
};

const log = [];

// RPC công khai là một cụm nhiều node: giao dịch vừa xác nhận ở node này có thể chưa có ở node
// khác, khiến bước ước tính gas của giao dịch kế tiếp báo "execution reverted". Vì vậy trên
// testnet: chờ 2 block xác nhận, và nếu chưa GỬI được giao dịch thì thử lại vài lần.
const CONFIRMATIONS = isLocal ? 1 : 2;
const RETRIES = isLocal ? 0 : 4;

async function send(label, makeTx) {
  let tx;
  for (let attempt = 0; ; attempt++) {
    try {
      tx = await makeTx();
      break;
    } catch (error) {
      if (attempt >= RETRIES) throw error;
      console.log(`  ... "${label}" chưa gửi được (${error.shortMessage || error.message}), thử lại sau 6s`);
      await new Promise((resolve) => setTimeout(resolve, 6000));
    }
  }
  const receipt = await tx.wait(CONFIRMATIONS);
  if (receipt.status !== 1) throw new Error(`${label} thất bại`);
  log.push({ label, hash: tx.hash, block: receipt.blockNumber, from: tx.from });
  console.log(`  ✔ ${label}\n    tx ${tx.hash}`);
  return receipt;
}

async function passTime(seconds) {
  if (isLocal) {
    await network.provider.send("evm_increaseTime", [seconds + 1]);
    await network.provider.send("evm_mine");
    return;
  }
  console.log(`  ... chờ ${seconds + 15}s cho tới khi qua hạn trên Sepolia`);
  await new Promise((resolve) => setTimeout(resolve, (seconds + 15) * 1000));
}

async function getSigners() {
  if (isLocal) {
    const [creator, alice, bob, carol, vendor, suspicious] = await ethers.getSigners();
    return { creator, alice, bob, carol, vendor: vendor.address, suspicious: suspicious.address };
  }
  // hardhat.config.js nạp 4 ví theo thứ tự DEPLOYER, BACKER1, BACKER2, BACKER3 (dùng chung giá gas cấu hình).
  const [creator, alice, bob, carol] = await ethers.getSigners();
  if (!carol) throw new Error("Thiếu BACKER1/2/3_PRIVATE_KEY trong .env");
  return {
    creator,
    alice,
    bob,
    carol,
    vendor: process.env.DEMO_VENDOR_ADDRESS || creator.address,
    suspicious: process.env.DEMO_SUSPICIOUS_ADDRESS || ethers.Wallet.createRandom().address,
  };
}

async function createCampaign(crowdOps, creator, title, goalUnits, diamondUnits) {
  const receipt = await send(`Tạo chiến dịch "${title}"`, () => crowdOps.connect(creator).createCampaign({
      title,
      description: `Chiến dịch demo Crowd Ops: ${title}`,
      goal: amount(goalUnits),
      durationSeconds: CAMPAIGN_DURATION,
      diamondThreshold: amount(diamondUnits),
      proposalCID: cids.proposal,
      mediaCID: cids.media,
      nftMetadataCID: cids.nftMetadata,
    })
  );
  const event = receipt.logs.map((l) => crowdOps.interface.parseLog(l)).find((e) => e && e.name === "CampaignCreated");
  return event.args.campaignId;
}

async function main() {
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`), "utf8")
  );
  const crowdOps = await ethers.getContractAt("CrowdOps", deployment.crowdOps);
  const { creator, alice, bob, carol, vendor, suspicious } = await getSigners();
  console.log(`CrowdOps ${deployment.crowdOps} trên ${network.name}`);

  console.log("\n[Kịch bản 1 + 3] Thành công, giải ngân hợp lệ, bác bỏ yêu cầu đáng ngờ");
  const ok = await createCampaign(crowdOps, creator, "Máy lọc nước cho điểm trường", 10, 3);
  await send("Alice góp 5 đơn vị", () => crowdOps.connect(alice).contribute(ok, { value: amount(5) }));
  await send("Bob góp 3 đơn vị", () => crowdOps.connect(bob).contribute(ok, { value: amount(3) }));
  await send("Carol góp 2 đơn vị", () => crowdOps.connect(carol).contribute(ok, { value: amount(2) }));

  console.log("\n[Kịch bản 2] Thất bại và hoàn tiền");
  const fail = await createCampaign(crowdOps, creator, "Thư viện sách cũ", 10, 3);
  await send("Alice góp 1 đơn vị", () => crowdOps.connect(alice).contribute(fail, { value: amount(1) }));
  await send("Bob góp 1 đơn vị", () => crowdOps.connect(bob).contribute(fail, { value: amount(1) }));

  console.log("\n[Kịch bản 4] Chủ dự án bỏ đi, người góp biểu quyết giải thể quỹ");
  const abandoned = await createCampaign(crowdOps, creator, "Vườn ươm cây cho xã ven biển", 4, 2);
  await send("Alice góp 2 đơn vị", () => crowdOps.connect(alice).contribute(abandoned, { value: amount(2) }));
  await send("Bob góp 1 đơn vị", () => crowdOps.connect(bob).contribute(abandoned, { value: amount(1) }));
  await send("Carol góp 1 đơn vị", () => crowdOps.connect(carol).contribute(abandoned, { value: amount(1) }));

  await passTime(CAMPAIGN_DURATION);
  await send("Chốt chiến dịch 1 (Thành công)", () => crowdOps.connect(carol).finalize(ok));
  await send("Chốt chiến dịch 2 (Thất bại)", () => crowdOps.connect(carol).finalize(fail));
  await send("Alice nhận hoàn tiền", () => crowdOps.connect(alice).refund(fail));
  await send("Bob nhận hoàn tiền", () => crowdOps.connect(bob).refund(fail));

  await send("Yêu cầu chi đáng ngờ: 9 đơn vị về ví lạ", () => crowdOps.connect(creator).requestSpending(ok, {
      description: "Chi phí marketing (không rõ nhà cung cấp)",
      recipient: suspicious,
      amount: amount(9),
      evidenceCID: cids.suspiciousInvoice,
      votingDurationSeconds: VOTING_DURATION,
    })
  );
  await send("Alice bỏ phiếu Reject", () => crowdOps.connect(alice).rejectRequest(ok, 0));
  console.log("  Trạng thái yêu cầu #0:", ["Voting", "Approved", "Rejected"][await crowdOps.getRequestStatus(ok, 0)]);

  await send("Yêu cầu chi hợp lệ: 4 đơn vị mua máy lọc nước", () => crowdOps.connect(creator).requestSpending(ok, {
      description: "Mua 5 máy lọc nước theo hóa đơn đính kèm",
      recipient: vendor,
      amount: amount(4),
      evidenceCID: cids.invoice,
      votingDurationSeconds: VOTING_DURATION,
    })
  );
  await send("Bob bỏ phiếu Approve", () => crowdOps.connect(bob).approveRequest(ok, 1));
  await send("Carol bỏ phiếu Reject", () => crowdOps.connect(carol).rejectRequest(ok, 1));
  await send("Alice bỏ phiếu Approve (8/10 > 50%)", () => crowdOps.connect(alice).approveRequest(ok, 1));
  await send("Chủ dự án giải ngân yêu cầu #1", () => crowdOps.connect(creator).executeSpending(ok, 1));
  await send("Alice nhận NFT Kim cương", () => crowdOps.connect(alice).claimDiamondNFT(ok));

  console.log("\n[Kịch bản 4] tiếp: giải ngân đợt 1 rồi chủ dự án biến mất");
  await send("Chốt chiến dịch 3 (Thành công)", () => crowdOps.connect(carol).finalize(abandoned));
  await send("Yêu cầu chi đợt 1: 1 đơn vị mua cây giống", () => crowdOps.connect(creator).requestSpending(abandoned, {
      description: "Mua cây giống đợt 1",
      recipient: vendor,
      amount: amount(1),
      evidenceCID: cids.invoice,
      votingDurationSeconds: VOTING_DURATION,
    })
  );
  await send("Alice bỏ phiếu Approve (2/4 = 50%, chưa đủ)", () => crowdOps.connect(alice).approveRequest(abandoned, 0));
  await send("Bob bỏ phiếu Approve (3/4 > 50%)", () => crowdOps.connect(bob).approveRequest(abandoned, 0));
  await send("Chủ dự án giải ngân đợt 1", () => crowdOps.connect(creator).executeSpending(abandoned, 0));
  await send("Bob đề xuất giải thể quỹ", () => crowdOps
      .connect(bob)
      .proposeDissolution(abandoned, "Chủ dự án không báo cáo tiến độ, không liên lạc được", VOTING_DURATION)
  );
  await send("Alice ủng hộ giải thể", () => crowdOps.connect(alice).voteDissolution(abandoned, 0, true));
  await send("Bob ủng hộ giải thể (3/4 > 50% => giải thể)", () => crowdOps.connect(bob).voteDissolution(abandoned, 0, true));
  await send("Alice rút phần còn lại (2/4 của quỹ)", () => crowdOps.connect(alice).claimDissolutionRefund(abandoned));
  await send("Bob rút phần còn lại", () => crowdOps.connect(bob).claimDissolutionRefund(abandoned));
  await send("Carol rút phần còn lại", () => crowdOps.connect(carol).claimDissolutionRefund(abandoned));

  const outFile = path.join(__dirname, "..", "deployments", `${network.name}-demo-log.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify({ network: network.name, crowdOps: deployment.crowdOps, runAt: new Date().toISOString(), log }, null, 2)
  );
  console.log(`\nĐã ghi ${log.length} giao dịch vào ${path.relative(process.cwd(), outFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
