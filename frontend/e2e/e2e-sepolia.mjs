// Kiểm thử end-to-end trên SEPOLIA THẬT: website thật + server thật (Pinata thật) + giao dịch thật.
// Khác e2e.mjs (Hardhat local, IPFS giả): ở đây "ví giả" chỉ thay phần bấm popup MetaMask,
// còn việc ký do Node làm bằng private key ví thử nghiệm trong blockchain/.env, gửi lên Sepolia.
// Tốn khoảng 3 giao dịch (tạo chiến dịch, góp tiền, thêm tài liệu riêng) ~ 0,002 ETH testnet.
//
// Chuẩn bị:
//   server>   npm start                (server/.env: CHAIN_ID=11155111, PINATA_JWT thật)
//   frontend> npx vite                 (frontend/.env.local: VITE_CHAIN_ID=11155111)
// Chạy:      frontend> E2E_BROWSER=chrome node e2e/e2e-sepolia.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { ethers } from "ethers";

const APP = process.env.E2E_APP_URL || "http://localhost:5173";
const root = new URL("../../", import.meta.url);
const SHOTS = new URL("docs/screenshots/sepolia-e2e/", root);
mkdirSync(SHOTS, { recursive: true });

const env = Object.fromEntries(
  readFileSync(new URL("blockchain/.env", root), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
const key = (k) => (k.startsWith("0x") ? k : `0x${k}`);
const wallets = {
  creator: new ethers.Wallet(key(env.DEPLOYER_PRIVATE_KEY), provider),
  alice: new ethers.Wallet(key(env.BACKER1_PRIVATE_KEY), provider),
  bob: new ethers.Wallet(key(env.BACKER2_PRIVATE_KEY), provider),
  carol: new ethers.Wallet(key(env.BACKER3_PRIVATE_KEY), provider),
};
const byAddress = Object.fromEntries(Object.values(wallets).map((w) => [w.address.toLowerCase(), w]));
const SEPOLIA = "0xaa36a7";
const txHashes = [];

// Ký bằng ví Node thay cho popup MetaMask
async function nodeSign(method, params, account) {
  const wallet = byAddress[String(account).toLowerCase()];
  if (!wallet) throw new Error(`Không có private key cho ${account}`);
  if (method === "eth_sendTransaction") {
    const tx = params[0];
    const sent = await wallet.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value ? BigInt(tx.value) : 0n,
      gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
    });
    txHashes.push(sent.hash);
    console.log("    tx", sent.hash);
    return sent.hash;
  }
  if (method === "personal_sign") {
    const msg = params[0];
    return wallet.signMessage(ethers.isHexString(msg) ? ethers.getBytes(msg) : msg);
  }
  throw new Error(`Phương thức ký không hỗ trợ: ${method}`);
}

