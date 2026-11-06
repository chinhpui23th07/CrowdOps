import { Address, Badge } from "../../../shared/components/common";
import { RequestStatus, formatEth, percent } from "../../../shared/utils/format";
import { ipfsUrl } from "../../../shared/services/ipfs.service";

/**
 * Minh bạch dòng tiền: mọi wei đã góp đi đâu - giải ngân cho ai (kèm chứng từ IPFS và tỷ lệ phiếu
 * đã duyệt), hoàn lại cho người góp, hay vẫn nằm trong contract. Số liệu đọc trực tiếp từ chain.
 */
export default function CashFlowPanel({ data }) {
  const { campaign: c, requests, balance } = data;
  const executed = requests.filter((r) => r.status === RequestStatus.Executed);
  const segments = [
    ["Đã giải ngân", c.totalDisbursed, "flow-disbursed"],
    ["Đã hoàn / chia lại cho người góp", c.totalRefunded, "flow-refunded"],
    ["Còn trong contract", balance, "flow-locked"],
  ];

  return (
    <div>
      <div className="card">
        <h2>Dòng tiền của chiến dịch</h2>
        <p className="help">
          Tổng đã huy động <strong>{formatEth(c.totalRaised)} ETH</strong>. Mọi khoản đều đọc trực tiếp từ smart contract: tổng
          ba phần dưới đây luôn bằng số đã huy động.
        </p>
        <div className="flow-bar" role="img" aria-label="Tỷ lệ giải ngân, hoàn tiền và số dư còn lại">
          {segments.map(([label, value, cls]) =>
            value > 0n ? <div key={label} className={cls} style={{ width: `${percent(value, c.totalRaised)}%` }} /> : null
          )}
        </div>
        <ul className="flow-legend">
          {segments.map(([label, value, cls]) => (
            <li key={label}>
              <span className={`flow-swatch ${cls}`} aria-hidden="true" />
              {label}: <strong className="mono">{formatEth(value)} ETH</strong>{" "}
              <span className="muted">({percent(value, c.totalRaised)}%)</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Các khoản đã giải ngân</h2>
        {executed.length === 0 && <p className="muted">Chưa có khoản nào được giải ngân.</p>}
        {executed.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Các khoản giải ngân kèm chứng từ và tỷ lệ phiếu duyệt</caption>
              <thead>
                <tr>
                  <th>Yêu cầu</th>
                  <th>Số tiền</th>
                  <th>Ví nhận</th>
                  <th>Phiếu duyệt</th>
                  <th>Chứng từ</th>
                </tr>
              </thead>
              <tbody>
                {executed.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Badge tone="success">#{r.id}</Badge>
                      <div className="small">{r.description}</div>
                    </td>
                    <td className="mono">{formatEth(r.amount)} ETH</td>
                    <td>
                      <Address value={r.recipient} />
                    </td>
                    <td className="mono">
                      {percent(r.approveVotes, r.totalVotingPower)}% · {r.approveCount} ví
                    </td>
                    <td>
                      <a href={ipfsUrl(r.evidenceCID)} target="_blank" rel="noreferrer">
                        Hóa đơn ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
