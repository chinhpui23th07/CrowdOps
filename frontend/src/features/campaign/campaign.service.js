import { Contract } from "ethers";
import CampaignTokenAbi from "../../contracts/CampaignToken.abi.json";

/**
 * Lớp SERVICE của tính năng chiến dịch: đọc dữ liệu từ smart contract và chuyển thành
 * object JavaScript thường. Không dính React - chỉ nhận contract/provider và trả dữ liệu,
 * nên đọc riêng file này là hiểu frontend lấy những gì từ blockchain.
 */

// ---------------- Chuyển Result của ethers thành object thường ----------------

function toCampaign(id, c) {
  return {
    id: Number(id),
    creator: c.creator,
    token: c.token,
    state: Number(c.state),
    createdAt: Number(c.createdAt),
    deadline: Number(c.deadline),
    goal: c.goal,
    diamondThreshold: c.diamondThreshold,
    totalRaised: c.totalRaised,
    totalDisbursed: c.totalDisbursed,
    totalRefunded: c.totalRefunded,
    backerCount: Number(c.backerCount),
    title: c.title,
    description: c.description,
    proposalCID: c.proposalCID,
    mediaCID: c.mediaCID,
    nftMetadataCID: c.nftMetadataCID,
  };
}

/** Yêu cầu chi tiền (tính năng voting). */
function toRequest(id, r, status) {
  return {
    id,
    description: r.description,
    recipient: r.recipient,
    amount: r.amount,
    evidenceCID: r.evidenceCID,
    createdAt: Number(r.createdAt),
    votingDeadline: Number(r.votingDeadline),
    snapshotBlock: Number(r.snapshotBlock),
    totalVotingPower: r.totalVotingPower,
    approveVotes: r.approveVotes,
    rejectVotes: r.rejectVotes,
    approveCount: Number(r.approveCount),
    rejectCount: Number(r.rejectCount),
    executed: r.executed,
    cancelled: r.cancelled,
    status: Number(status),
  };
}

/** Đề xuất giải thể quỹ (tính năng dissolution). */
function toDissolution(id, p, status) {
  return {
    id,
    proposer: p.proposer,
    reason: p.reason,
    createdAt: Number(p.createdAt),
    votingDeadline: Number(p.votingDeadline),
    snapshotBlock: Number(p.snapshotBlock),
    totalVotingPower: p.totalVotingPower,
    supportVotes: p.supportVotes,
    opposeVotes: p.opposeVotes,
    supportCount: Number(p.supportCount),
    opposeCount: Number(p.opposeCount),
    status: Number(status),
  };
}

const range = (count) => Array.from({ length: count }, (_, i) => i);

// ---------------- Các hàm đọc dữ liệu ----------------

/** Danh sách chiến dịch, mới nhất trước. */
export async function fetchCampaignList(crowdOps) {
  if (!crowdOps) return [];
  const count = Number(await crowdOps.campaignCount());
  const ids = Array.from({ length: count }, (_, i) => count - i);
  const campaigns = await Promise.all(ids.map((id) => crowdOps.getCampaign(id)));
  return campaigns.map((c, i) => toCampaign(ids[i], c));
}

/** Toàn bộ dữ liệu của trang chi tiết: chiến dịch, yêu cầu chi, giải thể, tài liệu, thông tin của ví đang kết nối. */
export async function fetchCampaignDetail({ crowdOps, readProvider, account, campaignId }) {
  const campaign = toCampaign(campaignId, await crowdOps.getCampaign(campaignId));

  const requestCount = Number(await crowdOps.getRequestCount(campaignId));
  const requests = await Promise.all(
    range(requestCount).map(async (i) => {
      const [r, status] = await crowdOps.getRequest(campaignId, i);
      return toRequest(i, r, status);
    })
  );

  const dissolutionCount = Number(await crowdOps.getDissolutionCount(campaignId));
  const dissolutions = await Promise.all(
    range(dissolutionCount).map(async (i) => {
      const [p, status] = await crowdOps.getDissolution(campaignId, i);
      return toDissolution(i, p, status);
    })
  );

  const documents = (await crowdOps.getDocuments(campaignId)).map((d, i) => ({
    id: i,
    label: d.label,
    cid: d.cid,
    encrypted: d.encrypted,
    addedAt: Number(d.addedAt),
  }));

  const [balance, hasOpenRequest] = await Promise.all([
    crowdOps.availableBalance(campaignId),
    crowdOps.hasOpenRequest(campaignId),
  ]);

  const token = new Contract(campaign.token, CampaignTokenAbi, readProvider);
  const [tokenSymbol, totalSupply] = await Promise.all([token.symbol(), token.totalSupply()]);

  const me = account ? await fetchMyStatus({ crowdOps, token, account, campaign, requests, dissolutions }) : null;
  return { campaign, requests, dissolutions, documents, balance, hasOpenRequest, tokenSymbol, totalSupply, me };
}

