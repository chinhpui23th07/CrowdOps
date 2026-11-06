import { useState } from "react";
import { useWallet } from "../wallet/WalletContext";
import { useTransaction } from "../wallet/useTransaction";
import { Badge, TxHint, TxStatus } from "../../shared/components/common";
import FileUploadField from "../../shared/components/FileUploadField";
import { fetchFromIpfs, ipfsUrl, uploadFile } from "../../shared/services/ipfs.service";
import { decryptFile, encryptFile } from "./crypto";
import { registerDocumentKey, requestDocumentKey } from "./keyAccess.service";
import { formatDateTime } from "../../shared/utils/format";

const TIER_LABEL = { backer: "Người giữ token của chiến dịch", diamond: "Chỉ người có NFT Kim cương" };

export default function DocumentsPanel({ data }) {
  const { campaign: c, requests, documents, me } = data;
  const publicDocs = [
    { label: "Proposal dự án (PDF)", cid: c.proposalCID, type: "Proposal" },
    c.mediaCID && { label: "Ảnh / video giới thiệu", cid: c.mediaCID, type: "Media" },
    { label: "Metadata NFT Kim cương (JSON)", cid: c.nftMetadataCID, type: "Metadata" },
    ...requests.map((r) => ({ label: `Chứng từ yêu cầu chi #${r.id}`, cid: r.evidenceCID, type: "Hóa đơn" })),
    ...documents.filter((d) => !d.encrypted).map((d) => ({ label: d.label, cid: d.cid, type: "Báo cáo" })),
  ].filter(Boolean);
  const privateDocs = documents.filter((d) => d.encrypted);

  return (
    <div>
      <div className="card">
        <h2>Tài liệu công khai</h2>
        <p className="help">
          Lưu trên IPFS, ai có CID đều xem được. CID được ghi trong smart contract: nếu nội dung bị sửa, CID sẽ khác nên
          không thể tráo tài liệu.
        </p>
        <table className="table">
          <caption className="sr-only">Danh sách tài liệu công khai của chiến dịch</caption>
          <thead>
            <tr>
              <th>Loại</th>
              <th>Tài liệu</th>
              <th>CID</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {publicDocs.map((d) => (
              <tr key={`${d.type}-${d.cid}-${d.label}`}>
                <td>
                  <Badge tone="info">{d.type}</Badge>
                </td>
                <td>{d.label}</td>
                <td>
                  <code className="mono small">{d.cid}</code>
                </td>
                <td>
                  <a href={ipfsUrl(d.cid)} target="_blank" rel="noreferrer">
                    Xem bản gốc ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Tài liệu riêng (đã mã hóa)</h2>
        <p className="help">
          File được mã hóa AES-256 trong trình duyệt trước khi lên IPFS - tải file từ IPFS chỉ nhận được dữ liệu vô nghĩa.
          Khóa giải mã nằm ở key server và chỉ được trả cho ví ký xác thực và thỏa điều kiện kiểm tra trực tiếp trên
          blockchain.
        </p>
        {privateDocs.length === 0 && <p className="muted">Chưa có tài liệu riêng.</p>}
        {privateDocs.map((d) => (
          <PrivateDocument key={d.id} campaignId={c.id} doc={d} />
        ))}
      </div>

      {me?.isCreator && <AddDocumentForm campaignId={c.id} />}
    </div>
  );
}

function PrivateDocument({ campaignId, doc }) {
  const { account, getSigner } = useWallet();
  const [status, setStatus] = useState({ state: "idle" });

  const onDecrypt = async () => {
    try {
      setStatus({ state: "working", text: "Ký xác thực trong ví (không tốn gas)…" });
      const key = await requestDocumentKey(await getSigner(), campaignId, doc.cid);
      setStatus({ state: "working", text: "Đang tải bản mã hóa từ IPFS và giải mã…" });
      const file = await decryptFile(await fetchFromIpfs(doc.cid), key);
      const url = URL.createObjectURL(file);
      setStatus({ state: "done", url, name: file.name });
    } catch (e) {
      const rejected = e.code === "ACTION_REJECTED" || e.code === 4001;
      setStatus({ state: "error", text: rejected ? "Bạn đã từ chối ký xác thực." : e.message });
    }
  };

  return (
    <div className="private-doc">
      <div>
        <strong>🔒 {doc.label}</strong> <span className="muted">· {formatDateTime(doc.addedAt)}</span>
        <div className="muted small">
          CID bản mã hóa: <code className="mono">{doc.cid}</code>
        </div>
      </div>
      <div>
        <button className="btn" disabled={!account || status.state === "working"} onClick={onDecrypt}>
          Giải mã &amp; xem
        </button>
        {!account && <span className="muted"> Kết nối ví để xin quyền xem.</span>}
      </div>
      {status.state === "working" && (
        <p className="muted">
          <span className="spinner" aria-hidden="true" /> {status.text}
        </p>
      )}
      {status.state === "error" && <p className="error-text">{status.text}</p>}
      {status.state === "done" && (
        <p className="alert alert-success">
          Đã giải mã:{" "}
          <a href={status.url} target="_blank" rel="noreferrer" download={status.name}>
            mở {status.name}
          </a>
        </p>
      )}
    </div>
  );
}

function AddDocumentForm({ campaignId }) {
  const { getSigner } = useWallet();
  const tx = useTransaction();
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState("public");
  const [tier, setTier] = useState("backer");
  const [publicCID, setPublicCID] = useState("");
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(null);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!label.trim()) return setError("Nhập tên tài liệu.");

    let cid = publicCID;
    if (mode === "private") {
      if (!file) return setError("Chọn file cần mã hóa.");
      try {
        setStep("Đang mã hóa file trong trình duyệt…");
        const { encryptedFile, keyBase64 } = await encryptFile(file);
        setStep("Đang upload bản mã hóa lên IPFS…");
        cid = (await uploadFile(encryptedFile, "private")).cid;
        setStep("Ký xác thực để gửi khóa giải mã cho key server (không tốn gas)…");
        await registerDocumentKey(await getSigner(), campaignId, cid, keyBase64, tier);
      } catch (err) {
        setStep(null);
        return setError(err.code === "ACTION_REJECTED" ? "Bạn đã từ chối ký xác thực." : err.message);
      }
      setStep(null);
    } else if (!cid) {
      return setError("Upload tài liệu lên IPFS trước.");
    }

    const receipt = await tx.run("Ghi tài liệu lên chain", (k) => k.addDocument(campaignId, label.trim(), cid, mode === "private"));
    if (receipt) {
      setLabel("");
      setPublicCID("");
      setFile(null);
    }
  };

  return (
    <form className="card form" onSubmit={onSubmit}>
      <h2>Thêm tài liệu (chủ dự án)</h2>
      <div className="field">
        <label htmlFor="doc-label">Tên tài liệu *</label>
        <input id="doc-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
      </div>
      <fieldset className="field">
        <legend>Quyền truy cập</legend>
        <label className="inline">
          <input type="radio" checked={mode === "public"} onChange={() => setMode("public")} /> Công khai
        </label>
        <label className="inline">
          <input type="radio" checked={mode === "private"} onChange={() => setMode("private")} /> Riêng tư (mã hóa)
        </label>
      </fieldset>

      {mode === "public" ? (
        <FileUploadField label="File tài liệu" kind="document" accept="application/pdf,image/*" required cid={publicCID} onCid={setPublicCID} />
      ) : (
        <>
          <div className="field">
            <label htmlFor="doc-tier">Ai được giải mã?</label>
            <select id="doc-tier" value={tier} onChange={(e) => setTier(e.target.value)}>
              {Object.entries(TIER_LABEL).map(([key, text]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="doc-file">File (sẽ được mã hóa trước khi upload) *</label>
            <input id="doc-file" type="file" onChange={(e) => setFile(e.target.files[0] || null)} />
          </div>
        </>
      )}

      {error && <div className="alert alert-danger">{error}</div>}
      {step && (
        <div className="alert alert-info">
          <span className="spinner" aria-hidden="true" /> {step}
        </div>
      )}
      <TxStatus tx={tx} />
      <div className="actions">
        <button className="btn btn-primary" disabled={tx.busy || Boolean(step)}>
          Thêm tài liệu
        </button>
        <TxHint />
      </div>
    </form>
  );
}
