// Kiểm tra địa chỉ và số dư các ví demo trước khi deploy / chạy kịch bản.
// Chỉ in ĐỊA CHỈ và số dư, không bao giờ in private key.
// Chạy: npx hardhat run scripts/check-balances.js --network sepolia
require("dotenv").config();
const { ethers, network } = require("hardhat");

const WALLETS = [
  ["Deployer (chủ dự án)", "DEPLOYER_PRIVATE_KEY"],
  ["Backer 1 (Alice)", "BACKER1_PRIVATE_KEY"],
  ["Backer 2 (Bob)", "BACKER2_PRIVATE_KEY"],
  ["Backer 3 (Carol)", "BACKER3_PRIVATE_KEY"],
];

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  const feeData = await ethers.provider.getFeeData();
  console.log(`Mạng ${network.name} (chainId ${chainId}), giá gas ~${ethers.formatUnits(feeData.gasPrice ?? 0n, "gwei")} gwei\n`);
  const seen = new Set();
  for (const [label, envName] of WALLETS) {
    const key = process.env[envName];
    if (!key) {
      console.log(`${label}: THIẾU ${envName}`);
      continue;
    }
    const address = new ethers.Wallet(key).address;
    const balance = await ethers.provider.getBalance(address);
    const duplicate = seen.has(address) ? "  <- TRÙNG với ví khác!" : "";
    seen.add(address);
    console.log(`${label.padEnd(22)} ${address}  ${ethers.formatEther(balance)} ETH${duplicate}`);
  }
}

main().catch((error) => {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
});
