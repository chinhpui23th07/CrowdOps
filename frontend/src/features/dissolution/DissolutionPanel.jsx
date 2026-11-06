import { useState } from "react";
import { useWallet } from "../wallet/WalletContext";
import { useTransaction } from "../wallet/useTransaction";
import { Address, Badge, ProgressBar, TxHint, TxStatus } from "../../shared/components/common";
import { CampaignState, RequestStatus, formatDateTime, formatEth, percent, timeLeft } from "../../shared/utils/format";

const UNITS = { minutes: 60, hours: 3600, days: 86400 };
const PROPOSAL_LABEL = {
  [RequestStatus.Voting]: { text: "Đang bỏ phiếu", tone: "info" },
  [RequestStatus.Approved]: { text: "Đã thông qua - quỹ giải thể", tone: "warning" },
  [RequestStatus.Rejected]: { text: "Không thông qua", tone: "neutral" },
};
const VOTE_LABEL = { 1: "Bạn đã ủng hộ giải thể", 2: "Bạn đã phản đối" };

/**
 * Giải thể quỹ: bảo vệ người góp khi chủ dự án bỏ đi. Người giữ token đề xuất, phiếu ủng hộ
 * vượt 50% TỔNG quyền (tại snapshot) thì quỹ đóng lại và mọi người rút phần còn lại theo tỷ lệ.
 */
export default function DissolutionPanel({ data }) {
  const { campaign: c, dissolutions, me } = data;
  const tx = useTransaction();
  const succeeded = c.state === CampaignState.Successful || c.state === CampaignState.Active;
  if (!succeeded && c.state !== CampaignState.Dissolved) return null;

  const hasOpen = dissolutions.some((p) => p.status === RequestStatus.Voting);
  const canPropose = succeeded && me && !me.isCreator && me.votes > 0n && !hasOpen;

  return (
    <div className="dissolution">
      <div className="card card-warning">
        <h2>Giải thể quỹ</h2>
        <p className="help">
          Nếu chủ dự án bỏ đi hoặc làm sai cam kết, người giữ token có thể đề xuất giải thể. Phiếu ủng hộ vượt{" "}
          <strong>50% tổng quyền biểu quyết</strong> thì chủ dự án mất quyền giải ngân, và số ETH còn lại được chia cho người
          giữ token theo tỷ lệ. Chủ dự án không được bỏ phiếu.
        </p>
        {succeeded && dissolutions.length === 0 && <p className="muted">Chưa có đề xuất giải thể nào.</p>}
        {succeeded && me && !me.isCreator && me.votes === 0n && (
          <p className="muted">Chỉ người đang giữ token của chiến dịch mới đề xuất được.</p>
        )}
        {canPropose && <ProposeForm campaignId={c.id} />}
        {hasOpen && succeeded && <p className="alert alert-info">Đang có một đề xuất chưa kết thúc.</p>}
      </div>

      <TxStatus tx={tx} />
      {[...dissolutions].reverse().map((p) => (
        <ProposalCard key={p.id} campaign={c} proposal={p} myVote={me?.dissolutionVotes?.[p.id]} isCreator={me?.isCreator} tx={tx} />
      ))}
    </div>
  );
}

function ProposeForm({ campaignId }) {
  const tx = useTransaction();
  const [reason, setReason] = useState("");
  const [durationValue, setDurationValue] = useState("3");
  const [durationUnit, setDurationUnit] = useState("days");
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    const duration = Number(durationValue) * UNITS[durationUnit];
    const problem = !reason.trim()
      ? "Nhập lý do đề xuất giải thể."
      : !(duration >= 60 && duration <= 30 * 86400)
        ? "Thời gian bỏ phiếu từ 1 phút đến 30 ngày."
        : null;
    setError(problem);
    if (problem) return;
    const receipt = await tx.run("Đề xuất giải thể quỹ", (k) => k.proposeDissolution(campaignId, reason.trim(), BigInt(duration)));
    if (receipt) setReason("");
  };

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="dissolve-reason">Lý do đề xuất *</label>
        <textarea id="dissolve-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="dissolve-duration">Thời gian bỏ phiếu *</label>
        <div className="row">
          <input id="dissolve-duration" type="number" min="1" value={durationValue} onChange={(e) => setDurationValue(e.target.value)} />
          <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)} aria-label="Đơn vị">
            <option value="minutes">phút</option>
            <option value="hours">giờ</option>
            <option value="days">ngày</option>
          </select>
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <TxStatus tx={tx} />
      <div className="actions">
        <button className="btn btn-danger" disabled={tx.busy}>
          Đề xuất giải thể
        </button>
        <TxHint />
      </div>
    </form>
  );
}

function ProposalCard({ campaign: c, proposal: p, myVote, isCreator, tx }) {
  const { account, chainNow } = useWallet();
  const label = PROPOSAL_LABEL[p.status];
  const supportPct = percent(p.supportVotes, p.totalVotingPower);
  const opposePct = percent(p.opposeVotes, p.totalVotingPower);
  const canVote =
    p.status === RequestStatus.Voting &&
    c.state !== CampaignState.Dissolved &&
    account &&
    !isCreator &&
    myVote &&
    myVote.vote === 0 &&
    myVote.power > 0n;

  return (
    <article className="card request-card">
      <div className="request-head">
        <h3>Đề xuất giải thể #{p.id}</h3>
        <Badge tone={label.tone}>{label.text}</Badge>
      </div>
      <p className="request-desc">{p.reason}</p>
      <dl className="info-list">
        <dt>Người đề xuất</dt>
        <dd>
          <Address value={p.proposer} />
        </dd>
        <dt>Hạn bỏ phiếu</dt>
        <dd>
          {formatDateTime(p.votingDeadline)}
          {p.status === RequestStatus.Voting && <strong> · {timeLeft(p.votingDeadline, chainNow)}</strong>}
        </dd>
        <dt>Snapshot</dt>
        <dd>
          block {p.snapshotBlock} · tổng quyền {formatEth(p.totalVotingPower)} phiếu
        </dd>
      </dl>

      <div className="vote-bars">
        <div className="vote-row">
          <span>Ủng hộ</span>
          <ProgressBar value={supportPct} marker={50} label={`Ủng hộ ${supportPct}% tổng quyền`} />
          <span className="mono">
            {supportPct}% · {p.supportCount} ví
          </span>
        </div>
        <div className="vote-row reject">
          <span>Phản đối</span>
          <ProgressBar value={opposePct} marker={50} label={`Phản đối ${opposePct}% tổng quyền`} />
          <span className="mono">
            {opposePct}% · {p.opposeCount} ví
          </span>
        </div>
      </div>

      {myVote && account && !isCreator && (
        <p className="help">
          Quyền biểu quyết của bạn cho đề xuất này: <strong>{formatEth(myVote.power)} phiếu</strong>
          {VOTE_LABEL[myVote.vote] && <> · {VOTE_LABEL[myVote.vote]}</>}
        </p>
      )}

      {canVote && (
        <div className="actions">
          <button className="btn btn-danger" disabled={tx.busy} onClick={() => tx.run(`Ủng hộ giải thể #${p.id}`, (k) => k.voteDissolution(c.id, p.id, true))}>
            Ủng hộ giải thể
          </button>
          <button className="btn" disabled={tx.busy} onClick={() => tx.run(`Phản đối giải thể #${p.id}`, (k) => k.voteDissolution(c.id, p.id, false))}>
            Phản đối
          </button>
          <TxHint />
        </div>
      )}
    </article>
  );
}
