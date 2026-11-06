import { verifyMessage, getAddress } from "ethers";
import { HttpError } from "../common/http-error.js";
import { SIGNATURE_TTL_MS, buildAuthMessage } from "./auth-message.js";

/**
 * Xác minh chữ ký và trả về địa chỉ ví đã ký. Ném lỗi nếu sai hành động, sai mạng,
 * chữ ký hết hạn hoặc không hợp lệ.
 */
export function recoverSigner(body, { expectedAction, expectedChainId, now = Date.now() }) {
  const { action, chainId, campaignId, cid, issuedAt, signature } = body;
  if (action !== expectedAction) throw new HttpError(400, "Sai loại hành động");
  if (Number(chainId) !== Number(expectedChainId)) throw new HttpError(400, "Sai mạng blockchain");
  if (!campaignId || !cid || !issuedAt || !signature) throw new HttpError(400, "Thiếu trường bắt buộc");

  const issuedMs = Date.parse(issuedAt);
  if (Number.isNaN(issuedMs)) throw new HttpError(400, "issuedAt không hợp lệ");
  if (Math.abs(now - issuedMs) > SIGNATURE_TTL_MS) throw new HttpError(401, "Chữ ký đã hết hạn, hãy ký lại");

  try {
    const message = buildAuthMessage({ action, chainId, campaignId, cid, issuedAt });
    return getAddress(verifyMessage(message, signature));
  } catch {
    throw new HttpError(401, "Chữ ký không hợp lệ");
  }
}

/**
 * Guard: request chỉ được vào controller khi có chữ ký ví hợp lệ cho đúng hành động.
 * Địa chỉ ví đã ký được gắn vào req.signer. Tương đương @UseGuards(...) của NestJS.
 */
export function signatureGuard({ action, chainId, now }) {
  return (req, _res, next) => {
    try {
      req.signer = recoverSigner(req.body, { expectedAction: action, expectedChainId: chainId, now: now() });
      next();
    } catch (error) {
      next(error);
    }
  };
}
