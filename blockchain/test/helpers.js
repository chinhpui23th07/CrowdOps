const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const CampaignState = { Fundraising: 0n, Successful: 1n, Failed: 2n, Active: 3n, Dissolved: 4n };
const RequestStatus = { Voting: 0n, Approved: 1n, Rejected: 2n, Executed: 3n, Cancelled: 4n };

const ONE_DAY = 24 * 60 * 60;
const eth = (value) => ethers.parseEther(String(value));

function campaignInput(overrides = {}) {
  return {
    title: "Máy lọc nước cho trường vùng cao",
    description: "Lắp 5 máy lọc nước cho điểm trường",
    goal: eth(10),
    durationSeconds: 7 * ONE_DAY,
    diamondThreshold: eth(3),
    proposalCID: "bafybeiproposalpdf",
    mediaCID: "bafybeimediaimage",
    nftMetadataCID: "bafybeinftmetadata",
    ...overrides,
  };
}

function requestInput(overrides = {}) {
  return {
    description: "Mua 5 máy lọc nước",
    recipient: ethers.ZeroAddress,
    amount: eth(4),
    evidenceCID: "bafybeiinvoice",
    votingDurationSeconds: 3 * ONE_DAY,
    ...overrides,
  };
}

async function deployFixture() {
  const [deployer, creator, alice, bob, carol, dave, vendor, outsider] = await ethers.getSigners();
  const crowdOps = await ethers.deployContract("CrowdOps");
  await crowdOps.waitForDeployment();
  const diamondNFT = await ethers.getContractAt("DiamondNFT", await crowdOps.diamondNFT());
  return { crowdOps, diamondNFT, deployer, creator, alice, bob, carol, dave, vendor, outsider };
}

/// Tạo chiến dịch mục tiêu 10 ETH, trả về id và token.
async function createCampaign(crowdOps, creator, overrides = {}) {
  await crowdOps.connect(creator).createCampaign(campaignInput(overrides));
  const campaignId = await crowdOps.campaignCount();
  const campaign = await crowdOps.getCampaign(campaignId);
  const token = await ethers.getContractAt("CampaignToken", campaign.token);
  return { campaignId, token };
}

/// Chiến dịch đã Thành công: alice 5, bob 3, carol 2 ETH (tổng 10 = mục tiêu).
async function successfulCampaignFixture() {
  const base = await deployFixture();
  const { crowdOps, creator, alice, bob, carol } = base;
  const { campaignId, token } = await createCampaign(crowdOps, creator);
  await crowdOps.connect(alice).contribute(campaignId, { value: eth(5) });
  await crowdOps.connect(bob).contribute(campaignId, { value: eth(3) });
  await crowdOps.connect(carol).contribute(campaignId, { value: eth(2) });
  await time.increase(7 * ONE_DAY + 1);
  await crowdOps.finalize(campaignId);
  return { ...base, campaignId, token };
}

/// Chiến dịch Thất bại: alice 2, bob 1 ETH (tổng 3 < 10).
async function failedCampaignFixture() {
  const base = await deployFixture();
  const { crowdOps, creator, alice, bob } = base;
  const { campaignId, token } = await createCampaign(crowdOps, creator);
  await crowdOps.connect(alice).contribute(campaignId, { value: eth(2) });
  await crowdOps.connect(bob).contribute(campaignId, { value: eth(1) });
  await time.increase(7 * ONE_DAY + 1);
  await crowdOps.finalize(campaignId);
  return { ...base, campaignId, token };
}

module.exports = {
  CampaignState,
  RequestStatus,
  ONE_DAY,
  eth,
  campaignInput,
  requestInput,
  deployFixture,
  createCampaign,
  successfulCampaignFixture,
  failedCampaignFixture,
};
