import { HttpError } from "../common/http-error.js";

/** Guard: chặn upload khi server chưa có PINATA_JWT, trả 503 thay vì để Pinata báo lỗi khó hiểu. */
export function pinataConfiguredGuard(pinata) {
  return (_req, _res, next) => {
    if (!pinata.configured) return next(new HttpError(503, "Server chưa cấu hình PINATA_JWT"));
    next();
  };
}
