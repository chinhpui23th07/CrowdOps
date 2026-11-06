import { CHAIN_ID, SERVER_URL } from "../../shared/config";

/** Phải khớp từng ký tự với server/src/auth/auth-message.js -> buildAuthMessage. */
function buildAuthMessage({ action, chainId, campaignId, cid, issuedAt }) {
  return [
    "Crowd Ops - xac thuc vi",
    `Hanh dong: ${action}`,
    `Chain ID: ${chainId}`,
    `Chien dich: ${campaignId}`,
    `CID: ${cid}`,
    `Thoi diem: ${issuedAt}`,
  ].join("\n");
}

/** Ký message (không tốn gas, không phải giao dịch) để chứng minh mình sở hữu ví. */
async function signedRequest(signer, action, campaignId, cid, extra = {}) {
  const fields = { action, chainId: CHAIN_ID, campaignId: String(campaignId), cid, issuedAt: new Date().toISOString() };
  const signature = await signer.signMessage(buildAuthMessage(fields));
  const response = await fetch(`${SERVER_URL}/api/keys/${action === "register-key" ? "register" : "request"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...fields, ...extra, signature }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Server lỗi ${response.status}`);
  return body;
}

export function registerDocumentKey(signer, campaignId, cid, keyBase64, tier) {
  return signedRequest(signer, "register-key", campaignId, cid, { key: keyBase64, tier });
}

export async function requestDocumentKey(signer, campaignId, cid) {
  return (await signedRequest(signer, "request-key", campaignId, cid)).key;
}
