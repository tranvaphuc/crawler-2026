# Triển khai sửa 7 bài báo — 19/11/2026

Đã triển khai lúc **18:00:19 ngày 19/11/2026 (giờ Việt Nam)**. Cả ba dịch vụ phát hiện URL, đọc bài và nhập dữ liệu hoạt động sau triển khai. Đã xác nhận **7/7 URL** bằng tìm kiếm chính xác trên ES5: mỗi URL có một bản ghi, có tiêu đề/nội dung và ngày đăng khớp bằng chứng gốc.

Release: `/opt/news-flow/releases/20261119-requested7-fixes-01`.
Index/type đã kiểm tra: `master202647/newsTopic`. Truy vấn đối chiếu năm URL người dùng vừa gửi: [check-5-links.http](../deploy/news-flow-requested7-20261119/check-5-links.http).

## Nguyên nhân đã xác nhận trên hệ thống đang chạy

- **Doanh nghiệp & Kinh doanh:** tên miền con chưa có trong registry, không có seed hay lịch sử xử lý URL. Bổ sung nguồn riêng, chín seed, H2 tiêu đề, sapo và nội dung gốc. Người dùng xác nhận giờ hiển thị là GMT+7 ngày 19/11; bằng chứng múi giờ được giới hạn đúng nguồn. Bài TTC dùng giờ hiển thị 13:20, không suy giờ từ chuỗi 13:18:49 trong URL.
- **Fili:** đã phát hiện URL lúc 18:35:12 ngày 18/11 nhưng bị giữ ở `NEWS_PUBLICATION_PAGE_IDENTITY_UNCONFIRMED`. Tiêu đề cấu hình lấy OG có hậu tố “| Fili”, không trùng H1; thời gian hiển thị chỉ là tuổi tương đối. Đã chuyển sang H1 và bổ sung adapter đối chiếu `publishTime` từ API in bài công khai với ID, URL, tiêu đề, khối bài và metadata publication có offset. Không lấy `modifiedTime` làm ngày đăng và không dùng tuổi tương đối.
- **Banker và Tài chính Công nghệ:** trên server đã có cấu hình hai nguồn. Khác với snapshot repository ban đầu, nguyên nhân production là toàn bộ 11 và 51 seed tương ứng bị giữ ở trạng thái lỗi sau HTTP 502; URL mới không được phát hiện. Kiểm tra trực tiếp xác nhận một số tuyến truy cập vẫn lỗi trong khi ba proxy được kiểm chứng trả 200 cho cả hai nguồn. Giới hạn riêng hai nguồn vào nhóm đã kiểm chứng; 502/503/504 của seed được thử ở vòng tiếp theo. Giữ nguyên bảo vệ lỗi bài, lỗi truy cập, 404 và trạng thái die. Tài chính Công nghệ ưu tiên ngày gốc trong NewsArticle của trang hiện tại, giữ feed làm phương án thay thế cho bố cục cũ. Trang chủ Tài chính Công nghệ tiếp tục chạm giới hạn phản hồi 5 giây trong kiểm tra production; đã bổ sung RSS công khai vốn có trong cấu hình vào bảng seed bền vững để phát hiện bài độc lập với trang chủ.
- **Dân trí, VietTimes:** đã lưu từ ngày 18/11, trước lần sửa này. Dân trí trễ khoảng 68 giây, VietTimes khoảng 348 giây so với metadata ngày đăng. Chuỗi ngày 17/11 trong URL Dân trí không phải thời điểm xuất bản được trang công bố.
- **Lao Động:** đăng lúc 07:16:42 ngày 19/11, phát hiện URL lúc 08:44:59, lưu lúc 08:45:08. Khoảng 88 phút nằm trước bước đọc bài; đọc/kiểm tra/lưu sau phát hiện khoảng 9 giây. Dữ liệu hiện có chưa phân biệt được thời điểm publisher thực sự đưa liên kết lên listing với lịch quét, nên không quy độ trễ này cho parser.

## Thời gian đối chiếu

Các mốc sau theo giờ Việt Nam. “Phát hiện trước sửa” lấy từ lịch sử luồng, không phải thời gian bắt đầu kiểm tra thủ công.

