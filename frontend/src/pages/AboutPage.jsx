import { Address } from "../shared/components/common";
import { CHAIN, DEPLOYMENT } from "../shared/config";
import { TxLink } from "../shared/components/common";

export default function AboutPage() {
  return (
    <section className="narrow">
      <h1>Crowd Ops hoạt động thế nào?</h1>
      <div className="card">
        <ol className="rules">
          <li>
            <strong>Tạo chiến dịch:</strong> chủ dự án đặt mục tiêu, thời hạn, upload proposal lên IPFS. Contract tạo một token
            quản trị ERC-20 riêng cho chiến dịch.
          </li>
          <li>
            <strong>Góp tiền:</strong> ETH được khóa trong smart contract; người góp nhận token 1:1 dùng để bỏ phiếu.
          </li>
          <li>
            <strong>Chốt kết quả:</strong> sau hạn chót, bất kỳ ai cũng có thể bấm chốt. Không đạt mục tiêu → mỗi người tự rút
            lại đúng số đã góp.
          </li>
          <li>
            <strong>Yêu cầu chi:</strong> đạt mục tiêu → chủ dự án tạo yêu cầu chi kèm hóa đơn trên IPFS. Người giữ token bỏ phiếu
            Approve/Reject; cần &gt; 50% tổng quyền biểu quyết mới giải ngân được.
          </li>
          <li>
            <strong>NFT Kim cương:</strong> người góp vượt ngưỡng do chủ dự án đặt được nhận NFT ERC-721 tri ân.
          </li>
        </ol>
      </div>
      <div className="card">
        <h2>Thao tác đọc và giao dịch</h2>
        <p>
          <strong>Đọc dữ liệu</strong> (danh sách, tiến độ, phiếu bầu, lịch sử) đi qua RPC công khai - miễn phí, không cần ví.
          <br />
          <strong>Giao dịch</strong> (góp tiền, chốt, hoàn tiền, tạo yêu cầu, bỏ phiếu, giải ngân, nhận NFT) cần ký bằng ví và
          trả phí gas; các nút này có nhãn "✍ Cần ký bằng ví".
          <br />
          <strong>Ký xác thực</strong> (khi xem tài liệu riêng) chỉ ký một thông điệp, không phải giao dịch, không tốn gas.
        </p>
      </div>
      <div className="card">
        <h2>Thông tin triển khai</h2>
        {DEPLOYMENT ? (
          <dl className="info-list">
            <dt>Mạng</dt>
            <dd>
              {CHAIN.name} (chainId {CHAIN.id})
            </dd>
            <dt>Contract CrowdOps</dt>
            <dd>
              <Address value={DEPLOYMENT.crowdOps} />
            </dd>
            <dt>Contract DiamondNFT</dt>
            <dd>
              <Address value={DEPLOYMENT.diamondNFT} />
            </dd>
            <dt>Giao dịch deploy</dt>
            <dd>
              <TxLink hash={DEPLOYMENT.deployTxHash} full />
            </dd>
          </dl>
        ) : (
          <p className="muted">Chưa deploy trên mạng này.</p>
        )}
      </div>
    </section>
  );
}
