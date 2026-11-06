import { HttpError } from "../common/http-error.js";
import { TIERS } from "../auth/access.service.js";

// Các trường chung (action, chainId, campaignId, cid, issuedAt, signature) đã được signatureGuard kiểm tra.

/** POST /api/keys/register - chủ dự án gửi khóa AES của một tài liệu đã mã hóa. */
export function validateRegisterKeyDto(body) {
  const { campaignId, cid, key, tier } = body;
  if (!TIERS.includes(tier)) throw new HttpError(400, "Cấp truy cập không hợp lệ");
  if (!isAes256Key(key)) throw new HttpError(400, "Khóa phải là AES-256 dạng base64");
  return { campaignId, cid, key, tier };
}

/** POST /api/keys/request - người dùng xin khóa của một tài liệu. */
export function validateRequestKeyDto(body) {
  const { campaignId, cid } = body;
  return { campaignId, cid };
}

function isAes256Key(value) {
  if (typeof value !== "string") return false;
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}
