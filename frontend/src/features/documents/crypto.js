/**
 * Mã hóa tài liệu riêng NGAY TRONG TRÌNH DUYỆT bằng AES-256-GCM (Web Crypto API) trước khi
 * upload lên IPFS. IPFS là công khai - ai có CID cũng tải được - nên chỉ bản mã hóa được lên đó.
 *
 * Định dạng file mã hóa: [12 byte IV][ciphertext]
 * Nội dung trước khi mã hóa: [4 byte độ dài header][header JSON {name, type}][bytes của file gốc]
 */
const IV_BYTES = 12;

export async function encryptFile(file) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const header = new TextEncoder().encode(JSON.stringify({ name: file.name, type: file.type }));
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const plain = new Uint8Array(4 + header.length + fileBytes.length);
  new DataView(plain.buffer).setUint32(0, header.length);
  plain.set(header, 4);
  plain.set(fileBytes, 4 + header.length);

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const output = new Uint8Array(IV_BYTES + cipher.length);
  output.set(iv, 0);
  output.set(cipher, IV_BYTES);

  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return {
    encryptedFile: new File([output], `${file.name}.enc`, { type: "application/octet-stream" }),
    keyBase64: bytesToBase64(rawKey),
  };
}

export async function decryptFile(encryptedBuffer, keyBase64) {
  const data = new Uint8Array(encryptedBuffer);
  const key = await crypto.subtle.importKey("raw", base64ToBytes(keyBase64), "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, IV_BYTES) }, key, data.slice(IV_BYTES))
  );
  const headerLength = new DataView(plain.buffer).getUint32(0);
  const header = JSON.parse(new TextDecoder().decode(plain.slice(4, 4 + headerLength)));
  return new File([plain.slice(4 + headerLength)], header.name, { type: header.type || "application/octet-stream" });
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
