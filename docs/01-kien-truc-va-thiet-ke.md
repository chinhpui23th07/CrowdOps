# Crowd Ops - Kiến trúc và thiết kế

## 1. Sản phẩm cuối qua một ví dụ

**Lan** muốn gây quỹ 0,05 ETH để lắp máy lọc nước cho một điểm trường vùng cao.

1. Lan vào website, kết nối MetaMask (mạng Sepolia), mở trang **Tạo chiến dịch**: điền tiêu đề, mục tiêu 0,05 ETH, thời hạn 7 ngày, ngưỡng Kim cương 0,01 ETH, rồi upload file `proposal.pdf` và ảnh điểm trường. File lên IPFS, website nhận về CID (mã định danh nội dung). Lan ký giao dịch `createCampaign`; contract lưu CID và tạo token quản trị `COP1` dành riêng cho chiến dịch #1.
2. **Minh** góp 0,03 ETH, **Hà** góp 0,02 ETH. ETH nằm trong contract, Lan chưa nhận được đồng nào. Minh nhận 0,03 COP1, Hà nhận 0,02 COP1. Trang chi tiết hiện thanh tiến độ 100%, lịch sử góp tiền kèm transaction hash.
3. Hết 7 ngày, ai đó bấm **Chốt kết quả**. Đã đạt mục tiêu nên chiến dịch chuyển sang **Thành công**.
4. Lan tạo **yêu cầu chi** 0,02 ETH gửi cho cửa hàng thiết bị, đính kèm ảnh hóa đơn (lên IPFS). Minh bấm **Approve**: 0,03/0,05 = 60% tổng quyền biểu quyết, vượt 50% nên yêu cầu được duyệt. Lan bấm **Giải ngân**, contract chuyển 0,02 ETH cho cửa hàng. Chiến dịch chuyển sang **Đang triển khai**.
5. Lan tạo tiếp một yêu cầu 0,03 ETH về "ví marketing" lạ, hóa đơn mập mờ. Minh bấm **Reject**: phiếu chống đã chiếm 60% nên yêu cầu bị bác ngay, tiền vẫn nằm trong quỹ.
6. Minh góp ≥ 0,01 ETH nên bấm **Nhận NFT Kim cương** và nhận một NFT ERC-721 tri ân.
7. Lan upload "hợp đồng nhà cung cấp" dưới dạng **tài liệu riêng**: file được mã hóa ngay trong trình duyệt, chỉ bản mã hóa lên IPFS. Minh và Hà (đang giữ COP1) ký xác thực và giải mã xem được. Một người lạ có CID cũng chỉ tải về được dữ liệu vô nghĩa.

Kịch bản thất bại: nếu hết hạn mà mới gây được 0,02 ETH, chiến dịch chuyển sang **Thất bại**. Mỗi người tự bấm **Nhận hoàn tiền** và nhận lại đúng số đã góp, còn token COP của họ bị hủy (burn).

## 2. Kiến trúc

```
┌──────────────────────┐   đọc (view, miễn phí)    ┌─────────────────────────────┐
│ Website React (Vite) │ ────────────────────────▶ │ RPC Sepolia / Hardhat local │
│  ethers v6           │                           └──────────────┬──────────────┘
│                      │   giao dịch (ký bằng ví)  ┌──────────────▼──────────────┐
│                      │ ──MetaMask──────────────▶ │ CrowdOps.sol (giữ ETH)      │
│                      │                           │  ├─ CampaignTokenFactory    │
│                      │                           │  │    └─ CampaignToken #1..n │
│                      │                           │  └─ DiamondNFT (ERC-721)    │
│                      │                           └──────────────▲──────────────┘
│                      │ upload / xin khóa         ┌──────────────┴──────────────┐
│                      │ ────────────────────────▶ │ Server Node (Express)       │
│                      │                           │  ├─ proxy upload → Pinata   │
│                      │                           │  └─ key server (đọc chain   │
│                      │                           │     để kiểm tra quyền)      │
│                      │ xem file (gateway)        └──────────────┬──────────────┘
│                      │ ◀──────────────────────────  IPFS (Pinata pin) ◀┘
└──────────────────────┘
```

