# Đối chiếu 39 website khách yêu cầu — 17/11/2026

> Cập nhật mới nhất ngày 17/11/2026: 15/16 nguồn từng gặp vấn đề đã có bằng chứng lấy bài (gồm chuyển miền, bài lưu trữ và SGGP thay thế); còn Hanoitimes bị chặn HTTP Basic. Hai lượt đã đối chiếu 45 bài trong ES5. Bảng bên dưới giữ nguyên kết quả kiểm tra ban đầu. Xem [báo cáo xử lý mới nhất](customer-11-deep-repair-2026-11-17.md) và [tin nhắn từng domain để trả lời ClickUp](customer-domain-clickup-update-2026-11-17.md).

Đã ghi nhận đủ 39 domain đúng thứ tự khách gửi và đăng ký đủ trên VPS. Có 27 nguồn đã tồn tại và 12 nguồn mới được bổ sung ở trạng thái chờ xác minh. 23 nguồn qua kiểm tra bài mẫu HTTP; kết quả này không khẳng định mọi bài hoặc mọi chuyên mục đều hoạt động.

12 nguồn mới đều có `originalPublicationBlockedReason` để chặn ghi bài chưa xác minh. Việc bổ sung danh mục không đồng nghĩa 39 nguồn đều đang thu thập thành công. Không đổi cấu hình nguồn cũ hoặc nới quy tắc ngày đăng.

| STT | Domain khách yêu cầu | Tình trạng | Kết quả kiểm tra |
|---:|---|---|---|
| 1 | bbw.vn | Đã có | Các URL bài thử chưa qua kiểm tra JSON-LD gắn đúng URL/nội dung. Đã có dữ liệu cũ trong hệ thống. |
| 2 | e.vnexpress.net | Đã có | Qua kiểm tra bài mẫu HTTP |
| 3 | businesstimes.com.sg | Đã có | Qua kiểm tra bài mẫu HTTP |
| 4 | theinvestor.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 5 | pvn.vn | Mới thêm — chờ xác minh | 301 sang petrovietnam.vn; miền đích có trang chủ và link bài nhưng chưa xác minh được parser. |
| 6 | nangluongvietnam.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 7 | moit.gov.vn | Mới thêm — chờ xác minh | Đọc được trang/bài; giờ hiển thị và metadata mâu thuẫn, chưa qua kiểm tra ngày gốc. |
| 8 | sbv.gov.vn | Mới thêm — chờ xác minh | Trang chủ đọc được; các URL bài mẫu trả lỗi access_blocked. |
| 9 | tapchinganhang.gov.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 10 | kinhtedothi.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 11 | luatvietnam.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 12 | tuyengiao.vn | Mới thêm — chờ xác minh | Trang trả giao diện Next.js chưa có nội dung bài; www có chứng chỉ hết hạn. |
| 13 | tietkiemnangluong.com.vn | Mới thêm — chờ xác minh | Đọc được bài nhưng mẫu chỉ có ngày, thiếu giờ đăng đủ để qua chính sách hiện tại. |
| 14 | baotainguyenmoitruong.vn | Mới thêm — chờ xác minh | Chuyển sang nongnghiepmoitruong.vn; giữ nguyên domain khách yêu cầu, chưa gán bài của miền đích sang miền cũ. |
| 15 | hanoitimes.vn | Mới thêm — chờ xác minh | Mẫu truy cập bị chặn/reset kết nối. |
| 16 | dealstreetasia.com | Đã có | Qua kiểm tra bài mẫu HTTP |
| 17 | haiquanonline.com.vn | Mới thêm — chờ xác minh | Mẫu trả 503/reset kết nối. |
| 18 | baodansinh.vn | Mới thêm — chờ xác minh | Mẫu trả 503/reset kết nối. |
| 19 | kinhtetrunguong.vn | Mới thêm — chờ xác minh | HTTP trả trang VNNIC báo hết hạn domain; HTTPS có lỗi chuỗi chứng chỉ. |
| 20 | baobariavungtau.com.vn | Đã có | HTTP trả nội dung mang tên báo Lai Châu; mẫu bị chặn bởi kiểm tra danh tính trang. |
| 21 | laodong.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 22 | tienphong.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 23 | daidoanket.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 24 | plo.vn | Mới thêm — chờ xác minh | Chuyển sang tuoitre.vn/tto-plo.htm; chưa xác nhận đây là nguồn PLO độc lập. |
| 25 | daibieunhandan.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 26 | thoibaonganhang.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 27 | thoibaotaichinhvietnam.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 28 | bnews.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 29 | baotintuc.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 30 | kinhtechungkhoan.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 31 | baoxaydung.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 32 | 1thegioi.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 33 | thitruongtaichinhtiente.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 34 | nguoidothi.net.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 35 | baodaklak.vn | Đã có | Bộ chọn ngày bắt cả giờ của bài liên quan; bản sửa thử chưa qua kiểm tra sở hữu đồng hồ bài. |
| 36 | vneconomy.vn | Đã có | Cấu hình đang dùng ngày từ RSS công khai; lượt thử HTML độc lập thiếu ngữ cảnh feed, chưa đủ để xác nhận lại. |
| 37 | nld.com.vn | Mới thêm — chờ xác minh | Trang chủ chuyển sang tuoitre.vn trong lượt kiểm tra; chưa xác nhận nguồn NLD độc lập. |
| 38 | vov.vn | Đã có | Qua kiểm tra bài mẫu HTTP |
| 39 | en.vietnamplus.vn | Đã có | Qua kiểm tra bài mẫu HTTP |

Bằng chứng: `outputs/customer-sites-20261117/coverage.json`, `activation.json`; trên VPS, HTML và từng request nằm trong `/opt/news-flow/current/outputs/customer-sites-20261117/audit/<domain>/`. Hai nguồn e.vnexpress.net và en.vietnamplus.vn đã được đối chiếu lại với registrableDomain đúng; lần thử ban đầu dùng domain con làm registrableDomain nên báo xung đột canonical sai.

Triển khai: registry VPS tăng từ 787 lên 799 nguồn; dịch vụ seed/parse/import đều active sau cập nhật. Không reset queue, không ghi trực tiếp ES, không gọi AI trả phí trong lượt kiểm tra. Ledger ai_usage được kiểm tra giữ nguyên tích lũy.
