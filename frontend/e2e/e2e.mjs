// Kiểm thử end-to-end trên trình duyệt thật (Edge/Chrome có sẵn) với ví giả lập.
// Ví giả chuyển mọi lệnh tới Hardhat node (các tài khoản đã mở khóa sẵn), cho phép
// đổi tài khoản, đổi mạng, và giả lập người dùng bấm "Từ chối" trong ví.
//
// Chuẩn bị (4 terminal):
//   blockchain> npx hardhat node
//   blockchain> npx hardhat run scripts/deploy.js --network localhost
//   server>     node e2e/e2e-server.mjs
//   frontend>   set VITE_IPFS_GATEWAY=http://localhost:4000/test-ipfs/ && npx vite
// Chạy:        frontend> node e2e/e2e.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const APP = process.env.E2E_APP_URL || "http://localhost:5173";
const RPC = "http://127.0.0.1:8545";
const SHOTS = new URL("../../docs/screenshots/local-e2e/", import.meta.url);
mkdirSync(SHOTS, { recursive: true });

// Tài khoản Hardhat mặc định (#6 chủ dự án mới, #7 #8 người ủng hộ, #9 người ngoài)
const ACCOUNTS = {
  creator: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  dave: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  erin: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
  outsider: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
};

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}
async function timeTravel(seconds) {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
}

function walletShim({ rpcUrl }) {
  const listeners = {};
  const state = { account: null, chainId: "0x7a69", connected: false, rejectNext: false };
  window.__wallet = state;
  window.__emit = (event, value) => (listeners[event] || []).forEach((cb) => cb(value));
  let id = 0;
  window.ethereum = {
    isMetaMask: true,
    on: (event, cb) => (listeners[event] ||= []).push(cb),
    removeListener: (event, cb) => (listeners[event] = (listeners[event] || []).filter((x) => x !== cb)),
    async request({ method, params = [] }) {
      if (method === "eth_requestAccounts") {
        state.connected = true;
        return [state.account];
      }
      if (method === "eth_accounts") return state.connected ? [state.account] : [];
      if (method === "eth_chainId") return state.chainId;
      if (method === "wallet_switchEthereumChain") {
        state.chainId = params[0].chainId;
        window.__emit("chainChanged", state.chainId);
        return null;
      }
      if ((method === "eth_sendTransaction" || method === "personal_sign") && state.rejectNext) {
        state.rejectNext = false;
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      }
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      });
      const body = await res.json();
      if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code, data: body.error.data });
      return body.result;
    },
  };
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
    console.log("✔", name);
  } catch (error) {
    results.push(["FAIL", name, error.message.split("\n")[0]]);
    console.log("✘", name, "\n   ", error.message.split("\n").slice(0, 3).join("\n    "));
    throw error;
  }
}

const pdfBytes = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
);
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.log("   [pageerror]", e.message));
await page.addInitScript(walletShim, { rpcUrl: RPC });

const shot = (name) => page.screenshot({ path: new URL(`${name}.png`, SHOTS).pathname.replace(/^\/([A-Za-z]:)/, "$1"), fullPage: true });
const useAccount = async (name) => {
  await page.evaluate((addr) => {
    window.__wallet.account = addr;
    window.__wallet.connected = true;
    window.__emit("accountsChanged", [addr]);
  }, ACCOUNTS[name]);
};
const success = () => page.getByText("Giao dịch thành công.").first().waitFor({ timeout: 20000 });
const field = (text) => page.locator(".field").filter({ hasText: text }).first();

