import { formatEther } from "ethers";

export const CampaignState = { Fundraising: 0, Successful: 1, Failed: 2, Active: 3, Dissolved: 4 };
export const RequestStatus = { Voting: 0, Approved: 1, Rejected: 2, Executed: 3, Cancelled: 4 };

export const REQUEST_STATUS_LABEL = {
  0: { text: "Đang bỏ phiếu", tone: "info" },
  1: { text: "Đã duyệt - chờ giải ngân", tone: "success" },
  2: { text: "Bị bác bỏ", tone: "danger" },
  3: { text: "Đã giải ngân", tone: "neutral" },
  4: { text: "Đã hủy", tone: "neutral" },
};

/**
 * Nhãn trạng thái hiển thị. Chiến dịch đã quá hạn nhưng chưa ai gọi finalize() vẫn là
 * Fundraising trên chain - hiển thị "Chờ chốt kết quả" để không gây hiểu nhầm là còn nhận góp.
 */
export function campaignStatusLabel(campaign, nowSeconds) {
  const state = Number(campaign.state);
  if (state === CampaignState.Fundraising) {
    return nowSeconds > Number(campaign.deadline)
      ? { text: "Chờ chốt kết quả", tone: "warning" }
      : { text: "Đang huy động", tone: "info" };
  }
  if (state === CampaignState.Successful) return { text: "Thành công", tone: "success" };
  if (state === CampaignState.Failed) return { text: "Thất bại - hoàn tiền", tone: "danger" };
  if (state === CampaignState.Dissolved) return { text: "Đã giải thể - chia lại quỹ", tone: "warning" };
  return { text: "Đang triển khai", tone: "success" };
}

/** Hiển thị ETH tối đa 6 chữ số thập phân, không làm tròn lên. */
export function formatEth(wei, maxDecimals = 6) {
  const [whole, fraction = ""] = formatEther(wei ?? 0n).split(".");
  const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function percent(part, total) {
  if (!total || total === 0n) return 0;
  return Number((BigInt(part) * 10000n) / BigInt(total)) / 100;
}

export function timeLeft(deadlineSeconds, nowSeconds) {
  const diff = Number(deadlineSeconds) - nowSeconds;
  if (diff <= 0) return "Đã hết hạn";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = Math.floor(diff % 60);
  if (d > 0) return `Còn ${d} ngày ${h} giờ`;
  if (h > 0) return `Còn ${h} giờ ${m} phút`;
  return `Còn ${m} phút ${s} giây`;
}

export function formatDateTime(seconds) {
  return new Date(Number(seconds) * 1000).toLocaleString("vi-VN");
}

export function shortHash(hash) {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : "";
}
