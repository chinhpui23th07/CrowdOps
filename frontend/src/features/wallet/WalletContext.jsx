import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Contract, JsonRpcProvider, toQuantity } from "ethers";
import { CHAIN, DEPLOYMENT } from "../../shared/config";
import CrowdOpsAbi from "../../contracts/CrowdOps.abi.json";
import { NetworkFeeBrowserProvider } from "./networkFeeProvider";

const WalletContext = createContext(null);

/**
 * Hai "đường" nói chuyện với blockchain:
 *  - ĐỌC (view): qua RPC công khai (readProvider), không cần ví, miễn phí.
 *  - GHI (giao dịch): qua ví MetaMask của người dùng, phải ký và trả phí gas.
 */
export function WalletProvider({ children }) {
  const ethereum = typeof window !== "undefined" ? window.ethereum : undefined;
  const [account, setAccount] = useState(null);
  const [walletChainId, setWalletChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [chainTimeOffset, setChainTimeOffset] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const readProvider = useMemo(
    () => new JsonRpcProvider(CHAIN.rpcUrl, CHAIN.id, { staticNetwork: true, polling: false }),
    []
  );
  const crowdOps = useMemo(
    () => (DEPLOYMENT ? new Contract(DEPLOYMENT.crowdOps, CrowdOpsAbi, readProvider) : null),
    [readProvider]
  );

  // Đồng hồ chạy mỗi giây cho bộ đếm ngược.
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Trên Hardhat local thời gian chain có thể bị tua nhanh hơn đồng hồ máy; lấy độ lệch để hiển thị đúng.
  useEffect(() => {
    readProvider
      .getBlock("latest")
      .then((block) => setChainTimeOffset(Math.max(0, block.timestamp - Math.floor(Date.now() / 1000))))
      .catch(() => {});
  }, [readProvider, refreshKey]);

  // Theo dõi ví: đổi tài khoản / đổi mạng thì cập nhật ngay.
  useEffect(() => {
    if (!ethereum) return;
    ethereum.request({ method: "eth_accounts" }).then((accounts) => setAccount(accounts[0] || null));
    ethereum.request({ method: "eth_chainId" }).then((id) => setWalletChainId(Number(id)));
    const onAccounts = (accounts) => setAccount(accounts[0] || null);
    const onChain = (id) => setWalletChainId(Number(id));
    ethereum.on?.("accountsChanged", onAccounts);
    ethereum.on?.("chainChanged", onChain);
    return () => {
      ethereum.removeListener?.("accountsChanged", onAccounts);
      ethereum.removeListener?.("chainChanged", onChain);
    };
  }, [ethereum]);

  const connect = useCallback(async () => {
    if (!ethereum) throw new Error("Chưa cài ví MetaMask");
    setConnecting(true);
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0] || null);
      setWalletChainId(Number(await ethereum.request({ method: "eth_chainId" })));
    } finally {
      setConnecting(false);
    }
  }, [ethereum]);

  const switchNetwork = useCallback(async () => {
    const chainId = toQuantity(CHAIN.id);
    try {
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (error) {
      // 4902: ví chưa biết mạng này -> thêm mạng
      if (error.code !== 4902) throw error;
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: CHAIN.name,
            rpcUrls: [CHAIN.rpcUrl],
            nativeCurrency: CHAIN.currency,
            blockExplorerUrls: CHAIN.explorer ? [CHAIN.explorer] : undefined,
          },
        ],
      });
    }
  }, [ethereum]);

  const isCorrectNetwork = walletChainId === CHAIN.id;

  /** Contract gắn với ví để gửi giao dịch. Chỉ gọi sau khi đã kiểm tra ví + mạng. */
  const getWriteContract = useCallback(
    async (address = DEPLOYMENT?.crowdOps, abi = CrowdOpsAbi) => {
      const signer = await new NetworkFeeBrowserProvider(ethereum).getSigner();
      return new Contract(address, abi, signer);
    },
    [ethereum]
  );

  const getSigner = useCallback(async () => new NetworkFeeBrowserProvider(ethereum).getSigner(), [ethereum]);

  const value = {
    hasWallet: Boolean(ethereum),
    account,
    walletChainId,
    isCorrectNetwork,
    connecting,
    connect,
    switchNetwork,
    readProvider,
    crowdOps,
    getWriteContract,
    getSigner,
    refreshKey,
    refresh: () => setRefreshKey((k) => k + 1),
    chainNow: now + chainTimeOffset,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet phải nằm trong WalletProvider");
  return context;
}
