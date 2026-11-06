import express from "express";
import cors from "cors";
import { httpExceptionFilter } from "./common/http-exception.filter.js";
import { createIpfsModule } from "./ipfs/ipfs.module.js";
import { createKeysModule } from "./keys/keys.module.js";

/**
 * Module gốc: ghép các module tính năng thành một ứng dụng Express.
 * Mọi phụ thuộc bên ngoài được truyền vào (dependency injection) nên test có thể thay bằng bản giả.
 *
 * @param deps.chain     đọc dữ liệu on-chain (createChainService hoặc bản giả trong test)
 * @param deps.keyStore  repository lưu khóa AES
 * @param deps.pinata    client Pinata
 * @param deps.chainId   mạng mà server phục vụ
 */
export function createApp({ chain, keyStore, pinata, chainId, corsOrigin = "*", now = () => Date.now() }) {
  const app = express();
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, chainId: Number(chainId), pinataConfigured: pinata.configured });
  });
  app.use("/api/ipfs", createIpfsModule({ pinata, now }));
  app.use("/api/keys", createKeysModule({ chain, keyStore, chainId, now }));

  app.use(httpExceptionFilter);
  return app;
}
