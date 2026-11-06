# Kế hoạch 14 ngày cho 4 người

Vai trò gợi ý (đổi tên theo nhóm):
- **A - Smart contract:** contract, test, deploy Sepolia, script demo
- **B - Frontend Web3:** website, ví, xử lý lỗi giao dịch
- **C - IPFS và server:** Pinata, key server, tài liệu mẫu (PDF, ảnh, hóa đơn)
- **D - Báo cáo, slide, QA:** báo cáo, slide, kịch bản demo, kiểm thử thủ công, video

Bộ khung mã nguồn đã có sẵn và đã chạy test. Vì vậy ngày 1-5 là **đọc hiểu, chỉnh sửa và tự kiểm chứng**, không phải viết lại từ đầu. Mỗi người phải giải thích được phần của mình trước hội đồng.

| Ngày | A | B | C | D |
|---|---|---|---|---|
| 1 | Cài môi trường, chạy `npx hardhat test` (78 pass), đọc `CrowdOps.sol` | Cài môi trường, chạy local theo README, đi hết 3 kịch bản bằng MetaMask | Tạo tài khoản Pinata, lấy JWT, chạy `npm test` của server (17 pass) | Đọc `docs/01`, dựng khung báo cáo Word (≥ 14 pt) và slide (≥ 18 pt) |
| 2 | Giải thích từng hàm/ràng buộc (viết vào mục báo cáo) | Đọc `WalletContext`, `useTransaction`, `errors.js` | Upload thật PDF/ảnh/hóa đơn qua server và lưu CID | Vẽ sơ đồ kiến trúc, máy trạng thái, sequence góp tiền/bỏ phiếu |
| 3 | Họp nhóm chốt vấn đề #4 trong docs/01 (quỹ bị khóa) | Chỉnh giao diện theo ý nhóm | Thử luồng tài liệu riêng với Pinata thật | Bảng chữ viết tắt, tài liệu tham khảo |
| 4 | Nếu chọn làm #4: thêm hàm và test | Kiểm tra trên điện thoại và màn hình nhỏ | Viết mục IPFS: nơi lưu, pin, luồng upload/retrieve | Viết mục bài toán và kiến trúc |
| 5 | Xin Sepolia ETH (faucet) cho 4-5 ví thử nghiệm | Kiểm tra mọi trạng thái lỗi: chưa kết nối, sai mạng, từ chối ký | Chuẩn bị bộ tài liệu demo đẹp (proposal, ảnh bìa, hóa đơn hợp lệ, hóa đơn đáng ngờ) | Viết mục smart contract (dựa trên ghi chú của A) |
| 6 | **Deploy Sepolia**, verify trên Etherscan, lưu địa chỉ + tx | Build frontend với `VITE_CHAIN_ID=11155111` | Chạy server với `CHAIN_ID=11155111` | Chụp ảnh triển khai |
| 7 | Chạy `demo-scenarios.js --network sepolia` với CID thật, lưu log tx | Thử toàn bộ UI trên Sepolia | Kiểm tra gateway dự phòng | **Mốc giữa kỳ: demo nội bộ, ghi lỗi** |
| 8 | Sửa lỗi từ buổi demo nội bộ | Sửa lỗi UI | Sửa lỗi server | Viết mục token/NFT, bảo mật |
| 9 | Báo cáo coverage, gas report (`REPORT_GAS=true`) | Hoàn thiện chữ và trạng thái loading | Triển khai server/website (Render, Vercel) nếu muốn demo online | Viết mục kiểm thử (dán kết quả test) |
| 10 | Tạo dữ liệu demo sạch trên Sepolia (chiến dịch thời hạn ngắn) | Kiểm tra độ tương phản, cỡ chữ | Kiểm tra các file IPFS đều mở được | Viết mục kết quả testnet (địa chỉ, tx hash, ảnh) |
| 11 | Diễn tập demo 1 | Diễn tập demo 1 | Diễn tập demo 1 | Quay video demo, **thêm caption** |
| 12 | Đối chiếu lại `docs/03-doi-chieu-rubric.md` | Sửa lỗi nhỏ | Sửa lỗi nhỏ | Hoàn thiện slide, kiểm tra chính tả |
| 13 | Diễn tập demo 2 (bấm giờ) | Diễn tập demo 2 | Diễn tập demo 2 | Chốt báo cáo, caption hình/bảng |
| 14 | Dự phòng, nộp bài | Dự phòng | Dự phòng | Nộp báo cáo, slide, video |

**Nguyên tắc demo ổn định:**
- Tạo trước chiến dịch có thời hạn 2-3 phút ngay trước giờ demo.
- Mỗi vai trò dùng một ví riêng, đã có đủ Sepolia ETH.
- Chuẩn bị sẵn video dự phòng.
- Mở sẵn tab Etherscan.