let campaignUrl;
try {
  await step("Explorer đọc dữ liệu on-chain khi CHƯA kết nối ví (chế độ chỉ xem)", async () => {
    await page.goto(APP);
    await page.getByText("Chế độ chỉ xem").waitFor();
    await page.locator(".campaign-card").first().waitFor();
    await shot("01-explorer-readonly");
  });

  await step("Kết nối ví ở sai mạng -> cảnh báo -> chuyển mạng", async () => {
    await page.evaluate((addr) => {
      window.__wallet.account = addr;
      window.__wallet.chainId = "0x1";
    }, ACCOUNTS.creator);
    await page.getByRole("button", { name: "Kết nối ví" }).click();
    await page.getByText("Ví đang kết nối sai mạng").waitFor();
    await shot("02-wrong-network");
    await page.getByRole("button", { name: /Chuyển sang/ }).click();
    await page.getByText("Ví đang kết nối sai mạng").waitFor({ state: "detached" });
  });

  await step("Tạo chiến dịch: upload PDF + ảnh lên IPFS, metadata NFT, gửi giao dịch", async () => {
    await page.getByRole("link", { name: "Tạo chiến dịch", exact: true }).click();
    await page.getByLabel("Tiêu đề").fill("E2E - Vườn rau thủy canh");
    await page.getByLabel("Mô tả ngắn").fill("Chiến dịch tạo bởi kiểm thử tự động");
    await page.getByLabel("Mục tiêu vốn (ETH)").fill("2");
    await page.getByLabel("Ngưỡng Kim cương (ETH)").fill("1");
    await page.getByLabel("Thời hạn huy động").fill("2");
    await page.getByLabel("Đơn vị thời gian").selectOption("minutes");
    await field("Proposal (PDF)").locator('input[type="file"]').setInputFiles({ name: "proposal.pdf", mimeType: "application/pdf", buffer: pdfBytes });
    await field("Proposal (PDF)").getByRole("button", { name: "Upload lên IPFS" }).click();
    await field("Proposal (PDF)").getByText("CID:").waitFor();
    await field("Ảnh / video").locator('input[type="file"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: pngBytes });
    await field("Ảnh / video").getByRole("button", { name: "Upload lên IPFS" }).click();
    await field("Ảnh / video").getByText("CID:").waitFor();
    await page.getByRole("button", { name: "Tạo chiến dịch" }).click();
    await success();
    await shot("03-create-success");
    await page.waitForURL(/\/campaign\/\d+/, { timeout: 10000 });
    campaignUrl = page.url();
  });

  await step("Người dùng từ chối ký -> báo lỗi rõ ràng, không có gì thay đổi", async () => {
    await useAccount("dave");
    await page.getByLabel("Số ETH muốn góp").fill("1.5");
    await page.evaluate(() => (window.__wallet.rejectNext = true));
    await page.getByRole("button", { name: "Góp tiền" }).click();
    await page.getByText("Bạn đã từ chối ký giao dịch").waitFor();
    await shot("04-user-rejected");
  });

  await step("Góp tiền từ 2 ví, hiển thị transaction hash", async () => {
    await page.getByRole("button", { name: "Góp tiền" }).click();
    await success();
    await page.getByText("Mã giao dịch:").waitFor();
    await shot("05-contribute-success");
    await useAccount("erin");
    await page.getByLabel("Số ETH muốn góp").fill("0.5");
    await page.getByRole("button", { name: "Góp tiền" }).click();
    await page.locator(".big-stat").filter({ hasText: "100%" }).waitFor({ timeout: 20000 });
  });

  await step("Chủ dự án không thể tự góp (nút bị khóa + giải thích)", async () => {
    await useAccount("creator");
    await page.getByText("Chủ dự án không được tự góp").waitFor();
  });

  await step("Sau hạn chót: chốt kết quả -> Thành công", async () => {
    await timeTravel(150);
    await page.reload();
    await useAccount("erin");
    await page.getByRole("button", { name: "Chốt kết quả" }).click();
    await success();
    await page.locator(".detail-head").getByText("Thành công").waitFor({ timeout: 15000 });
  });

  await step("Chủ dự án tạo yêu cầu chi kèm hóa đơn IPFS", async () => {
    await useAccount("creator");
    await page.getByRole("tab", { name: /Bỏ phiếu chi tiêu/ }).click();
    await page.getByLabel("Mô tả khoản chi").fill("Mua hệ thống thủy canh theo hóa đơn");
    await page.getByLabel(/Số tiền \(ETH\)/).fill("1");
    await page.getByLabel("Thời gian bỏ phiếu").fill("5");
    await page.getByLabel("Đơn vị", { exact: true }).selectOption("minutes");
    await field("Hóa đơn / chứng từ").locator('input[type="file"]').setInputFiles({ name: "invoice.png", mimeType: "image/png", buffer: pngBytes });
    await field("Hóa đơn / chứng từ").getByRole("button", { name: "Upload lên IPFS" }).click();
    await field("Hóa đơn / chứng từ").getByText("CID:").waitFor();
    await page.getByRole("button", { name: "Gửi yêu cầu chi" }).click();
    await success();
    await page.getByText("Yêu cầu #0").waitFor({ timeout: 15000 });
  });

  await step("Người ngoài không có token: không có nút bỏ phiếu, hiển thị 0 phiếu", async () => {
    await useAccount("outsider");
    await page.getByText("bạn không giữ token tại thời điểm snapshot").waitFor({ timeout: 15000 });
    if (await page.getByRole("button", { name: "Approve" }).count()) throw new Error("Người ngoài vẫn thấy nút Approve");
  });

  await step("Người ủng hộ 75% bấm Approve -> yêu cầu được duyệt", async () => {
    await useAccount("dave");
    await page.getByRole("button", { name: "Approve" }).click();
    await success();
    await page.getByText("Đã duyệt - chờ giải ngân").waitFor({ timeout: 15000 });
    await shot("06-voting-approved");
  });

  await step("Chủ dự án giải ngân -> Đã giải ngân, chiến dịch Đang triển khai", async () => {
    await useAccount("creator");
    await page.getByRole("button", { name: /Giải ngân 1 ETH/ }).click();
    await success();
    await page.getByText("Đã giải ngân", { exact: true }).waitFor({ timeout: 15000 });
    await page.locator(".detail-head").getByText("Đang triển khai").waitFor();
  });

  await step("Người góp >= ngưỡng nhận NFT Kim cương", async () => {
    await useAccount("dave");
    await page.getByRole("button", { name: /Nhận NFT Kim cương/ }).click();
    await success();
    await page.getByText("Bạn đã nhận NFT Kim cương").waitFor({ timeout: 15000 });
  });

  await step("Chủ dự án thêm tài liệu RIÊNG: mã hóa -> IPFS -> đăng ký khóa -> ghi CID lên chain", async () => {
    await useAccount("creator");
    await page.getByRole("tab", { name: "Tài liệu IPFS" }).click();
    await page.getByLabel("Tên tài liệu").fill("Hợp đồng nhà cung cấp (bản riêng)");
    await page.getByLabel("Riêng tư (mã hóa)").check();
    await page.getByLabel(/File \(sẽ được mã hóa/).setInputFiles({ name: "contract.pdf", mimeType: "application/pdf", buffer: pdfBytes });
    await page.getByRole("button", { name: "Thêm tài liệu" }).click();
    await success();
    await page.getByText("🔒 Hợp đồng nhà cung cấp").waitFor({ timeout: 15000 });
  });

  await step("Người giữ token giải mã được tài liệu riêng", async () => {
    await useAccount("erin");
    await page.getByRole("button", { name: "Giải mã & xem" }).click();
    await page.getByText("Đã giải mã").waitFor({ timeout: 15000 });
    await shot("07-private-doc-decrypted");
  });

  await step("Người ngoài bị key server từ chối, không nhận được khóa", async () => {
    await page.reload();
    await useAccount("outsider");
    await page.getByRole("tab", { name: "Tài liệu IPFS" }).click();
    await page.getByRole("button", { name: "Giải mã & xem" }).click();
    await page.getByText("Ví không giữ token quản trị").waitFor({ timeout: 15000 });
    await shot("08-private-doc-denied");
  });

  await step("Tab lịch sử hiển thị đóng góp/bỏ phiếu/giải ngân kèm tx hash", async () => {
    await page.getByRole("tab", { name: "Lịch sử giao dịch" }).click();
    await page.locator("table").getByText("Đóng góp").first().waitFor({ timeout: 15000 });
    await page.locator("table").getByText("Giải ngân").first().waitFor();
    await shot("09-history");
  });

  await step("Chiến dịch thất bại (tạo bởi script demo) hiển thị trạng thái và số đã hoàn", async () => {
    await page.goto(APP);
    await page.locator(".campaign-card").filter({ hasText: "Thư viện sách cũ" }).getByText("Đã hoàn lại 2 ETH").waitFor({ timeout: 15000 });
    await page.goto(`${APP}/campaign/2`);
    await page.locator(".detail-head").getByText("Thất bại - hoàn tiền").waitFor({ timeout: 15000 });
    await page.getByText("đã hoàn 2").waitFor();
    await shot("10-failed-campaign");
  });

  await step("Chiến dịch bị giải thể (script demo) + tab Dòng tiền + đối soát số dư contract", async () => {
    await page.goto(`${APP}/campaign/3`);
    await page.locator(".detail-head").getByText("Đã giải thể - chia lại quỹ").waitFor({ timeout: 15000 });
    await page.getByRole("tab", { name: /Bỏ phiếu chi tiêu/ }).click();
    await page.getByText("Đã thông qua - quỹ giải thể").waitFor();
    await shot("11-dissolved-campaign");
    await page.getByRole("tab", { name: "Dòng tiền" }).click();
    await page.getByText("Các khoản đã giải ngân").waitFor();
    await page.locator("table").getByText("Mua cây giống đợt 1").waitFor();
    await shot("12-cash-flow");
    await page.goto(APP);
    await page.getByText("✓ Khớp số dư thực tế của contract").waitFor({ timeout: 15000 });
  });

  await step("Người góp 75% đề xuất + bỏ phiếu giải thể trên web, rồi rút phần còn lại", async () => {
    await page.goto(campaignUrl);
    await useAccount("dave");
    await page.getByRole("tab", { name: /Bỏ phiếu chi tiêu/ }).click();
    await page.getByLabel("Lý do đề xuất").fill("Chủ dự án không cập nhật tiến độ");
    await page.getByRole("button", { name: "Đề xuất giải thể" }).click();
    await success();
    await page.getByRole("button", { name: "Ủng hộ giải thể" }).click({ timeout: 15000 });
    await page.locator(".detail-head").getByText("Đã giải thể - chia lại quỹ").waitFor({ timeout: 15000 });
    // Còn 1 ETH, dave giữ 1.5/2 token => 0.75 ETH
    await page.getByRole("button", { name: "Rút 0.75 ETH" }).click({ timeout: 15000 });
    await page.getByText("Ví này không giữ token của chiến dịch").waitFor({ timeout: 15000 });
    await shot("13-dissolution-claimed");
  });
} catch {
  // lỗi đã được in trong step()
} finally {
  await browser.close();
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${results.length - failed} PASS / ${failed} FAIL${campaignUrl ? ` · chiến dịch E2E: ${campaignUrl}` : ""}`);
  process.exitCode = failed ? 1 : 0;
}
