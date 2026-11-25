# Xử lý URL metro cuối cùng — 19/11/2026

Lúc 23:51 UTC+7, đã chuyển đúng URL Báo Mới `cong-khai-28-vi-tri-nha-ga-uu-tien-tren-5-tuyen-metro-c56554323.epi` từ `fail / baomoi_original_not_found` sang **`skipped / source_unavailable:publisher_removed_or_missing`**. Giữ nguyên URL, thông tin phát hiện và snapshot trước thay đổi. Không đánh dấu `done`, không tính đây là bài phục hồi và không ghi mới/ghi đè ES.

Kết quả của nhóm 46 URL: **45 bài đã phục hồi và đối chiếu ES; 1 URL được xác minh nguồn không còn cung cấp nội dung và bỏ qua có bằng chứng**. Không còn task pending/running cho URL metro này. Ba dịch vụ seed, parse và import vẫn active.

## Kiểm chứng nguồn

- URL `-c56554323.epi` trả về trang chủ Báo Mới. Đường `-r56554323.epi` vẫn có dữ liệu native khớp ID, tiêu đề, ngày đăng và URL báo gốc.
- [Bài gốc Hà Nội Online](https://hanoionline.vn/cong-khai-28-vi-tri-nha-ga-uu-tien-tren-5-tuyen-metro-246261119154753198.htm) trả HTTP 404 với thông báo “Nội dung này đã bị gỡ hoặc không tồn tại”. Đã kiểm tra lại ngay trước khi áp dụng cập nhật; lưu HTML và SHA-256 của phản hồi.
- Đã kiểm tra HTTP/HTTPS, www, URL rút gọn theo ID, tham số AMP và các đường dữ liệu/mobile tương ứng của Báo Mới. Không lấy được thân bài hoặc URL video thật của đúng bài.
- Đã tìm theo URL trong 31 cơ sở dữ liệu lưu mẫu của dự án; không còn bản HTML đúng bài có thể dùng để phục hồi media. Log HTTP cũ có lần thành công nhưng phần response HTML đã không còn lưu.
- ES đã có bản ghi publisher Hà Nội Online từ 17:52. Bản ghi này không chứa URL video; trường content còn lẫn các mục liên quan. Không dùng nó để tạo tài liệu Báo Mới hay tuyên bố đã phục hồi đầy đủ video. Bản ghi publisher lịch sử không bị thay đổi trong lượt xử lý này.

Kết quả tìm kiếm vẫn nhận diện bài đã xuất bản, nhưng không chứng minh nội dung hoặc media đang còn truy cập được. Không suy đoán URL video từ thumbnail, không thay bằng bài metro khác hoặc nội dung trang chủ.

## Cập nhật trạng thái và bằng chứng

Chỉ cập nhật trạng thái của URL đang xét và trạng thái review của các dấu lỗi gắn với URL đó. Thêm sự kiện `manual_source_unavailable` và marker trong `flow_meta`; snapshot trước thay đổi cho phép hoàn tác. Không xóa bài, không thay cấu hình nguồn hay triển khai/restart dịch vụ. URL có thể được mở lại để kiểm tra nếu báo gốc khôi phục nội dung.

Bằng chứng VPS: `/var/lib/news-flow/baomoi-metro-20261119/`. Bản sao workspace: `outputs/baomoi-metro-20261119/proof/`, gồm `http.json`, `data-probe.json`, `saved-html-index.json`, `resolution.json`, `before-resolution.json`, `confirmed-original-404.html` và `confirmed-redirect.html`.

Không gọi AI API trả phí. Ledger `ai_usage` giữ nguyên tích lũy; ngân sách vẫn 2 USD/ngày và giới hạn 200 lượt/ngày. Không thay đổi hay tuyên bố giới hạn phí ứng dụng Codex/ChatGPT.
