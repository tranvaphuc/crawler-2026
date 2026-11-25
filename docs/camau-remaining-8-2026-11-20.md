# 8 URL gốc Báo Cà Mau: kiểm tra và bản sửa ứng viên

Ngày 20/11/2026 giờ Việt Nam, cả 8 URL HTTP 200: 6 bài chỉ có ảnh thông báo (11 ảnh gốc) và 2 bài chỉ có iframe YouTube (2 video). Nguồn không có mô tả cho các bài này. Giữ mô tả trống và URL media theo lựa chọn trước của người dùng; không OCR hoặc lấy tiêu đề thay mô tả. Loại logo site và các link bài liên quan khỏi body.

Đã triển khai **bản ứng viên, chưa chuyển current** tại `/opt/news-flow/releases/20261120-camau-original-01`. Release đang chạy vẫn `/opt/news-flow/releases/20261120-baomoi-original-03`.

47 test đạt trên VPS. Bản ứng viên lấy được đúng media cho 8/8 URL và giữ raw clock gốc (6 bài ảnh đối chiếu `datePublished` với đồng hồ hiển thị của cùng bài; 2 video lấy đồng hồ trong `.video-information`). `candidate-verification.json` ghi `contentOnly:true`, **không phải bằng chứng cho phép import** khi thiếu xác nhận múi giờ.

## Thông tin còn thiếu — đã hỏi người dùng, chưa có trả lời

Đã gửi câu hỏi async: “8 bài Báo Cà Mau chỉ ghi giờ địa phương, không ghi múi giờ; RSS lỗi và sitemap chỉ có lastmod nên không dùng để xác định giờ đăng. Bạn xác nhận giờ hiển thị trên baocamau.vn là giờ Việt Nam (UTC+7) để mình lưu đúng thời điểm đăng nhé?”

**Chưa có xác nhận UTC+7. Không ghi giả authority `explicit_user_confirmation`, không thêm `baocamau.vn` vào danh sách đồng hồ được xác nhận và chưa import 8 bài.**

RSS `/rss`, `/rss.html`, `/rss.xml`, `/feed` đều lỗi HTTP 500. Các sitemap được robots khai báo chỉ có `lastmod`, không phải ngày đăng gốc. Không dùng lastmod hoặc đồng hồ hiện tại của site làm thời điểm đăng bài.

## Khi có câu trả lời

Nếu người dùng xác nhận UTC+7, thêm exact host `baocamau.vn` với ngày xác nhận `2026-11-20` vào `newsUserConfirmedTimezone.mjs`, tạo `timezone-confirmation.json` trong thư mục bằng chứng (authority/scope/confirmation theo cấu trúc hiện có), rồi chạy lại full candidate verification với cổng xuất bản nghiêm ngặt. Cấu hình động đã sửa để giữ chính sách giờ địa phương chỉ khi hàm `userConfirmedPublicationTimezone` xác minh được; cấu hình giả vẫn bị đổi về `original_clock_required`.

Cần kiểm chứng 8 media + ít nhất 3 bài văn bản độc lập và homepage trước khi bật nguồn. Bài văn bản đã tải đầy đủ vào `holdouts/`; cấu hình CSS được xác định trước khi tải các holdout. Nếu mọi cổng qua, cập nhật riêng candidate source `baomoi_original_sources` và đưa 8 URL từ awaiting_source vào luồng kiểm tra trùng/parse/import hiện có. Giữ mọi trạng thái done/fail khác, lưu backup trước thay đổi. Chưa có script activation/recovery dữ liệu ở giai đoạn này.

Khi chuyển release phải restart cả seed, parse, **import** và baomoi-original: writer cần module mới để xác minh omission proof Cà Mau qua envelope compact thực tế. Kiểm chứng create-only ES, mô tả trống, đủ 13 media, đúng publisher/giờ đăng và không có bản trùng. Có thể cần kiểm tra source holdout vì đây là bước chưa chạy full proof trước khi có múi giờ.

## File và bằng chứng

- Mã mới: `src/web/camauOriginalNews.mjs`; tích hợp `newsNativeVideoDescription.mjs`, `newsResearchTransport.mjs`, `src/newsFlow/registry.mjs`.
- Test: `test/news-camau-original.test.mjs`.
- Đóng gói: `scripts/build_camau_patch_20261120.py`; `deploy/prepare-camau-remaining.sh`.
- Kiểm chứng ứng viên: `scripts/verify_camau_candidate_20261120.mjs`.
- VPS: `/var/lib/news-flow/baocamau-remaining-20261120` gồm `audit.json`, `0.html.gz`…`15.html.gz`, `clocks/`, `holdouts/`, `candidate-verification.json`, `server-tests.tap`.
- Workspace: `outputs/camau-remaining-evidence`, `outputs/camau-code-baseline`, `outputs/camau-holdouts`.

Không gọi AI trả phí. Không sửa `ai.env`, `ai_usage` hoặc thêm FireAnt. Khoản 10 USD riêng đợt triển khai trước đã đóng; cấu hình thường lệ vẫn 2 USD/ngày, 200 calls/ngày.
