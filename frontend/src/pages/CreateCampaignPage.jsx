import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseEther } from "ethers";
import { useWallet } from "../features/wallet/WalletContext";
import { useTransaction } from "../features/wallet/useTransaction";
import FileUploadField from "../shared/components/FileUploadField";
import { TxHint, TxStatus } from "../shared/components/common";
import { uploadJson } from "../shared/services/ipfs.service";

const UNITS = { minutes: 60, hours: 3600, days: 86400 };

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const { account, crowdOps } = useWallet();
  const tx = useTransaction();
  const [form, setForm] = useState({
    title: "",
    description: "",
    goal: "",
    durationValue: "7",
    durationUnit: "days",
    diamondThreshold: "",
  });
  const [proposalCID, setProposalCID] = useState("");
  const [media, setMedia] = useState({ cid: "", mimeType: "" });
  const [step, setStep] = useState(null);
  const [formError, setFormError] = useState(null);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function validate() {
    if (!form.title.trim()) return "Nhập tiêu đề chiến dịch.";
    let goal;
    let diamond;
    try {
      goal = parseEther(form.goal || "0");
      diamond = parseEther(form.diamondThreshold || "0");
    } catch {
      return "Số ETH không hợp lệ (dùng dấu chấm cho phần thập phân, ví dụ 0.05).";
    }
    if (goal <= 0n) return "Mục tiêu vốn phải lớn hơn 0.";
    if (diamond <= 0n || diamond > goal) return "Ngưỡng Kim cương phải lớn hơn 0 và không vượt mục tiêu.";
    const duration = Number(form.durationValue) * UNITS[form.durationUnit];
    if (!Number.isFinite(duration) || duration < 60 || duration > 90 * 86400) return "Thời hạn phải từ 1 phút đến 90 ngày.";
    if (!proposalCID) return "Cần upload PDF proposal lên IPFS.";
    return null;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    const problem = validate();
    setFormError(problem);
    if (problem) return;

    // Bước 1: tạo metadata NFT Kim cương (chuẩn ERC-721 metadata) và upload lên IPFS.
    let nftMetadataCID;
    try {
      setStep("Đang tạo metadata NFT Kim cương trên IPFS…");
      const metadata = {
        name: `Crowd Ops Diamond Backer - ${form.title.trim()}`,
        description: `NFT tri ân người ủng hộ hạng Kim cương của chiến dịch "${form.title.trim()}" trên Crowd Ops.`,
        image: media.cid && media.mimeType?.startsWith("image/") ? `ipfs://${media.cid}` : undefined,
        external_url: window.location.origin,
        attributes: [
          { trait_type: "Tier", value: "Diamond" },
          { trait_type: "Proposal", value: `ipfs://${proposalCID}` },
        ],
      };
      nftMetadataCID = (await uploadJson(metadata, `nft-${form.title.trim().slice(0, 40)}.json`)).cid;
    } catch (err) {
      setStep(null);
      setFormError(`Upload metadata thất bại: ${err.message}`);
      return;
    }

    // Bước 2: gửi giao dịch createCampaign.
    setStep(null);
    const receipt = await tx.run("Tạo chiến dịch", (contract) =>
      contract.createCampaign({
        title: form.title.trim(),
        description: form.description.trim(),
        goal: parseEther(form.goal),
        durationSeconds: BigInt(Number(form.durationValue) * UNITS[form.durationUnit]),
        diamondThreshold: parseEther(form.diamondThreshold),
        proposalCID,
        mediaCID: media.cid,
        nftMetadataCID,
      })
    );
    if (receipt) {
      const event = receipt.logs.map((l) => crowdOps.interface.parseLog(l)).find((ev) => ev?.name === "CampaignCreated");
      if (event) setTimeout(() => navigate(`/campaign/${event.args.campaignId}`), 1500);
    }
  };

  return (
    <section className="narrow">
      <h1>Tạo chiến dịch</h1>
      <p className="lead">
        Tài liệu được lưu trên IPFS và là <strong>tài liệu công khai</strong> - ai cũng xem được. CID (mã định danh nội dung)
        được ghi vào smart contract nên không thể bị thay thế lặng lẽ sau này.
      </p>
      <form onSubmit={onSubmit} className="card form">
        <div className="field">
          <label htmlFor="title">
            Tiêu đề <span className="required">*</span>
          </label>
          <input id="title" value={form.title} onChange={set("title")} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="description">Mô tả ngắn</label>
          <textarea id="description" rows={4} value={form.description} onChange={set("description")} maxLength={1000} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="goal">
              Mục tiêu vốn (ETH) <span className="required">*</span>
            </label>
            <input id="goal" inputMode="decimal" placeholder="0.05" value={form.goal} onChange={set("goal")} />
          </div>
          <div className="field">
            <label htmlFor="diamond">
              Ngưỡng Kim cương (ETH) <span className="required">*</span>
            </label>
            <input id="diamond" inputMode="decimal" placeholder="0.01" value={form.diamondThreshold} onChange={set("diamondThreshold")} />
            <p className="help">Ai góp tổng cộng từ mức này trở lên sẽ được nhận NFT tri ân nếu chiến dịch thành công.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="duration">
            Thời hạn huy động <span className="required">*</span>
          </label>
          <div className="row">
            <input id="duration" type="number" min="1" value={form.durationValue} onChange={set("durationValue")} />
            <select value={form.durationUnit} onChange={set("durationUnit")} aria-label="Đơn vị thời gian">
              <option value="minutes">phút</option>
              <option value="hours">giờ</option>
              <option value="days">ngày</option>
            </select>
          </div>
        </div>

        <FileUploadField
          label="Proposal (PDF)"
          kind="proposal"
          accept="application/pdf"
          required
          cid={proposalCID}
          onCid={(cid) => setProposalCID(cid)}
          help="Tài liệu công khai mô tả kế hoạch, ngân sách và tiến độ."
        />
        <FileUploadField
          label="Ảnh / video giới thiệu"
          kind="media"
          accept="image/*,video/mp4,video/webm"
          cid={media.cid}
          onCid={(cid, info) => setMedia({ cid, mimeType: info?.mimeType || media.mimeType })}
          help="Ảnh sẽ được dùng làm ảnh bìa và ảnh của NFT Kim cương."
        />

        {formError && <div className="alert alert-danger">{formError}</div>}
        {step && <div className="alert alert-info"><span className="spinner" aria-hidden="true" /> {step}</div>}
        <TxStatus tx={tx} />

        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={!account || tx.busy || Boolean(step)}>
            Tạo chiến dịch
          </button>
          <TxHint />
          {!account && <span className="muted">Kết nối ví để tạo chiến dịch.</span>}
        </div>
      </form>
    </section>
  );
}
