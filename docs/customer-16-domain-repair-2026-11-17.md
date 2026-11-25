# Kết quả xử lý 16 domain — 17/11/2026

> Cập nhật tiếp trong ngày: đã sửa và đối chiếu thêm 30 bài cho 10 nguồn; còn Hanoitimes bị chặn HTTP Basic. Tính cả lượt dưới đây, 15/16 nguồn có bằng chứng lấy bài, gồm nguồn chuyển miền, bài lưu trữ và SGGP thay thế. Xem [báo cáo mới nhất](customer-11-deep-repair-2026-11-17.md). Phần bên dưới giữ nguyên kết quả tại thời điểm lượt đầu.

Đã triển khai và xác minh thực tế 5 nguồn; còn 11 nguồn chưa xử lý xong. 15/15 URL kiểm chứng có đúng một tài liệu trong ES5, có tiêu đề, ngày đăng và nội dung từ 3.143 đến 7.981 ký tự trong tập mẫu đầu; không chỉ dừng ở trạng thái đăng ký hoặc parser thử. Bản cuối có 80 kiểm tra tự động đạt trên VPS và máy local.

| Domain | Kết quả | Thay đổi và phạm vi xác minh |
|---|---|---|
| plo.vn | Crawl được bài lưu trữ | Đi đúng chuyên trang /plo/ trên Tuổi Trẻ, giữ siteName plo.vn. Sửa việc lấy nhầm giờ trong thẻ related-content. Đã kiểm tra parser trên 4 bài; đối soát 3 bài trong ES5. |
| nld.com.vn | Crawl được bài lưu trữ | Đi đúng chuyên trang /nld/ trên Tuổi Trẻ, giữ siteName nld.com.vn. Đã kiểm tra và đối soát 3 bài trong ES5. |
| baotainguyenmoitruong.vn | Crawl qua miền mới | Mở alias đã xác minh sang nongnghiepmoitruong.vn; dữ liệu ghi đúng publisher mới. 5 bài chữ qua parser, 3 bài được đối soát trong ES5. Một số layout ảnh/video vẫn có thể bị giữ lại bởi kiểm tra nội dung. |
| vneconomy.vn | Đã xác minh luồng RSS đang hoạt động | Giữ cấu hình ngày đăng từ RSS tieu-diem.rss, kiểm tra bằng đúng ngữ cảnh feed. 6 bài qua parser, 3 bài được đối soát trong ES5. Không khẳng định toàn bộ chuyên mục ngoài feed này đã được phục hồi. |
| tuyengiao.vn | Crawl được qua API công khai chính chủ | Bổ sung adapter cho frontend chỉ dựng giao diện bằng JavaScript. API được frontend tham chiếu là tuyengiaodanvan.vn/api/v1/news/public; khớp chính xác slug, ID, trạng thái approved và loại news. Ngày gốc dùng đúng biểu thức BlogPublishDate của frontend: publishDate ?? createdAt, giữ nguyên ISO có múi giờ; không dùng updatedAt. 4 bài qua parser, 3 bài được đối soát trong ES5. |

PLO/NLD: bằng chứng hiện tại là bài lưu trữ trong chuyên trang trên Tuổi Trẻ. Lượt kiểm chứng chủ động cho phép lấy mẫu cũ và giữ nguyên ngày đăng; không đổi cửa sổ tuổi bài của dịch vụ thường kỳ, không khẳng định hai nguồn có tin mới độc lập. Tuyên Giáo: bài mẫu hiện có ngày 07/11/2026; không tạo ngày mới để vượt cửa sổ thời gian.

