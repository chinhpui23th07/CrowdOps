/** Chữ ký chỉ có hiệu lực trong 5 phút để hạn chế dùng lại (replay). */
export const SIGNATURE_TTL_MS = 5 * 60 * 1000;

/**
 * Nội dung người dùng ký trong MetaMask. Frontend và server phải dựng chuỗi y hệt nhau
 * (frontend/src/lib/keyAccess.js dùng cùng định dạng).
 */
export function buildAuthMessage({ action, chainId, campaignId, cid, issuedAt }) {
  return [
    "Crowd Ops - xac thuc vi",
    `Hanh dong: ${action}`,
    `Chain ID: ${chainId}`,
    `Chien dich: ${campaignId}`,
    `CID: ${cid}`,
    `Thoi diem: ${issuedAt}`,
  ].join("\n");
}
