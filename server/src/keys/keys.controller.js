import { Router } from "express";
import { asyncHandler } from "../common/async-handler.js";
import { signatureGuard } from "../auth/signature.guard.js";
import { validateRegisterKeyDto, validateRequestKeyDto } from "./keys.dto.js";

/**
 * Controller "/api/keys": mọi route đều phải qua signatureGuard (ký bằng ví).
 *   POST /api/keys/register   chủ dự án đăng ký khóa AES của tài liệu riêng
 *   POST /api/keys/request    người dùng xin khóa, server kiểm tra quyền on-chain
 */
export function createKeysController({ keysService, chainId, now }) {
  const router = Router();

  router.post(
    "/register",
    signatureGuard({ action: "register-key", chainId, now }),
    asyncHandler(async (req, res) => {
      const dto = validateRegisterKeyDto(req.body);
      res.json(await keysService.registerKey(dto, req.signer));
    })
  );

  router.post(
    "/request",
    signatureGuard({ action: "request-key", chainId, now }),
    asyncHandler(async (req, res) => {
      const dto = validateRequestKeyDto(req.body);
      res.json(await keysService.grantKey(dto, req.signer));
    })
  );

  return router;
}
