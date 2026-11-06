import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useWallet } from "../features/wallet/WalletContext";
import { CHAIN, DEPLOYMENT } from "../shared/config";
import { serverHealth } from "../shared/services/ipfs.service";
import { describeError } from "../shared/utils/errors";
import { Logo } from "../shared/components/common";

export default function Header() {
  const { hasWallet, account, connect, connecting, isCorrectNetwork, walletChainId } = useWallet();
  const [error, setError] = useState(null);

  const onConnect = async () => {
    setError(null);
    try {
      await connect();
    } catch (e) {
      setError(describeError(e).message);
    }
  };

  return (
    <header className="header">
      <div className="container header-inner">
        <NavLink to="/" className="brand">
          <Logo />
          <span>
            Crowd <span className="gradient-text">Ops</span>
          </span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>
            Khám phá
          </NavLink>
          <NavLink to="/create">Tạo chiến dịch</NavLink>
          <NavLink to="/about">Cách hoạt động</NavLink>
        </nav>
        <div className="wallet">
          <span className={`network-pill ${account && !isCorrectNetwork ? "network-wrong" : ""}`}>
            {account
              ? isCorrectNetwork
                ? CHAIN.name
                : `Sai mạng (chainId ${walletChainId})`
              : `Mạng ứng dụng: ${CHAIN.name}`}
          </span>
          {account ? (
            <span className="account mono" title={account}>
              {account.slice(0, 6)}…{account.slice(-4)}
            </span>
          ) : hasWallet ? (
            <button className="btn btn-primary" onClick={onConnect} disabled={connecting}>
              {connecting ? "Đang kết nối…" : "Kết nối ví"}
            </button>
          ) : (
            <a className="btn btn-primary" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
              Cài MetaMask
            </a>
          )}
        </div>
      </div>
      {error && <div className="container alert alert-warning">{error}</div>}
      <WalletBanner />
    </header>
  );
}

/** Cảnh báo các tình huống khiến giao dịch không thể thực hiện. */
function WalletBanner() {
  const { hasWallet, account, isCorrectNetwork, switchNetwork } = useWallet();
  const [health, setHealth] = useState(undefined);
  const [switchError, setSwitchError] = useState(null);

  useEffect(() => {
    serverHealth().then(setHealth);
  }, []);

  const messages = [];
  if (!DEPLOYMENT) {
    messages.push(["danger", `Chưa có contract CrowdOps trên ${CHAIN.name}. Hãy chạy scripts/deploy.js.`]);
  }
  if (!hasWallet) {
    messages.push(["warning", "Trình duyệt chưa có ví. Bạn vẫn xem được dữ liệu, nhưng cần MetaMask để góp tiền và bỏ phiếu."]);
  } else if (!account) {
    messages.push(["info", "Chế độ chỉ xem: dữ liệu được đọc trực tiếp từ blockchain. Kết nối ví để thực hiện giao dịch."]);
  }
  if (health === null) {
    messages.push(["warning", "Không kết nối được server IPFS - tạm thời không upload được tài liệu (xem tài liệu vẫn bình thường)."]);
  } else if (health && !health.pinataConfigured) {
    messages.push(["warning", "Server chưa cấu hình Pinata - chưa upload được tài liệu lên IPFS."]);
  }

  const onSwitch = async () => {
    setSwitchError(null);
    try {
      await switchNetwork();
    } catch (e) {
      setSwitchError(describeError(e).message);
    }
  };

  return (
    <div className="container banners">
      {account && !isCorrectNetwork && (
        <div className="alert alert-danger">
          Ví đang kết nối sai mạng. Ứng dụng chạy trên <strong>{CHAIN.name}</strong> (chainId {CHAIN.id}).{" "}
          <button className="btn btn-small" onClick={onSwitch}>
            Chuyển sang {CHAIN.name}
          </button>
          {switchError && <div>{switchError}</div>}
        </div>
      )}
      {messages.map(([tone, text]) => (
        <div key={text} className={`alert alert-${tone}`}>
          {text}
        </div>
      ))}
    </div>
  );
}
