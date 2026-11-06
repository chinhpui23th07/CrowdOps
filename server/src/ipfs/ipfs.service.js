/**
 * Nghiệp vụ upload IPFS. Dữ liệu vào đã được DTO kiểm tra, service chỉ việc gọi Pinata
 * và gắn metadata của ứng dụng.
 */
export function createIpfsService({ pinata }) {
  return {
    async uploadFile({ file, kind }) {
      const result = await pinata.pinFile({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        metadata: { app: "crowd-ops", kind },
      });
      return { ...result, kind, mimeType: file.mimetype, name: file.originalname };
    },

    async uploadJson({ content, name }) {
      return pinata.pinJson({ content, name, metadata: { app: "crowd-ops" } });
    },
  };
}
