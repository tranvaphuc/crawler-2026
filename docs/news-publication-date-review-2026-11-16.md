# Rà lại giờ đăng bài ngày 16/11/2026

**Cập nhật sau triển khai:** Báo cáo này ghi lượt rà ban đầu trong workspace. Xem [kiểm tra strict trên 761 nguồn live](news-strict-publication-2026-11-16.md) để biết policy đang chạy và kết quả mới nhất; phần "chưa triển khai" bên dưới là trạng thái lịch sử.

Đã tái hiện lỗi trên bài Vinamilk `d39473` của Sức Khỏe Cộng: cấu hình `.date` lấy `15/11/2026 10:11` từ thẻ bài gợi ý. Ngày gốc nằm ở `.info-author > ul > li:first-child`: `08/04/2016 11:19`, tương ứng `2016-04-08T04:19:00.000Z`. Không phải lỗi quy đổi UTC.

Nguyên nhân chung: selector rộng cộng với index 0 chọn được một ngày hợp lệ nhưng không thuộc bài đang đọc. Kiểm tra parse thành công, định dạng ngày, timezone hay nội dung không đủ chứng minh quyền sở hữu của phần tử ngày. Bộ chặn cũ có một số tên card cố định, bỏ sót `.item-sp .info`; bộ tìm ngày cũng chưa biết `.info-author`.

Đã sửa cấu hình và profile học selector cho ba site:

| Site | Selector cũ | Selector mới |
|---|---|---|
| suckhoecong.vn | `.date` | `.info-author > ul > li:first-child` |
| thuongtruong24h.vn | `.time-public` | `.dt-news__body .tacgia-area .datetime` |
| vietq.vn | `time` | `article.detail-art > .datetimeup` |

Bộ kiểm tra dùng chung chặn ngày trong navigation/sidebar/related/recommendation, hoặc khối có tiêu đề liên kết tới bài khác. Áp dụng khi học cấu hình và khi parse cấu hình đóng băng. Giữ ngoại lệ cho tiêu đề native h2/h3/h4 không có link, tránh nhận nhầm bài audio là card khác. Không tự thay ngày thiếu bằng ngày crawl.

## Bằng chứng

`outputs/news-time-review-2026-11-16/` chứa HTML tải mới, replay và báo cáo. Kiểm tra link người dùng gửi và hai bài mới độc lập của Sức Khỏe Cộng đều trả đúng giờ hiển thị. Hai bài VietQ trả `04/11/2026 06:11`, `02/11/2026 07:34`. Hai bài Thương Trường trả `05/11/2026 17:53`, `11/07/2025 15:13`; một URL thử khác trả trang rỗng, không tính là kiểm chứng thành công.

Rà 14.382 mẫu HTTP lưu trước đây của 544 site. Lượt đầu có 154 cảnh báo theo selector/variant trên 14 site. Sau sửa hai selector và tránh nhận nhầm heading audio, còn 122 cảnh báo trên 11 site: antv.gov.vn, baocaovien.vn, baoninhbinh.org.vn, congnghiepmoitruong.vn, danhgiaxe.com, gocnhinthoidai.vn, kinhdoanhdoisong.vn, kinhteplus.com.vn, nudoanhnhan.vn, suckhoedoisong.vn, vccinews.com. Đây là cảnh báo quyền sở hữu phần tử, không phải 122 bài đã ghi sai; có trang danh mục, variant không được chọn và layout thiếu title/body. Parser mới từ chối ngày không thuộc bài thay vì xuất timestamp đó. Cần bằng chứng ngày gốc trước khi sửa riêng các layout này.

Replay Sức Khỏe Cộng: 18/24 mẫu parse được, sáu lỗi layout/title/body/date được giữ là lỗi. Thương Trường: 9/9 mẫu cũ parse được. VietQ: 9 bài thường parse được; 15 mẫu video/emagazine/archive vẫn bị từ chối. Phạm vi này không chứng nhận mọi layout của từng site và không thay thế audit ngữ nghĩa từng thời gian.

Thay đổi ở workspace, chưa triển khai VPS và chưa sửa dữ liệu đã ghi. Những bản ghi cũ cần đối chiếu lại theo URL; không cập nhật hàng loạt ngày bằng phép cộng/trừ timezone. Không gọi AI trả phí, không thay đổi cấu hình ngân sách hoặc ledger `ai_usage`.
