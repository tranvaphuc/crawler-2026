# Kiểm tra giờ đăng của các nguồn đang chạy

Policy `strict_native_publication_v1` đã triển khai VPS lúc **09:47:33 ngày 16/11/2026 (UTC+7)** cho toàn bộ **761 nguồn trong registry đang dùng**, bao gồm cấu hình parser overlay. Đây là kiểm tra bắt buộc trên từng bài, không phải whitelist theo site hoặc chỉ kiểm tra khi học selector.

## Điều kiện ghi

- Ngày gốc phải thuộc đúng URL/bài: JSON-LD có URL và headline khớp; metadata ngày xuất bản cần bằng chứng đối chiếu; giờ DOM phải nằm trong scope bài có headline tương ứng; feed phải gắn đúng URL và trường publication.
- Phải có giờ/phút cùng bằng chứng timezone: offset/epoch/RFC, hoặc đối chiếu clock của bài với metadata ngày xuất bản có timezone rõ ràng. Chỉ cấu hình `Asia/Ho_Chi_Minh` không đủ.
- Mâu thuẫn ngày/giờ giữa các bằng chứng gốc, selector trỏ nhiều ngày khác nhau, sidebar/bài gợi ý, trường modified/updated/upload dùng thay publication, hoặc không xác nhận được ownership đều bị từ chối.
- Ngày không có giờ không còn được tự gán `00:00` trên luồng chạy thật. Không dùng giờ crawl để lấp dữ liệu thiếu.
- Proof gắn URL, timestamp, precision và version được kiểm tra trước chuyển sang ES, lưu trong outbox và kiểm tra lần nữa ngay trước import. Outbox không có proof phải held. Overlay/variant không được tắt policy.

## Phạm vi kiểm tra và kết quả

Snapshot read-only của VPS gồm 761 cấu hình và 3.220 mẫu HTML trong `review_samples`. Replay cuối: **1.124 mẫu đạt kiểm tra, 2.096 mẫu bị từ chối**, 330 site có ít nhất một mẫu đạt. 98 site chưa có HTML mẫu trong snapshot. Những số này không đồng nghĩa toàn bộ layout của site đã đạt.

Audit HTTP mới qua proxy production đã kiểm tra đủ **761 site, 1.515 lượt bài**, tối đa hai URL mỗi site; không ghi ES, không gọi AI. **370 site có ít nhất một mẫu đạt**, **391 site chưa có mẫu đủ điều kiện**. Nhóm chưa đạt gồm thiếu bằng chứng timezone/ownership, metadata chưa đối chiếu được, xung đột, trang thiếu dữ liệu và lỗi HTTP. Vẫn giữ chặn trên từng bài của cả 761 nguồn; không tự nới điều kiện theo số lượng bài parse được.

Ví dụ thời gian bị từ chối trong lượt mới: 83 lượt có bằng chứng publication mâu thuẫn, 25 lượt selector có nhiều thời gian khác nhau, 49 lượt thiếu clock, 74 lượt chưa xác nhận timezone và 179 lượt JSON-LD chưa gắn đúng URL/headline. Đây là các lý do từ chối mẫu, không phải số bài đã ghi sai trước đó.

Bộ test news của candidate Linux: **357/357 qua**. Test bảo vệ policy/ghi/import sau cài đặt: **8/8 qua**. Bộ Windows cũng kiểm tra được nhánh strict; một test ngoài nhánh strict bị giới hạn quyền symlink Windows, Linux chạy qua.

Sau triển khai: đối chiếu read-only **50 bài vừa tạo trên ES** với HTML gốc và cấu hình strict: **50 khớp, 0 lệch, 0 chưa xác nhận**. Tại lần kiểm tra hàng đợi, **0 pending/sending thiếu proof**. Parse và import đều active, không restart lỗi. Ledger `ai_usage` giữ nguyên: 119 calls, USD 1.95291025 ngày UTC 16/11; công việc này không khởi tạo AI call trả phí. Không reset queue/database.

## Dữ liệu cũ

Không coi các bản ghi trước triển khai là đã sạch. Tìm đúng ba URL regression trên ES: URL Sức Khỏe Cộng người dùng gửi không có kết quả trong truy vấn URL chính xác/http alias; VietQ có bản ghi đúng giờ hiển thị; Thương Trường có hai ID cùng URL, trong đó ID `9f30a2d3bc857d2df87602148b48a49f` tại `master202645` còn lưu `2026-11-04T01:28:00.000Z`, khác clock gốc hiển thị `05/11/2026 17:53`. Bản cùng URL có title SEO lưu `2026-11-05T10:53:00.000Z`.

Chưa sửa hoặc xóa bản ghi cũ đó: lượt strict mới từ chối Thương Trường do chưa có bằng chứng timezone độc lập. Không thay ngày trong dữ liệu bằng một giả định timezone hoặc lấy bản ghi ES khác làm nguồn gốc. Cần xử lý dữ liệu lịch sử riêng với bằng chứng nguồn đủ chuẩn; không tuyên bố toàn bộ dữ liệu cũ đúng.

## Bằng chứng và phục hồi

Trong workspace: `outputs/news-time-review-2026-11-16/strict-final-saved-audit/`, `strict-fresh-audit/`, `es-verification.json`, `deployment.json`, `linux-tests.tap`.

VPS: `/var/lib/news-flow/news-time-strict-live-20261116/` chứa HTML mới và kết quả từng site. Mã cũ được backup tại `/var/lib/news-flow/backups/time-strict-20261116-1794797253513`; ledger và dữ liệu không bị thay thế. Báo cáo triển khai: `/var/lib/news-flow/news-time-strict-deployment.json`.
