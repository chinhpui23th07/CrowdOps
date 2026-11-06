import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../features/wallet/WalletContext";
import { useCampaignList } from "../features/campaign/useCampaigns";
import { Badge, BlockArt, ChainArt, ErrorBox, Loading, ProgressBar } from "../shared/components/common";
import { CampaignState, campaignStatusLabel, formatEth, percent, timeLeft } from "../shared/utils/format";
import { ipfsUrl } from "../shared/services/ipfs.service";
import { CHAIN, DEPLOYMENT } from "../shared/config";

const FILTERS = [
  ["all", "Tất cả"],
  ["fundraising", "Đang huy động"],
  ["success", "Thành công / Triển khai"],
  ["failed", "Thất bại / Giải thể"],
];

function matches(filter, c, now) {
  if (filter === "all") return true;
  if (filter === "fundraising") return c.state === CampaignState.Fundraising && now <= c.deadline;
  if (filter === "success") return c.state === CampaignState.Successful || c.state === CampaignState.Active;
  return c.state === CampaignState.Failed || c.state === CampaignState.Dissolved;
}

export default function ExplorerPage() {
  const { chainNow } = useWallet();
  const { loading, data, error } = useCampaignList();
  const [filter, setFilter] = useState("all");
  const campaigns = (data || []).filter((c) => matches(filter, c, chainNow));

  return (
    <section>
      <div className="hero">
        <ChainArt />
        <p className="hero-kicker">◆ On-chain · {CHAIN.name}</p>
        <h1>
          Gây quỹ minh bạch, <span className="gradient-text">giải ngân bằng biểu quyết</span>
        </h1>
        <p className="lead">
          Tiền góp được giữ trong smart contract. Chủ dự án chỉ nhận được tiền khi người ủng hộ biểu quyết đồng ý
          (&gt; 50% tổng quyền biểu quyết). Không đạt mục tiêu thì mọi người được hoàn tiền.
        </p>
        <div className="actions">
          <Link className="btn btn-primary" to="/create">
            + Tạo chiến dịch
          </Link>
          <Link className="btn" to="/about">
            Cách hoạt động
          </Link>
        </div>
        {data && <PlatformStats campaigns={data} />}
      </div>

      <div className="page-head">
        <h2>Khám phá chiến dịch</h2>
      </div>

      <div className="tabs" role="tablist">
        {FILTERS.map(([key, text]) => (
          <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? "tab active" : "tab"} onClick={() => setFilter(key)}>
            {text}
          </button>
        ))}
      </div>

      {loading && !data && <Loading />}
      <ErrorBox error={error} />
      {data && campaigns.length === 0 && <p className="muted">Chưa có chiến dịch nào trong mục này.</p>}

      <div className="grid">
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} now={chainNow} />
        ))}
      </div>
    </section>
  );
}

/** Số liệu tổng hợp, tính từ dữ liệu đọc trực tiếp trên contract. */
function PlatformStats({ campaigns }) {
  const { readProvider } = useWallet();
  const [contractBalance, setContractBalance] = useState(null);
  const sum = (field) => campaigns.reduce((total, c) => total + c[field], 0n);
  const raised = sum("totalRaised");
  const disbursed = sum("totalDisbursed");
  const held = raised - disbursed - sum("totalRefunded");

  // Đối soát: số dư ETH thật của contract phải bằng tổng sổ sách các chiến dịch.
  useEffect(() => {
    if (!readProvider || !DEPLOYMENT) return;
    readProvider
      .getBalance(DEPLOYMENT.crowdOps)
      .then(setContractBalance)
      .catch(() => setContractBalance(null));
  }, [readProvider, raised, held]);

  const audit =
    contractBalance === null ? null : contractBalance === held ? (
      <p className="stat-note ok">✓ Khớp số dư thực tế của contract</p>
    ) : (
      <p className="stat-note bad">⚠ Số dư thực tế {formatEth(contractBalance, 4)} ETH</p>
    );
  const tiles = [
    ["Chiến dịch", campaigns.length],
    ["Tổng đã huy động", `${formatEth(raised, 4)} ETH`],
    ["Đang giữ trong contract", `${formatEth(held, 4)} ETH`, audit],
    ["Đã giải ngân", `${formatEth(disbursed, 4)} ETH`],
  ];
  return (
    <div className="hero-stats">
      {tiles.map(([label, value, note]) => (
        <div key={label} className="stat-tile">
          <p className="stat-label">{label}</p>
          <p className="stat-value">{value}</p>
          {note}
        </div>
      ))}
    </div>
  );
}

function CampaignCard({ campaign: c, now }) {
  const status = campaignStatusLabel(c, now);
  const progress = percent(c.totalRaised, c.goal);
  return (
    <Link to={`/campaign/${c.id}`} className="card campaign-card">
      <div className="card-media">
        <BlockArt seed={c.id} />
        {c.mediaCID ? <img src={ipfsUrl(c.mediaCID)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} /> : null}
        <span className="card-id">#{c.id}</span>
      </div>
      <div className="card-body">
        <Badge tone={status.tone}>{status.text}</Badge>
        <h3>{c.title}</h3>
        <ProgressBar value={progress} label={`Đã đạt ${progress}% mục tiêu`} />
        <p className="stats">
          <strong>{formatEth(c.totalRaised)} ETH</strong> / {formatEth(c.goal)} ETH ({progress}%)
        </p>
        {c.totalRefunded > 0n && <p className="muted small">Đã hoàn lại {formatEth(c.totalRefunded)} ETH cho người ủng hộ</p>}
        <p className="card-foot muted">
          <span>{c.backerCount} người ủng hộ</span>
          <span>{c.state === CampaignState.Fundraising ? `⏱ ${timeLeft(c.deadline, now)}` : "Đã kết thúc huy động"}</span>
        </p>
      </div>
    </Link>
  );
}
