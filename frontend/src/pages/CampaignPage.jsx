import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ZeroAddress } from "ethers";
import { useWallet } from "../features/wallet/WalletContext";
import { useCampaignDetail } from "../features/campaign/useCampaigns";
import { Address, Badge, ErrorBox, Loading, ProgressBar } from "../shared/components/common";
import { campaignStatusLabel, formatDateTime, formatEth, percent, timeLeft, CampaignState } from "../shared/utils/format";
import { ipfsUrl } from "../shared/services/ipfs.service";
import { CHAIN } from "../shared/config";
import ActionPanel from "../features/campaign/components/ActionPanel";
import VotingDashboard from "../features/voting/VotingDashboard";
import DocumentsPanel from "../features/documents/DocumentsPanel";
import HistoryPanel from "../features/campaign/components/HistoryPanel";
import DissolutionPanel from "../features/dissolution/DissolutionPanel";
import CashFlowPanel from "../features/campaign/components/CashFlowPanel";

const TABS = [
  ["overview", "Tổng quan"],
  ["voting", "Bỏ phiếu chi tiêu"],
  ["cashflow", "Dòng tiền"],
  ["documents", "Tài liệu IPFS"],
  ["history", "Lịch sử giao dịch"],
];

export default function CampaignPage() {
  const { id } = useParams();
  const campaignId = Number(id);
  const { chainNow, crowdOps } = useWallet();
  const [tab, setTab] = useState("overview");
  const { loading, data, error } = useCampaignDetail(campaignId);

  if (!crowdOps) return <div className="alert alert-danger">Chưa cấu hình contract.</div>;
  if (loading && !data) return <Loading />;
  if (error && !data) {
    return (
      <>
        <ErrorBox error={error} />
        <Link to="/">← Về danh sách</Link>
      </>
    );
  }

  const { campaign: c, me } = data;
  const status = campaignStatusLabel(c, chainNow);
  const progress = percent(c.totalRaised, c.goal);
  const openRequests = [...data.requests, ...data.dissolutions].filter((r) => r.status === 0).length;

  return (
    <section>
      <Link to="/" className="back">
        ← Danh sách chiến dịch
      </Link>
      <div className="detail-head">
        <div>
          <Badge tone={status.tone}>{status.text}</Badge>
          <h1>
            #{c.id} · {c.title}
          </h1>
          {c.description && <p className="lead">{c.description}</p>}
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <MediaPreview cid={c.mediaCID} />
          <ProgressBar value={progress} label={`Đã đạt ${progress}% mục tiêu`} />
          <p className="big-stat">
            <strong>{formatEth(c.totalRaised)} ETH</strong> / {formatEth(c.goal)} ETH · {progress}%
          </p>
          <dl className="info-list">
            <dt>Chủ dự án</dt>
            <dd>
              <Address value={c.creator} />
            </dd>
            <dt>Mạng</dt>
            <dd>
              {CHAIN.name} (chainId {CHAIN.id})
            </dd>
            <dt>Hạn chót</dt>
            <dd>
              {formatDateTime(c.deadline)} ·{" "}
              <strong>{c.state === CampaignState.Fundraising ? timeLeft(c.deadline, chainNow) : "Đã chốt kết quả"}</strong>
            </dd>
            <dt>Người ủng hộ</dt>
            <dd>{c.backerCount}</dd>
            <dt>Số dư quỹ trong contract</dt>
            <dd>
              {formatEth(data.balance)} ETH
              <span className="muted">
                {" "}
                (đã giải ngân {formatEth(c.totalDisbursed)} · đã hoàn {formatEth(c.totalRefunded)})
              </span>
            </dd>
            <dt>Token quản trị</dt>
            <dd>
              {data.tokenSymbol} - riêng cho chiến dịch #{c.id} · tổng cung {formatEth(data.totalSupply)}
              <br />
              <Address value={c.token} />
            </dd>
            <dt>Ngưỡng Kim cương</dt>
            <dd>{formatEth(c.diamondThreshold)} ETH</dd>
          </dl>
        </div>

        <ActionPanel data={data} />
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([key, text]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "tab active" : "tab"} onClick={() => setTab(key)}>
            {text}
            {key === "voting" && openRequests > 0 && <span className="dot">{openRequests}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview campaign={c} me={me} tokenSymbol={data.tokenSymbol} />}
      {tab === "voting" && (
        <>
          <VotingDashboard data={data} />
          <DissolutionPanel data={data} />
        </>
      )}
      {tab === "cashflow" && <CashFlowPanel data={data} />}
      {tab === "documents" && <DocumentsPanel data={data} />}
      {tab === "history" && <HistoryPanel campaignId={campaignId} />}
    </section>
  );
}

