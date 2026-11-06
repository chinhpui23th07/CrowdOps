/**
 * Upload lên IPFS qua dịch vụ pinning Pinata. "Pin" nghĩa là Pinata cam kết giữ file trên
 * node IPFS của họ, nên file vẫn truy xuất được khi máy của nhóm tắt.
 * JWT chỉ nằm ở server (.env) - không bao giờ gửi xuống trình duyệt.
 */
const PINATA_API = "https://api.pinata.cloud";

export function createPinataClient(jwt, fetchImpl = fetch) {
  const headers = { Authorization: `Bearer ${jwt}` };

  async function handle(response) {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Pinata trả lỗi ${response.status}: ${text.slice(0, 200)}`);
    }
    const body = await response.json();
    return { cid: body.IpfsHash, size: body.PinSize };
  }

  async function pinFile({ buffer, fileName, mimeType, metadata = {} }) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), fileName);
    form.append("pinataMetadata", JSON.stringify({ name: fileName, keyvalues: metadata }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
    return handle(await fetchImpl(`${PINATA_API}/pinning/pinFileToIPFS`, { method: "POST", headers, body: form }));
  }

  return {
    configured: Boolean(jwt),
    pinFile,

    /**
     * JSON cũng được upload như một file UTF-8 qua pinFileToIPFS (thay vì pinJSONToIPFS):
     * kiểm thử ngày 03/11/2026 cho thấy nội dung ghim bằng pinJSONToIPFS không truy xuất được
     * qua gateway, còn pinFileToIPFS thì được. CID = sha256 của đúng chuỗi JSON nên tự kiểm chứng được.
     */
    async pinJson({ content, name, metadata = {} }) {
      return pinFile({
        buffer: Buffer.from(JSON.stringify(content), "utf8"),
        fileName: name,
        mimeType: "application/json",
        metadata,
      });
    },
  };
}
