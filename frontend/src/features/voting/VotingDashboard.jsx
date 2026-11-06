import { useState } from "react";
import { isAddress, parseEther } from "ethers";
import { useWallet } from "../wallet/WalletContext";
import { useTransaction } from "../wallet/useTransaction";
import { Address, Badge, ProgressBar, TxHint, TxStatus } from "../../shared/components/common";
import FileUploadField from "../../shared/components/FileUploadField";
import { CampaignState, REQUEST_STATUS_LABEL, RequestStatus, formatDateTime, formatEth, percent, timeLeft } from "../../shared/utils/format";
import { ipfsUrl } from "../../shared/services/ipfs.service";

const VOTE_LABEL = { 0: null, 1: "Bạn đã Approve", 2: "Bạn đã Reject" };

export default function VotingDashboard({ data }) {
  const { campaign: c, requests, me, hasOpenRequest } = data;
  const tx = useTransaction();
  const succeeded = c.state === CampaignState.Successful || c.state === CampaignState.Active;

  return (
    <div>
      <div className="card">
        <h2>Voting Dashboard</h2>
        <p className="help">
          Điều kiện duyệt: phiếu Approve &gt; 50% <strong>tổng quyền biểu quyết tại snapshot</strong>. Vạch đứng trên thanh là
          mốc 50%. Phiếu Reject đạt 50% thì yêu cầu bị bác ngay; hết hạn mà chưa đủ phiếu Approve cũng bị bác.
        </p>
        {c.state === CampaignState.Dissolved ? (
          <p className="muted">Quỹ đã giải thể theo biểu quyết - không thể tạo hay giải ngân yêu cầu chi nữa.</p>
        ) : (
          !succeeded && <p className="muted">Chỉ chiến dịch đã thành công mới có yêu cầu chi tiêu.</p>
        )}
        {succeeded && requests.length === 0 && <p className="muted">Chủ dự án chưa tạo yêu cầu chi nào.</p>}
      </div>

      {me?.isCreator && succeeded && !hasOpenRequest && <CreateRequestForm campaign={c} balance={data.balance} />}
      {me?.isCreator && succeeded && hasOpenRequest && (
        <p className="alert alert-info">Đang có một yêu cầu chưa kết thúc - mỗi chiến dịch chỉ có một yêu cầu mở tại một thời điểm.</p>
      )}

      <TxStatus tx={tx} />
      {[...requests].reverse().map((r) => (
        <RequestCard key={r.id} campaign={c} request={r} myVote={me?.requestVotes?.[r.id]} isCreator={me?.isCreator} tx={tx} />
      ))}
    </div>
  );
}

function RequestCard({ campaign: c, request: r, myVote, isCreator, tx }) {
  const { account, chainNow } = useWallet();
  const label = REQUEST_STATUS_LABEL[r.status];
  const approvePct = percent(r.approveVotes, r.totalVotingPower);
  const rejectPct = percent(r.rejectVotes, r.totalVotingPower);
  const canVote = r.status === RequestStatus.Voting && account && !isCreator && myVote && myVote.vote === 0 && myVote.power > 0n;

  return (
    <article className="card request-card">
      <div className="request-head">
        <h3>Yêu cầu #{r.id}</h3>
        <Badge tone={label.tone}>{label.text}</Badge>
      </div>
      <p className="request-desc">{r.description}</p>
      <dl className="info-list">
        <dt>Số tiền</dt>
        <dd>
          <strong>{formatEth(r.amount)} ETH</strong>
        </dd>
        <dt>Ví nhận tiền</dt>
        <dd>
          <Address value={r.recipient} />
        </dd>
        <dt>Chứng từ</dt>
        <dd>
          <a href={ipfsUrl(r.evidenceCID)} target="_blank" rel="noreferrer">
            Xem hóa đơn/chứng từ gốc trên IPFS ↗
          </a>{" "}
          <span className="muted">(công khai)</span>
        </dd>
        <dt>Hạn bỏ phiếu</dt>
        <dd>
          {formatDateTime(r.votingDeadline)}
          {r.status === RequestStatus.Voting && <strong> · {timeLeft(r.votingDeadline, chainNow)}</strong>}
        </dd>
        <dt>Snapshot</dt>
        <dd>
          block {r.snapshotBlock} · tổng quyền {formatEth(r.totalVotingPower)} phiếu
        </dd>
      </dl>

      <div className="vote-bars">
        <div className="vote-row">
          <span>Approve</span>
          <ProgressBar value={approvePct} marker={50} label={`Approve ${approvePct}% tổng quyền`} />
          <span className="mono">
            {approvePct}% · {r.approveCount} ví
          </span>
        </div>
        <div className="vote-row reject">
          <span>Reject</span>
          <ProgressBar value={rejectPct} marker={50} label={`Reject ${rejectPct}% tổng quyền`} />
          <span className="mono">
            {rejectPct}% · {r.rejectCount} ví
          </span>
        </div>
      </div>

      {myVote && account && !isCreator && (
        <p className="help">
          Quyền biểu quyết của bạn cho yêu cầu này: <strong>{formatEth(myVote.power)} phiếu</strong>
          {VOTE_LABEL[myVote.vote] && <> · {VOTE_LABEL[myVote.vote]}</>}
          {myVote.power === 0n && r.status === RequestStatus.Voting && " (bạn không giữ token tại thời điểm snapshot)"}
        </p>
      )}

      <div className="actions">
        {canVote && (
          <>
            <button className="btn btn-success" disabled={tx.busy} onClick={() => tx.run(`Approve yêu cầu #${r.id}`, (k) => k.approveRequest(c.id, r.id))}>
              Approve
            </button>
            <button className="btn btn-danger" disabled={tx.busy} onClick={() => tx.run(`Reject yêu cầu #${r.id}`, (k) => k.rejectRequest(c.id, r.id))}>
              Reject
            </button>
            <TxHint />
          </>
        )}
        {isCreator && r.status === RequestStatus.Approved && (
          <button className="btn btn-primary" disabled={tx.busy} onClick={() => tx.run(`Giải ngân yêu cầu #${r.id}`, (k) => k.executeSpending(c.id, r.id))}>
            Giải ngân {formatEth(r.amount)} ETH
          </button>
        )}
        {isCreator && (r.status === RequestStatus.Voting || r.status === RequestStatus.Approved) && (
          <button className="btn" disabled={tx.busy} onClick={() => tx.run(`Hủy yêu cầu #${r.id}`, (k) => k.cancelRequest(c.id, r.id))}>
            Hủy yêu cầu
          </button>
        )}
      </div>
    </article>
  );
}

