# Báo cáo sửa ES và kiểm tra layout — 18/11/2026

Đã triển khai sửa trên VPS, kiểm tra bằng HTTP thật và luồng parse/ghi hiện có. Không dùng Astra; lượt xử lý này không gọi AI API trả phí. Ledger ai_usage giữ nguyên, không reset.

## Kết quả đã xác nhận

- Hai bản ghi ES ban đầu đã sửa có backup và kiểm tra version: NguoiDoThi từ **00:00 ngày 17/11** thành **17:33 ngày 16/11/2026 (UTC+7)**; SGGP từ nội dung chỉ có tên tác giả **10 ký tự** thành sapo video gốc **233 ký tự**. Sapo video không phải transcript.
- Sửa thêm bản ghi VOV mất phần giây: **11:35:00 → 11:35:08 ngày 26/10/2026 (UTC+7)** theo JSON-LD gốc gắn đúng bài. Các trường khác giữ nguyên.
- **13/13 bài kiểm chứng có trong ES**. URL, nguồn, tiêu đề và ngày/giờ khớp, không còn khác biệt ở bốn trường này. Hai bản ghi sửa ban đầu đã được đọc lại đúng trường cần sửa và xác nhận các trường khác giữ nguyên. Chưa so khớp toàn bộ nội dung của mọi bản ghi ES.
- Sửa cấu hình/layout của **7 nguồn**: e.vnexpress.net, haiquanonline.com.vn, baodaklak.vn, vov.vn, baotintuc.vn, en.vietnamplus.vn và SGGP. Quiz VnExpress lấy câu hỏi/lựa chọn công khai; không làm bài hay gửi đáp án.
- Chạy lại **167 URL từng lỗi: 58 URL đạt; 109 URL chưa đạt hoặc bị loại đúng phạm vi**. Trong 109 có 4 URL miền Bà Rịa–Vũng Tàu cũ bị loại và 1 URL SBV chưa gửi lại HTTP vì cooldown. VOV chuyển chuyên mục được kiểm chứng bổ sung sau bản sửa cuối.
- Đây là bộ mẫu lỗi, không phải tổng số lỗi toàn hệ thống. 58 kết quả đạt của lượt rà soát là kiểm tra chẩn đoán, không có nghĩa cả 58 vừa được ghi mới vào ES. Đối chiếu queue: chỉ 2 URL còn fail được trả lại hàng đợi thường; 56 URL khác giữ nguyên. Luồng thường giữ giới hạn tuổi bài.
- **59/59 test đạt**; ba service seed/parse/import đều active.

## Trạng thái từng nguồn khách yêu cầu

Cả 38 nguồn đã có cấu hình từ các lượt trước. “Đạt/mẫu” chỉ tính URL từng lỗi được kiểm ở lượt này. “—” nghĩa là không có mẫu, không phải xác nhận crawl hiện tại thành công. Lỗi cục bộ không đồng nghĩa cả domain ngừng hoạt động.

