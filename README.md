# Crowd Ops

DApp gọi vốn cộng đồng trên Ethereum. Tiền góp được khóa trong smart contract và chỉ được giải ngân khi người ủng hộ biểu quyết đồng ý trên 50%. Chiến dịch thất bại thì người góp được hoàn tiền. Tài liệu lưu trên IPFS, tài liệu riêng được mã hóa AES.

## Kiến trúc

```
                ┌──────── đọc (RPC, miễn phí) ────────┐
                │                                     ▼
 Trình duyệt ───┤                             Smart contract
 (React)        └── ghi (ký qua MetaMask) ───► CrowdOps, CampaignToken, DiamondNFT
     │                                                ▲
     │ HTTP                                           │ đọc quyền truy cập
     ▼                                                │
 Server (Express) ────────────────────────────────────┘
     │
     └──► Pinata (IPFS)
```

| Phần | Công nghệ | Vai trò |
|---|---|---|
| `blockchain/` | Solidity, Hardhat 2, OpenZeppelin 5 | Giữ quỹ, máy trạng thái chiến dịch, biểu quyết, hoàn tiền, NFT |
| `server/` | Node.js, Express | Upload IPFS (giữ JWT Pinata), cấp khóa giải mã theo quyền on-chain |
| `frontend/` | React 18, Vite 6, ethers 6 | Giao diện, kết nối ví, gửi giao dịch |

### Server: module theo kiểu NestJS

```
server/src/
├── main.js            khởi động
├── app.module.js      ghép các module
├── common/            HttpError, exception filter, rate limit
├── auth/              guard kiểm tra chữ ký ví, quy tắc phân quyền
├── chain/             đọc dữ liệu blockchain
├── ipfs/              /api/ipfs  -> controller, service, dto, pinata client
└── keys/              /api/keys  -> controller, service, dto, repository
```

Request đi theo thứ tự: controller → guard → dto → service → repository. Lỗi ở bước nào cũng được exception filter trả về dạng `{ error }`.

### Frontend: chia theo tính năng

```
frontend/src/
├── app/               App (định tuyến), Header
├── pages/             Explorer, Create, Campaign, About
├── features/
│   ├── wallet/        kết nối ví, vòng đời giao dịch
│   ├── campaign/      danh sách, chi tiết, góp tiền, lịch sử
│   ├── voting/        yêu cầu chi + bỏ phiếu
│   ├── dissolution/   giải thể quỹ
│   └── documents/     tài liệu, mã hóa AES-GCM
├── shared/            config, component chung, hooks, utils, ipfs
└── contracts/         ABI + địa chỉ (do deploy.js sinh ra)
```

Mỗi tính năng có 3 lớp: **service** (gọi contract/server) → **hook** (state React) → **component** (giao diện).

Chi tiết: [docs/01-kien-truc-va-thiet-ke.md](docs/01-kien-truc-va-thiet-ke.md).

## Yêu cầu

- Node.js 20.x, npm 10
- MetaMask
- Chrome hoặc Edge

## Chạy với Sepolia (contract đã deploy sẵn)

```bash
# Terminal 1 - server
cd server && npm install && cp .env.sepolia.example .env && npm start

# Terminal 2 - web
cd frontend && npm install && cp .env.sepolia.example .env.local && npm run dev
```

Mở http://localhost:5173. Trong MetaMask chọn mạng Sepolia, cần một ít Sepolia ETH lấy từ faucet.

`PINATA_JWT` trong `server/.env` là tùy chọn. Thiếu JWT thì web vẫn xem được dữ liệu nhưng không upload file mới được.

## Chạy local (Hardhat)

```bash
# Terminal 1 - blockchain
cd blockchain && npm install
npx hardhat node

# Terminal 2 - deploy
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/demo-scenarios.js --network localhost   # tùy chọn: dữ liệu mẫu

# Terminal 3 - server
cd server && npm install && cp .env.example .env && npm start

# Terminal 4 - web
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

Trong MetaMask, thêm mạng RPC `http://127.0.0.1:8545`, chainId `31337`, rồi import private key của các tài khoản Hardhat in ra ở terminal 1.

Tua thời gian để qua hạn chót của chiến dịch:

```bash
cd blockchain && npx hardhat console --network localhost
> await network.provider.send("evm_increaseTime", [3600]); await network.provider.send("evm_mine")
```

## Kiểm thử

```bash
cd blockchain && npx hardhat test       # smart contract
cd server && npm test                   # server
```

E2E trên trình duyệt (ví và IPFS giả lập, chạy trên Hardhat node mới sau `deploy.js` và `demo-scenarios.js`):

```bash
cd server && node e2e/e2e-server.mjs
cd frontend && VITE_IPFS_GATEWAY=http://localhost:4000/test-ipfs/ npx vite
cd frontend && E2E_BROWSER=chrome node e2e/e2e.mjs
```

## Deploy lên Sepolia

1. Tạo `blockchain/.env` từ `.env.example`, điền `SEPOLIA_RPC_URL` và các private key của ví thử nghiệm.
2. Deploy:
   ```bash
   cd blockchain
   DEPLOY_GAS_LIMIT=60000000 npx hardhat run scripts/deploy.js --network sepolia
   ```
   Script ghi `deployments/sepolia.json` và cập nhật `frontend/src/contracts/addresses.json`. Cần `DEPLOY_GAS_LIMIT` vì deploy tốn khoảng 54 triệu gas, vượt mức ước tính tối đa mà RPC công khai cho phép.
3. Đặt `CHAIN_ID=11155111` trong `server/.env` và `VITE_CHAIN_ID=11155111` trong `frontend/.env.local`.

> Chỉ dùng ví và ETH thử nghiệm trên testnet.
