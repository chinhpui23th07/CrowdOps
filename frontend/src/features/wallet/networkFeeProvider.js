import { BrowserProvider, FeeData, parseUnits } from "ethers";

const MIN_PRIORITY_FEE = parseUnits("0.001", "gwei");

/**
 * Mặc định ethers đề xuất "tiền boa" 1 gwei/gas cho mọi giao dịch. Trên Sepolia, tạo chiến dịch
 * tốn ~15 triệu gas (tự deploy token riêng) nên sẽ mất ~0,015 ETH, trong khi mạng chỉ cần vài wei.
 * Đề xuất phí theo giá thực tế của mạng (base fee x 2 + tip mạng gợi ý, tối thiểu 0,001 gwei).
 */
export class NetworkFeeBrowserProvider extends BrowserProvider {
  async getFeeData() {
    const fallback = await super.getFeeData();
    try {
      const [suggestedTip, block] = await Promise.all([this.send("eth_maxPriorityFeePerGas", []), this.getBlock("latest")]);
      if (block?.baseFeePerGas == null) return fallback;
      let tip = BigInt(suggestedTip);
      if (tip < MIN_PRIORITY_FEE) tip = MIN_PRIORITY_FEE;
      return new FeeData(fallback.gasPrice, block.baseFeePerGas * 2n + tip, tip);
    } catch {
      return fallback;
    }
  }
}
