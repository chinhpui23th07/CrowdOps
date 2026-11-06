# Tài liệu demo trên IPFS (Pinata)

Upload ngày 03/11/2026 qua server Crowd Ops (`POST /api/ipfs/file`, `POST /api/ipfs/json`), đã ghim (pin) trên Pinata.
Tất cả là **tài liệu công khai**: ai có CID đều xem được qua gateway.
Kiểm chứng: tải lại qua `https://gateway.pinata.cloud/ipfs/<CID>` và so SHA-256 với file gốc trong thư mục này.

| Loại dữ liệu | File | CID | Dùng ở đâu |
|---|---|---|---|
| PDF proposal | `proposal.pdf` | `bafkreihg57qnseklmksfe3gpsvqo7fbezubqbgjr2sbhxtnmaxtppbaynm` | `proposalCID` của chiến dịch |
| Ảnh dự án | `cover.png` | `bafkreigctbxukr6s5nolcyleteewgzlbtcauxergy4dmmpvajaqlsg7a4m` | `mediaCID`, ảnh của NFT |
| Hóa đơn hợp lệ | `invoice.pdf` | `bafkreidyz6x2n6wlaog77ljphnrnknrin6qhfonq5fzotkanuv47j2khjq` | `evidenceCID` của yêu cầu chi được duyệt |
| Hóa đơn đáng ngờ | `suspicious-invoice.pdf` | `bafkreidkekv6qtteiqysrohtre3ngob746tr5dr64ukirhrfxgcb7jk6ly` | `evidenceCID` của yêu cầu chi bị bác |
| Metadata JSON của NFT | (tạo từ API) | `bafkreidz7s3sdvayeoj7ewrmqy2fupexj5y52jtw64nvy3nrfy5oxvv5ea` | `nftMetadataCID`, `tokenURI` của NFT Kim cương |

Ghi chú: metadata JSON được server upload như một file UTF-8 qua `pinFileToIPFS`. Bản thử đầu tiên dùng
`pinJSONToIPFS` ghim thành công nhưng gateway không trả về được nội dung, nên đã đổi cách upload.
CID của JSON là SHA-256 của đúng chuỗi `JSON.stringify(content)` nên có thể tự tính lại để đối chiếu.

Tạo lại file: `python docs/demo-assets/make_assets.py` (file PDF mới sẽ có CID khác vì chứa thời điểm tạo).