| # | Domain khách yêu cầu | Đạt/mẫu | Kết quả và phần còn vướng |
|---:|---|---:|---|
| 1 | e.vnexpress.net | 4/5 | Đã sửa longform và quiz, lấy đủ câu hỏi/lựa chọn từ API công khai gắn với bài. Còn 1 bài video thiếu thân bài. |
| 2 | businesstimes.com.sg | 2/8 | Còn 3 bài xung đột định danh trang, 1 bài thân bài lẫn liên kết, 1 URL chuyển host chưa cấu hình; /global là danh mục. |
| 3 | theinvestor.vn | 0/2 | Bài cũ d3451 thiếu ngày/nội dung; trang tổng kết năm thiếu đủ trường bài báo. |
| 4 | pvn.vn | 0/3 | Dùng petrovietnam.vn. Video thiếu sapo gốc; URL tin-tuc dạng UUID và trang nhận diện thương hiệu không có đủ trường bài báo. |
| 5 | nangluongvietnam.vn | 0/1 | Bài hội thảo cũ có JSON-LD không khớp URL bài, chưa đủ căn cứ gán ngày đăng. |
| 6 | moit.gov.vn | — | Không có mẫu trong bộ 167 lỗi này. Giữ ưu tiên giờ hiển thị UTC+7 theo xác nhận; lượt này không kiểm lại bài của nguồn. |
| 7 | sbv.gov.vn | 1/7 | Có bài lấy được. Còn xung đột URL, thiếu trường ở layout khác, 1 bài bị chặn và 1 bài chưa gửi HTTP lại vì cooldown sau chặn. |
| 8 | tapchinganhang.gov.vn | 1/6 | Có bài lấy được. Còn tài liệu .docs, ấn phẩm .paper, trang danh mục và layout thiếu ngày/tiêu đề. |
| 9 | kinhtedothi.vn | — | Không có mẫu trong bộ 167 lỗi; lượt này không kiểm lại bài của nguồn. |
| 10 | luatvietnam.vn | 1/9 | Có bài tin lấy được. Văn bản -d1/-d2 còn thiếu ngày đăng/thân bài; video lệch JSON-LD; 1 request lỗi. |
| 11 | tuyengiao.vn | — | Không có mẫu trong bộ 167 lỗi. Có kiểm chứng ở lượt trước; lượt này không xác nhận lại độ ổn định. |
| 12 | tietkiemnangluong.com.vn | 0/5 | Còn e-magazine thiếu trường, video thiếu văn bản, infographic thiếu tiêu đề, tài liệu âm nhạc xung đột định danh. Giữ quy tắc thiếu giờ lưu 00:00 UTC+7. |
| 13 | baotainguyenmoitruong.vn | 6/15 | Dùng nongnghiepmoitruong.vn. Có bài lấy được; còn video chưa bao phủ đủ nội dung, infographic thiếu tiêu đề/văn bản, xung đột URL/chứng cứ ngày và trang chuyên mục. |
| 14 | hanoitimes.vn | — | Không có mẫu trong bộ 167 lỗi. Lần kiểm trước trả HTTP 401/Basic Auth; chưa có giải pháp lấy bài mới. ES cũ không chứng minh crawl hiện tại thành công. |
| 15 | dealstreetasia.com | 2/6 | Hai bài công khai lấy được. Hai bài bị hạn chế/chưa xác nhận toàn văn công khai; trang reports thiếu trường; trang đăng ký newsletter không có thân bài tin. |
| 16 | haiquanonline.com.vn | 2/5 | Dùng thuehaiquan.tapchikinhtetaichinh.vn. Đã sửa e-magazine. Còn .region, video .media thiếu ngày/thân bài và infographic không có văn bản gốc. |
| 17 | baodansinh.vn | — | Dùng kho dansinh.dantri.com.vn, UTC+7 theo xác nhận. Không có mẫu trong bộ 167 lỗi; lượt này không kiểm lại bài hay xác nhận có tin mới. |
| 18 | kinhtetrunguong.vn | 1/2 | Dùng cscltw.dcs.vn. Có bài lấy được; ấn phẩm điểm tin số 62 còn thân bài lẫn nhiều liên kết. |
| 19 | baobariavungtau.com.vn | 2/10 | Dùng SGGP theo yêu cầu, không phải redirect kỹ thuật của miền cũ. 4 URL miền cũ bị loại đúng phạm vi. SGGP đã sửa video có sapo; còn podcast thiếu văn bản, bài thời tiết thiếu trường và 2 bài chuyển publisher khác. |
| 20 | laodong.vn | 1/6 | Có bài lấy được. Còn short-video không có văn bản, bài thiếu bao phủ thân bài, podcast nhiều liên kết, trang chuyên mục và timeout. |
| 21 | tienphong.vn | 2/6 | Có bài lấy được. Hai clip còn lẫn liên kết; 1 media thiếu văn bản; 1 bài thiếu thân bài. |
| 22 | daidoanket.vn | 1/7 | Có bài lấy được. Còn body nhiều liên kết, podcast thiếu văn bản, layout thiếu tiêu đề/thân bài, short trả rỗng và bài không có sapo gốc. |
| 23 | plo.vn | 0/1 | Dùng tuoitre.vn/plo/. Bài mẫu còn xung đột chứng cứ ngày đăng; chưa tự chọn ngày thay cho nguồn. |
| 24 | daibieunhandan.vn | 0/2 | Một bài thiếu thân bài; một bài JSON-LD chưa gắn đúng URL. Hai layout này chưa lấy được. |
| 25 | thoibaonganhang.vn | 2/5 | Có bài lấy được. Còn bài không có sapo gốc, video .media lệch JSON-LD và e-magazine thiếu thân bài. |
| 26 | thoibaotaichinhvietnam.vn | 0/1 | Bản tin video .media thiếu tiêu đề theo selector hiện tại; chưa lấy được layout này. |
| 27 | bnews.vn | 2/4 | Có bài lấy được. Còn bài xổ số lệch JSON-LD và photo chưa xác nhận múi giờ bằng chứng cứ nguồn. |
| 28 | baotintuc.vn | 2/4 | Đã sửa video có sapo/player gốc. Còn 2 URL xung đột định danh trang. |
| 29 | kinhtechungkhoan.vn | 3/4 | Ba bài lỗi trước đã qua kiểm tra. Một URL trả 404, không lấy được nội dung từ trang hiện tại. |
| 30 | baoxaydung.vn | 2/7 | Có bài lấy được. Còn bài thiếu một đoạn gốc, infographic không có văn bản, layout thể thao thiếu thân bài, layout thiếu tiêu đề và bài lệch JSON-LD. |
| 31 | 1thegioi.vn | 1/3 | Có bài lấy được. Còn bài Trạm Tech thiếu thân bài và ấn phẩm tháng 11 thiếu ngày/thân bài. |
| 32 | thitruongtaichinhtiente.vn | 1/1 | URL từng lỗi trong mẫu đã lấy được; không còn vướng trong mẫu 1 URL này. |
| 33 | nguoidothi.net.vn | 3/5 | Đã sửa bản ghi ES sai ngày/giờ. Ba URL lỗi trước lấy được; còn layout thiếu tiêu đề/ngày và 1 URL timeout. |
| 34 | baodaklak.vn | 1/5 | Đã sửa e-magazine. Còn video thiếu văn bản, infographic chưa xác nhận quyền sở hữu dữ liệu gốc; chuyên mục và báo in thiếu trường tin. |
| 35 | vneconomy.vn | 5/6 | Năm URL lỗi trước lấy được bằng nội dung/ngày gốc. Còn layout tổng hợp tuần có mật độ liên kết cao. |
| 36 | nld.com.vn | 0/1 | Bài chuyển sang tuoitre.vn/nld/ là media không có văn bản gốc đủ dùng; chưa có transcript/OCR. |
| 37 | vov.vn | 4/8 | Đã sửa thân bài và nhận diện chuyển chuyên mục cùng native ID. Còn infographic/bản đồ e-magazine, báo in thiếu văn bản và 1 URL chuyển host chưa cấu hình. |
| 38 | en.vietnamplus.vn | 6/7 | Đã sửa video có sapo/player. Sáu URL lỗi trước lấy được; còn bài lễ cầu hôn Jrai thiếu thân bài. |

