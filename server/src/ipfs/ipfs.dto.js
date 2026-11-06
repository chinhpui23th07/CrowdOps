import { HttpError } from "../common/http-error.js";

/** Loại file được phép cho từng loại tài liệu. Tài liệu riêng luôn là bản đã mã hóa (nhị phân). */
export const ALLOWED_TYPES = {
  proposal: (m) => m === "application/pdf",
  media: (m) => m.startsWith("image/") || m === "video/mp4" || m === "video/webm",
  invoice: (m) => m === "application/pdf" || m.startsWith("image/"),
  document: (m) => m === "application/pdf" || m.startsWith("image/"),
  private: (m) => m === "application/octet-stream",
};

/** POST /api/ipfs/file - multipart: kind + file */
export function validateUploadFileDto({ file, kind }) {
  if (!file) throw new HttpError(400, "Chưa chọn file");
  if (!ALLOWED_TYPES[kind]) throw new HttpError(400, "Loại tài liệu không hợp lệ");
  if (!ALLOWED_TYPES[kind](file.mimetype)) {
    throw new HttpError(400, `File ${file.mimetype} không phù hợp với loại "${kind}"`);
  }
  return { file, kind };
}

/** POST /api/ipfs/json - { content: object, name?: string } */
export function validateUploadJsonDto(body) {
  const { content, name } = body || {};
  if (!content || typeof content !== "object") throw new HttpError(400, "Thiếu nội dung JSON");
  return { content, name: name || "metadata.json" };
}
