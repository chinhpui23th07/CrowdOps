import { useCallback, useEffect, useState } from "react";
import { useWallet } from "./WalletContext";
import { describeError } from "../../shared/utils/errors";

/**
 * Vòng đời một giao dịch:
 *   idle -> signing (chờ người dùng ký trong ví) -> pending (đã gửi, chờ đào vào block)
 *        -> success | error
 * ethers tự "chạy thử" (estimateGas) trước khi mở ví, nên giao dịch chắc chắn bị contract
 * từ chối sẽ báo lỗi ngay, người dùng không mất phí gas.
 */
export function useTransaction() {
  const { account, isCorrectNetwork, getWriteContract, refresh } = useWallet();
  const [state, setState] = useState({ status: "idle" });

  // Đổi ví thì xóa trạng thái giao dịch cũ để không hiển thị kết quả của ví khác.
  useEffect(() => {
    setState({ status: "idle" });
  }, [account]);

  const run = useCallback(
    async (label, send, { contractAddress, abi } = {}) => {
      if (!account) {
        setState({ status: "error", label, kind: "wallet", message: "Hãy kết nối ví trước khi gửi giao dịch." });
        return null;
      }
      if (!isCorrectNetwork) {
        setState({ status: "error", label, kind: "network", message: "Ví đang ở sai mạng. Hãy chuyển mạng trước." });
        return null;
      }
      try {
        setState({ status: "signing", label });
        const contract = await getWriteContract(contractAddress, abi);
        const tx = await send(contract);
        setState({ status: "pending", label, hash: tx.hash });
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("Giao dịch bị revert trên chain");
        setState({ status: "success", label, hash: tx.hash, blockNumber: receipt.blockNumber });
        refresh();
        return receipt;
      } catch (error) {
        console.error(error);
        const { kind, message } = describeError(error);
        setState((prev) => ({ status: "error", label, kind, message, hash: prev.hash }));
        return null;
      }
    },
    [account, isCorrectNetwork, getWriteContract, refresh]
  );

  return {
    ...state,
    busy: state.status === "signing" || state.status === "pending",
    run,
    reset: () => setState({ status: "idle" }),
  };
}