| Thành phần | Vai trò | Lý do chọn |
|---|---|---|
| `CrowdOps.sol` | Giữ quỹ, máy trạng thái, biểu quyết, hoàn tiền, giải ngân | Mọi luật nghiệp vụ quan trọng nằm on-chain |
| `CampaignToken.sol` | ERC-20 + ERC20Votes, mỗi chiến dịch một token | Quyền biểu quyết không lẫn giữa các chiến dịch; ERC20Votes có sẵn snapshot |
| `CampaignTokenFactory.sol` | Deploy token | Nếu nhúng thẳng vào CrowdOps thì bytecode là 24.612 byte, vượt giới hạn 24.576 byte |
| `DiamondNFT.sol` | ERC-721 tri ân | Một collection chung, mỗi NFT ghi `campaignOf[tokenId]` |
| Server | Upload qua Pinata, cấp khóa giải mã | Không để lộ JWT Pinata ra trình duyệt; giữ khóa AES ngoài IPFS |
| Pinata | Dịch vụ pin IPFS | File vẫn truy xuất được khi máy của nhóm tắt |

## 3. Cấu trúc thư mục

```
Project_Blockchain/
├── blockchain/                 Hardhat 2.29 + OpenZeppelin 5.1
│   ├── contracts/              CrowdOps, CampaignToken, CampaignTokenFactory, DiamondNFT
│   │   └── test/               ReentrancyAttacker, RejectingReceiver (chỉ dùng cho test)
│   ├── test/                   01…06 *.test.js - 97 test
│   ├── scripts/deploy.js       deploy, ghi deployments/<network>.json, xuất ABI cho frontend
│   ├── scripts/demo-scenarios.js  chạy 3 kịch bản demo, lưu toàn bộ tx hash
│   └── deployments/            bằng chứng triển khai (địa chỉ, tx hash, block)
├── server/                     Express, tổ chức theo module kiểu NestJS (xem mục 3.1)
│   ├── src/                    main, app.module, common/, auth/, chain/, ipfs/, keys/
│   ├── test/                   17 unit test
│   └── e2e/e2e-server.mjs      server với IPFS giả, chỉ dùng cho kiểm thử E2E
├── frontend/                   React 18 + Vite 6 + ethers 6, chia theo tính năng (xem mục 3.2)
│   ├── src/                    app/, pages/, features/, shared/, contracts/
│   └── e2e/e2e.mjs             19 bước kiểm thử trên trình duyệt thật
└── docs/                       tài liệu thiết kế, kế hoạch, rubric, ảnh chụp
```

### 3.1. Kiến trúc server: module theo kiểu NestJS

Server viết bằng Express nhưng tổ chức theo mô hình của NestJS: chia theo **tính năng (module)**, mỗi module có
controller, service, DTO riêng. Mỗi file chỉ làm một việc nên đọc tên file là biết code nằm ở đâu.

