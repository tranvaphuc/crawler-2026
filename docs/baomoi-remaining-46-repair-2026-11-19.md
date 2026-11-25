> Cập nhật 23:51: URL metro cuối cùng đã được xác minh nguồn gốc trả 404 và chuyển sang `skipped / source_unavailable`, giữ URL và bằng chứng; không tính là phục hồi ES. Xem [kết quả xử lý URL metro](baomoi-metro-unavailable-2026-11-19.md). Phần dưới là snapshot trước cập nhật trạng thái này.

# Xử lý tiếp 46 URL Báo Mới — 19/11/2026

Đã phục hồi và đối chiếu **45/45 tài liệu trong ES** lúc 23:32:22 UTC+7. Còn 1 URL giữ lỗi `baomoi_original_not_found`: Báo Mới chuyển URL bài về trang chủ, đường `-r56554323.epi` vẫn khai báo bài gốc nhưng yêu cầu HTTP tới bài gốc trên VPS trả 404. Không dùng nội dung trang chủ hoặc thumbnail để thay bài/video.

URL còn giữ: `https://baomoi.com/cong-khai-28-vi-tri-nha-ga-uu-tien-tren-5-tuyen-metro-c56554323.epi`. Liên kết gốc được chính trang chuyển Báo Mới khai báo: [Hà Nội Online](https://hanoionline.vn/cong-khai-28-vi-tri-nha-ga-uu-tien-tren-5-tuyen-metro-246261119154753198.htm). Kết quả tìm kiếm còn nhận diện bài này; điều đó không xác minh được URL video gốc hiện tại và không được tính là lấy bài thành công.

## Dữ liệu và thay đổi đã triển khai

- 16 bài có `description: ""`, `descriptionStatus: "not_published_by_source"` và mảng `nativeMediaUrls`, theo lựa chọn rõ ràng của người dùng trong lượt này. Ưu tiên `originUrl` công khai do payload bài khai báo; không dùng địa chỉ IP nội bộ, credential URL hoặc nguồn bị cấm. Nếu không có origin công khai hợp lệ, giữ URL media thực của CDN Báo Mới.
- Những bài có phần mô tả ở báo gốc được khôi phục từ đúng URL mà Báo Mới khai báo, sau khi đối chiếu tiêu đề, URL/canonical và publisher được cho phép. Ngày đăng, danh tính bài và URL tài liệu Báo Mới vẫn theo bằng chứng native của Báo Mới; không thay bằng giờ sửa bài.
- Trang `contentdetailredirect` được đọc như chuyển bài bằng JavaScript, thay vì mặc định kết luận HTML rỗng. Nội dung chữ hoặc player lấy từ vùng bài gốc phù hợp; có lưu nguồn bằng chứng.
- Khôi phục bảng giá từ nội dung bảng thật trong payload, không lấy riêng tên tác giả. Player Thanh Hóa được xác minh qua endpoint media công khai, đối chiếu ID dữ liệu nhúng; không thực thi JavaScript tải từ website.
- Gỡ 44 dấu `empty_page` cũ của đúng các URL bài/redirect đã có tài liệu ES được kiểm chứng. Thêm kiểm thử và logic để một bài lấy thành công không tiếp tục mang dấu lỗi shell cũ. Lỗi thật của bài khác và URL 404 còn lại được giữ.

Release đang chạy: `/opt/news-flow/releases/20261119-baomoi-remaining-08b`. Cả ba dịch vụ seed, parse và import hoạt động sau triển khai. Writer tiếp tục dùng chế độ create; không ghi đè tài liệu ES lịch sử.

Mapping bổ sung `nativeMediaUrls` kiểu `keyword` (nhận mảng URL) và template cho chỉ mục mới. Mapping đã được sao lưu, xác minh trên 1.774 chỉ mục phù hợp; số tài liệu lịch sử bị thay đổi bởi thao tác mapping là 0. Policy mô tả trống chỉ áp dụng cho Báo Mới có bằng chứng media, xác nhận người dùng và proof khớp URL, tiêu đề, ngày đăng, danh sách URL media; không nới cho nguồn khác.

## Kiểm chứng

Đã rà HTTP 46 URL gốc, đường c-ID, liên kết báo gốc, trường hợp redirect và player đặc thù. Một timeout được kiểm tra lại riêng rồi thành công. Gate thực tế xác nhận 45 bài đủ điều kiện trước khi đưa lại vào xử lý; sau đó 45/45 có biên nhận và tài liệu ES khớp publisher, URL, tiêu đề, ngày, nội dung, mô tả và mảng URL media gốc.

107 kiểm thử trên VPS đạt (46 parser/policy và 61 completion/runtime). Local có 53 kiểm thử parser/policy đạt; nhóm completion/runtime cuối cùng có 62 đạt, 1 bỏ qua. Một kiểm thử dependency cũ được chạy thăm dò riêng còn lỗi mock thiếu `state` trong `NewsProcessor.context`; phương thức đó không được sửa trong lượt này và không thuộc các nhóm kiểm thử đạt nêu trên.

Không khởi tạo AI API trả phí trong các script kiểm tra/sửa. Ledger `ai_usage` giữ nguyên tích lũy; ngân sách vẫn 2 USD/ngày, giới hạn 200 lượt/ngày. Không thay đổi hay tuyên bố có giới hạn phí ứng dụng Codex/ChatGPT.

Bằng chứng VPS: `/var/lib/news-flow/baomoi-remaining-20261119/`. Bản sao trong workspace: `outputs/baomoi-remaining-20261119/proof/`, gồm `candidate-verification.json`, `recovery.json`, `es-verification.json`, `es5-mapping.json`, `resolved-shell-failures.json`, hai file TAP kiểm thử và `budget-final.json`.
