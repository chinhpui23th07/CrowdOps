import { useState } from "react";
import { addressUrl, txUrl } from "../config";
import { shortHash } from "../utils/format";

export function Badge({ tone = "neutral", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ProgressBar({ value, label, marker }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-fill" style={{ width: `${clamped}%` }} />
      {marker !== undefined && <div className="progress-marker" style={{ left: `${marker}%` }} title={`Ngưỡng ${marker}%`} />}
    </div>
  );
}

/** Hiển thị ĐẦY ĐỦ địa chỉ ví (không rút gọn) để người dùng đối chiếu, kèm nút sao chép. */
export function Address({ value, label }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const url = addressUrl(value);
  const copy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="address">
      {label && <span className="muted">{label}: </span>}
      <code className="mono">{value}</code>
      <button type="button" className="btn-link" onClick={copy} aria-label="Sao chép địa chỉ">
        {copied ? "Đã chép" : "Chép"}
      </button>
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          Etherscan ↗
        </a>
      )}
    </span>
  );
}

export function TxLink({ hash, full = false }) {
  if (!hash) return null;
  const url = txUrl(hash);
  const text = full ? hash : shortHash(hash);
  return url ? (
    <a className="mono" href={url} target="_blank" rel="noreferrer" title={hash}>
      {text} ↗
    </a>
  ) : (
    <code className="mono" title={hash}>
      {text}
    </code>
  );
}

/** Khung trạng thái giao dịch - dùng chung cho mọi nút gửi giao dịch. */
export function TxStatus({ tx }) {
  if (!tx || tx.status === "idle") return null;
  const map = {
    signing: ["info", "Đang chờ bạn xác nhận trong ví MetaMask…"],
    pending: ["info", "Đã gửi giao dịch, đang chờ mạng xác nhận (đào vào block)…"],
    success: ["success", "Giao dịch thành công."],
    error: [tx.kind === "rejected" ? "warning" : "danger", tx.message],
  };
  const [tone, text] = map[tx.status];
  return (
    <div className={`alert alert-${tone}`} role="status" aria-live="polite">
      <strong>{tx.label}: </strong>
      {(tx.status === "signing" || tx.status === "pending") && <span className="spinner" aria-hidden="true" />}
      {text}
      {tx.hash && (
        <div className="tx-hash">
          Mã giao dịch: <TxLink hash={tx.hash} full />
          {tx.blockNumber && <span className="muted"> · block {tx.blockNumber}</span>}
        </div>
      )}
    </div>
  );
}

export function Loading({ text = "Đang đọc dữ liệu từ blockchain…" }) {
  return (
    <p className="muted">
      <span className="spinner" aria-hidden="true" /> {text}
    </p>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert alert-danger">Không đọc được dữ liệu: {error.shortMessage || error.message}</div>;
}

/** Nhãn phân biệt thao tác đọc (miễn phí) và giao dịch (cần ký ví, tốn gas). */
export function TxHint() {
  return <span className="tx-hint">✍ Cần ký bằng ví · tốn phí gas</span>;
}

/** Logo khối lập phương (một "block" của chuỗi). */
export function Logo({ className = "brand-logo" }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path d="M16 2 28 9v14L16 30 4 23V9z" fill="none" stroke="url(#logo-g)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 16 28 9M16 16 4 9M16 16v14" stroke="url(#logo-g)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 6.6 23.5 11 16 15.4 8.5 11z" fill="url(#logo-g)" opacity="0.85" />
    </svg>
  );
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống - cùng id luôn cho cùng một hình. */
function seeded(seed) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ảnh nền thay thế khi chiến dịch chưa có ảnh: lưới khối sinh từ id chiến dịch. */
export function BlockArt({ seed = 0 }) {
  const rand = seeded(seed * 9973 + 17);
  const hue = Math.floor(rand() * 360);
  const cells = [];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 14; x++) {
      const r = rand();
      if (r > 0.55) cells.push({ x, y, o: 0.12 + r * 0.5, accent: r > 0.93 });
    }
  }
  return (
    <svg className="block-art" viewBox="0 0 280 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`ba-${seed}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 85% 55%)`} />
          <stop offset="1" stopColor={`hsl(${(hue + 70) % 360} 80% 60%)`} />
        </linearGradient>
      </defs>
      <rect width="280" height="120" fill="#0b1224" />
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x * 20 + 2}
          y={c.y * 20 + 2}
          width="16"
          height="16"
          rx="3"
          fill={`url(#ba-${seed})`}
          opacity={c.accent ? 1 : c.o}
        />
      ))}
    </svg>
  );
}

/** Minh họa chuỗi khối cho phần hero. */
export function ChainArt() {
  const blocks = [0, 1, 2, 3];
  return (
    <svg className="hero-chain" viewBox="0 0 260 120" aria-hidden="true">
      <defs>
        <linearGradient id="chain-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {blocks.slice(1).map((i) => (
        <line key={i} x1={i * 64 - 20} y1={30 + (i % 2) * 50} x2={i * 64 + 16} y2={30 + ((i + 1) % 2) * 50} stroke="url(#chain-g)" strokeWidth="2" strokeDasharray="4 4" opacity="0.7" />
      ))}
      {blocks.map((i) => (
        <g key={i} transform={`translate(${i * 64 + 4} ${12 + ((i + 1) % 2) * 50})`}>
          <rect width="40" height="40" rx="9" fill="rgba(6,9,18,0.8)" stroke="url(#chain-g)" strokeWidth="2" />
          <rect x="10" y="10" width="20" height="20" rx="4" fill="url(#chain-g)" opacity={0.35 + i * 0.18} />
        </g>
      ))}
    </svg>
  );
}