const UNITS = { minutes: 60, hours: 3600, days: 86400 };

function CreateRequestForm({ campaign: c, balance }) {
  const { account } = useWallet();
  const tx = useTransaction();
  const [form, setForm] = useState({ description: "", recipient: account || "", amount: "", durationValue: "3", durationUnit: "days" });
  const [evidenceCID, setEvidenceCID] = useState("");
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    let amount;
    try {
      amount = parseEther(form.amount || "0");
    } catch {
      return setError("Số ETH không hợp lệ.");
    }
    const duration = Number(form.durationValue) * UNITS[form.durationUnit];
    const problem = !form.description.trim()
      ? "Nhập mô tả khoản chi."
      : !isAddress(form.recipient)
        ? "Địa chỉ ví nhận không hợp lệ."
        : amount <= 0n || amount > balance
          ? `Số tiền phải lớn hơn 0 và không vượt số dư quỹ (${formatEth(balance)} ETH).`
          : !evidenceCID
            ? "Cần upload hóa đơn/chứng từ lên IPFS."
            : duration < 60 || duration > 30 * 86400
              ? "Thời gian bỏ phiếu từ 1 phút đến 30 ngày."
              : null;
    setError(problem);
    if (problem) return;
    const receipt = await tx.run("Tạo yêu cầu chi", (k) =>
      k.requestSpending(c.id, {
        description: form.description.trim(),
        recipient: form.recipient,
        amount,
        evidenceCID,
        votingDurationSeconds: BigInt(duration),
      })
    );
    if (receipt) {
      setForm({ ...form, description: "", amount: "" });
      setEvidenceCID("");
    }
  };

  return (
    <form className="card form" onSubmit={onSubmit}>
      <h2>Tạo yêu cầu chi tiêu (chủ dự án)</h2>
      <div className="field">
        <label htmlFor="req-desc">Mô tả khoản chi *</label>
        <textarea id="req-desc" rows={3} value={form.description} onChange={set("description")} maxLength={500} />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="req-amount">Số tiền (ETH) * - tối đa {formatEth(balance)}</label>
          <input id="req-amount" inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </div>
        <div className="field">
          <label htmlFor="req-duration">Thời gian bỏ phiếu *</label>
          <div className="row">
            <input id="req-duration" type="number" min="1" value={form.durationValue} onChange={set("durationValue")} />
            <select value={form.durationUnit} onChange={set("durationUnit")} aria-label="Đơn vị">
              <option value="minutes">phút</option>
              <option value="hours">giờ</option>
              <option value="days">ngày</option>
            </select>
          </div>
        </div>
      </div>
      <div className="field">
        <label htmlFor="req-recipient">Ví nhận tiền (nhà cung cấp hoặc ví của bạn) *</label>
        <input id="req-recipient" className="mono" value={form.recipient} onChange={set("recipient")} />
      </div>
      <FileUploadField
        label="Hóa đơn / chứng từ (PDF hoặc ảnh)"
        kind="invoice"
        accept="application/pdf,image/*"
        required
        cid={evidenceCID}
        onCid={setEvidenceCID}
        help="Chứng từ là tài liệu công khai để người ủng hộ kiểm tra trước khi bỏ phiếu."
      />
      {error && <div className="alert alert-danger">{error}</div>}
      <TxStatus tx={tx} />
      <div className="actions">
        <button className="btn btn-primary" disabled={tx.busy}>
          Gửi yêu cầu chi
        </button>
        <TxHint />
      </div>
    </form>
  );
}
