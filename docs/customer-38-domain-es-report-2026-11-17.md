Báo cáo đối chiếu 38 nguồn tin và dữ liệu Elasticsearch

Thời điểm kiểm tra: 17:25 ngày 17/11/2026 (UTC+7).

Đã kiểm tra trực tiếp Elasticsearch và xác nhận cả 38 nguồn yêu cầu đều có dữ liệu, tính theo domain gốc hoặc nguồn kế thừa đã thống nhất. Đã đối chiếu 3 bản ghi mẫu cho mỗi nguồn, tổng cộng 114 mẫu có URL, tiêu đề, ngày đăng và nội dung từ 100 ký tự trở lên.

“Có dữ liệu trên ES” bao gồm dữ liệu đã lưu từ trước, không đồng nghĩa nguồn đang cập nhật bài mới ổn định. Riêng Hanoitimes có dữ liệu cũ nhưng hiện chưa lấy được bài mới do yêu cầu xác thực HTTP 401. Báo Bà Rịa - Vũng Tàu được thay bằng SGGP theo phương án đã xác nhận.

Số dưới đây là số bản ghi ES theo đúng nhãn nguồn và phạm vi URL, gồm dữ liệu lịch sử, chưa khử trùng URL; không phải số bài mới crawl trong lần kiểm tra này. Đã loại riêng các bản ghi có ngày đăng vượt thời điểm kiểm tra. Ngày gần nhất là ngày đăng đang lưu trên ES, quy đổi UTC+7, không phải thời điểm crawl.

| STT | Domain yêu cầu | Bản ghi ES* | Ngày bài gần nhất | Ghi chú |
|---:|---|---:|---|---|
| 1 | e.vnexpress.net | 10.377 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 2 | businesstimes.com.sg | 1.627 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 3 | theinvestor.vn | 1.736 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 4 | pvn.vn | 23 | 17/11/2026 | Lấy qua petrovietnam.vn; bài chỉ có ngày được lưu giờ 00:00. |
| 5 | nangluongvietnam.vn | 296 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 6 | moit.gov.vn | 589 | 17/11/2026 | Ưu tiên ngày/giờ hiển thị trên bài, UTC+7. |
| 7 | sbv.gov.vn | 24 | 16/11/2026 | Đã có bài; dùng thêm seed dự phòng vì trang chủ đôi lúc timeout/trả HTML rỗng. |
| 8 | tapchinganhang.gov.vn | 230 | 14/09/2026 | Dữ liệu gần nhất hiện ghi ngày 14/09/2026; chưa xác nhận cập nhật mới hơn. |
| 9 | kinhtedothi.vn | 47.506 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 10 | luatvietnam.vn | 476 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 11 | tuyengiao.vn | 182 | 07/11/2026 | Lấy qua API công khai; ES gần nhất hiện ghi ngày 07/11/2026. |
| 12 | tietkiemnangluong.com.vn | 91 | 12/11/2026 | Bài chỉ có ngày được lưu giờ 00:00; ES gần nhất hiện ghi ngày 12/11/2026. |
| 13 | baotainguyenmoitruong.vn | 3.135 | 17/11/2026 | Nguồn kế thừa nongnghiepmoitruong.vn; ghi đúng publisher mới. |
| 14 | hanoitimes.vn | 46 | 22/02/2026 | 46 bản ghi cũ; hiện HTTP 401 yêu cầu xác thực, chưa lấy được bài mới. |
| 15 | dealstreetasia.com | 59 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 16 | haiquanonline.com.vn | 4.781 | 17/11/2026 | Lấy qua thuehaiquan.tapchikinhtetaichinh.vn. |
| 17 | baodansinh.vn | 53 | 28/02/2025 | Kho bài tại dansinh.dantri.com.vn; dữ liệu gần nhất thuộc tháng 02/2025. |
| 18 | kinhtetrunguong.vn | 89 | 17/11/2026 | Lấy qua cscltw.dcs.vn; ưu tiên giờ hiển thị UTC+7. |
| 19 | baobariavungtau.com.vn | 116.390 | 17/11/2026 | Dùng SGGP thay thế theo xác nhận. Số này thuộc toàn nguồn SGGP, không phải số bài của báo Bà Rịa - Vũng Tàu cũ. |
| 20 | laodong.vn | 93.406 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 21 | tienphong.vn | 240.142 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 22 | daidoanket.vn | 2.753 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 23 | plo.vn | 154.888 | 06/11/2026 | Có dữ liệu lịch sử; luồng đã xác minh thêm chuyên trang /plo/ trên Tuổi Trẻ. Đã tách 10 bản ghi ngày tương lai. |
| 24 | daibieunhandan.vn | 28.615 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 25 | thoibaonganhang.vn | 16.466 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 26 | thoibaotaichinhvietnam.vn | 40.175 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 27 | bnews.vn | 100.550 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 28 | baotintuc.vn | 309.176 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 29 | kinhtechungkhoan.vn | 25.544 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 30 | baoxaydung.vn | 2.875 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 31 | 1thegioi.vn | 2.299 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 32 | thitruongtaichinhtiente.vn | 14.319 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 33 | nguoidothi.net.vn | 19.883 | 17/11/2026 | Đã tách 110 bản ghi ngày tương lai khỏi số trong bảng. |
| 34 | baodaklak.vn | 17.346 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 35 | vneconomy.vn | 38.360 | 17/11/2026 | Đã có dữ liệu trên ES. |
| 36 | nld.com.vn | 118.336 | 17/11/2026 | Có dữ liệu lịch sử; luồng đã xác minh thêm chuyên trang /nld/ trên Tuổi Trẻ. |
| 37 | vov.vn | 189.900 | 17/11/2026 | Đã tách 520 bản ghi ngày tương lai khỏi số trong bảng. |
| 38 | en.vietnamplus.vn | 14.366 | 17/11/2026 | Đã có dữ liệu trên ES. |

*Lưu ý về phạm vi: số của baobariavungtau.com.vn là số bản ghi thuộc nguồn SGGP thay thế. Các nguồn chuyển miền được tính theo publisher và URL đã xác nhận; không gộp nội dung báo khác chỉ vì trùng domain cũ.

Các điểm còn cần theo dõi:

- Hanoitimes: đang bị chặn HTTP 401; 46 bản ghi hiện có là dữ liệu cũ, ngày gần nhất 22/02/2026.
- SBV: đã có bài trong ES; trang chủ có lúc timeout/trả HTML rỗng, đã bổ sung seed từ chuyên mục tin tức và root có link bài.
- Dân sinh: lấy được kho bài lưu trữ, không coi dữ liệu tháng 02/2025 là bài mới.
- Tạp chí Ngân hàng, Tuyên giáo và Tiết kiệm năng lượng: ngày đăng gần nhất trong ES lần lượt là 14/09, 07/11 và 12/11/2026. Số liệu hiện tại chưa chứng minh có bài mới hơn các mốc này.
- Phát hiện 640 bản ghi có ngày đăng vượt thời điểm kiểm tra: PLO 10, Người Đô Thị 110, VOV 520. Đã tách khỏi thống kê trong bảng; lượt kiểm tra này không sửa/xóa dữ liệu ES gốc.

Việc đối chiếu dữ liệu không xác nhận mọi bài hoặc mọi layout của mỗi website đều được lấy đầy đủ. Báo cáo giữ riêng nguồn thay thế, nguồn lưu trữ và nguồn đang bị chặn để tránh nhầm với trạng thái cập nhật tin mới.
