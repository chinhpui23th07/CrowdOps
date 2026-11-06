import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import { createApp } from "../src/app.module.js";
import { buildAuthMessage } from "../src/auth/auth-message.js";
import { createMemoryKeyStore } from "../src/keys/keys.repository.js";

const CHAIN_ID = 31337;
const creator = Wallet.createRandom();
const backer = Wallet.createRandom();
const diamondBacker = Wallet.createRandom();
const outsider = Wallet.createRandom();
const AES_KEY = Buffer.alloc(32, 7).toString("base64");

// Blockchain giả: campaign 1 do creator tạo; backer và diamondBacker có token; chỉ diamondBacker có NFT.
const fakeChain = {
  getCreator: async () => creator.address,
  getTokenBalance: async (_id, addr) =>
    [backer.address, diamondBacker.address].includes(addr) ? 10n ** 18n : 0n,
  hasDiamond: async (_id, addr) => addr === diamondBacker.address,
};

const pinnedFiles = [];
const fakePinata = {
  configured: true,
  pinFile: async (file) => {
    pinnedFiles.push(file);
    return { cid: "bafyfakefile", size: file.buffer.length };
  },
  pinJson: async () => ({ cid: "bafyfakejson", size: 10 }),
};

async function signedBody(wallet, { action, campaignId = "1", cid = "bafydoc", issuedAt, ...extra }) {
  const fields = { action, chainId: CHAIN_ID, campaignId, cid, issuedAt: issuedAt || new Date().toISOString() };
  return { ...fields, ...extra, signature: await wallet.signMessage(buildAuthMessage(fields)) };
}

describe("Crowd Ops server", () => {
  let server;
  let baseUrl;
  const post = (path, body) =>
    fetch(baseUrl + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  before(async () => {
    const app = createApp({ chain: fakeChain, keyStore: createMemoryKeyStore(), pinata: fakePinata, chainId: CHAIN_ID });
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  describe("Đăng ký khóa", () => {
    test("người không phải chủ dự án bị từ chối (403)", async () => {
      const res = await post("/api/keys/register", await signedBody(outsider, { action: "register-key", key: AES_KEY, tier: "backer" }));
      assert.equal(res.status, 403);
    });

    test("chủ dự án đăng ký khóa thành công", async () => {
      const res = await post("/api/keys/register", await signedBody(creator, { action: "register-key", key: AES_KEY, tier: "backer" }));
      assert.equal(res.status, 200);
    });

    test("không ghi đè khóa đã có (409)", async () => {
      const res = await post("/api/keys/register", await signedBody(creator, { action: "register-key", key: AES_KEY, tier: "backer" }));
      assert.equal(res.status, 409);
    });

    test("khóa không phải AES-256 bị từ chối", async () => {
      const res = await post(
        "/api/keys/register",
        await signedBody(creator, { action: "register-key", cid: "bafyother", key: "abc", tier: "backer" })
      );
      assert.equal(res.status, 400);
    });
  });

  describe("Xin khóa (tier backer)", () => {
    test("người giữ token nhận được khóa", async () => {
      const res = await post("/api/keys/request", await signedBody(backer, { action: "request-key" }));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.key, AES_KEY);
      assert.equal(body.grantedTo, backer.address);
    });

    test("chủ dự án luôn nhận được khóa", async () => {
      const res = await post("/api/keys/request", await signedBody(creator, { action: "request-key" }));
      assert.equal(res.status, 200);
    });

    test("ví không có token bị từ chối (403) và không lộ khóa", async () => {
      const res = await post("/api/keys/request", await signedBody(outsider, { action: "request-key" }));
      assert.equal(res.status, 403);
      assert.equal((await res.json()).key, undefined);
    });

    test("chữ ký quá 5 phút bị từ chối (chống dùng lại)", async () => {
      const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const res = await post("/api/keys/request", await signedBody(backer, { action: "request-key", issuedAt: old }));
      assert.equal(res.status, 401);
    });

    test("giả mạo: chữ ký của ví A nhưng sửa CID khác => chữ ký không khớp", async () => {
      const body = await signedBody(backer, { action: "request-key", cid: "bafysomething" });
      body.cid = "bafydoc";
      const res = await post("/api/keys/request", body);
      // Chữ ký vẫn "hợp lệ" về mặt toán học nhưng khôi phục ra một địa chỉ ngẫu nhiên không có token.
      assert.equal(res.status, 403);
    });

    test("sai chain ID bị từ chối", async () => {
      const body = await signedBody(backer, { action: "request-key" });
      body.chainId = 1;
      const res = await post("/api/keys/request", body);
      assert.equal(res.status, 400);
    });

    test("tài liệu chưa đăng ký khóa trả 404", async () => {
      const res = await post("/api/keys/request", await signedBody(backer, { action: "request-key", cid: "bafyunknown" }));
      assert.equal(res.status, 404);
    });
  });

  describe("Xin khóa (tier diamond)", () => {
    before(async () => {
      await post(
        "/api/keys/register",
        await signedBody(creator, { action: "register-key", cid: "bafydiamond", key: AES_KEY, tier: "diamond" })
      );
    });

    test("người có token nhưng chưa có NFT Kim cương bị từ chối", async () => {
      const res = await post("/api/keys/request", await signedBody(backer, { action: "request-key", cid: "bafydiamond" }));
      assert.equal(res.status, 403);
    });

    test("người có NFT Kim cương nhận được khóa", async () => {
      const res = await post(
        "/api/keys/request",
        await signedBody(diamondBacker, { action: "request-key", cid: "bafydiamond" })
      );
      assert.equal(res.status, 200);
    });
  });

  describe("Upload IPFS", () => {
    const uploadFile = (kind, type, name = "file.bin") => {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", new Blob([Buffer.from("hello")], { type }), name);
      return fetch(baseUrl + "/api/ipfs/file", { method: "POST", body: form });
    };

    test("upload PDF proposal trả CID", async () => {
      const res = await uploadFile("proposal", "application/pdf", "proposal.pdf");
      assert.equal(res.status, 200);
      assert.equal((await res.json()).cid, "bafyfakefile");
      assert.equal(pinnedFiles.at(-1).fileName, "proposal.pdf");
    });

    test("ảnh không được dùng làm proposal", async () => {
      const res = await uploadFile("proposal", "image/png", "x.png");
      assert.equal(res.status, 400);
    });

    test("tài liệu riêng phải là bản mã hóa (octet-stream)", async () => {
      assert.equal((await uploadFile("private", "application/pdf", "secret.pdf")).status, 400);
      assert.equal((await uploadFile("private", "application/octet-stream", "secret.pdf.enc")).status, 200);
    });

    test("upload JSON metadata", async () => {
      const res = await post("/api/ipfs/json", { content: { name: "NFT" }, name: "nft.json" });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).cid, "bafyfakejson");
    });
  });
});
