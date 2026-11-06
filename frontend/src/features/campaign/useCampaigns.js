import { useWallet } from "../wallet/WalletContext";
import { useAsync } from "../../shared/hooks/useAsync";
import { DEPLOYMENT } from "../../shared/config";
import { fetchCampaignDetail, fetchCampaignHistory, fetchCampaignList } from "./campaign.service";

/**
 * Lớp HOOK (ViewModel): nối campaign.service với React. Lấy contract từ ví, gọi service,
 * và tự tải lại khi đổi ví hoặc sau mỗi giao dịch (refreshKey). Trả { loading, data, error }.
 */

export function useCampaignList() {
  const { crowdOps, refreshKey } = useWallet();
  return useAsync(() => fetchCampaignList(crowdOps), [crowdOps, refreshKey]);
}

export function useCampaignDetail(campaignId) {
  const { crowdOps, readProvider, account, refreshKey } = useWallet();
  return useAsync(
    () => fetchCampaignDetail({ crowdOps, readProvider, account, campaignId }),
    [crowdOps, campaignId, account, refreshKey]
  );
}

export function useCampaignHistory(campaignId) {
  const { crowdOps, readProvider, refreshKey } = useWallet();
  return useAsync(
    () => fetchCampaignHistory({ crowdOps, readProvider, campaignId, fromBlock: DEPLOYMENT?.deployBlock || 0 }),
    [crowdOps, campaignId, refreshKey]
  );
}
