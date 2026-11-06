import { readFileSync } from "node:fs";
import { Contract, JsonRpcProvider } from "ethers";

// ABI và địa chỉ contract do blockchain/scripts/deploy.js xuất ra thư mục của frontend; server đọc chung.
const contractsDir = new URL("../../../frontend/src/contracts/", import.meta.url);
const loadJson = (name) => JSON.parse(readFileSync(new URL(name, contractsDir), "utf8"));

/** Đọc dữ liệu on-chain cần cho việc phân quyền. Chỉ gọi hàm view - không tốn gas. */
export function createChainService({ rpcUrl, chainId }) {
  const addresses = loadJson("addresses.json")[chainId];
  if (!addresses) throw new Error(`Chưa có địa chỉ contract cho chainId ${chainId} - hãy chạy scripts/deploy.js`);

  const provider = new JsonRpcProvider(rpcUrl, Number(chainId), { staticNetwork: true });
  const crowdOps = new Contract(addresses.crowdOps, loadJson("CrowdOps.abi.json"), provider);
  const diamondNFT = new Contract(addresses.diamondNFT, loadJson("DiamondNFT.abi.json"), provider);
  const tokenAbi = loadJson("CampaignToken.abi.json");

  return {
    crowdOpsAddress: addresses.crowdOps,
    async getCreator(campaignId) {
      return (await crowdOps.getCampaign(campaignId)).creator;
    },
    async getTokenBalance(campaignId, address) {
      const campaign = await crowdOps.getCampaign(campaignId);
      return new Contract(campaign.token, tokenAbi, provider).balanceOf(address);
    },
    async hasDiamond(campaignId, address) {
      return diamondNFT.hasDiamond(campaignId, address);
    },
  };
}