| Domain chưa xử lý xong | Lý do đã kiểm tra | Điều kiện để tiếp tục |
|---|---|---|
| bbw.vn | HTML bài hiện tại chủ yếu là giao diện JavaScript và dữ liệu nhúng. datePublished trong các mẫu là giờ không có offset/múi giờ; chưa có nguồn đối chứng đủ để chuẩn hóa ngày đăng theo kiểm tra hiện tại. | Bộ đọc dữ liệu nhúng kèm bằng chứng múi giờ chính chủ hoặc chính sách xử lý giờ địa phương được xác nhận; chưa mở ghi chỉ từ timestamp đang thiếu múi giờ. |
| pvn.vn | Đã xác nhận chuyển sang petrovietnam.vn và đọc được nội dung thật. Mẫu trang chi tiết chỉ hiển thị ngày, không có giờ đăng; chưa tìm được timestamp gốc có múi giờ qua RSS/sitemap công khai đã kiểm tra. | Timestamp gốc từ nguồn công khai, hoặc hỗ trợ ngày gốc với độ chính xác ngày mà không tự thêm 00:00. Hiện chưa bỏ chốt kiểm tra để gán giờ giả. |
| moit.gov.vn | Đọc được bài, nhưng metadata article:published_time và đồng hồ hiển thị mâu thuẫn. Ví dụ bài Việt Nam - Chile hiển thị 15:24, metadata là 15:38:25 ngày 16/11/2026; bản sửa selector vẫn bị chặn đúng bởi kiểm tra bằng chứng ngày gốc. | Xác định trường nào là thời điểm đăng gốc và trường nào là cập nhật bằng bằng chứng từ publisher; chưa bỏ qua một trong hai chỉ để ép bài đạt. |
| sbv.gov.vn | Lượt truy cập trực tiếp trả HTTP 200 nhưng nội dung là Request Rejected của firewall, không phải bài báo. Kiểm tra trước qua transport VPS đọc được trang chủ nhưng các URL bài bị chặn. | Đường truy cập/API công khai được publisher cho phép hoặc quyền truy cập phù hợp; chưa có nội dung bài hợp lệ để học và xác minh parser. |
| tietkiemnangluong.com.vn | Đọc được bài chữ; các mẫu chỉ có ngày dạng 10/11/2026, không có giờ đăng. Ngày ở header trang là ngày hiện tại, không thể lấy làm thời điểm đăng bài. | Timestamp gốc hoặc hỗ trợ độ chính xác ngày được xác nhận; không thay ngày bài bằng ngày header và không tự tạo giờ. |
| hanoitimes.vn | HTTP và HTTPS đều trả 401; bản www reset kết nối. Phản hồi không có nội dung bài để parse. | Publisher mở lại truy cập công khai hoặc cung cấp quyền truy cập phù hợp. |
| haiquanonline.com.vn | DNS của domain trả ENOTFOUND trong lượt kiểm tra trực tiếp và resolve4. Lượt kiểm tra VPS trước gặp 503/reset kết nối. | DNS/website được khôi phục hoặc tên miền thay thế được publisher xác nhận; không tự gán sang báo khác. |
| baodansinh.vn | DNS của domain trả ENOTFOUND trong lượt kiểm tra trực tiếp và resolve4. Lượt kiểm tra VPS trước gặp 503/reset kết nối. | DNS/website được khôi phục hoặc tên miền thay thế được publisher xác nhận. |
| kinhtetrunguong.vn | Lượt mới gặp lỗi DNS ENOTFOUND/ESERVFAIL. Lượt trước HTTP trả trang VNNIC báo hết hạn tên miền và HTTPS lỗi chứng chỉ; chưa có trang tin chính chủ hợp lệ. | Khôi phục domain hoặc xác nhận tên miền chính thức mới. |
| baobariavungtau.com.vn | HTTPS lỗi TLS EPROTO. HTTP trả nội dung mang tên Báo và Phát thanh, Truyền hình Lai Châu, không xác minh được là nguồn Bà Rịa - Vũng Tàu. | Publisher xác nhận địa chỉ chính thức hoặc khôi phục đúng virtual host/nội dung và TLS; không nhập bài Lai Châu dưới tên nguồn này. |
| baodaklak.vn | Trang có nhiều h1 và nhiều đồng hồ của bài liên quan. Đã thử khoanh vùng tiêu đề/ngày bài; các mẫu vẫn chưa vượt kiểm tra quyền sở hữu đồng hồ. Giờ hiển thị cũng không kèm offset/múi giờ để chứng minh timestamp độc lập. | Hoàn thiện vùng bài bao gồm đúng tiêu đề, nội dung và đồng hồ, kèm nguồn chứng minh múi giờ/ngày đăng. Chưa đánh dấu thành công từ dữ liệu cũ 189 bài. |

Các nguồn chưa đạt vẫn chịu kiểm tra ngày gốc, múi giờ và danh tính publisher hiện có. Không mở chặn để ghi dữ liệu có giờ tự đặt hoặc nội dung của báo khác. Không reset hàng đợi hoặc dữ liệu tích lũy ai_usage; không thực hiện cuộc gọi AI trả phí thủ công trong lượt này. Dịch vụ seed/parse/import đều active sau triển khai.

Bằng chứng ES5 (có thể đối chiếu từng URL):

