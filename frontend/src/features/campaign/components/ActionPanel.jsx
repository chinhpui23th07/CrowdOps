import { useState } from "react";
import { parseEther } from "ethers";
import { useWallet } from "../../wallet/WalletContext";
import { useTransaction } from "../../wallet/useTransaction";
import { TxHint, TxStatus } from "../../../shared/components/common";
import { CampaignState, formatEth } from "../../../shared/utils/format";

/** Các thao tác ghi lên chain tùy theo trạng thái chiến dịch và vai trò của ví. */
export default function ActionPanel({ data }) {
  const { campaign: c, me } = data;
  const { account, chainNow } = useWallet();
  const tx = useTransaction();
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState(null);

  const deadlinePassed = chainNow > c.deadline;
  const fundraising = c.state === CampaignState.Fundraising;
  const succeeded = c.state === CampaignState.Successful || c.state === CampaignState.Active;

  const onContribute = async (e) => {
    e.preventDefault();
    let value;
    try {
      value = parseEther(amount || "0");
    } catch {
      setAmountError("Số ETH không hợp lệ. Dùng dấu chấm cho phần thập phân, ví dụ 0.01");
      return;
    }
    if (value <= 0n) {
      setAmountError("Số tiền phải lớn hơn 0.");
      return;
    }
    setAmountError(null);
    const receipt = await tx.run(`Góp ${amount} ETH`, (contract) => contract.contribute(c.id, { value }));
    if (receipt) setAmount("");
  };

  return (
    <div className="card action-panel">
      <h2>Thao tác</h2>

      {fundraising && !deadlinePassed && (
        <form onSubmit={onContribute}>
          <label htmlFor="amount">Số ETH muốn góp</label>
          <div className="upload-row">
            <input id="amount" inputMode="decimal" placeholder="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="btn btn-primary" disabled={!account || tx.busy || me?.isCreator}>
              Góp tiền
            </button>
          </div>
          {amountError && <p className="error-text">{amountError}</p>}
          <p className="help">
            Bạn sẽ nhận {amount && !amountError ? amount : "…"} token quản trị (1 ETH = 1 token). Tiền nằm trong smart
            contract, không chuyển thẳng cho chủ dự án.
          </p>
          {me?.isCreator && <p className="help">Chủ dự án không được tự góp vào chiến dịch của mình.</p>}
          <TxHint />
        </form>
      )}

      {fundraising && deadlinePassed && (
        <div>
          <p>
            Đã qua hạn chót. Cần một người bấm <strong>Chốt kết quả</strong> để contract xác định chiến dịch thành công hay thất
            bại (đạt {formatEth(c.totalRaised)}/{formatEth(c.goal)} ETH).
          </p>
          <button className="btn btn-primary" disabled={!account || tx.busy} onClick={() => tx.run("Chốt kết quả", (k) => k.finalize(c.id))}>
            Chốt kết quả
          </button>{" "}
          <TxHint />
        </div>
      )}

      {c.state === CampaignState.Failed && (
        <div>
          <p>Chiến dịch không đạt mục tiêu. Mỗi người ủng hộ tự rút lại đúng số ETH đã góp.</p>
          {me && me.contributed > 0n && !me.refunded && (
            <>
              <button className="btn btn-primary" disabled={tx.busy} onClick={() => tx.run("Nhận hoàn tiền", (k) => k.refund(c.id))}>
                Nhận lại {formatEth(me.contributed)} ETH
              </button>{" "}
              <TxHint />
            </>
          )}
          {me?.refunded && <p className="alert alert-success">Bạn đã nhận lại {formatEth(me.contributed)} ETH.</p>}
          {me && me.contributed === 0n && <p className="muted">Ví này không góp vào chiến dịch nên không có gì để hoàn.</p>}
        </div>
      )}

      {succeeded && (
        <div>
          <p>Chiến dịch thành công. Tiền chỉ được giải ngân qua yêu cầu chi đã được biểu quyết - xem tab "Bỏ phiếu chi tiêu".</p>
          {me?.diamondEligible && !me.diamondClaimed && (
            <>
              <button className="btn btn-primary" disabled={tx.busy} onClick={() => tx.run("Nhận NFT Kim cương", (k) => k.claimDiamondNFT(c.id))}>
                💎 Nhận NFT Kim cương
              </button>{" "}
              <TxHint />
            </>
          )}
          {me?.diamondClaimed && <p className="alert alert-success">Bạn đã nhận NFT Kim cương của chiến dịch này.</p>}
        </div>
      )}

      {c.state === CampaignState.Dissolved && <DissolvedActions data={data} tx={tx} />}

      {!account && <p className="muted">Kết nối ví để thực hiện thao tác.</p>}
      <TxStatus tx={tx} />
    </div>
  );
}

/** Quỹ đã giải thể: người giữ token đổi token lấy phần ETH còn lại theo tỷ lệ. */
function DissolvedActions({ data, tx }) {
  const { campaign: c, me, balance, totalSupply, tokenSymbol } = data;
  // Cùng công thức với contract: số dư quỹ * token của bạn / tổng token đang lưu hành.
  const estimate = me && totalSupply > 0n ? (balance * me.tokenBalance) / totalSupply : 0n;
  return (
    <div>
      <p>
        Người ủng hộ đã biểu quyết <strong>giải thể quỹ</strong>. Chủ dự án không thể giải ngân thêm. Mỗi người giữ token đổi
        token lấy phần ETH còn lại theo tỷ lệ ({formatEth(balance)} ETH còn trong quỹ).
      </p>
      {me && me.tokenBalance > 0n && (
        <>
          <button className="btn btn-primary" disabled={tx.busy} onClick={() => tx.run("Rút phần quỹ còn lại", (k) => k.claimDissolutionRefund(c.id))}>
            Rút {formatEth(estimate)} ETH
          </button>{" "}
          <TxHint />
          <p className="help">
            Đổi {formatEth(me.tokenBalance)} {tokenSymbol} (token bị hủy sau khi rút).
          </p>
        </>
      )}
      {me && me.tokenBalance === 0n && <p className="muted">Ví này không giữ token của chiến dịch nên không có phần để rút.</p>}
    </div>
  );
}
