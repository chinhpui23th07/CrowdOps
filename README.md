# Crowd Ops - Nền tảng crowdfunding phi tập trung

DApp gây quỹ trong đó ETH được khóa trong smart contract và chỉ được giải ngân khi người ủng hộ biểu quyết > 50% tổng quyền. Hỗ trợ hoàn tiền khi thất bại, lưu tài liệu trên IPFS (có tài liệu riêng được mã hóa), token quản trị ERC-20 riêng cho từng chiến dịch và NFT Kim cương ERC-721.

> Chỉ dùng ETH thử nghiệm trên testnet. Chỉ dùng ví tạo riêng cho đồ án.

Tài liệu: [Kiến trúc và thiết kế](docs/01-kien-truc-va-thiet-ke.md) · [Kế hoạch 14 ngày](docs/02-ke-hoach-14-ngay.md) · [Đối chiếu rubric](docs/03-doi-chieu-rubric.md)

## Yêu cầu
Node.js 20.x (đã thử với 20.14), npm 10, MetaMask, Chrome hoặc Edge.

## Dành cho thành viên nhóm: chạy web demo trên Sepolia

Contract đã deploy sẵn trên Sepolia, địa chỉ nằm trong repo. **Không cần** deploy lại hay chạy Hardhat.

```bash
git clone <repo> && cd <repo>
cd server   && npm install && cp .env.sepolia.example .env       && npm start    # terminal 1
cd frontend && npm install && cp .env.sepolia.example .env.local && npm run dev  # terminal 2 -> http://localhost:5173
```

1. **PINATA_JWT**: xin trưởng nhóm qua tin nhắn riêng rồi dán vào `server/.env`. Thiếu JWT thì web vẫn xem được mọi chiến dịch, nhưng không upload file mới được (lúc tạo chiến dịch vẫn có thể bấm "Tôi đã có CID" và dán CID có sẵn trong `blockchain/.env.example`).
2. **MetaMask**: bật "Show test networks", chọn Sepolia. Cần ETH thử nghiệm để ký giao dịch: nhờ trưởng nhóm chuyển ít Sepolia ETH (0,05 là đủ demo nhiều lần), hoặc lấy từ faucet.
3. **Chiến dịch để trình bày**: #4 (thành công, có yêu cầu chi bị bác + giải ngân + NFT), #5 (thất bại, đã hoàn tiền), #6 (chủ dự án bỏ đi, đã giải thể). #1-#3 và #7-#9 là dữ liệu kiểm thử, bỏ qua.
4. **Tài liệu riêng (mã hóa)**: khóa giải mã nằm trong `server/data/` của **máy đã chạy server lúc tạo tài liệu**. Vì vậy hãy tạo và giải mã tài liệu riêng trên cùng một máy chạy demo.
5. Khi tạo chiến dịch mới để demo, đặt thời hạn vài phút (tối thiểu 1 phút) để kịp chốt kết quả và bỏ phiếu trong video. Mỗi giao dịch trên Sepolia mất khoảng 10-20 giây.

## Chạy trên máy (Hardhat local)

```bash
# Terminal 1 - blockchain
cd blockchain && npm install
npx hardhat test                       # 97 test
npx hardhat node                       # giữ terminal này chạy

# Terminal 2 - deploy và dữ liệu demo
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/demo-scenarios.js --network localhost   # tùy chọn: tạo sẵn 2 chiến dịch

# Terminal 3 - server (cần PINATA_JWT để upload thật)
cd server && npm install && cp .env.example .env && npm test && npm start

# Terminal 4 - website
cd frontend && npm install && cp .env.example .env.local && npm run dev   # http://localhost:5173
```

MetaMask: thêm mạng `http://127.0.0.1:8545`, chainId `31337`, rồi import private key của các tài khoản Hardhat (được in ra ở terminal 1; đây là key công khai, chỉ dùng local).

Tua thời gian trên local (để qua hạn chót):
```bash
cd blockchain && npx hardhat console --network localhost
> await network.provider.send("evm_increaseTime", [3600]); await network.provider.send("evm_mine")
```

### Kiểm thử E2E trên trình duyệt
Dùng ví giả lập và IPFS giả lập, không cần MetaMask hay Pinata:
```bash
cd server && node e2e/e2e-server.mjs
cd frontend && VITE_IPFS_GATEWAY=http://localhost:4000/test-ipfs/ npx vite
cd frontend && E2E_BROWSER=chrome node e2e/e2e.mjs     # 19 bước, ảnh chụp vào docs/screenshots/local-e2e
```
Chạy trên một Hardhat node mới, sau khi đã chạy `deploy.js` và `demo-scenarios.js`.

Bản chạy trên **Sepolia thật** (Pinata thật, giao dịch thật bằng các ví thử nghiệm trong `blockchain/.env`, tốn khoảng 0,002 ETH testnet mỗi lần):
```bash
cd server && npm start                     # server/.env: CHAIN_ID=11155111
cd frontend && npx vite                    # frontend/.env.local: VITE_CHAIN_ID=11155111
cd frontend && E2E_BROWSER=chrome node e2e/e2e-sepolia.mjs   # 10 bước, ảnh vào docs/screenshots/sepolia-e2e
```

## Deploy lên Sepolia
1. `blockchain/.env` (sao chép từ `.env.example`): điền `SEPOLIA_RPC_URL` và **private key** (64 ký tự hex, không phải địa chỉ ví) của 4 ví thử nghiệm: `DEPLOYER_PRIVATE_KEY`, `BACKER1/2/3_PRIVATE_KEY`. Kiểm tra: `npx hardhat run scripts/check-balances.js --network sepolia` (chỉ in địa chỉ và số dư).
2. Deploy: `DEPLOY_GAS_LIMIT=60000000 npx hardhat run scripts/deploy.js --network sepolia` → ghi `deployments/sepolia.json` và cập nhật `frontend/src/contracts/addresses.json`.
   - Vì sao cần `DEPLOY_GAS_LIMIT`: Sepolia tính phí tạo contract khoảng 1.600 gas/byte (Hardhat local chỉ 200), nên deploy CrowdOps + 2 contract con tốn ~54 triệu gas; RPC công khai từ chối *ước tính* gas trên 50 triệu. Phí thực tế rất nhỏ (~0,0005 ETH) vì giá gas Sepolia thấp.
   - Giá gas các giao dịch khác cố định 0,05 gwei (`SEPOLIA_GAS_PRICE_GWEI` trong `.env` để đổi); nếu bị báo phí quá thấp thì tăng giá trị này.
3. Tùy chọn: `npx hardhat verify --network sepolia <địa chỉ CrowdOps>` (cần `ETHERSCAN_API_KEY`).
4. `server/.env`: `CHAIN_ID=11155111`, `RPC_URL=<RPC Sepolia>`. `frontend/.env.local`: `VITE_CHAIN_ID=11155111`, `VITE_RPC_URL=<RPC Sepolia>`, `VITE_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/`.
5. Bằng chứng giao dịch: điền các `DEMO_*_CID` (CID thật, xem `docs/demo-assets/README.md`) rồi chạy `npx hardhat run scripts/demo-scenarios.js --network sepolia` (4 kịch bản, khoảng 15 phút vì mỗi giao dịch chờ 2 block) → `deployments/sepolia-demo-log.json`.