| Nguồn | Ngày giờ đăng | Phát hiện trước sửa | Ngày giờ lưu |
| --- | --- | --- | --- |
| Dân trí | 14:51:24 18-11 | 14:52:28 18-11 | 14:52:31 18-11 |
| VietTimes | 13:15:28 18-11 | 13:21:10 18-11 | 13:21:16 18-11 |
| Doanh nghiệp & Kinh doanh | 13:20:00 18-11 | Chưa phát hiện trước sửa | 18:00:44 19-11 |
| Fili | 18:29:02 18-11 | 18:35:12 18-11 | 18:00:45 19-11 |
| Tài chính Công nghệ | 19:48:18 18-11 | Chưa phát hiện trước sửa | 18:00:48 19-11 |
| Banker | 19:48:18 18-11 | Chưa phát hiện trước sửa | 18:00:49 19-11 |
| Lao Động | 07:16:42 19-11 | 08:44:59 19-11 | 08:45:08 19-11 |

Bốn URL thiếu được chạy lại qua đúng bộ xử lý production và hàng đợi writer. Biên nhận xác nhận cả bốn là `created`. Ba bài đã có giữ ngày lưu cũ. Không ghi trực tiếp để bỏ qua kiểm tra publication/nội dung.

## Đối chiếu ES5

| Nguồn | ID trong master202647/newsTopic |
| --- | --- |
| Dân trí | `8d49320f460a4fcda23f31ea86d6b484` |
| VietTimes | `1899c576dae9d3d51425cedff4512dd6` |
| Doanh nghiệp & Kinh doanh | `328250746c477900871f823e14855e1f` |
| Fili | `81aba64839fdd916fd1a593a783662db` |
| Tài chính Công nghệ | `57c7d57843eee7ed4e660b80eddbb200` |
| Banker | `f4879cfe84878d6873ca73b45673793f` |
| Lao Động | `be12a45278547841a788f0fbfb61b40c` |

Cả GET theo ID và `_search` theo URL đều đã kiểm tra. Trường `url` có kiểu `keyword`, dùng `term`/`terms` để đối chiếu chính xác. VietTimes được lưu ngày 18/11 nên bộ lọc chỉ lấy bản ghi ngày 19/11 sẽ không trả bài này.

Chỉ mục cấu hình `refresh_interval=60s`: sau khi writer xác nhận tạo bản ghi, GET theo ID đã có trong khi tìm kiếm có thể chưa thấy. Đã refresh riêng `master202647` và tìm lại đủ 7/7; không đổi chu kỳ refresh hiện tại.

## Kiểm thử và triển khai

- **136/136** kiểm thử trên máy chủ: bộ kiểm tra gốc, timezone có xác nhận, các snapshot/holdout, adapter Fili và cache key theo ID, khôi phục seed có giới hạn theo nguồn và giới hạn tuyến proxy.
- **101/101** kiểm thử hồi quy trong repository.
- **7/7** kiểm tra qua đúng HTTP/proxy/tài khoản dịch vụ trong state thử riêng trước khi kích hoạt.
- Kiểm tra discovery thật sau triển khai: Banker tìm 62 liên kết (34 mới); Doanh nghiệp & Kinh doanh tìm 44 liên kết (44 mới); RSS Tài chính Công nghệ tìm 30 liên kết. RSS đã được đăng ký bền vững để các vòng sau tiếp tục quét, trong khi trang chủ Tài chính Công nghệ vẫn có thể quá thời gian phản hồi.
- So sánh checksum mã gốc trước triển khai, tạo release riêng và chuyển symlink sau khi kiểm tra đạt. Script rollback lưu ở `/var/lib/news-flow/requested7-20261119/rollback.sh`.
- Không thay đổi UI. Không mở rộng quyền xác nhận múi giờ sang nguồn khác, không tự thay ngày gốc và không reset lỗi bài trên toàn hệ thống.

Gói triển khai, patch theo mã server, manifest và kết quả ES5 được lưu tại [deploy/news-flow-requested7-20261119](../deploy/news-flow-requested7-20261119/). Chứng cứ chi tiết nằm trong `outputs/news-requested-7-2026-11-19/deploy/` và `/var/lib/news-flow/requested7-20261119/` trên server.

Phạm vi xác nhận: bảy URL yêu cầu và các bài holdout đã kiểm tra; không phải xác nhận mọi bố cục hoặc toàn bộ lịch sử của từng nguồn.