```
server/src/
├── main.js                       khởi động: đọc .env, tạo phụ thuộc thật, chạy server
├── app.module.js                 module gốc: ghép middleware + các module, gắn exception filter
├── common/                       dùng chung
│   ├── http-error.js             HttpError (≈ HttpException)
│   ├── http-exception.filter.js  biến mọi lỗi thành JSON { error } (≈ ExceptionFilter)
│   ├── rate-limit.middleware.js  giới hạn số lần upload mỗi IP
│   ├── async-handler.js          chuyển lỗi của hàm async tới filter
│   └── address.js                so sánh địa chỉ ví
├── auth/                         xác thực và phân quyền
│   ├── auth-message.js           nội dung message người dùng ký (khớp với frontend)
│   ├── signature.guard.js        guard: kiểm tra chữ ký ví, gắn req.signer (≈ @UseGuards)
│   └── access.service.js         quy tắc ai được nhận khóa (creator / backer / diamond)
├── chain/
│   └── chain.service.js          đọc dữ liệu on-chain (chỉ hàm view)
├── ipfs/                         module upload IPFS -> /api/ipfs
│   ├── ipfs.module.js            ghép service + controller (≈ @Module)
│   ├── ipfs.controller.js        POST /file, POST /json (≈ @Controller)
│   ├── ipfs.service.js           nghiệp vụ upload (≈ @Injectable service)
│   ├── ipfs.dto.js               kiểm tra dữ liệu vào: loại file, MIME (≈ DTO + ValidationPipe)
│   ├── pinata-configured.guard.js  chặn upload khi chưa có PINATA_JWT (503)
│   └── pinata.client.js          gọi API Pinata
└── keys/                         module khóa giải mã -> /api/keys
    ├── keys.module.js
    ├── keys.controller.js        POST /register, POST /request (đều qua signatureGuard)
    ├── keys.service.js           đăng ký khóa (chỉ chủ dự án), cấp khóa (kiểm tra quyền on-chain)
    ├── keys.dto.js               kiểm tra tier, khóa AES-256
    └── keys.repository.js        lưu khóa (file JSON; bản bộ nhớ cho test)
```

Đường đi của một request, ví dụ người dùng xin khóa tài liệu riêng:

```
POST /api/keys/request
  -> app.module         (CORS, đọc JSON)
  -> keys.controller    (route /request)
  -> signature.guard    (chữ ký hợp lệ? đúng mạng? còn hạn 5 phút?)      sai -> 400/401
  -> keys.dto           (lấy campaignId, cid)
  -> keys.service       (có khóa không?  -> access.service: có quyền không?)  -> 404/403
       -> keys.repository, chain.service (đọc blockchain)
  <- trả { key }        lỗi ở bất kỳ bước nào -> http-exception.filter -> { error }
```

**Dependency injection:** `createApp({ chain, keyStore, pinata, ... })` nhận mọi phụ thuộc từ bên ngoài.
`main.js` truyền bản thật (blockchain, file, Pinata). Test và E2E truyền bản giả, nên kiểm thử được
mà không cần mạng. Đây cũng là ý tưởng DI cốt lõi của NestJS, chỉ khác là ghép bằng tay thay vì dùng decorator.

### 3.2. Kiến trúc frontend: chia theo tính năng

Frontend dùng cùng tinh thần với server: mỗi tính năng của smart contract là một thư mục trong `features/`,
giống một module của server. Các lớp chỉ được gọi theo chiều **app → pages → features → shared**, không gọi ngược lại.

```
frontend/src/
├── main.jsx                      gắn React vào index.html
├── app/                          khung ứng dụng (≈ app.module)
│   ├── App.jsx                   định tuyến: / , /create, /campaign/:id, /about
│   ├── Header.jsx                thanh trên: kết nối ví, cảnh báo sai mạng
│   └── styles.css
├── pages/                        màn hình: ghép các feature lại, ít logic
│   ├── ExplorerPage.jsx  CreateCampaignPage.jsx  CampaignPage.jsx  AboutPage.jsx
├── features/                     tính năng (≈ module)
│   ├── wallet/                   kết nối ví + gửi giao dịch
│   │   ├── WalletContext.jsx     trạng thái ví, provider đọc (RPC) và ghi (MetaMask)
│   │   ├── useTransaction.js     vòng đời giao dịch: signing -> pending -> success/error
│   │   └── networkFeeProvider.js đề xuất phí gas theo giá thực tế của mạng
│   ├── campaign/                 chiến dịch: danh sách, chi tiết, góp tiền, lịch sử, dòng tiền
│   │   ├── campaign.service.js   SERVICE: đọc contract, chuyển dữ liệu (không dính React)
│   │   ├── useCampaigns.js       HOOK: nối service với React, tự tải lại sau giao dịch
│   │   └── components/           ActionPanel, HistoryPanel, CashFlowPanel
│   ├── voting/VotingDashboard.jsx         yêu cầu chi tiền + bỏ phiếu Approve/Reject
│   ├── dissolution/DissolutionPanel.jsx   đề xuất + bỏ phiếu giải thể, chia lại quỹ
│   └── documents/                tài liệu công khai và riêng tư
│       ├── DocumentsPanel.jsx
│       ├── crypto.js             mã hóa/giải mã AES-GCM ngay trên trình duyệt
│       └── keyAccess.service.js  ký message, gọi /api/keys của server
├── shared/                       dùng chung (≈ common/ của server)
│   ├── config.js                 mạng, RPC, địa chỉ contract, URL server
│   ├── components/               common.jsx (Badge, ProgressBar, TxStatus…), FileUploadField
│   ├── hooks/useAsync.js         tải dữ liệu async + tự thử lại khi RPC chậm
│   ├── services/ipfs.service.js  upload/tải file IPFS qua server
│   └── utils/                    format.js (ETH, thời gian), errors.js (dịch lỗi contract/ví)
└── contracts/                    ABI + địa chỉ, do blockchain/scripts/deploy.js sinh ra
```

