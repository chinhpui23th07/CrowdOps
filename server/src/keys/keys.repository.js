import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Repository: nơi lưu khóa AES của tài liệu riêng. Bản chính lưu vào một file JSON trên server
 * (đủ cho đồ án). Khóa KHÔNG bao giờ lên IPFS hay blockchain; IPFS chỉ chứa bản đã mã hóa.
 * Bản production nên dùng KMS/HSM hoặc mạng như Lit Protocol để không phụ thuộc một server.
 */
const keyOf = (chainId, campaignId, cid) => `${chainId}:${campaignId}:${cid}`;

export function createKeyStore(filePath) {
  const load = () => (existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : {});
  const data = load();

  return {
    get(chainId, campaignId, cid) {
      return data[keyOf(chainId, campaignId, cid)] || null;
    },
    set(chainId, campaignId, cid, record) {
      data[keyOf(chainId, campaignId, cid)] = record;
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(data, null, 2));
    },
  };
}

/** Bản lưu trong bộ nhớ, dùng cho test và E2E. */
export function createMemoryKeyStore() {
  const data = new Map();
  return {
    get: (chainId, campaignId, cid) => data.get(keyOf(chainId, campaignId, cid)) || null,
    set: (chainId, campaignId, cid, record) => data.set(keyOf(chainId, campaignId, cid), record),
  };
}
