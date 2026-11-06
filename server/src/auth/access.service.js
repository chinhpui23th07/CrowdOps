import { sameAddress } from "../common/address.js";

/**
 * Quy tắc cấp khóa giải mã tài liệu riêng. Luôn đọc trạng thái TRỰC TIẾP từ blockchain,
 * không tin bất kỳ thông tin nào frontend gửi lên ngoài chữ ký.
 *
 * Cấp truy cập (tier) do chủ dự án chọn khi đăng ký khóa:
 *  - "backer":  ví đang giữ > 0 token quản trị của chiến dịch.
 *  - "diamond": ví đã nhận NFT Kim cương của chiến dịch.
 * Chủ dự án luôn được truy cập tài liệu của chính mình.
 */
export const TIERS = ["backer", "diamond"];

export function createAccessService({ chain }) {
  return {
    async check({ campaignId, address, tier }) {
      const creator = await chain.getCreator(campaignId);
      if (sameAddress(creator, address)) return { allowed: true, reason: "creator" };

      if (tier === "backer") {
        const balance = await chain.getTokenBalance(campaignId, address);
        return balance > 0n
          ? { allowed: true, reason: "token-holder" }
          : { allowed: false, reason: "Ví không giữ token quản trị của chiến dịch này" };
      }
      if (tier === "diamond") {
        const hasDiamond = await chain.hasDiamond(campaignId, address);
        return hasDiamond
          ? { allowed: true, reason: "diamond" }
          : { allowed: false, reason: "Tài liệu chỉ dành cho người ủng hộ hạng Kim cương" };
      }
      return { allowed: false, reason: "Cấp truy cập không hợp lệ" };
    },
  };
}