Mỗi tính năng có tối đa 3 lớp, tương ứng mô hình MVVM:

| Lớp | Ví dụ | Vai trò |
|---|---|---|
| Service (Model) | `campaign.service.js`, `keyAccess.service.js` | Nói chuyện với contract/server, trả dữ liệu thuần |
| Hook (ViewModel) | `useCampaigns.js`, `useTransaction.js` | Giữ state React, gọi service, tải lại khi cần |
| Component (View) | `VotingDashboard.jsx`, `pages/*` | Chỉ hiển thị và bắt sự kiện người dùng |

Ví dụ luồng mở trang chi tiết chiến dịch:

```
pages/CampaignPage  -> useCampaignDetail(id)            (hook)
                    -> fetchCampaignDetail(...)         (service: đọc CrowdOps + CampaignToken)
                    -> useAsync                         (thử lại nếu RPC chưa thấy block mới)
                    <- { campaign, requests, dissolutions, documents, me }
                    -> truyền xuống ActionPanel, VotingDashboard, DissolutionPanel, DocumentsPanel
```

## 4. Mô hình dữ liệu on-chain

**Campaign**: `creator, token, state, createdAt, deadline, goal, diamondThreshold, totalRaised, totalDisbursed, totalRefunded, backerCount, title, description, proposalCID, mediaCID, nftMetadataCID`

**SpendingRequest**: `description, recipient, amount, evidenceCID, createdAt, votingDeadline, snapshotBlock, totalVotingPower, approveVotes, rejectVotes, approveCount, rejectCount, executed, cancelled`

**Document**: `label, cid, encrypted, addedAt`

**Mapping**: `contributions[campaign][ví]`, `hasRefunded[campaign][ví]`, `votes[campaign][request][ví]` (None/Approve/Reject), `diamondClaimed[campaign][ví]`

`availableBalance = totalRaised − totalDisbursed − totalRefunded`

### Trạng thái chiến dịch
```
Fundraising ──(finalize sau hạn chót, raised ≥ goal)──▶ Successful ──(executeSpending lần đầu)──▶ Active
     └──────(finalize sau hạn chót, raised < goal)──▶ Failed  (refund)

Successful / Active ──(phiếu ủng hộ giải thể > 50% tổng quyền)──▶ Dissolved  (claimDissolutionRefund)
```

Đề xuất giải thể dùng chung enum trạng thái với yêu cầu chi: `Voting` → `Approved` (đã thông qua, quỹ giải thể) hoặc `Rejected` (phản đối ≥ 50% hoặc hết hạn).

