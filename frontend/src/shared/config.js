import addresses from "../contracts/addresses.json";

const CHAINS = {
  31337: {
    name: "Hardhat Local",
    rpcUrl: "http://127.0.0.1:8545",
    explorer: null,
    currency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  11155111: {
    name: "Sepolia Testnet",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    currency: { name: "Sepolia Ether", symbol: "SepoliaETH", decimals: 18 },
  },
};

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 31337);
export const CHAIN = {
  id: CHAIN_ID,
  ...CHAINS[CHAIN_ID],
  rpcUrl: import.meta.env.VITE_RPC_URL || CHAINS[CHAIN_ID]?.rpcUrl,
};
export const DEPLOYMENT = addresses[CHAIN_ID] || null;
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
export const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

export function txUrl(hash) {
  return CHAIN.explorer ? `${CHAIN.explorer}/tx/${hash}` : null;
}

export function addressUrl(address) {
  return CHAIN.explorer ? `${CHAIN.explorer}/address/${address}` : null;
}
