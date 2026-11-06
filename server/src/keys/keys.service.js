import { HttpError } from "../common/http-error.js";
import { sameAddress } from "../common/address.js";

/**
 * Nghiệp vụ khóa giải mã tài liệu riêng.
 * @param chain          đọc dữ liệu on-chain (ai là chủ dự án)
 * @param keyStore       repository lưu khóa
 * @param accessService  quy tắc ai được nhận khóa
 */
export function createKeysService({ chain, keyStore, accessService, chainId, now }) {
  return {
    /** Chỉ chủ dự án được đăng ký, và mỗi tài liệu chỉ đăng ký một lần. */
    async registerKey({ campaignId, cid, key, tier }, signer) {
      const creator = await chain.getCreator(campaignId);
      if (!sameAddress(creator, signer)) throw new HttpError(403, "Chỉ chủ dự án được đăng ký khóa");
      if (keyStore.get(chainId, campaignId, cid)) throw new HttpError(409, "Tài liệu này đã có khóa");

      keyStore.set(chainId, campaignId, cid, { key, tier, registeredBy: signer, registeredAt: new Date(now()).toISOString() });
      return { ok: true, tier };
    },

    /** Kiểm tra quyền on-chain rồi mới trả khóa. */
    async grantKey({ campaignId, cid }, signer) {
      const record = keyStore.get(chainId, campaignId, cid);
      if (!record) throw new HttpError(404, "Không tìm thấy khóa cho tài liệu này");

      const access = await accessService.check({ campaignId, address: signer, tier: record.tier });
      if (!access.allowed) throw new HttpError(403, access.reason);
      return { key: record.key, tier: record.tier, grantedTo: signer, reason: access.reason };
    },
  };
}