### Trạng thái yêu cầu chi (tính bằng hàm view `_statusOf`)
| Thứ tự kiểm tra | Điều kiện | Trạng thái |
|---|---|---|
| 1 | `cancelled` | Cancelled |
| 2 | `executed` | Executed |
| 3 | `approveVotes × 2 > totalVotingPower` | Approved |
| 4 | `rejectVotes × 2 ≥ totalVotingPower` (phe thuận không thể vượt 50% nữa) | Rejected |
| 5 | đã quá `votingDeadline` | Rejected |
| 6 | còn lại | Voting |

## 5. Danh sách hàm contract

| Hàm | Ai gọi | Ràng buộc chính | Loại |
|---|---|---|---|
| `createCampaign(input)` | bất kỳ | title ≠ rỗng; goal > 0; 60 s ≤ thời hạn ≤ 90 ngày; 0 < diamondThreshold ≤ goal; có proposalCID và nftMetadataCID | giao dịch |
| `contribute(id)` payable | bất kỳ trừ chủ dự án | state = Fundraising; now ≤ deadline; msg.value > 0; mint token 1:1 | giao dịch |
| `finalize(id)` | bất kỳ | state = Fundraising; now > deadline | giao dịch |
| `refund(id)` | người đã góp | state = Failed; chưa hoàn; có góp; CEI + nonReentrant; burn token | giao dịch |
| `requestSpending(id, input)` | chủ dự án | Successful/Active; không có yêu cầu mở; 0 < amount ≤ số dư; có ví nhận, mô tả, evidenceCID; 60 s ≤ thời gian bỏ phiếu ≤ 30 ngày; chụp snapshot | giao dịch |
| `approveRequest` / `rejectRequest` | người có quyền biểu quyết, trừ chủ dự án | status = Voting; chưa bỏ phiếu; quyền tại snapshot > 0 | giao dịch |
| `executeSpending(id, rid)` | chủ dự án | status = Approved; amount ≤ số dư; nonReentrant | giao dịch |
| `cancelRequest(id, rid)` | chủ dự án | status Voting/Approved | giao dịch |
| `addDocument(id, label, cid, encrypted)` | chủ dự án | label, cid ≠ rỗng | giao dịch |
| `claimDiamondNFT(id)` | người góp ≥ ngưỡng | Successful/Active; chưa nhận | giao dịch |
| `proposeDissolution(id, reason, duration)` | người đang giữ token, trừ chủ dự án | Successful/Active; reason ≠ rỗng; 60 s ≤ thời gian bỏ phiếu ≤ 30 ngày; không có đề xuất mở; chụp snapshot | giao dịch |
| `voteDissolution(id, pid, support)` | người có quyền tại snapshot, trừ chủ dự án | Successful/Active; status = Voting; chưa bỏ phiếu; ủng hộ > 50% tổng quyền thì chuyển Dissolved ngay | giao dịch |
| `claimDissolutionRefund(id)` | người giữ token | state = Dissolved; có token; nhận `số dư × token / tổng cung`; burn toàn bộ token; CEI + nonReentrant | giao dịch |
| `getCampaign`, `getRequest`, `getRequestStatus`, `getRequestCount`, `getDocuments`, `availableBalance`, `hasOpenRequest`, `votingPowerFor`, `isDiamondEligible`, `getDissolution`, `getDissolutionCount`, `dissolutionVotingPowerFor` | bất kỳ | - | view (miễn phí) |

## 6. Token và NFT

