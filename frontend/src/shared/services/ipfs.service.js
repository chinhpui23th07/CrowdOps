import { IPFS_GATEWAY, SERVER_URL } from "../config";

export function ipfsUrl(cid) {
  return cid ? `${IPFS_GATEWAY}${cid}` : null;
}

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Server lỗi ${response.status}`);
  return body;
}

/**
 * Upload file lên IPFS thông qua server (server giữ JWT Pinata).
 * @param kind proposal | media | invoice | document | private
 */
export async function uploadFile(file, kind) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file, file.name);
  return parseResponse(await fetch(`${SERVER_URL}/api/ipfs/file`, { method: "POST", body: form }));
}

export async function uploadJson(content, name) {
  return parseResponse(
    await fetch(`${SERVER_URL}/api/ipfs/json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, name }),
    })
  );
}

export async function fetchFromIpfs(cid) {
  const response = await fetch(ipfsUrl(cid));
  if (!response.ok) throw new Error(`Không tải được ${cid} từ gateway (HTTP ${response.status})`);
  return response.arrayBuffer();
}

export async function serverHealth() {
  try {
    return await parseResponse(await fetch(`${SERVER_URL}/api/health`));
  } catch {
    return null;
  }
}
