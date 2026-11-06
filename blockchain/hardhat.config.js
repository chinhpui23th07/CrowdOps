require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY, SEPOLIA_GAS_PRICE_GWEI } = process.env;
// Ví đầu tiên là ví deploy/chủ dự án; 3 ví sau là người ủng hộ trong script demo.
const SEPOLIA_ACCOUNTS = [
  DEPLOYER_PRIVATE_KEY,
  process.env.BACKER1_PRIVATE_KEY,
  process.env.BACKER2_PRIVATE_KEY,
  process.env.BACKER3_PRIVATE_KEY,
].filter(Boolean);
// Giá gas cố định cho Sepolia. Mặc định ethers trả "tiền boa" 1 gwei/gas; mỗi createCampaign
// tốn ~15 triệu gas (tự deploy token riêng) nên sẽ mất ~0,015 ETH. 0,05 gwei vẫn cao hơn
// base fee Sepolia hiện tại rất nhiều; nếu bị báo "fee too low" thì tăng SEPOLIA_GAS_PRICE_GWEI.
const SEPOLIA_GAS_PRICE = Math.round(Number(SEPOLIA_GAS_PRICE_GWEI || "0.05") * 1e9);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    // Chỉ dùng ví thử nghiệm riêng cho đồ án, KHÔNG dùng ví chứa tài sản thật.
    ...(SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY
      ? {
          sepolia: {
            url: SEPOLIA_RPC_URL,
            accounts: SEPOLIA_ACCOUNTS,
            chainId: 11155111,
            gasPrice: SEPOLIA_GAS_PRICE,
          },
        }
      : {}),
  },
  etherscan: { apiKey: ETHERSCAN_API_KEY || "" },
  gasReporter: { enabled: process.env.REPORT_GAS === "true", currency: "USD" },
};
