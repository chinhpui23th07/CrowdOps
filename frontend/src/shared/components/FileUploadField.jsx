import { useState } from "react";
import { uploadFile, ipfsUrl } from "../services/ipfs.service";

/**
 * Chọn file -> upload lên IPFS (qua server) -> trả CID cho form cha.
 * Có tùy chọn dán CID đã có sẵn (ví dụ đã upload trước bằng Pinata web).
 */
export default function FileUploadField({ label, kind, accept, required, cid, onCid, help }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [manual, setManual] = useState(false);
  const inputId = `file-${kind}-${label}`;

  const onUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const result = await uploadFile(file, kind);
      onCid(result.cid, { mimeType: result.mimeType, name: result.name });
      setStatus("done");
    } catch (e) {
      setError(e.message);
      setStatus("idle");
    }
  };

  return (
    <div className="field">
      <label htmlFor={inputId}>
        {label} {required ? <span className="required">*</span> : <span className="muted">(tùy chọn)</span>}
      </label>
      {help && <p className="help">{help}</p>}
      {manual ? (
        <input
          id={inputId}
          type="text"
          placeholder="bafy…"
          value={cid}
          onChange={(e) => onCid(e.target.value.trim(), null)}
        />
      ) : (
        <div className="upload-row">
          <input
            id={inputId}
            type="file"
            accept={accept}
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              setStatus("idle");
            }}
          />
          <button type="button" className="btn" onClick={onUpload} disabled={!file || status === "uploading"}>
            {status === "uploading" ? "Đang upload…" : "Upload lên IPFS"}
          </button>
        </div>
      )}
      <button type="button" className="btn-link" onClick={() => setManual(!manual)}>
        {manual ? "Chọn file để upload" : "Tôi đã có CID"}
      </button>
      {cid && (
        <p className="cid-ok">
          CID: <code className="mono">{cid}</code>{" "}
          <a href={ipfsUrl(cid)} target="_blank" rel="noreferrer">
            Xem nội dung gốc ↗
          </a>
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