Nguồn bổ sung **english.vov.vn** đã tách riêng theo yêu cầu ở lượt trước. Bộ 167 URL này không có bài English VOV để kiểm lại.

## Từng URL còn vướng

Giữ chính xác URL đã kiểm và lý do trả về. Không dùng AI đoán ngày, tạo sapo hay transcript thay nội dung gốc. Trường hợp thiếu trường vẫn cần xử lý tiếp layout/selector hoặc có thêm dữ liệu gốc; chưa coi là sửa thành công.

### e.vnexpress.net

- [1. Mở URL](https://e.vnexpress.net/news/tech/robots-perform-martial-arts-dance-in-lion-costumes-on-hcmc-s-nguyen-hue-walking-street-5143087.html) — Thiếu thân bài. Mã: missing_body.

### businesstimes.com.sg

- [1. Mở URL](https://www.businesstimes.com.sg/opinion-features/stork-options-singapores-ivf-market-sees-patient-demand-amid-birth-dearth?ref=global-middle-featured) — URL/canonical/định danh trang không thống nhất. Mã: NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT.
- [2. Mở URL](https://www.businesstimes.com.sg/international/asean/grit-built-genes-malaysias-lee-yeow-seng-drives-iois-bold-singapore-push?ref=global-behind-the-name) — URL/canonical/định danh trang không thống nhất. Mã: NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT.
- [3. Mở URL](https://www.businesstimes.com.sg/international/global/jensen-huang-discusses-comeback-nvidia-ceo-allies-report?ref=global-international) — Thân bài lẫn nhiều liên kết. Mã: body_link_density.
- [4. Mở URL](https://www.businesstimes.com.sg/global?ref=logo) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.
- [5. Mở URL](https://www.businesstimes.com.sg/international/global/inside-new-hong-kong-what-fuelling-its-economy?ref=global-middle-featured) — Chuyển tới host chưa có cấu hình. Mã: NEWS_UNCONFIGURED_TARGET_HOST.
- [6. Mở URL](https://www.businesstimes.com.sg/singapore/asean-social-security-members-meet-spore-discuss-ageing-digitalisation-and-new-work-trends) — URL/canonical/định danh trang không thống nhất. Mã: NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT.

### theinvestor.vn

- [1. Mở URL](https://theinvestor.vn/cultural-due-diligence-critical-to-nurturing-foreign-bank-marriages-d3451.html) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.
- [2. Mở URL](https://theinvestor.vn/a-year-in-review-and-2024-forecasts/) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.

### pvn.vn

- [1. Mở URL](https://petrovietnam.vn/video-nhung-quyet-sach-mo-duong-36420) — Kiểm tra trường thất bại; chi tiết: missing_description. Mã: NEWS_FIELD_VERIFICATION_FAILED.
- [2. Mở URL](https://petrovietnam.vn/tin-tuc/33abc48c-bfe7-4165-ab1e-8eb11a47b4d0) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.
- [3. Mở URL](https://petrovietnam.vn/he-thong-nhan-dien-thuong-hieu/20a4a647-bf5d-471d-b9c4-56a7c928e0d7) — Thiếu tiêu đề; Thiếu ngày đăng; Thân bài lẫn nhiều liên kết. Mã: missing_title,missing_published_date,body_link_density.

### nangluongvietnam.vn

- [1. Mở URL](https://nangluongvietnam.vn/hoi-thao-khoa-hoc-truc-tuyen-tiet-kiem-nang-luong-nhung-van-de-cap-bach-9947.html) — JSON-LD chưa gắn đúng URL bài. Mã: NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND.

### sbv.gov.vn

- [1. Mở URL](https://sbv.gov.vn/vi/w/%C4%91%E1%BA%A3ng-%E1%BB%A7y-ng%C3%A2n-h%C3%A0ng-nh%C3%A0-n%C6%B0%E1%BB%9Bc-%C4%91%E1%BA%A9y-m%E1%BA%A1nh-tuy%C3%AAn-truy%E1%BB%81n-tri%E1%BB%83n-khai-th%E1%BB%B1c-hi%E1%BB%87n-ch%E1%BB%89-th%E1%BB%8B-s%E1%BB%91-14-ct/tw-c%E1%BB%A7a-ban-b%C3%AD-th%C6%B0-v?redirect=%2Fvi%2Ftin-tuc-su-kien) — URL/canonical/định danh trang không thống nhất. Mã: NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT.
- [2. Mở URL](https://sbv.gov.vn/w/th%C3%B4ng-c%C3%A1o-b%C3%A1o-ch%C3%AD-ban-h%C3%A0nh-th%C3%B4ng-t%C6%B0-s%E1%BB%91-57/2026/tt-nhnn-quy-%C4%91%E1%BB%8Bnh-v%E1%BB%81-tr%C3%ACnh-t%E1%BB%B1-th%E1%BB%A7-t%E1%BB%A5c-gi%C3%A1m-s%C3%A1t-ho%E1%BA%A1t-%C4%91%E1%BB%99ng-ph%C3%B2ng-ch%E1%BB%91ng-r-1) — Thiếu thân bài; Thân bài lẫn nhiều liên kết. Mã: missing_body,body_link_density.
- [3. Mở URL](https://sbv.gov.vn/vi/w/-chung-m%E1%BB%99t-h%C3%A0nh-tr%C3%ACnh-%C4%91%E1%BB%93ng-h%C3%A0nh-v%C3%AC-s%E1%BB%B1-ph%C3%A1t-tri%E1%BB%83n-c%E1%BB%A7a-ph%E1%BB%A5-n%E1%BB%AF?redirect=%2Fvi%2Ftin-tuc-su-kien) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.
- [4. Mở URL](https://sbv.gov.vn/w/di%E1%BB%85n-bi%E1%BA%BFn-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-ngo%E1%BA%A1i-t%E1%BB%87-v%C3%A0-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-li%C3%AAn-ng%C3%A2n-h%C3%A0ng-tu%E1%BA%A7n-t%E1%BB%AB-19-23.10.2026) — Bị chặn truy cập. Mã: access_blocked.
- [5. Mở URL](https://sbv.gov.vn/vi/w/k%E1%BA%BF-ho%E1%BA%A1ch-h%C3%A0nh-%C4%91%E1%BB%99ng-c%E1%BB%A7a-ng%C3%A0nh-ng%C3%A2n-h%C3%A0ng-th%E1%BB%B1c-hi%E1%BB%87n-ngh%E1%BB%8B-quy%E1%BA%BFt-s%E1%BB%91-280/nq-cp-ng%C3%A0y-22/9/2026-c%E1%BB%A7a-ch%C3%ADnh-ph%E1%BB%A7-ban-h%C3%A0nh-k%E1%BA%BF-ho?redirect=%2Fvi%2Ftin-tuc-su-kien) — Chưa gửi lại HTTP vì cooldown sau chặn. Mã: waiting_for_site_cooldown.
- [6. Mở URL](https://sbv.gov.vn/vi/w/%E1%BA%A5n-t%C6%B0%E1%BB%A3ng-ng%C3%A0nh-ng%C3%A2n-h%C3%A0ng-t%E1%BA%A1i-tri%E1%BB%83n-l%C3%A3m-th%C3%A0nh-t%E1%BB%B1u-%C4%91%E1%BA%A5t-n%C6%B0%E1%BB%9Bc-80-n%C4%83m-h%C3%A0nh-tr%C3%ACnh-%C4%91%E1%BB%99c-l%E1%BA%ADp-t%E1%BB%B1-do-h%E1%BA%A1nh-ph%C3%BAc-?redirect=%2Fvi%2Ftin-tuc-su-kien) — Thiếu tiêu đề. Mã: missing_title.

### tapchinganhang.gov.vn

- [1. Mở URL](https://tapchinganhang.gov.vn/369.docs) — Thiếu thân bài. Mã: missing_body.
- [2. Mở URL](https://tapchinganhang.gov.vn/an-pham-tap-chi-in/chuyen-de-dac-biet-quy-2-nam-2026.paper) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.
- [3. Mở URL](https://tapchinganhang.gov.vn/hoat-dong-ngan-hang/bao-chi-dong-hanh-cung-su-phat-trien-cua-nganh-ngan-hang-viet-nam) — Thiếu tiêu đề; Thiếu ngày đăng. Mã: missing_title,missing_published_date.
- [4. Mở URL](https://tapchinganhang.gov.vn/van-ban-phap-luat-ngan-hang) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.
- [5. Mở URL](https://tapchinganhang.gov.vn/nganh-ngan-hang-voi-ky-nguyen-vuon-minh-cua-dan-toc-viet-nam) — Thiếu ngày đăng. Mã: missing_published_date.

### luatvietnam.vn

- [1. Mở URL](https://luatvietnam.vn/doanh-nghiep/quyet-dinh-1007-qd-ubnd-uy-ban-nhan-dan-tinh-lao-cai-410330-d2.html) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.
- [2. Mở URL](https://luatvietnam.vn/dan-su/luat-bao-ve-du-lieu-ca-nhan-2025-so-91-2025-qh15-405135-d1.html) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.
- [3. Mở URL](https://luatvietnam.vn/chinh-sach-moi-hang-thang/chinh-sach-moi-co-hieu-luc-thang-11-2026-559-114453-article.html) — Thiếu ngày đăng. Mã: missing_published_date.
- [4. Mở URL](https://luatvietnam.vn/tin-phap-luat/media-luat-c627-article.html) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.
- [5. Mở URL](https://luatvietnam.vn/tai-nguyen/quyet-dinh-42-2026-qd-ttg-kiem-ke-khi-nha-kinh-danh-muc-linh-vuc-va-co-so-phat-thai-443625-d1.html) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.
- [6. Mở URL](https://luatvietnam.vn/media-luat/video-8-diem-moi-ve-ky-luat-to-chuc-dang-dang-vien-vi-pham-theo-quy-dinh-212-560-115689-article.html) — JSON-LD chưa gắn đúng URL bài. Mã: NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND.
- [7. Mở URL](https://luatvietnam.vn/cong-nghiep/quyet-dinh-3550-qd-ubnd-dong-thap-2026-cong-bo-danh-muc-thu-tuc-hanh-chinh-sua-doi-bo-sung-456465-d2.html) — HTTP lỗi. Mã: ERR_BAD_RESPONSE.
- [8. Mở URL](https://luatvietnam.vn/co-cau-to-chuc/quyet-dinh-2219-qd-ttg-2026-phe-chuan-ket-qua-bau-pho-chu-tich-ubnd-tinh-vinh-long-456511-d1.html) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.

### tietkiemnangluong.com.vn

- [1. Mở URL](https://tietkiemnangluong.com.vn/tin-tuc/e-magazine/t53785/-e-magazine-iso-50001--he-thong-quan-ly-nang-luong-cho-tang-truong-ben-vung) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.
- [2. Mở URL](https://tietkiemnangluong.com.vn/tin-tuc/video/t53999/chuong-trinh-tiet-kiem-nang-luong--so-22) — Thiếu thân bài. Mã: missing_body.
- [3. Mở URL](https://tietkiemnangluong.com.vn/trang-chu-video.html?VideoId=53976) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.
- [4. Mở URL](https://tietkiemnangluong.com.vn/tin-tuc/infographic/t53970/-infographic-tiet-kiem-dien-khi-dung-lo-vi-song) — Thiếu tiêu đề. Mã: missing_title.
- [5. Mở URL](https://tietkiemnangluong.com.vn/tin-tuc/tai-lieu/t14505/8-ca-khuc-tiet-kiem-nang-luong.html) — URL/canonical/định danh trang không thống nhất. Mã: NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT.

### baotainguyenmoitruong.vn

- [1. Mở URL](https://nongnghiepmoitruong.vn/video/giu-nghe-truyen-thong-mo-sinh-ke-bang-chinh-sach-va-du-lich-tv841540.html) — Kiểm tra trường thất bại; chi tiết: body_coverage_unconfirmed, native_paragraph_coverage_requires_review. Mã: NEWS_FIELD_VERIFICATION_FAILED.
- [2. Mở URL](https://nongnghiepmoitruong.vn/vtv8-dinh-vi-moi-lan-toa-van-hoa-di-san-lich-su-va-du-lich-viet-nam-i841995.html) — Thiếu tiêu đề. Mã: missing_title.
- [3. Mở URL](https://nongnghiepmoitruong.vn/dan-lon-tai-da-nang-tang-gan-4-d838912.html) — Chưa xác nhận dữ liệu thuộc chính bài. Mã: NEWS_PUBLICATION_OWNERSHIP_UNCONFIRMED.
- [4. Mở URL](https://nongnghiepmoitruong.vn/giam-phat-thai-khi-nha-kinh-va-xay-dung-thi-truong-cac--bon-channel75/) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.
- [5. Mở URL](https://nongnghiepmoitruong.vn/nganh-dua-viet-nam-con-duong-huong-toi-gia-tri-xuat-khau-ty-usd-d841994.html) — URL/canonical/định danh trang không thống nhất. Mã: NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT.
- [6. Mở URL](https://nongnghiepmoitruong.vn/inforgraphic-xa-hiep-luc-chung-tay-phong-chong-ma-tuy-d841801.html) — Media không có văn bản gốc đủ điều kiện. Mã: NEWS_MEDIA_WITHOUT_NATIVE_TEXT.
- [7. Mở URL](https://nongnghiepmoitruong.vn/nganh-dua-viet-nam-con-duong-huong-toi-gia-tri-xuat-khau-ty-usd-d841760.html) — URL/canonical/định danh trang không thống nhất. Mã: NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT.
- [8. Mở URL](https://nongnghiepmoitruong.vn/tri-thuc-nong-dan/mat-ong-su-vet-mang-gia-tri-ngot-lanh-tu-rung-ngap-man-d839740.html) — Metadata chưa có bằng chứng đối chiếu. Mã: NEWS_PUBLICATION_METADATA_UNCORROBORATED.
- [9. Mở URL](https://nongnghiepmoitruong.vn/infographic--giai-phap-quan-tri-tai-nguyen-nuoc-trong-tinh-hinh-moi-d840576.html) — Thiếu tiêu đề. Mã: missing_title.

### dealstreetasia.com

- [1. Mở URL](https://www.dealstreetasia.com/stories/deal-monitor-11-november-500735/) — publisher_restricted_or_unconfirmed_public_content. Mã: publisher_restricted_or_unconfirmed_public_content.
- [2. Mở URL](https://www.dealstreetasia.com/reports/greater-china-deal-review-q3-2026) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.
- [3. Mở URL](https://www.dealstreetasia.com/deals-intelligence-newsletter-subscription/) — Thiếu thân bài. Mã: missing_body.
- [4. Mở URL](https://www.dealstreetasia.com/stories/hkex-launches-offshore-yuan-bond-index-amid-yuan-globalisation-drive-501120/) — publisher_restricted_or_unconfirmed_public_content. Mã: publisher_restricted_or_unconfirmed_public_content.

### haiquanonline.com.vn

- [1. Mở URL](https://thuehaiquan.tapchikinhtetaichinh.vn/tin-thue-dia-phuong-va-hai-quan-khu-vuc/chi-cuc-hai-quan-khu-vuc-i.region) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.
- [2. Mở URL](https://thuehaiquan.tapchikinhtetaichinh.vn/video-quy-mo-giao-thuong-quoc-te-cua-viet-nam-tiep-tuc-duoc-mo-rong-3916.media) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.
- [3. Mở URL](https://thuehaiquan.tapchikinhtetaichinh.vn/infographic-huong-dan-nop-thue-toi-thieu-toan-cau-172725.html) — Media không có văn bản gốc đủ điều kiện. Mã: NEWS_MEDIA_WITHOUT_NATIVE_TEXT.

### kinhtetrunguong.vn

- [1. Mở URL](https://cscltw.dcs.vn/an-pham-cua-ban/diem-tin-khoa-hoc-cong-nghe-doi-moi-sang-tao-va-chuyen-doi-so-so-62.html) — Thân bài lẫn nhiều liên kết. Mã: body_link_density.

### baobariavungtau.com.vn

- [1. Mở URL](http://baobariavungtau.com.vn/tin-tuc-su-kien-noi-bat/202611/thong-bao-dau-gia-tai-san-so-222-818033/) — Loại khỏi nguồn vì ngoài phạm vi bài báo. Mã: non_article:outside_configured_news_scope.
- [2. Mở URL](http://baobariavungtau.com.vn/truyen-hinh/muc-chuyen-muc/phong-su-chuyen-de-ky-su/202611/noi-nhip-van-minh-tieu-dung-noi-mien-nui-bien-cuong-lai-chau-818071/) — Loại khỏi nguồn vì ngoài phạm vi bài báo. Mã: non_article:outside_configured_news_scope.
- [3. Mở URL](http://baobariavungtau.com.vn/truyen-hinh/muc-chuyen-muc/phong-su-chuyen-de-ky-su/202611/nang-cao-hieu-qua-dau-tu-cong-tao-dong-luc-phat-trien-817846/) — Loại khỏi nguồn vì ngoài phạm vi bài báo. Mã: non_article:outside_configured_news_scope.
- [4. Mở URL](http://baobariavungtau.com.vn/truyen-hinh/muc-chuyen-muc/hoc-tap-lam-theo-tam-guong-dao-duc-HCM/) — Loại khỏi nguồn vì ngoài phạm vi bài báo. Mã: non_article:outside_configured_news_scope.
- [5. Mở URL](https://www.sggp.org.vn/podcast-tin-thoi-su-ngay-15-11-phien-cho-co-tu-huong-sac-nui-rung-post881944.html) — Thiếu thân bài. Mã: missing_body.
- [6. Mở URL](https://www.sggp.org.vn/nam-bo-chuyen-dan-sang-mua-kho-tu-ngay-17-11-post881878.html) — Thiếu tiêu đề; Thiếu thân bài. Mã: missing_title,missing_body.
- [7. Mở URL](https://www.sggp.org.vn/nhung-ky-vong-khi-tuyen-viet-nam-manh-dan-thay-doi-post882255.html) — Chuyển publisher khác chưa được duyệt. Mã: UNAPPROVED_CROSS_PUBLISHER_REDIRECT.
- [8. Mở URL](https://www.sggp.org.vn/ong-khiev-sameth-tai-dac-cu-chu-tich-aff-post881925.html) — Chuyển publisher khác chưa được duyệt. Mã: UNAPPROVED_CROSS_PUBLISHER_REDIRECT.

### laodong.vn

- [1. Mở URL](https://laodong.vn/short-video/hang-tam-co-noi-ky-uc-chien-tranh-con-mai-1802210.ldo) — Media không có văn bản gốc đủ điều kiện. Mã: NEWS_MEDIA_WITHOUT_NATIVE_TEXT.
- [2. Mở URL](https://laodong.vn/vi-loi-ich-doan-vien/bao-ve-quyen-loi-cua-nguoi-lao-dong-tu-som-tu-xa-1721903.ldo) — Kiểm tra trường thất bại; chi tiết: body_coverage_unconfirmed. Mã: NEWS_FIELD_VERIFICATION_FAILED.
- [3. Mở URL](https://laodong.vn/thong-tin-doanh-nghiep) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.
- [4. Mở URL](https://laodong.vn/gio-thu-9/tam-bang-mang-dau-tay-me-phan-2-1800653.ldo) — Thân bài lẫn nhiều liên kết. Mã: body_link_density.
- [5. Mở URL](https://laodong.vn/van-hoa-giai-tri/hon-10000-nguoi-se-don-binh-minh-tren-dinh-yen-tu-1801663.ldo) — Request timeout. Mã: request_deadline_exceeded.

### tienphong.vn

- [1. Mở URL](https://tienphong.vn/clip-nu-tai-xe-lui-xe-bat-ngo-tong-vo-dau-suv-lexus-post1894542.tpo) — Thân bài lẫn nhiều liên kết. Mã: body_link_density.
- [2. Mở URL](https://tienphong.vn/ven-song-hong-duoc-quy-hoach-lai-nguoi-dan-ngoai-de-can-biet-gi-post1894525.tpo) — Media không có văn bản gốc đủ điều kiện. Mã: NEWS_MEDIA_WITHOUT_NATIVE_TEXT.
- [3. Mở URL](https://tienphong.vn/clip-o-to-tai-vuot-au-xo-nga-nhieu-nguoi-di-xe-may-post1894977.tpo) — Thân bài lẫn nhiều liên kết. Mã: body_link_density.
- [4. Mở URL](https://tienphong.vn/tai-xe-grab-keu-goi-tat-app-moi-cuoc-xe-nhan-duoc-bao-nhieu-post1875469.tpo) — Thiếu thân bài. Mã: missing_body.

### daidoanket.vn

- [1. Mở URL](https://daidoanket.vn/chua-tam-chuc-ve-dep-giua-non-nuoc-va-mien-tam-linh.html) — Thân bài lẫn nhiều liên kết. Mã: body_link_density.
- [2. Mở URL](https://daidoanket.vn/chu-tich-quoc-hoi-du-le-ky-niem-60-nam-thanh-lap-truong-dai-hoc-mo-dia-chat.html) — Thân bài lẫn nhiều liên kết. Mã: body_link_density.
- [3. Mở URL](https://daidoanket.vn/podcast-phat-huy-vai-tro-cua-nguoi-co-uy-tin-trong-chuyen-doi-so.html) — Media không có văn bản gốc đủ điều kiện. Mã: NEWS_MEDIA_WITHOUT_NATIVE_TEXT.
- [4. Mở URL](https://daidoanket.vn/dau-tu-cho-khoa-hoc-bang-tu-duy-dai-han.html) — Thiếu tiêu đề; Thiếu thân bài. Mã: missing_title,missing_body.
- [5. Mở URL](https://daidoanket.vn/short-quang-tri-sat-lo-gay-ach-tac-tuyen-quoc-lo15d.html) — Trang trả rỗng. Mã: empty_page.
- [6. Mở URL](https://daidoanket.vn/mua-thu-giua-khoi-xa.html) — Kiểm tra trường thất bại; chi tiết: missing_description. Mã: NEWS_FIELD_VERIFICATION_FAILED.

### plo.vn

- [1. Mở URL](https://tuoitre.vn/plo/cac-luu-y-phap-ly-cho-chu-nha-va-khach-luu-tru-tai-can-ho-du-lich-109907341.htm) — Chứng cứ ngày đăng mâu thuẫn. Mã: NEWS_PUBLICATION_EVIDENCE_CONFLICT.

### daibieunhandan.vn

- [1. Mở URL](https://daibieunhandan.vn/can-danh-gia-ky-tac-dong-cua-de-xuat-xoa-no-thue-10443909.html) — Thiếu thân bài. Mã: missing_body.
- [2. Mở URL](https://daibieunhandan.vn/tu-chu-truong-khuyen-khich-den-co-che-ton-vinh-trong-dung-va-bao-ve-can-bo-dam-doi-moi-vi-loi-ich-chung-bai-cuoi-neu-guong-bang-hanh-dong-do-luong-bang-ket-qua-10441406.html) — JSON-LD chưa gắn đúng URL bài. Mã: NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND.

### thoibaonganhang.vn

- [1. Mở URL](https://thoibaonganhang.vn/hinh-anh-cua-ban-dang-gia-trieu-do-tam-ho-chieu-mo-ra-ngan-co-hoi-175412.html) — Kiểm tra trường thất bại; chi tiết: missing_description. Mã: NEWS_FIELD_VERIFICATION_FAILED.
- [2. Mở URL](https://thoibaonganhang.vn/tri-tue-nhan-tao-trong-ngan-hang-nhung-quy-dinh-moi-can-biet-1691.media) — JSON-LD chưa gắn đúng URL bài. Mã: NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND.
- [3. Mở URL](https://thoibaonganhang.vn/emagazine-tai-chinh-toan-dien-khoi-thong-nguon-luc-kien-tao-nong-thon-thinh-vuong-ky-4-189960.html) — Thiếu thân bài. Mã: missing_body.

### thoibaotaichinhvietnam.vn

- [1. Mở URL](https://thoibaotaichinhvietnam.vn/ban-tin-tai-chinh-so-2-thang-11-2026-4672.media) — Thiếu tiêu đề. Mã: missing_title.

### bnews.vn

- [1. Mở URL](https://bnews.vn/xsst-18-11-ket-qua-xo-so-soc-trang-hom-nay-ngay-18-11-2026-xsst-ngay-18-11/442760.html) — JSON-LD chưa gắn đúng URL bài. Mã: NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND.
- [2. Mở URL](https://bnews.vn/photo/lung-linh-le-hoi-anh-sang-tai-seoul/155246/trang-1.html) — Chưa xác nhận múi giờ. Mã: NEWS_PUBLICATION_TIMEZONE_UNCONFIRMED.

### baotintuc.vn

- [1. Mở URL](https://baotintuc.vn/nguoi-dan-mong-muon-som-khoi-thong-loi-di-chung-tai-kenh-giao-chi-dong-thap-post1403517.html) — URL/canonical/định danh trang không thống nhất. Mã: NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT.
- [2. Mở URL](https://baotintuc.vn/lop-hoc-khiem-thi-trong-thoi-dai-so-post1392352.html) — URL/canonical/định danh trang không thống nhất. Mã: NEWS_PUBLICATION_PAGE_IDENTITY_CONFLICT.

### kinhtechungkhoan.vn

- [1. Mở URL](https://kinhtechungkhoan.vn/nong-dan-tre-xay-chuoi-gia-tri-dua-hat-gao-que-huong-vuon-xa) — HTTP 404. Mã: not_found.

### baoxaydung.vn

- [1. Mở URL](https://baoxaydung.vn/binh-dinh-khai-thac-khoang-san-vuot-phep-mot-doanh-nghiep-bi-phat-hon-1-ty-dong-192250514113953654.htm) — Kiểm tra trường thất bại; chi tiết: native_paragraph_coverage_requires_review. Mã: NEWS_FIELD_VERIFICATION_FAILED.
- [2. Mở URL](https://baoxaydung.vn/infographic-ha-noi-thuc-day-nguon-cung-nha-o-xa-hoi-192261116083438713.htm) — Media không có văn bản gốc đủ điều kiện. Mã: NEWS_MEDIA_WITHOUT_NATIVE_TEXT.
- [3. Mở URL](https://baoxaydung.vn/chang-dua-day-kich-tinh-tai-giai-thaco-marathon-vi-atgt-dien-bien-phu-nam-2024-192240414205828607.htm) — Thiếu thân bài. Mã: missing_body.
- [4. Mở URL](https://baoxaydung.vn/bo-xay-dung-192261030152912003.htm) — Thiếu tiêu đề; Thiếu thân bài. Mã: missing_title,missing_body.
- [5. Mở URL](https://baoxaydung.vn/doi-tuyen-viet-nam-lao-dao-truoc-vong-loai-world-cup-vi-thieu-dan-192231018123805555.htm) — JSON-LD chưa gắn đúng URL bài. Mã: NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND.

### 1thegioi.vn

- [1. Mở URL](https://1thegioi.vn/tram-tech-2026-sinh-vien-cham-hon-25-thuong-hieu-cong-nghe-ngay-tai-noi-o-261499.html) — Thiếu thân bài. Mã: missing_body.
- [2. Mở URL](https://1thegioi.vn/an-pham-thong-tin-va-phat-trien-thang-11-2026-giao-duc-mo-tu-tam-nhin-toan-cau-den-thuc-tien-261350.html) — Thiếu ngày đăng; Thiếu thân bài. Mã: missing_published_date,missing_body.

### nguoidothi.net.vn

- [1. Mở URL](https://nguoidothi.net.vn/trang-bi-cho-sinh-vien-kien-thuc-nang-luc-can-thiet-trong-thoi-dai-4-0-44303.html) — Thiếu tiêu đề; Thiếu ngày đăng. Mã: missing_title,missing_published_date.
- [2. Mở URL](https://nguoidothi.net.vn/luat-chung-khoan-54498.html) — Request timeout. Mã: request_deadline_exceeded.

### baodaklak.vn

- [1. Mở URL](https://baodaklak.vn/kinh-te/nong-nghiep-nong-thon/) — Selector ngày trỏ ngoài bài; Thiếu ngày đăng; Thiếu thân bài. Mã: publication_selector_points_outside_article,missing_published_date,missing_body.
- [2. Mở URL](https://baodaklak.vn/doc-bao-in/202611/bao-in-ngay-18112026-5436ade/) — Thiếu tiêu đề; Thiếu ngày đăng; Thiếu thân bài. Mã: missing_title,missing_published_date,missing_body.
- [3. Mở URL](https://baodaklak.vn/video/dak-lak-xanh/202611/video-tiet-kiem-nuoc-tuoi-tu-nhung-cach-lam-thiet-thuc-a1d1c84/) — Media không có văn bản gốc đủ điều kiện. Mã: NEWS_MEDIA_WITHOUT_NATIVE_TEXT.
- [4. Mở URL](https://baodaklak.vn/multimedia/Infographic/202611/infographic-dak-lak-phat-trien-kinh-te-bien-hien-dai-xanh-va-ben-vung-ee910f9/) — Chưa xác nhận dữ liệu thuộc chính bài. Mã: NEWS_PUBLICATION_OWNERSHIP_UNCONFIRMED.

### vneconomy.vn

- [1. Mở URL](https://vneconomy.vn/dau-an-kinh-te-the-gioi-tuan-8-14112026-ceo-nvidia-mat-chuc-trung-quoc-thang-du-thuong-mai-hon-1-nghin-ty-usd-gia-vang-giam-manh-nhat-4-thang.htm) — Thân bài lẫn nhiều liên kết. Mã: body_link_density.

### nld.com.vn

- [1. Mở URL](https://tuoitre.vn/nld/bi-an-ngoi-mo-co-doc-nhat-vo-nhi-o-viet-nam-196260219170928488.htm) — Media không có văn bản gốc đủ điều kiện. Mã: NEWS_MEDIA_WITHOUT_NATIVE_TEXT.

### vov.vn

- [1. Mở URL](https://vov.vn/emagazine/ban-chap-hanh-trung-uong-dang-1261070.vov) — Thiếu tiêu đề; Thiếu thân bài. Mã: missing_title,missing_body.
- [2. Mở URL](https://vov.vn/emagazine/ban-do-tinh-thanh-viet-nam-1209578.vov) — Thiếu tiêu đề. Mã: missing_title.
- [3. Mở URL](https://vov.vn/bao-in/an-pham-tieng-noi-viet-nam-so-462065-thu-nam-ngay-12112026-post1349432.vov) — Thiếu thân bài. Mã: missing_body.
- [4. Mở URL](https://vov.vn/van-hoa/am-nhac/muoi-chin-thang-tam-tu-buoc-chan-khoi-nghia-den-lan-song-tieng-noi-viet-nam-post1325336.vov) — Chuyển tới host chưa có cấu hình. Mã: NEWS_UNCONFIGURED_TARGET_HOST.

### en.vietnamplus.vn

- [1. Mở URL](https://en.vietnamplus.vn/unique-jrai-proposal-ceremony-revived-in-central-highlands-post335465.vnp) — Thiếu thân bài. Mã: missing_body.

## Bằng chứng

- [Kết quả 167 URL trước lượt bổ sung VOV](../outputs/customer-layout-repair-20261118/recheck-final.json).
- [VOV chuyển chuyên mục: đã đạt sau sửa](../outputs/customer-layout-repair-20261118/final-evidence/vov-alias-proof/pipeline-results.json).
- [Đối chiếu ES cuối](../outputs/customer-layout-repair-20261118/final-evidence/es-final-verification.json).
- [Hai bản ghi ban đầu](../outputs/customer-layout-repair-20261118/final-evidence/two-es-repair.json); [bổ sung giây VOV](../outputs/customer-layout-repair-20261118/final-evidence/vov-seconds-repair.json).
- [59 test](../outputs/customer-layout-repair-20261118/final-evidence/final-tests.tap).

Backup nội bộ VPS: /var/lib/news-flow/customer-layout-repair-20261118. Có bản gốc ES trước sửa, cập nhật có điều kiện version để tránh đè thay đổi đồng thời.