| Câu hỏi | Trả lời |
|---|---|
| Token thuộc chiến dịch nào? | Mỗi chiến dịch có một contract `CampaignToken` riêng (`COP<id>`), lưu `campaignId` dạng immutable |
| Ai được mint? | Chỉ CrowdOps (`minter` immutable). Chủ dự án, deployer hay factory đều không mint được (có test) |
| Tỷ lệ | 1 wei góp = 1 đơn vị token (18 decimals) → 1 ETH = 1 token |
| Chuyển nhượng | **Khóa** khi đang Huy động và khi Thất bại; **mở** khi Thành công |
| Delegation | ERC20Votes chỉ tính phiếu cho token đã delegate → contract **tự delegate cho người nhận** nếu họ chưa chọn ai, nên người dùng không cần gửi thêm giao dịch. Ai muốn ủy quyền cho người khác thì gọi `delegate()` |
| Chống bỏ phiếu hai lần | Phiếu đọc tại `snapshotBlock = block.number − 1` lúc tạo yêu cầu, và mỗi ví chỉ bỏ phiếu một lần. Chuyển token sau mốc này không tạo thêm phiếu (có test) |
| Khi thất bại / hoàn tiền | Token bị burn đúng bằng số đã góp, tổng cung về 0, mất quyền xem tài liệu riêng |
| Nghiệp vụ dùng token | (1) mint khi góp; (2) tính phiếu biểu quyết; (3) key server kiểm tra `balanceOf > 0` để cấp khóa tài liệu riêng; NFT dùng làm điều kiện cho tài liệu cấp "diamond" |
| NFT Kim cương | Ngưỡng do chủ dự án đặt (`diamondThreshold`), tính theo **tổng ETH đã góp** (không theo token, nên mua token không biến ai thành Kim cương). Mint một lần: kiểm tra trùng ở cả CrowdOps và DiamondNFT. `tokenURI = ipfs://<nftMetadataCID>` |

## 7. IPFS và phân quyền tài liệu

| Loại dữ liệu | Truy cập | Lưu CID ở đâu |
|---|---|---|
| Proposal PDF | Công khai | `Campaign.proposalCID` |
| Ảnh/video dự án | Công khai | `Campaign.mediaCID` |
| Metadata NFT (JSON, chuẩn ERC-721) | Công khai | `Campaign.nftMetadataCID` |
| Hóa đơn/chứng từ chi tiêu | Công khai | `SpendingRequest.evidenceCID` |
| Báo cáo bổ sung | Công khai | `Document` (encrypted = false) |
| Tài liệu riêng | Mã hóa AES-256-GCM | `Document` (encrypted = true) |

**Luồng upload tài liệu riêng:**
1. Trình duyệt sinh khóa AES ngẫu nhiên rồi mã hóa file.
2. Upload bản mã hóa qua server lên Pinata và nhận CID.
3. Chủ dự án ký message; server kiểm tra on-chain rằng người ký là `creator`, rồi lưu khóa.
4. Gửi giao dịch `addDocument(..., encrypted=true)`.

**Luồng giải mã:**
1. Người dùng ký message gồm action, chainId, campaignId, CID và thời điểm (hết hạn sau 5 phút).
2. Server khôi phục địa chỉ ví từ chữ ký, rồi đọc chain: là creator, hoặc `token.balanceOf > 0` (cấp backer), hoặc `DiamondNFT.hasDiamond` (cấp diamond).
3. Đủ điều kiện thì trả khóa; trình duyệt tải bản mã hóa từ gateway và giải mã.

Việc này không dựa vào chuyện ẩn nút trên frontend: không có khóa thì file trên IPFS chỉ là dữ liệu vô nghĩa (có test 403 và E2E).

**Giữ file truy xuất được:** Pinata pin file nên file vẫn còn khi máy nhóm tắt. CID ghi on-chain nên có thể pin lại ở dịch vụ khác (web3.storage, Filebase, node Kubo riêng) mà không đổi CID. Nên chuẩn bị thêm một gateway dự phòng (`ipfs.io`) cho buổi demo.

## 8. Bảo mật

- **Re-entrancy:** `nonReentrant` cho `contribute`, `refund`, `executeSpending`, `claimDiamondNFT` và theo mẫu Checks-Effects-Interactions (ghi `hasRefunded` / `executed` trước khi chuyển ETH). Có test tấn công bằng `ReentrancyAttacker`.
- Không nhận ETH gửi thẳng (`receive` revert).
- **Custom error** cho mọi điều kiện, frontend dịch sang tiếng Việt. ethers chạy thử (estimateGas) trước khi mở ví nên giao dịch chắc chắn lỗi bị chặn trước khi người dùng mất phí gas.
- **Server:** chữ ký chỉ hiệu lực 5 phút, ràng buộc chainId; giới hạn loại file theo mục đích và tối đa 25 MB; rate limit upload; JWT chỉ nằm trong `.env`.

