import { createIpfsController } from "./ipfs.controller.js";
import { createIpfsService } from "./ipfs.service.js";

/**
 * Module IPFS: ghép service + controller của tính năng upload.
 * Tương đương @Module({ controllers: [IpfsController], providers: [IpfsService] }).
 * @returns Express router, được gắn vào "/api/ipfs" trong app.module.js
 */
export function createIpfsModule({ pinata, now }) {
  const ipfsService = createIpfsService({ pinata });
  return createIpfsController({ ipfsService, pinata, now });
}
