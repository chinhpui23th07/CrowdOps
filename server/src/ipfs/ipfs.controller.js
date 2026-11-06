import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../common/async-handler.js";
import { createRateLimiter } from "../common/rate-limit.middleware.js";
import { pinataConfiguredGuard } from "./pinata-configured.guard.js";
import { validateUploadFileDto, validateUploadJsonDto } from "./ipfs.dto.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Controller "/api/ipfs": chỉ khai báo route, chạy guard/DTO rồi giao cho service.
 *   POST /api/ipfs/file   upload một file (PDF, ảnh, video, tài liệu đã mã hóa)
 *   POST /api/ipfs/json   upload metadata JSON
 */
export function createIpfsController({ ipfsService, pinata, now }) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });
  const uploadLimiter = createRateLimiter({ max: 30, windowMs: 10 * 60 * 1000, now });
  const requirePinata = pinataConfiguredGuard(pinata);

  router.post(
    "/file",
    uploadLimiter,
    upload.single("file"),
    requirePinata,
    asyncHandler(async (req, res) => {
      const dto = validateUploadFileDto({ file: req.file, kind: req.body.kind });
      res.json(await ipfsService.uploadFile(dto));
    })
  );

  router.post(
    "/json",
    uploadLimiter,
    requirePinata,
    asyncHandler(async (req, res) => {
      const dto = validateUploadJsonDto(req.body);
      res.json(await ipfsService.uploadJson(dto));
    })
  );

  return router;
}