/** Thông tin riêng của ví đang kết nối: đã góp bao nhiêu, token, quyền biểu quyết, đã bỏ phiếu gì. */
async function fetchMyStatus({ crowdOps, token, account, campaign, requests, dissolutions }) {
  const campaignId = campaign.id;
  const [contributed, refunded, tokenBalance, votes, delegate, diamondClaimed, diamondEligible] = await Promise.all([
    crowdOps.contributions(campaignId, account),
    crowdOps.hasRefunded(campaignId, account),
    token.balanceOf(account),
    token.getVotes(account),
    token.delegates(account),
    crowdOps.diamondClaimed(campaignId, account),
    crowdOps.isDiamondEligible(campaignId, account),
  ]);
  const requestVotes = await Promise.all(
    requests.map(async (r) => ({
      vote: Number(await crowdOps.votes(campaignId, r.id, account)),
      power: await crowdOps.votingPowerFor(campaignId, r.id, account),
    }))
  );
  const dissolutionVotes = await Promise.all(
    dissolutions.map(async (p) => ({
      vote: Number(await crowdOps.dissolutionVotes(campaignId, p.id, account)),
      power: await crowdOps.dissolutionVotingPowerFor(campaignId, p.id, account),
    }))
  );
  return {
    dissolutionVotes,
    contributed,
    refunded,
    tokenBalance,
    votes,
    delegate,
    diamondClaimed,
    diamondEligible,
    requestVotes,
    isCreator: account.toLowerCase() === campaign.creator.toLowerCase(),
  };
}

/**
 * Lịch sử lấy từ event trên chain - kèm transaction hash để người dùng tự kiểm chứng trên
 * Etherscan. Truy vấn theo từng đoạn block vì RPC công khai giới hạn phạm vi mỗi lần gọi.
 */
export async function fetchCampaignHistory({ crowdOps, readProvider, campaignId, fromBlock = 0 }) {
  const latest = await readProvider.getBlockNumber();
  const filters = [
    ["Đóng góp", crowdOps.filters.Contributed(campaignId)],
    ["Hoàn tiền", crowdOps.filters.Refunded(campaignId)],
    ["Giải ngân", crowdOps.filters.SpendingExecuted(campaignId)],
    ["Bỏ phiếu", crowdOps.filters.Voted(campaignId)],
    ["Bỏ phiếu giải thể", crowdOps.filters.DissolutionVoted(campaignId)],
    ["Chia lại quỹ", crowdOps.filters.DissolutionRefunded(campaignId)],
  ];
  const CHUNK = 40000;
  const items = [];
  for (const [type, filter] of filters) {
    for (let start = fromBlock; start <= latest; start += CHUNK) {
      const events = await crowdOps.queryFilter(filter, start, Math.min(start + CHUNK - 1, latest));
      for (const e of events) items.push(describeEvent(type, e));
    }
  }
  return items.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

function describeEvent(type, e) {
  const base = { type, hash: e.transactionHash, blockNumber: e.blockNumber, logIndex: e.index };
  const a = e.args;
  if (type === "Đóng góp") return { ...base, from: a.backer, amount: a.amount };
  if (type === "Hoàn tiền") return { ...base, from: a.backer, amount: a.amount };
  if (type === "Giải ngân") return { ...base, from: a.recipient, amount: a.amount, note: `Yêu cầu #${a.requestId}` };
  if (type === "Chia lại quỹ") return { ...base, from: a.holder, amount: a.amount, note: "Sau khi giải thể" };
  if (type === "Bỏ phiếu giải thể") {
    const note = `${a.support ? "Ủng hộ" : "Phản đối"} đề xuất giải thể #${a.proposalId}`;
    return { ...base, from: a.voter, amount: a.weight, note, isVote: true };
  }
  return {
    ...base,
    from: a.voter,
    amount: a.weight,
    note: `${a.approve ? "Approve" : "Reject"} yêu cầu #${a.requestId}`,
    isVote: true,
  };
}