function MediaPreview({ cid }) {
  const [kind, setKind] = useState("image");
  if (!cid) return null;
  const url = ipfsUrl(cid);
  return (
    <div className="media-preview">
      {kind === "image" ? (
        <img src={url} alt="Ảnh giới thiệu dự án" onError={() => setKind("video")} />
      ) : kind === "video" ? (
        <video src={url} controls onError={() => setKind("none")} />
      ) : null}
    </div>
  );
}

function Overview({ campaign: c, me, tokenSymbol }) {
  const { account } = useWallet();
  return (
    <div className="card">
      <h2>Quy tắc của chiến dịch này</h2>
      <ol className="rules">
        <li>Mỗi 1 ETH góp vào nhận 1 {tokenSymbol}. Token chỉ thuộc chiến dịch #{c.id}, chỉ contract CrowdOps mint được.</li>
        <li>Trong lúc huy động, token không chuyển nhượng được. Hết hạn mà chưa đạt mục tiêu thì mỗi người tự bấm hoàn tiền và token bị hủy (burn).</li>
        <li>
          Nếu thành công, chủ dự án phải tạo yêu cầu chi kèm chứng từ. Yêu cầu chỉ được giải ngân khi phiếu Approve vượt{" "}
          <strong>50% tổng token</strong> (không phải 50% số người đã bỏ phiếu).
        </li>
        <li>Quyền biểu quyết được chụp (snapshot) lúc tạo yêu cầu - chuyển token sau đó không tạo thêm phiếu.</li>
        <li>Người góp từ {formatEth(c.diamondThreshold)} ETH được nhận một NFT Kim cương khi chiến dịch thành công.</li>
        <li>
          Nếu chủ dự án bỏ đi, người giữ token có thể biểu quyết <strong>giải thể quỹ</strong> (cũng cần &gt; 50% tổng quyền).
          Khi đó số ETH còn lại được chia cho người giữ token theo tỷ lệ.
        </li>
      </ol>
      {me && (
        <>
          <h2>Vị thế của bạn</h2>
          <dl className="info-list">
            <dt>Đã góp</dt>
            <dd>
              {formatEth(me.contributed)} ETH {me.refunded && <Badge tone="neutral">đã hoàn tiền</Badge>}
            </dd>
            <dt>Token đang giữ</dt>
            <dd>
              {formatEth(me.tokenBalance)} {tokenSymbol}
            </dd>
            <dt>Quyền biểu quyết hiện tại</dt>
            <dd>{formatEth(me.votes)} phiếu</dd>
            <dt>Người đại diện bỏ phiếu (delegate)</dt>
            <dd>
              {me.delegate === ZeroAddress ? (
                "Chưa có (token chưa có quyền biểu quyết)"
              ) : me.delegate.toLowerCase() === account?.toLowerCase() ? (
                "Chính bạn (tự động khi nhận token)"
              ) : (
                <Address value={me.delegate} />
              )}
            </dd>
            <dt>NFT Kim cương</dt>
            <dd>{me.diamondClaimed ? "Đã nhận" : me.diamondEligible ? "Đủ điều kiện" : "Chưa đủ điều kiện"}</dd>
          </dl>
        </>
      )}
    </div>
  );
}