## 9. Các vấn đề phát hiện khi đối chiếu quy tắc (quy tắc 8)

| # | Vấn đề | Đã xử lý | Còn lại |
|---|---|---|---|
| 1 | Chủ dự án tự góp tiền để tự có phiếu duyệt chi cho mình | Cấm creator `contribute` và bỏ phiếu | Creator vẫn có thể dùng ví khác (Sybil) hoặc mua token sau khi thành công. On-chain không chặn được hoàn toàn; ghi nhận trong báo cáo |
| 2 | Token chuyển nhượng → bỏ phiếu hai lần | Snapshot theo yêu cầu + mỗi ví một phiếu | - |
| 3 | ERC20Votes: người có token nhưng chưa delegate thì có 0 phiếu, trong khi mẫu số là tổng cung → yêu cầu không bao giờ đạt | Tự delegate khi nhận token | Ai chủ động delegate cho `address(0)` thì phiếu của họ coi như phiếu trắng (vẫn nằm trong mẫu số, tức nghiêng về phía không duyệt - an toàn cho quỹ) |
| 4 | **Quỹ bị khóa vĩnh viễn** nếu chiến dịch thành công nhưng chủ dự án bỏ đi hoặc không bao giờ được duyệt chi | **Đã xử lý** (03/11/2026) | `proposeDissolution` → người giữ token bỏ phiếu, ủng hộ > 50% tổng quyền tại snapshot → `Dissolved`; chủ dự án mất quyền giải ngân (kể cả yêu cầu đã duyệt trước đó); mỗi người `claimDissolutionRefund` nhận phần còn lại theo tỷ lệ token, token bị burn. Test: `06.dissolution.test.js` (18 test) + kịch bản demo 4 |
| 5 | Người góp lớn vắng mặt khiến không yêu cầu nào đạt > 50% tổng | Chấp nhận, vì đúng yêu cầu "50% TỔNG quyền" | Yêu cầu hết hạn thì tạo lại; có thể giải thích trong báo cáo như một đánh đổi |
| 6 | Bytecode CrowdOps vượt 24 KB | Tách `CampaignTokenFactory` | - |
| 7 | Key server là bên tin cậy tập trung; người được cấp khóa có thể phát tán file đã giải mã | Ghi rõ giới hạn | Phương án phi tập trung: Lit Protocol (phức tạp hơn, phụ thuộc mạng bên ngoài) |
| 8 | Đã đạt mục tiêu sớm nhưng vẫn phải chờ hạn chót mới chốt | Giữ đúng quy tắc 1 | Demo dùng thời hạn 2-3 phút |
| 9 | Giải ngân ngay khi Approve > 50%, trước hạn bỏ phiếu | Cho phép, vì phiếu không đổi được nên kết quả đã chắc chắn | - |
| 10 | Phí gas trên Sepolia khác Hardhat local: tạo contract tốn ~1.600 gas/byte (local 200), deploy cần ~54 triệu gas, mỗi `createCampaign` ~15 triệu gas (deploy token riêng). RPC công khai từ chối ước tính gas > 50 triệu | Phát hiện khi deploy thật 03/11/2026 | `DEPLOY_GAS_LIMIT` cho script deploy; giá gas cố định 0,05 gwei cho script; website đề xuất phí theo base fee + tip thực tế của mạng thay vì tip mặc định 1 gwei của ethers. Chi phí thực tế: deploy ~0,0005 ETH |
| 11 | RPC công khai là cụm nhiều node: giao dịch vừa xác nhận có thể chưa thấy ở node khác, khiến giao dịch kế tiếp ước tính gas thất bại | Phát hiện khi chạy demo Sepolia | Script demo chờ 2 block xác nhận và thử gửi lại tối đa 4 lần |
