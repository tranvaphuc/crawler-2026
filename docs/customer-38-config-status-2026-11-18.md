> Cập nhật mới: hai bản ghi ES đã sửa, bổ sung sửa layout và kiểm chứng thực tế. Xem [báo cáo ES/layout mới](customer-layout-es-repair-2026-11-18.md). Phần dưới là snapshot lịch sử.

Báo cáo cấu hình và trạng thái 38 nguồn — 08:55 ngày 18/11/2026 (UTC+7)

> Cập nhật sau lượt rà soát sâu: đã phục hồi 127 seed, sửa Business Times/VnEconomy, kiểm chứng lại Tuyên giáo/Tài nguyên Môi trường và bổ sung English VOV riêng theo yêu cầu. Còn các lỗi layout/truy cập và 2 bản ghi ES chưa đạt. Xem [báo cáo sửa lỗi mới nhất](customer-live-errors-repair-2026-11-18.md). Phần dưới giữ nguyên snapshot 08:55.

Cả 38 nguồn đã có cấu hình trong registry. “Đã lấy được” nghĩa là có bài đã kiểm chứng/xử lý thành công, không có nghĩa mọi chuyên mục hoặc mọi bài đều thành công. Lỗi nêu dưới đây là trạng thái đang lưu ở các seed trong runtime, không phải kết quả vừa gửi HTTP mới tới tất cả URL.

Hanoitimes vẫn bị chặn. Tuyên giáo và Tài nguyên Môi trường từng lấy được bài nhưng seed hiện lỗi/chờ rà soát. Các nguồn có lỗi cục bộ vẫn được ghi rõ, không xếp thành hoàn toàn không crawl được.

