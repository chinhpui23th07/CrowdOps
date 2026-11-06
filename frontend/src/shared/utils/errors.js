import { formatEther } from "ethers";

/** Lỗi custom của CrowdOps -> câu tiếng Việt cho người dùng. */
const CONTRACT_ERRORS = {
  CampaignNotFound: () => "Chiến dịch không tồn tại.",
  RequestNotFound: () => "Yêu cầu chi không tồn tại.",
  InvalidInput: ([field]) => `Dữ liệu không hợp lệ: ${INPUT_FIELDS[field] || field}.`,
  NotCreator: () => "Chỉ chủ dự án mới thực hiện được thao tác này.",
  CreatorCannotParticipate: () => "Chủ dự án không được tự góp tiền hoặc bỏ phiếu cho chiến dịch của mình.",
  WrongState: () => "Trạng thái chiến dịch hiện tại không cho phép thao tác này. Hãy tải lại trang.",
  DeadlinePassed: () => "Chiến dịch đã hết hạn huy động.",
  DeadlineNotReached: () => "Chưa tới hạn chót nên chưa thể chốt kết quả.",
  ZeroContribution: () => "Số tiền góp phải lớn hơn 0.",
  NothingToRefund: () => "Ví này không có khoản góp nào để hoàn.",
  AlreadyRefunded: () => "Ví này đã nhận hoàn tiền rồi.",
  OpenRequestExists: () => "Đang có một yêu cầu chi chưa kết thúc. Hãy chờ hoặc hủy yêu cầu đó trước.",
  AmountExceedsBalance: ([requested, available]) =>
    `Số tiền yêu cầu (${formatEther(requested)} ETH) vượt số dư quỹ (${formatEther(available)} ETH).`,
  VotingClosed: () => "Yêu cầu này đã kết thúc bỏ phiếu.",
  AlreadyVoted: () => "Ví này đã bỏ phiếu cho yêu cầu này.",
  NoVotingPower: () => "Ví này không có quyền biểu quyết tại thời điểm chụp snapshot của yêu cầu.",
  RequestNotApproved: () => "Yêu cầu chưa được duyệt nên chưa thể giải ngân.",
  RequestNotOpen: () => "Yêu cầu đã đóng, không thể hủy.",
  NotDiamondBacker: ([contributed, threshold]) =>
    `Bạn đã góp ${formatEther(contributed)} ETH, cần tối thiểu ${formatEther(threshold)} ETH để nhận NFT Kim cương.`,
  DiamondAlreadyClaimed: () => "Bạn đã nhận NFT Kim cương của chiến dịch này rồi.",
  TransferFailed: () => "Chuyển ETH tới ví nhận thất bại (ví nhận từ chối ETH).",
  DirectPaymentNotAllowed: () => "Không gửi ETH thẳng vào contract; hãy dùng nút Góp tiền.",
  ReentrancyGuardReentrantCall: () => "Giao dịch bị chặn do gọi lặp (re-entrancy).",
};

const INPUT_FIELDS = {
  title: "tiêu đề",
  goal: "mục tiêu vốn",
  duration: "thời hạn (1 phút - 90 ngày)",
  diamondThreshold: "ngưỡng Kim cương (lớn hơn 0 và không vượt mục tiêu)",
  proposalCID: "CID proposal",
  nftMetadataCID: "CID metadata NFT",
  description: "mô tả",
  recipient: "ví nhận",
  evidenceCID: "CID chứng từ",
  votingDuration: "thời gian bỏ phiếu (1 phút - 30 ngày)",
  amount: "số tiền",
  label: "tên tài liệu",
  cid: "CID",
};

/** Phân loại lỗi để UI hiển thị đúng: người dùng từ chối ký, contract từ chối, hay lỗi mạng. */
export function describeError(error) {
  if (!error) return { kind: "unknown", message: "Lỗi không xác định." };
  if (error.code === "ACTION_REJECTED" || error.code === 4001 || error.info?.error?.code === 4001) {
    return { kind: "rejected", message: "Bạn đã từ chối ký giao dịch trong ví. Không có gì thay đổi." };
  }
  if (error.code === "INSUFFICIENT_FUNDS") {
    return { kind: "funds", message: "Số dư ví không đủ để trả số tiền và phí gas." };
  }
  const revert = error.revert;
  if (revert?.name && CONTRACT_ERRORS[revert.name]) {
    return { kind: "contract", message: CONTRACT_ERRORS[revert.name](revert.args || []) };
  }
  if (error.code === "CALL_EXCEPTION") {
    return { kind: "contract", message: "Contract từ chối giao dịch. " + (error.reason || error.shortMessage || "") };
  }
  if (error.code === "NETWORK_ERROR" || error.code === "SERVER_ERROR") {
    return { kind: "network", message: "Không kết nối được tới mạng blockchain. Kiểm tra RPC/Internet." };
  }
  return { kind: "unknown", message: error.shortMessage || error.message || String(error) };
}