| Nguồn yêu cầu | URL thực tế | ES index | ES ID | Ngày đăng trong ES | Độ dài nội dung |
|---|---|---|---|---|---:|
| plo.vn | https://tuoitre.vn/plo/36-nam-cung-ban-doc-tu-day-khep-lai-109913390.htm | master202627 | 6c15d397971e340d810d3b822b59b270 | 2026-06-30T15:15:00.000Z | 3143 |
| plo.vn | https://tuoitre.vn/plo/36-nam-bao-phap-luat-tphcm-cam-xuc-cong-ly-la-ban-sac-cua-chung-toi-109913343.htm | master202627 | 57d5a05abec06beb48f0ac18998665b2 | 2026-06-30T03:05:00.000Z | 7377 |
| plo.vn | https://tuoitre.vn/plo/36-nam-phap-luat-tphcm-hay-giu-mai-chat-nguoi-phap-luat-109913376.htm | master202627 | 19170df7276149bfe41588cf73adbb4c | 2026-06-30T08:03:00.000Z | 3848 |
| nld.com.vn | https://tuoitre.vn/nld/thu-dang-uy-ban-bien-tap-gui-ban-doc-nhung-loi-gui-lai-196260629212047062.htm | master202627 | 9dd132c6d73c68c5d5c5bfa1a956c8d5 | 2026-06-30T00:17:00.000Z | 3362 |
| nld.com.vn | https://tuoitre.vn/nld/ban-thao-khong-the-nao-quen-196260629204136125.htm | master202627 | 9b4b854f35af6bada8d5b5512d9ed063 | 2026-06-30T00:04:00.000Z | 7281 |
| nld.com.vn | https://tuoitre.vn/nld/khep-lai-de-nho-buoc-tiep-de-truong-thanh-19626062919301067.htm | master202627 | cc5616a42a8c306b2b4ec405d4868c2e | 2026-06-30T00:30:00.000Z | 7981 |
| vneconomy.vn | https://vneconomy.vn/chung-mot-dai-duong-chung-mot-tuong-lai.htm | master202647 | 30e2cc0206f03017f374e77b047bd16b | 2026-11-17T01:40:41.000Z | 6497 |
| vneconomy.vn | https://vneconomy.vn/chu-tich-quoc-hoi-tran-thanh-man-tham-du-dai-hoi-dong-lien-nghi-vien-asean-lan-thu-47-tai-philippines.htm | master202647 | 56f2de3496833b1d6df42bddd964e67e | 2026-11-17T01:38:10.000Z | 3629 |
| vneconomy.vn | https://vneconomy.vn/viet-nam-thai-lan-huong-toi-muc-tieu-thuong-mai-song-phuong-50-ty-usd.htm | master202647 | 3f47f4046b06b650ac3d8645a8a37433 | 2026-11-17T01:24:45.000Z | 3963 |
| baotainguyenmoitruong.vn | https://nongnghiepmoitruong.vn/siet-chat-xu-ly-vi-pham-giam-sat-hanh-trinh-tau-ca-het-thoi-hieu-d841788.html | master202647 | e96679596ae123a976536c4500f97885 | 2026-11-17T06:29:00.000Z | 5530 |
| baotainguyenmoitruong.vn | https://nongnghiepmoitruong.vn/pgsts-nguyen-the-ky-giu-chuc-chu-tich-hoi-nha-van-viet-nam-d841867.html | master202647 | 56d623d8b49311dabecf16fc714c2ba1 | 2026-11-17T06:27:00.000Z | 4774 |
| baotainguyenmoitruong.vn | https://nongnghiepmoitruong.vn/viet-nam--trung-quoc-trao-doi-hop-tac-chia-se-du-lieu-thuy-van-d841855.html | master202647 | 4e3d157b1e32e97f4762c3ec9f518818 | 2026-11-17T05:03:00.000Z | 3944 |
| tuyengiao.vn | https://tuyengiao.vn/vn/blogs/khai-truong-trung-tam-bao-chi-dai-hoi-the-thao-toan-quoc-lan-thu-x-nam-2026-6aeebe3efe13b9ef33e00d4f | master202645 | aa0842cf8d63a3cba68b8687fbc769c7 | 2026-11-07T05:59:26.018Z | 6212 |
| tuyengiao.vn | https://tuyengiao.vn/vn/blogs/quoc-hoi-chot-muc-tieu-tang-truong-gdp-nam-2027-tu-10-tro-len-6aeeba241dfce6e28581a26a | master202645 | 3dc35df4a897061d34c56683d656988b | 2026-11-07T05:41:56.463Z | 3436 |
| tuyengiao.vn | https://tuyengiao.vn/vn/blogs/ra-mat-chip-va-nen-tang-ban-dan-bao-mat-dau-tien-tai-viet-nam-6aeeb921fe13b9ef33e00ca1 | master202645 | 8a913e6548a30815ca3eda5dc8f4156c | 2026-11-07T05:37:37.381Z | 5684 |

Bằng chứng máy đọc: `outputs/customer-16-repair-20261117/resolution.json`, `server-final/es-verification.json`, `server-final/final-verification.json`, `server-final/pipeline-results.json`, `server-final/pipeline-tuyengiao.json`, `server-final/tests-final.tap`. HTML và API nguyên bản nằm trong từng thư mục domain của cùng đợt kiểm tra.

Sao lưu VPS: `/var/lib/news-flow/customer16-repair-20261117/backup` và `/var/lib/news-flow/customer16-tuyengiao-20261117/backup`. Chỉ vá phần routing URL, loại đồng hồ của related-content và thêm adapter Tuyên Giáo; giữ các thay đổi khác của release hiện tại.