| STT | Nguồn | Config | Kết quả và lỗi hiện tại | Địa chỉ khác miền/nguồn thay thế |
|---:|---|---|---|---|
| 1 | e.vnexpress.net | Đã có | Đã lấy được; 2 seed còn lỗi do gián đoạn dịch vụ. | Không đổi miền trong cấu hình nguồn chính. |
| 2 | businesstimes.com.sg | Đã có | Đã lấy được; 5 seed chuyên mục trả 404. Cùng publisher, dùng www.businesstimes.com.sg/global?ref=home-redirect. | Không đổi miền trong cấu hình nguồn chính. |
| 3 | theinvestor.vn | Đã có | Đã lấy được. | Không đổi miền trong cấu hình nguồn chính. |
| 4 | pvn.vn | Đã có | Đã lấy được qua petrovietnam.vn. | https://petrovietnam.vn/ |
| 5 | nangluongvietnam.vn | Đã có | Đã lấy được; 1 seed còn lỗi gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 6 | moit.gov.vn | Đã có | Đã lấy được; dùng giờ hiển thị trên bài UTC+7. | Không đổi miền trong cấu hình nguồn chính. |
| 7 | sbv.gov.vn | Đã có | Đã lấy được; còn seed trả HTML rỗng/chờ rà soát, vẫn có seed hoạt động. Cùng domain, dùng /vi/trang-chu và seed dự phòng. | Không đổi miền trong cấu hình nguồn chính. |
| 8 | tapchinganhang.gov.vn | Đã có | Đã lấy được; 1 seed trả 404. Không khẳng định đã cập nhật tin mới nhất. | Không đổi miền trong cấu hình nguồn chính. |
| 9 | kinhtedothi.vn | Đã có | Đã lấy được; một số seed timeout, reset kết nối hoặc gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 10 | luatvietnam.vn | Đã có | Đã lấy được. | Không đổi miền trong cấu hình nguồn chính. |
| 11 | tuyengiao.vn | Đã có | Từng lấy được 40 bài theo runtime; seed /vn hiện bị giữ chờ rà soát sau lỗi trang rỗng. Chưa coi là cập nhật tự động ổn định. | Không đổi miền trong cấu hình nguồn chính. |
| 12 | tietkiemnangluong.com.vn | Đã có | Đã lấy được; ngày gốc thiếu giờ lưu 00:00 UTC+7 theo xác nhận. | Không đổi miền trong cấu hình nguồn chính. |
| 13 | baotainguyenmoitruong.vn | Đã có | Từng lấy được qua nongnghiepmoitruong.vn và có dữ liệu ES; seed alias hiện chờ rà soát, homepage miền đích trả HTML rỗng. Chưa coi luồng seed đã ổn định. | https://nongnghiepmoitruong.vn/ |
| 14 | hanoitimes.vn | Đã có | Đã đăng ký cấu hình nhưng chưa đủ điều kiện lấy bài mới; HTTP 401 yêu cầu xác thực, nguồn vẫn bị chặn. ES có dữ liệu cũ. | Không đổi miền trong cấu hình nguồn chính. |
| 15 | dealstreetasia.com | Đã có | Đã lấy được; 3 seed còn HTTP 502. | Không đổi miền trong cấu hình nguồn chính. |
| 16 | haiquanonline.com.vn | Đã có | Đã lấy được qua thuehaiquan.tapchikinhtetaichinh.vn. | https://thuehaiquan.tapchikinhtetaichinh.vn/ |
| 17 | baodansinh.vn | Đã có | Đã lấy được kho lưu trữ tại dansinh.dantri.com.vn; không đồng nghĩa có tin mới. | https://dansinh.dantri.com.vn/ |
| 18 | kinhtetrunguong.vn | Đã có | Đã lấy được qua cscltw.dcs.vn. | https://cscltw.dcs.vn/ |
| 19 | baobariavungtau.com.vn | Đã có | Dùng SGGP thay thế theo xác nhận, không phải sửa thành công domain cũ. Nguồn SGGP đang có seed hoạt động và bài xử lý thành công. | https://www.sggp.org.vn/ (thay thế theo yêu cầu) |
| 20 | laodong.vn | Đã có | Đã lấy được; nhiều seed còn vướng bước khởi tạo cookie công khai, có seed gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 21 | tienphong.vn | Đã có | Đã lấy được; có seed HTTP 502/gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 22 | daidoanket.vn | Đã có | Đã lấy được. | Không đổi miền trong cấu hình nguồn chính. |
| 23 | plo.vn | Đã có | Đã lấy được các bài đã kiểm chứng tại tuoitre.vn/plo/; ghi rõ phạm vi chuyên trang, không gộp toàn Tuổi Trẻ. | https://tuoitre.vn/plo/index.htm |
| 24 | daibieunhandan.vn | Đã có | Đã lấy được. | Không đổi miền trong cấu hình nguồn chính. |
| 25 | thoibaonganhang.vn | Đã có | Đã lấy được; 4 seed trang rỗng, 1 seed gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 26 | thoibaotaichinhvietnam.vn | Đã có | Đã lấy được. | Không đổi miền trong cấu hình nguồn chính. |
| 27 | bnews.vn | Đã có | Đã lấy được; có seed reset kết nối/gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 28 | baotintuc.vn | Đã có | Đã lấy được; 1 seed trả 404. | Không đổi miền trong cấu hình nguồn chính. |
| 29 | kinhtechungkhoan.vn | Đã có | Đã lấy được; nhiều seed chuyên mục bị chặn truy cập hoặc HTTP 500, có gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 30 | baoxaydung.vn | Đã có | Đã lấy được; vẫn cùng domain, homepage cấu hình dùng /an-toan-giao-thong.htm. | Không đổi miền trong cấu hình nguồn chính. |
| 31 | 1thegioi.vn | Đã có | Đã lấy được. | Không đổi miền trong cấu hình nguồn chính. |
| 32 | thitruongtaichinhtiente.vn | Đã có | Đã lấy được. | Không đổi miền trong cấu hình nguồn chính. |
| 33 | nguoidothi.net.vn | Đã có | Đã lấy được; có seed reset kết nối/gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 34 | baodaklak.vn | Đã có | Đã lấy được; dùng đồng hồ đúng vùng bài, UTC+7. | Không đổi miền trong cấu hình nguồn chính. |
| 35 | vneconomy.vn | Đã có | Đã lấy được; dùng ngữ cảnh ngày từ RSS, còn một số seed HTTP 500/reset/gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 36 | nld.com.vn | Đã có | Đã lấy được các bài đã kiểm chứng tại tuoitre.vn/nld/; ghi rõ phạm vi chuyên trang. | https://tuoitre.vn/nld/index.htm |
| 37 | vov.vn | Đã có | Đã lấy được bản tiếng Việt; một số seed media rỗng, 8 seed tiếng Anh chuyển tới publisher chưa cấu hình, có seed gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |
| 38 | en.vietnamplus.vn | Đã có | Đã lấy được; 1 seed còn lỗi gián đoạn. | Không đổi miền trong cấu hình nguồn chính. |

Có 8 nguồn dùng địa chỉ khác miền hoặc nguồn thay thế như cột cuối. Riêng SGGP là phương án thay thế đã được người dùng duyệt, không được mô tả là redirect thành công của domain Bà Rịa - Vũng Tàu cũ. Các đường dẫn /vn, /vi/trang-chu, /global và /an-toan-giao-thong.htm là thay đổi đường dẫn trong cùng miền/publisher.

Dữ liệu ES của 38 nguồn đã được đối chiếu riêng lúc 17:25 ngày 17/11/2026; kết quả đó bao gồm dữ liệu lịch sử và nguồn kế thừa, không thay thế cho trạng thái runtime ngày 18/11 trong báo cáo này. Lượt báo cáo hiện tại chỉ đọc, không triển khai sửa hoặc reset hàng đợi.
