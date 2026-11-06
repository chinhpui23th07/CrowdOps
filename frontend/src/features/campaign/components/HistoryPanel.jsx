import { useCampaignHistory } from "../useCampaigns";
import { Badge, ErrorBox, Loading, TxLink } from "../../../shared/components/common";
import { formatEth } from "../../../shared/utils/format";

const TONE = {
  "Đóng góp": "info",
  "Hoàn tiền": "warning",
  "Giải ngân": "success",
  "Bỏ phiếu": "neutral",
  "Bỏ phiếu giải thể": "neutral",
  "Chia lại quỹ": "warning",
};

export default function HistoryPanel({ campaignId }) {
  const { loading, data, error } = useCampaignHistory(campaignId);
  return (
    <div className="card">
      <h2>Lịch sử giao dịch on-chain</h2>
      <p className="help">
        Đọc trực tiếp từ event của smart contract. Bấm mã giao dịch để tự kiểm chứng trên block explorer.
      </p>
      {loading && !data && <Loading text="Đang quét event trên blockchain…" />}
      <ErrorBox error={error} />
      {data && data.length === 0 && <p className="muted">Chưa có giao dịch nào.</p>}
      {data && data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Lịch sử đóng góp, hoàn tiền, bỏ phiếu và giải ngân</caption>
            <thead>
              <tr>
                <th>Loại</th>
                <th>Ví</th>
                <th>Số lượng</th>
                <th>Block</th>
                <th>Mã giao dịch</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={`${item.hash}-${item.logIndex}`}>
                  <td>
                    <Badge tone={TONE[item.type]}>{item.type}</Badge>
                    {item.note && <div className="small muted">{item.note}</div>}
                  </td>
                  <td>
                    <code className="mono small">{item.from}</code>
                  </td>
                  <td>{item.isVote ? `${formatEth(item.amount)} phiếu` : `${formatEth(item.amount)} ETH`}</td>
                  <td>{item.blockNumber}</td>
                  <td>
                    <TxLink hash={item.hash} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
