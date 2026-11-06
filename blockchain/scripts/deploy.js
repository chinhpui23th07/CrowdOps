// Deploy CrowdOps (tự deploy kèm DiamondNFT + CampaignTokenFactory) và ghi lại bằng chứng triển khai.
// Chạy: npx hardhat run scripts/deploy.js --network localhost | sepolia
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Mạng: ${network.name} (chainId ${network.config.chainId})`);
  console.log(`Ví deploy: ${deployer.address} - số dư ${ethers.formatEther(balance)} ETH`);

  // Sepolia tính phí tạo contract cao hơn nhiều so với Hardhat local (~1.600 gas/byte mã),
  // CrowdOps tự deploy thêm 2 contract con nên cần ~55 triệu gas. Một số RPC công khai từ chối
  // ước tính gas vượt 50 triệu => cho phép đặt gas thủ công qua DEPLOY_GAS_LIMIT.
  const overrides = {};
  if (process.env.DEPLOY_GAS_LIMIT) {
    overrides.gasLimit = BigInt(process.env.DEPLOY_GAS_LIMIT);
    // Ví phải có đủ gasLimit × maxFeePerGas để "đặt cọc". Mặc định ethers đặt tip 1 gwei nên
    // 60 triệu gas đòi cọc 0,06 ETH. Đặt phí theo base fee thực tế (gấp 3 để dư khi giá tăng).
    const { lastBaseFeePerGas } = await ethers.provider.getFeeData();
    const tip = ethers.parseUnits("0.01", "gwei");
    overrides.maxPriorityFeePerGas = tip;
    overrides.maxFeePerGas = (lastBaseFeePerGas ?? 0n) * 3n + tip;
    console.log(`Gas thủ công: ${overrides.gasLimit}, phí tối đa ${ethers.formatUnits(overrides.maxFeePerGas, "gwei")} gwei`);
  }
  const crowdOps = await ethers.deployContract("CrowdOps", [], overrides);
  const deployTx = crowdOps.deploymentTransaction();
  const receipt = await deployTx.wait(network.name === "hardhat" || network.name === "localhost" ? 1 : 2);

  const crowdOpsAddress = await crowdOps.getAddress();
  const diamondNFTAddress = await crowdOps.diamondNFT();
  const tokenFactoryAddress = await crowdOps.tokenFactory();

  const deployment = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    crowdOps: crowdOpsAddress,
    diamondNFT: diamondNFTAddress,
    tokenFactory: tokenFactoryAddress,
    deployTxHash: deployTx.hash,
    deployBlock: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deployedAt: new Date().toISOString(),
  };

  console.log("CrowdOps    :", crowdOpsAddress);
  console.log("DiamondNFT  :", diamondNFTAddress);
  console.log("TokenFactory:", tokenFactoryAddress);
  console.log("Tx deploy   :", deployTx.hash, `(block ${receipt.blockNumber}, gas ${receipt.gasUsed})`);

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(path.join(deploymentsDir, `${network.name}.json`), JSON.stringify(deployment, null, 2));

  exportToFrontend(deployment);
}

// Frontend chỉ cần ABI + địa chỉ; ghi đè theo chainId để một bản build chạy được nhiều mạng.
function exportToFrontend(deployment) {
  const outDir = path.join(__dirname, "..", "..", "frontend", "src", "contracts");
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of ["CrowdOps", "CampaignToken", "DiamondNFT"]) {
    const artifact = require(`../artifacts/contracts/${name}.sol/${name}.json`);
    fs.writeFileSync(path.join(outDir, `${name}.abi.json`), JSON.stringify(artifact.abi, null, 2));
  }

  const addressesFile = path.join(outDir, "addresses.json");
  const addresses = fs.existsSync(addressesFile) ? JSON.parse(fs.readFileSync(addressesFile, "utf8")) : {};
  addresses[deployment.chainId] = {
    network: deployment.network,
    crowdOps: deployment.crowdOps,
    diamondNFT: deployment.diamondNFT,
    deployBlock: deployment.deployBlock,
    deployTxHash: deployment.deployTxHash,
  };
  fs.writeFileSync(addressesFile, JSON.stringify(addresses, null, 2));
  console.log(`Đã xuất ABI + địa chỉ sang ${path.relative(process.cwd(), outDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
