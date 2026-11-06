import { createAccessService } from "../auth/access.service.js";
import { createKeysController } from "./keys.controller.js";
import { createKeysService } from "./keys.service.js";

/**
 * Module khóa giải mã: ghép access service + keys service + controller.
 * Tương đương @Module({ controllers: [KeysController], providers: [KeysService, AccessService] }).
 * @returns Express router, được gắn vào "/api/keys" trong app.module.js
 */
export function createKeysModule({ chain, keyStore, chainId, now }) {
  const accessService = createAccessService({ chain });
  const keysService = createKeysService({ chain, keyStore, accessService, chainId, now });
  return createKeysController({ keysService, chainId, now });
}
