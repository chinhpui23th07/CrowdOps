import "dotenv/config";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.module.js";
import { createChainService } from "./chain/chain.service.js";
import { createKeyStore } from "./keys/keys.repository.js";
import { createPinataClient } from "./ipfs/pinata.client.js";

/** Điểm khởi động: đọc cấu hình .env, tạo các phụ thuộc thật rồi chạy server. */
const {
  PORT = 4000,
  CHAIN_ID = "31337",
  RPC_URL = "http://127.0.0.1:8545",
  PINATA_JWT = "",
  CORS_ORIGIN = "http://localhost:5173",
} = process.env;

const app = createApp({
  chain: createChainService({ rpcUrl: RPC_URL, chainId: CHAIN_ID }),
  keyStore: createKeyStore(fileURLToPath(new URL("../data/keys.json", import.meta.url))),
  pinata: createPinataClient(PINATA_JWT),
  chainId: CHAIN_ID,
  corsOrigin: CORS_ORIGIN,
});

app.listen(PORT, () => {
  console.log(`Crowd Ops server: http://localhost:${PORT} (chainId ${CHAIN_ID}, RPC ${RPC_URL})`);
  if (!PINATA_JWT) console.warn("Cảnh báo: chưa có PINATA_JWT - upload IPFS sẽ trả lỗi 503");
});
