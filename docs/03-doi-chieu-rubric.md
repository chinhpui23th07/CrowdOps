# Đối chiếu rubric

Trạng thái: ✅ đã làm và có bằng chứng kiểm chứng · 🟡 đã có mã nhưng chưa kiểm chứng trên môi trường thật · ❌ chưa làm

Bằng chứng hiện có (chạy ngày 03/11/2026, trên máy local):
- `npx hardhat test`: **97 passing**
- `npx hardhat coverage`: 98,9% statements, 90,3% branches (CrowdOps.sol: 99,4% / 90,2%)
- `server npm test`: **17 pass**
- `frontend node e2e/e2e.mjs` (Chrome): **19/19 PASS**, ảnh chụp ở `docs/screenshots/local-e2e/`
- `demo-scenarios.js --network localhost`: 34 giao dịch thành công (4 kịch bản), log ở `blockchain/deployments/localhost-demo-log.json`

Bằng chứng trên **Sepolia** (deploy 03/11/2026, chạy demo 04/11/2026):
- CrowdOps: [`0xf1f014D6e5F50C1Db64BEF1d2B1de55F756F00da`](https://sepolia.etherscan.io/address/0xf1f014D6e5F50C1Db64BEF1d2B1de55F756F00da) · DiamondNFT: [`0xdf2610f4…6bF9`](https://sepolia.etherscan.io/address/0xdf2610f410c7F8ce43167Af45DCF44661EeB6bF9) · TokenFactory: [`0xb5c83d99…cAD5`](https://sepolia.etherscan.io/address/0xb5c83d99C0619ee686fA5b1CC8aCb5d38725cAD5)
- Tx deploy: [`0xa8ca0040…6d70`](https://sepolia.etherscan.io/tx/0xa8ca00407033e3d8431a03a97f440c5fd8f845f1ee527af2271e257b63006d70) (block 12056165) · chi tiết: `blockchain/deployments/sepolia.json`
- `demo-scenarios.js --network sepolia`: **34/34 giao dịch thành công** (đã đối chiếu receipt từng tx trên chain), log đủ tx hash ở `blockchain/deployments/sepolia-demo-log.json`. Trạng thái cuối trên chain: chiến dịch #4 Active (còn 0,006 ETH), #5 Failed (đã hoàn hết), #6 Dissolved (đã chia lại hết); yêu cầu chi đáng ngờ bị Rejected; Alice đã nhận NFT Kim cương.
- Chiến dịch #1-#3 là lần chạy demo trước bị dừng giữa chừng (chỉ tạo + góp tiền); #7-#9 do E2E web tạo ra (chạy 3 lần). Bỏ qua khi trình bày.
- `frontend/e2e/e2e-sepolia.mjs` (Chrome, 04/11/2026): **10/10 PASS** - đọc dữ liệu Sepolia khi chưa nối ví, chuyển mạng, tạo chiến dịch qua web với upload Pinata thật, từ chối ký, góp tiền, tài liệu riêng mã hóa + cấp/từ chối khóa, xem lịch sử/dòng tiền chiến dịch #4-#6. Ảnh ở `docs/screenshots/sepolia-e2e/`.
- Một số tx tiêu biểu:

| Nghiệp vụ | Tx hash |
|---|---|
| createCampaign (#4) | [`0xf20b8e9b…250d8`](https://sepolia.etherscan.io/tx/0xf20b8e9b59c6c15db73bc6ebf3de41445906a77226f6508431422482ded250d8) |
| contribute (Alice) | [`0x4e31aa17…a0e0`](https://sepolia.etherscan.io/tx/0x4e31aa17b9a873ea565fd152a92f0dae9ad473cb2f7de40a0236c8ee5034a0e0) |
| finalize (thành công / thất bại) | [`0x6a17a2b6…b6b5`](https://sepolia.etherscan.io/tx/0x6a17a2b60812edb08c1256534af4d508432e5ec9012dbed976acd349962fb6b5) / [`0xd97f5cc7…936d`](https://sepolia.etherscan.io/tx/0xd97f5cc7edb436ade09d0ae787a7454b7fe62516cab577f5adc8d0d11c1e936d) |
| refund (Alice) | [`0xd2bf1363…3d14`](https://sepolia.etherscan.io/tx/0xd2bf1363e2b3edb432bb70f4dbc11b249b63eebc4958ad0f3dc9d2ec7a7f3d14) |
| rejectRequest (yêu cầu đáng ngờ) | [`0x7b4e9fb6…d97d`](https://sepolia.etherscan.io/tx/0x7b4e9fb61a98468b0cb3f19f5e8ef283e85bf539de9d1cb5eaf755f6702fd97d) |
| executeSpending | [`0x9c8e1459…2f83`](https://sepolia.etherscan.io/tx/0x9c8e1459944ec65d3c21a08f19996e5e2b0da9c7fe7494dfd384c4d75ebb2f83) |
| claimDiamondNFT | [`0xce2317f2…9647`](https://sepolia.etherscan.io/tx/0xce2317f2561216a6b3580a277ca3d18d7ebe288dcc4703c481e6cc3996cb9647) |
| voteDissolution (đủ > 50% → giải thể) | [`0x92c50db4…bae2`](https://sepolia.etherscan.io/tx/0x92c50db43be5fa8dc0c0af9cd4fd919680d849f5cc98332ccabf6d0d2697bae2) |
| claimDissolutionRefund (Alice) | [`0x5ecc2ee5…a9fd`](https://sepolia.etherscan.io/tx/0x5ecc2ee53a27eebdc768a68f9fd1c49e487925811c18e554d9e02dc46104a9fd) |

## Tiêu chí 1 - Smart contract

| Yêu cầu | Chức năng | File | Test | Bằng chứng demo | TT |
|---|---|---|---|---|---|
| createCampaign | `createCampaign` | `contracts/CrowdOps.sol` | `01.campaign` (10 test) | E2E bước 3 | ✅ |
| contribute | `contribute` | như trên | `01.campaign` (8 test) | E2E bước 5 | ✅ |
| requestSpending | `requestSpending` | như trên | `03.spending-voting` (11 test) | E2E bước 8 | ✅ |
| approveRequest / Reject | `approveRequest`, `rejectRequest` | như trên | `03` (9 test, gồm ngưỡng đúng 50%) | E2E bước 10, kịch bản 3 | ✅ |
| finalize, refund, executeSpending | các hàm cùng tên + `cancelRequest` | như trên | `01`, `02.refund`, `03` | E2E bước 7, 11; demo log | ✅ |
| Kiểm tra quyền, thời hạn, trạng thái, số tiền, ngưỡng, chống rút lặp | modifier + custom error | như trên | các test "từ chối…", tấn công re-entrancy | - | ✅ |
| Test đường thành công và giao dịch bị từ chối | - | `blockchain/test/*` | 97 test | output test | ✅ |
| Deploy testnet, địa chỉ + tx hash | `scripts/deploy.js` | - | - | địa chỉ + tx hash ở mục "Bằng chứng trên Sepolia" | ✅ |
| Giải thích hàm/trạng thái trong báo cáo | - | `docs/01` mục 4-5 | - | - | 🟡 (đã có nội dung, chưa đưa vào Word) |

## Tiêu chí 2 - Website / Web3

| Yêu cầu | File | Bằng chứng | TT |
|---|---|---|---|
| Explorer: danh sách, progress bar, thời gian còn lại, trạng thái | `frontend/src/pages/ExplorerPage.jsx` | ảnh 01 | ✅ |
| Trang chi tiết, tạo chiến dịch, góp tiền, xem tài liệu, Voting Dashboard Approve/Reject | `pages/CampaignPage`, `pages/CreateCampaignPage`, `features/campaign`, `features/voting`, `features/documents` | ảnh 03, 05, 06, 07 | ✅ |
| ≥ 3 tương tác on-chain thật; phân biệt đọc và ký | 9 loại giao dịch; nhãn "✍ Cần ký bằng ví"; chế độ chỉ xem | E2E | ✅ |
| Hiện đầy đủ ví chủ dự án, mạng, lịch sử + tx hash | `Address`, `HistoryPanel` | ảnh 06, 09 | ✅ |
| Chưa kết nối ví / sai mạng / từ chối ký / tx thất bại / đang chờ | `app/Header.jsx`, `features/wallet/useTransaction.js`, `shared/utils/errors.js` | ảnh 01, 02, 04 | ✅ |
| Demo ổn định trên testnet | `frontend/e2e/e2e-sepolia.mjs` | script 4 kịch bản: 34/34 tx Sepolia; **E2E web trên Sepolia 10/10 PASS** (Pinata thật, tx thật, ảnh `docs/screenshots/sepolia-e2e/`). Ví trong E2E ký bằng private key thay cho popup MetaMask, nên vẫn cần thử tay với extension MetaMask một lần | ✅ (MetaMask tay: 🟡) |

## Tiêu chí 3 - IPFS

| Yêu cầu | File | Bằng chứng | TT |
|---|---|---|---|
| Upload/truy xuất PDF, ảnh/video, hóa đơn, metadata JSON | `server/src/ipfs/` (pinata.client, ipfs.controller/service/dto), `FileUploadField.jsx` | 5 file demo (PDF đề xuất, ảnh bìa, metadata NFT JSON, 2 hóa đơn) đã upload Pinata thật, mở được qua gateway; CID dùng trong các tx Sepolia. Upload qua giao diện web (PDF, ảnh, tài liệu riêng đã mã hóa) lên Pinata thật: E2E Sepolia bước 3, 6 | ✅ |
| Lưu CID trong contract; nút xem bản gốc | các trường `*CID`, `DocumentsPanel` | ảnh 08 | ✅ |
| Phân quyền theo vai trò, mã hóa thật, cấp khóa thật | `features/documents/crypto.js`, `server/src/auth/` (signature.guard, access.service), `server/src/keys/` | 17 test server; E2E bước 14-15 | ✅ |
| Giải thích nơi lưu, cách giữ file, luồng upload/retrieve | `docs/01` mục 7 | - | 🟡 (chưa đưa vào Word) |

## Tiêu chí 4 - Token / NFT

| Yêu cầu | File | Test | TT |
|---|---|---|---|
| ERC-20 quản trị + ERC-721 Kim cương | `CampaignToken.sol`, `DiamondNFT.sol` | `04.token-nft-docs` | ✅ |
| ≥ 2 nghiệp vụ dùng token | mint khi góp; tính phiếu; gate tài liệu theo số dư/NFT | `01`, `03`, server test | ✅ |
| Test + giao dịch demo cấp/kiểm tra/sử dụng | - | 97 test; demo log (claim NFT, chia lại quỹ theo token) | ✅ local · ✅ Sepolia |
| Token thuộc chiến dịch nào, ai mint, khi thất bại thì sao | `docs/01` mục 6 | test burn khi refund | ✅ |

## Tiêu chí 5 - Báo cáo và thuyết trình

| Yêu cầu | TT |
|---|---|
| Nội dung báo cáo (bài toán, kiến trúc, luồng, contract, IPFS, token, bảo mật, test, testnet) | 🟡 có nguyên liệu trong `docs/01`; chưa có file Word |
| Bảng chữ viết tắt, caption, tài liệu tham khảo, chính tả | ❌ |
| Slide chữ ≥ 18 pt, Word ≥ 14 pt, tương phản đủ | ❌ |
| Video demo có caption | ❌ |

Đề bài không quy định số trang/số slide nên nhóm tự quyết theo hướng dẫn của giảng viên.

## Tính năng mở rộng (điểm cộng, ngoài rubric)

| Tính năng | File | Test / bằng chứng | TT |
|---|---|---|---|
| Giải thể quỹ khi chủ dự án bỏ đi: biểu quyết > 50% tổng quyền, chia lại phần còn lại theo tỷ lệ token (vá vấn đề #4) | `CrowdOps.sol` (`proposeDissolution`, `voteDissolution`, `claimDissolutionRefund`), `DissolutionPanel.jsx` | `06.dissolution` (18 test, gồm re-entrancy), kịch bản demo 4, E2E bước 18-19, ảnh 11, 13 | ✅ local · ✅ Sepolia (chiến dịch #6) |
| Minh bạch dòng tiền: giải ngân / hoàn / còn lại, từng khoản kèm hóa đơn IPFS và tỷ lệ phiếu | `CashFlowPanel.jsx` | E2E bước 18, ảnh 12 | ✅ local |
| Đối soát on-chain: số dư ETH thật của contract = tổng sổ sách các chiến dịch | `ExplorerPage.jsx` (`PlatformStats`) | E2E bước 18 | ✅ local |
| Giao diện tối kiểu Web3 | `styles.css` | ảnh 01-13 | ✅ |
| Giải ngân theo cột mốc định trước | - | Không làm: trùng cơ chế yêu cầu chi + biểu quyết, phải đổi `createCampaign` | ➖ |
