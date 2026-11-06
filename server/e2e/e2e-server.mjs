// CHỈ DÙNG CHO KIỂM THỬ E2E: server thật (app.module.js + chain service thật trên Hardhat local)
// nhưng Pinata được thay bằng kho file trong bộ nhớ, phục vụ lại qua /test-ipfs/:cid.
// Chạy: node e2e/e2e-server.mjs   (cần Hardhat node + contract đã deploy)
import { createHash } from "node:crypto";
import express from "express";
import { createApp } from "../src/app.module.js";
import { createChainService } from "../src/chain/chain.service.js";
import { createMemoryKeyStore } from "../src/keys/keys.repository.js";

const files = new Map();
const fakeCid = (buffer) => "bafytest" + createHash("sha256").update(buffer).digest("hex").slice(0, 40);

const fakePinata = {
  configured: true,
  async pinFile({ buffer, mimeType }) {
    const cid = fakeCid(buffer);
    files.set(cid, { buffer, mimeType });
    return { cid, size: buffer.length };
  },
  async pinJson({ content }) {
    const buffer = Buffer.from(JSON.stringify(content));
    const cid = fakeCid(buffer);
    files.set(cid, { buffer, mimeType: "application/json" });
    return { cid, size: buffer.length };
  },
};

const app = express();
app.get("/test-ipfs/:cid", (req, res) => {
  const file = files.get(req.params.cid);
  if (!file) return res.status(404).send("not found");
  res.set("Access-Control-Allow-Origin", "*").type(file.mimeType).send(file.buffer);
});
app.use(
  createApp({
    chain: createChainService({ rpcUrl: "http://127.0.0.1:8545", chainId: "31337" }),
    keyStore: createMemoryKeyStore(),
    pinata: fakePinata,
    chainId: 31337,
  })
);
app.listen(4000, () => console.log("E2E server (fake IPFS) on http://localhost:4000"));