function walletShim({ rpcUrl, chainId }) {
  const listeners = {};
  const state = { account: null, chainId, connected: false, rejectNext: false };
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
      if (method === "eth_sendTransaction" || method === "personal_sign") {
        if (state.rejectNext) {
          state.rejectNext = false;
          throw Object.assign(new Error("User rejected the request."), { code: 4001 });
        }
        return window.__nodeSign(method, params, state.account);
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

const asset = (name) => readFileSync(new URL(`docs/demo-assets/${name}`, root));
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.log("   [pageerror]", e.message));
await page.exposeFunction("__nodeSign", nodeSign);
await page.addInitScript(walletShim, { rpcUrl: env.SEPOLIA_RPC_URL, chainId: SEPOLIA });

const shot = (name) => page.screenshot({ path: new URL(`${name}.png`, SHOTS).pathname.replace(/^\/([A-Za-z]:)/, "$1"), fullPage: true });
const useAccount = async (name) => {
  await page.evaluate((addr) => {
    window.__wallet.account = addr;
    window.__wallet.connected = true;
    window.__emit("accountsChanged", [addr]);
  }, wallets[name].address);
};
// Sepolia: mỗi block ~12s, app chờ xác nhận nên cho thời gian dài
const success = () => page.getByText("Giao dịch thành công.").first().waitFor({ timeout: 180000 });
const field = (text) => page.locator(".field").filter({ hasText: text }).first();
const cidIn = async (locator) => (await locator.getByText("CID:").innerText()).match(/(baf[a-z0-9]+|Qm[A-Za-z0-9]+)/)[1];
async function expectOnPinata(cid, mime) {
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
  if (!res.ok) throw new Error(`Gateway trả ${res.status} cho ${cid}`);
  const type = res.headers.get("content-type") || "";
  if (mime && !type.includes(mime)) throw new Error(`Gateway trả ${type}, mong đợi ${mime}`);
  console.log(`    Pinata OK: ${cid} (${type})`);
}

let campaignUrl;
try {
  await step("Explorer đọc chiến dịch demo trên Sepolia khi CHƯA kết nối ví", async () => {
    await page.goto(APP);
    await page.getByText("Chế độ chỉ xem").waitFor();
    await page.locator(".campaign-card").filter({ hasText: "Vườn ươm cây cho xã ven biển" }).first().waitFor({ timeout: 60000 });
    await page.getByText("✓ Khớp số dư thực tế của contract").waitFor({ timeout: 60000 });
    await shot("01-explorer-sepolia");
  });

  await step("Ví ở sai mạng -> cảnh báo -> chuyển sang Sepolia", async () => {
    await page.evaluate((addr) => {
      window.__wallet.account = addr;
      window.__wallet.chainId = "0x1";
    }, wallets.creator.address);
    await page.getByRole("button", { name: "Kết nối ví" }).click();
    await page.getByText("Ví đang kết nối sai mạng").waitFor();
    await page.getByRole("button", { name: /Chuyển sang/ }).click();
    await page.getByText("Ví đang kết nối sai mạng").waitFor({ state: "detached" });
  });

  await step("Tạo chiến dịch qua web: upload PDF + ảnh lên PINATA THẬT, ký giao dịch trên Sepolia", async () => {
    await page.getByRole("link", { name: "Tạo chiến dịch", exact: true }).click();
    await page.getByLabel("Tiêu đề").fill("Kiểm thử web trên Sepolia");
    await page.getByLabel("Mô tả ngắn").fill("Chiến dịch tạo bởi kiểm thử tự động qua giao diện web, file trên Pinata thật");
    await page.getByLabel("Mục tiêu vốn (ETH)").fill("0.002");
    await page.getByLabel("Ngưỡng Kim cương (ETH)").fill("0.001");
    await page.getByLabel("Thời hạn huy động").fill("10");
    await page.getByLabel("Đơn vị thời gian").selectOption("minutes");
    const proposal = field("Proposal (PDF)");
    await proposal.locator('input[type="file"]').setInputFiles({ name: "proposal.pdf", mimeType: "application/pdf", buffer: asset("proposal.pdf") });
    await proposal.getByRole("button", { name: "Upload lên IPFS" }).click();
    await proposal.getByText("CID:").waitFor({ timeout: 60000 });
    await expectOnPinata(await cidIn(proposal), "pdf");
    const media = field("Ảnh / video");
    await media.locator('input[type="file"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: asset("cover.png") });
    await media.getByRole("button", { name: "Upload lên IPFS" }).click();
    await media.getByText("CID:").waitFor({ timeout: 60000 });
    await expectOnPinata(await cidIn(media), "image");
    await page.getByRole("button", { name: "Tạo chiến dịch" }).click();
    await success();
    await shot("02-create-success");
    await page.waitForURL(/\/campaign\/\d+/, { timeout: 60000 });
    campaignUrl = page.url();
    console.log("    trang chiến dịch:", campaignUrl);
  });

  await step("Từ chối ký -> báo lỗi rõ ràng", async () => {
    await useAccount("alice");
    await page.getByLabel("Số ETH muốn góp").fill("0.001");
    await page.evaluate(() => (window.__wallet.rejectNext = true));
    await page.getByRole("button", { name: "Góp tiền" }).click();
    await page.getByText("Bạn đã từ chối ký giao dịch").waitFor();
  });

  await step("Alice góp 0,001 ETH, web hiển thị tx hash", async () => {
    await page.getByRole("button", { name: "Góp tiền" }).click();
    await success();
    await page.getByText("Mã giao dịch:").waitFor();
    await page.locator(".big-stat").filter({ hasText: "50%" }).waitFor({ timeout: 60000 });
    await shot("03-contribute-success");
  });

  await step("Chủ dự án thêm tài liệu RIÊNG: mã hóa -> Pinata -> đăng ký khóa (ký tin nhắn) -> ghi CID lên chain", async () => {
    await useAccount("creator");
    await page.getByRole("tab", { name: "Tài liệu IPFS" }).click();
    await page.getByLabel("Tên tài liệu").fill("Hóa đơn nhà cung cấp (bản riêng)");
    await page.getByLabel("Riêng tư (mã hóa)").check();
    await page.getByLabel(/File \(sẽ được mã hóa/).setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: asset("invoice.pdf") });
    await page.getByRole("button", { name: "Thêm tài liệu" }).click();
    await success();
    await page.getByText("🔒 Hóa đơn nhà cung cấp").waitFor({ timeout: 60000 });
  });

  await step("Alice (giữ token) giải mã được tài liệu riêng", async () => {
    await useAccount("alice");
    await page.getByRole("button", { name: "Giải mã & xem" }).click();
    await page.getByText("Đã giải mã").waitFor({ timeout: 60000 });
    await shot("04-private-doc-decrypted");
  });

  await step("Carol (không góp chiến dịch này) bị key server từ chối", async () => {
    await page.reload();
    await useAccount("carol");
    await page.getByRole("tab", { name: "Tài liệu IPFS" }).click();
    await page.getByRole("button", { name: "Giải mã & xem" }).click();
    await page.getByText("Ví không giữ token quản trị").waitFor({ timeout: 60000 });
    await shot("05-private-doc-denied");
  });

  await step("Chiến dịch demo #4: lịch sử tx, yêu cầu bị bác, dòng tiền, ảnh bìa tải từ Pinata", async () => {
    await page.goto(`${APP}/campaign/4`);
    await page.getByRole("heading", { name: /Máy lọc nước cho điểm trường/ }).waitFor({ timeout: 60000 });
    const imgOk = await page.locator("img").evaluateAll((imgs) => imgs.some((i) => i.src.includes("/ipfs/") && i.complete && i.naturalWidth > 0));
    if (!imgOk) {
      await page.waitForFunction(() => [...document.images].some((i) => i.src.includes("/ipfs/") && i.complete && i.naturalWidth > 0), null, { timeout: 60000 });
    }
    await shot("06-campaign4-detail");
    await page.getByRole("tab", { name: /Bỏ phiếu chi tiêu/ }).click();
    await page.getByText("Chi phí marketing (không rõ nhà cung cấp)").waitFor({ timeout: 30000 });
    await shot("07-campaign4-voting");
    await page.getByRole("tab", { name: "Dòng tiền" }).click();
    await page.locator("table").getByText("Mua 5 máy lọc nước theo hóa đơn đính kèm").waitFor({ timeout: 30000 });
    await shot("08-campaign4-cashflow");
    await page.getByRole("tab", { name: "Lịch sử giao dịch" }).click();
    await page.locator("table").getByText("Đóng góp").first().waitFor({ timeout: 60000 });
    await page.locator("table").getByText("Giải ngân").first().waitFor({ timeout: 60000 });
    await shot("09-campaign4-history");
  });

  await step("Chiến dịch demo #5 Thất bại và #6 Đã giải thể hiển thị đúng", async () => {
    await page.goto(`${APP}/campaign/5`);
    await page.locator(".detail-head").getByText("Thất bại - hoàn tiền").waitFor({ timeout: 60000 });
    await shot("10-campaign5-failed");
    await page.goto(`${APP}/campaign/6`);
    await page.locator(".detail-head").getByText("Đã giải thể - chia lại quỹ").waitFor({ timeout: 60000 });
    await shot("11-campaign6-dissolved");
  });
} catch {
  // lỗi đã được in trong step()
} finally {
  await browser.close();
}

for (const hash of txHashes) {
  const receipt = await provider.getTransactionReceipt(hash);
  console.log(`  receipt ${hash}: ${receipt?.status === 1 ? "thành công" : "KHÔNG thành công"}`);
}
const failed = results.filter((r) => r[0] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} bước PASS`);
process.exit(failed.length ? 1 : 0);
