# Tài liệu API Crawler — Facebook, Threads, Instagram và YouTube

Tài liệu cập nhật ngày 24/10/2026. Bộ Postman có **9 đường dẫn API, 105 request mẫu, chia thành 12 thư mục**. Các tên trường, mã trạng thái và mã lỗi được giữ nguyên để bạn đối chiếu trực tiếp với JSON trả về.

## 1. Truy cập và xác thực

Bản triển khai ngày 24/10/2026 dùng chung địa chỉ **https://api-v1.oneforsl.net** cho cả 9 API. Không cần thêm cổng 3804/3805 khi gọi qua domain.

Mọi request, kể cả `/api/health`, bắt buộc gửi header:

```http
Authorization: Bearer <giá trị AUTHEN_KEY_FOR_DOMAIN của bạn>
Content-Type: application/json
```

Key lấy từ cấu hình riêng của bạn; tài liệu và bộ Postman không chứa giá trị thật. Key thiếu, sai, header không đúng định dạng hoặc trùng Authorization đều bị từ chối; key trong URL/body/`X-API-Key` không được dùng để xác thực. Lớp kiểm tra chạy trước khi đọc JSON hoặc gọi crawler. Dịch vụ từ chối khởi động nếu key trống hoặc cấu hình key không hợp lệ.

Dùng HTTPS khi gửi key. Bất kỳ ai có key đều có quyền gọi API, vì vậy chỉ giữ key trong môi trường riêng/Vault và thay key nếu bị lộ. Cơ chế hiện tại dùng một key dùng chung, chưa phải tài khoản người dùng hay phân quyền theo vai trò.

Trong Postman:

1. Import `Crawler-2026.postman_collection.json`.
2. Import và chọn `Crawler-2026-Server.postman_environment.json` để gọi server; chọn môi trường Local nếu tự chạy trên máy.
3. Điền giá trị thật vào biến `AUTHEN_KEY_FOR_DOMAIN` trong môi trường riêng. Collection dùng Bearer token và tự gửi header.
4. Kiểm tra `GET https://api-v1.oneforsl.net/api/health`: đúng key trả HTTP 200 với `{"status":"ok"}`; thiếu/sai key trả HTTP 401.
5. Chạy từng request mẫu; không export hoặc chia sẻ environment đã điền key thật.

Để chạy local, dùng hai tiến trình `npm run api:social` (127.0.0.1:3805) và `npm run api:facebook-share` (127.0.0.1:3804), hoặc chỉ dùng `npm run api:public` để phục vụ chung cả 9 API ở 127.0.0.1:3805. Tất cả đều cần `AUTHEN_KEY_FOR_DOMAIN` trong cấu hình. Không chạy `api:social` và `api:public` đồng thời trên cùng cổng. Không chạy `npm start`/`monitor` để chỉ phục vụ API vì ứng dụng cũ còn có queue.

Request thực thi bằng HTTP ẩn danh qua proxy, không mở Chrome mỗi lần gọi. Tab ẩn danh qua proxy chỉ dùng trong quá trình phát triển để quan sát và xác minh request của nền tảng. ES5 chỉ được đọc để tra cứu và ánh xạ ID. Bản triển khai này không cài Mongo/Redis hoặc khởi động crawler nền.

## 2. Danh sách API

Cột cổng dưới đây chỉ áp dụng khi chạy hai dịch vụ local cũ; qua domain dùng HTTPS cổng mặc định 443 cho tất cả API.

| Cổng local | Đường dẫn | Chức năng |
|---|---|---|
| 3804 | `/api/facebook/post/share` | Kiểm tra bài Facebook có phải bài chia sẻ hay không |
| 3804 | `/api/facebook/post/details` | Lấy chi tiết bài Facebook; có tùy chọn đầu ra theo mẫu ES5 |
| 3805 | `/api/social/post/metrics` | Lấy chỉ số tương tác của bài đăng |
| 3805 | `/api/social/source/posts` | Lấy bài đăng từ nguồn |
| 3805 | `/api/social/post/comments` | Lấy bình luận và trả lời của bài đăng |
| 3805 | `/api/social/search` | Tìm bài theo từ khóa trên Threads hoặc YouTube |
| 3805 | `/api/social/post/info` | Lấy thông tin bài đăng của bốn nền tảng |
| 3805 | `/api/social/comment/info` | Lấy thông tin một bình luận hoặc trả lời cụ thể |
| 3805 | `/api/social/resource/resolve` | Nhận diện nền tảng, loại tài nguyên và ID của nguồn/bài/bình luận |

Các request của hai API Facebook cũ đã có trong collection. Những ví dụ dưới đây tập trung vào cách dùng chung của các API social.

## 3. URL, ID hệ thống và ID của nền tảng

Bạn có thể dùng `url` hoặc `link`. Với các API social, trừ tìm kiếm, bạn cũng có thể truyền `id` dạng **chuỗi**, kèm `platform` và tùy chọn `type`, `index` để tra trong ES5.

```json
{
  "id": "6920202806_4000665603886005848",
  "platform": "instagram",
  "type": "snsTopic",
  "index": "master202643"
}
```

`platform` nhận một trong bốn giá trị: `facebook`, `threads`, `instagram`, `youtube`. Không truyền ID dài dưới dạng số JSON vì có thể mất độ chính xác.

| Loại | Dạng ID cần lưu ý |
|---|---|
| Bài Facebook | ID hệ thống thường là `owner_post` |
| Bình luận Facebook/Instagram | ID hệ thống thường là `post_comment` |
| Bài Instagram/Threads | ID hệ thống có thể là `user_media`; ID gốc của bài là phần media |
| YouTube | ID có thể chứa dấu gạch dưới; không tách theo quy tắc Facebook |
| Trả lời Threads | Là một bài đăng gốc của Threads; API thông tin bài/tương tác có thể đọc URL thuộc `threadsComment` |

`systemId` là ID hệ thống; `id` trong kết quả nhận diện là ID gốc khi đã có bằng chứng. Hai giá trị không phải lúc nào cũng giống nhau.

Mặc định bộ tra cứu đọc chính xác trong 12 index `master` mới nhất có dữ liệu. Với bản ghi cũ, nên truyền `index`. Không tìm thấy, kết quả không duy nhất, hoặc tra cứu chưa đầy đủ sẽ trả lần lượt HTTP 404, 409 hoặc 503; không tự đoán ID.

Nếu truyền đồng thời ID và URL thì chúng phải khớp. `systemIdentity` kiểm tra ID quan sát được với bản ghi ES5. `SYSTEM_ID_URL_MISMATCH` nghĩa là URL đang trả dữ liệu của tài nguyên khác; dữ liệu đó bị loại bỏ. `SYSTEM_NATIVE_ID_UNVERIFIED` nghĩa là phản hồi công khai chưa đủ bằng chứng xác nhận ID.

Facebook Page ID và Profile ID được giữ riêng. Đầu ra giữ Page ID chuẩn; truy vấn timeline có thể dùng Profile ID đã được xác minh liên kết với Page đó. Không mặc định số đầu tiên trong mọi URL `số_số` là ID nguồn đã xác minh.

## 4. Lấy bài đăng từ nguồn

Gọi `POST /api/social/source/posts`. Facebook hỗ trợ Page, User và Group. Threads/Instagram dùng nguồn tương ứng; YouTube hiện lấy danh sách Videos của kênh.

Ví dụ lấy tối đa 50 bài mới nhất của Facebook Page:

```json
{
  "url": "https://www.facebook.com/1794121197534939",
  "sourceType": "page",
  "count": 50,
  "limit": 20,
  "order": "latest"
}
```

Với Facebook, `sourceType` là `page`, `user` hoặc `group`. Có thể thay URL bằng `id` của nguồn, kèm `platform`, `type`, `index` như các request mẫu trong Postman.

Ví dụ giới hạn cả số lượng lẫn thời gian:

```json
{
  "url": "https://www.facebook.com/1794121197534939",
  "sourceType": "page",
  "count": 500,
  "limit": 100,
  "since": "2026-10-20T00:00:00+07:00",
  "order": "latest"
}
```

`since` hoặc tên thay thế `stopBefore` nhận thời gian ISO 8601 có múi giờ. Các bài có thời gian xác định và cũ hơn mốc sẽ bị loại. Chỉ dừng sớm ở bài cũ khi đã xác minh thứ tự duyệt theo thời gian; bảng tin xếp hạng hoặc bài ghim có thể làm thứ tự không liên tục.

Bài thiếu thời gian bị loại khỏi kết quả lọc ngày và được báo bằng `SOURCE_DATES_UNAVAILABLE`. Kiểm tra `dateFilter.verified` và `earlyStopVerified`; không xem một lượt lọc chưa xác minh là đã quét hết nguồn.

## 5. Lấy bình luận và trả lời

Gọi `POST /api/social/post/comments`:

```json
{
  "url": "https://www.instagram.com/p/DeFOCuYv75Y/",
  "count": 500,
  "limit": 100,
  "includeReplies": true,
  "order": "oldest"
}
```

- `includeReplies: true`: lấy cả bình luận gốc và trả lời nếu nền tảng cho phép truy cập.
- `order: "oldest"`: yêu cầu cũ nhất trước. Cần đọc phần xác minh thứ tự trong phản hồi.
- `count` tính chung bình luận gốc và trả lời.
- Muốn lấy mức tối đa của một lượt thu thập, điền `count: "all"`.

```json
{
  "url": "https://www.instagram.com/p/DeFOCuYv75Y/",
  "count": "all",
  "limit": 100,
  "includeReplies": true,
  "order": "oldest"
}
```

`"all"` có trần **20.000 bản ghi cho một lượt thu thập**, không có nghĩa là không giới hạn hay chắc chắn đầy đủ mọi bình luận. Với Facebook, chế độ toàn bộ bình luận phải được nền tảng xác nhận bằng `CHRONOLOGICAL_UNFILTERED_INTENT_V1`; nếu không hỗ trợ sẽ báo `COMMENT_SORT_UNAVAILABLE`, không âm thầm chuyển sang Most relevant.

Khi cần gom dữ liệu để sắp xếp cũ nhất trước, Facebook/YouTube có thể trả `phase: "collecting"`, `count: 0`, kèm `stagedCount` và `pagination.nextCursor`. Tiếp tục phân trang; số 0 ở bước này không có nghĩa bài không có bình luận.

## 6. Số lượng và phân trang

| Trường | Ý nghĩa |
|---|---|
| `limit` | Số bản ghi một trang, từ 1 đến 100 |
| `count` trong request | Tổng số bản ghi muốn lấy qua nhiều trang, từ 1 đến 20.000 hoặc `"all"` |
| `count` trong response | Số bản ghi trả ở phản hồi hiện tại |
| `pagination.nextCursor` | Mã dùng lấy trang tiếp theo |
| `limits.totalReturned` | Tổng đã trả trong lượt thu thập |
| `stopReason` | Lý do dừng theo chính sách/giới hạn |
| `coverage` | Mức độ đầy đủ đã xác minh |
| `ordering` | Thứ tự và mức độ xác minh thứ tự |

Để tương thích, `limit` từ 101 đến 20.000 được hiểu là tổng muốn lấy, với kích thước trang 100. `limit: "all"` cũng bật chế độ tối đa. Khi viết tích hợp mới, nên dùng `count` cho tổng và `limit` cho mỗi trang để rõ nghĩa.

Request đầu không có `cursor`. Request sau giữ nguyên các tham số và thêm cursor từ phản hồi trước:

```json
{
  "url": "https://www.instagram.com/p/DeFOCuYv75Y/",
  "count": "all",
  "limit": 100,
  "includeReplies": true,
  "order": "oldest",
  "cursor": "DÁN_GIÁ_TRỊ_pagination.nextCursor_VÀO_ĐÂY"
}
```

Trong Postman, chạy request `FIRST` trước, rồi `NEXT` tương ứng; collection tự lưu cursor. Cursor gắn với tài nguyên và các tham số `count`, `limit`, `order`, `includeReplies`, `since`. Không sửa tham số giữa các trang. Cursor lưu trong RAM, hết hạn sau 30 phút và mất khi dịch vụ khởi động lại.

`REQUESTED_COUNT_REACHED` chỉ nghĩa đã đạt số lượng yêu cầu, không chứng minh đã hết dữ liệu trên nền tảng. Một trang lọc ngày có thể rỗng với `phase: "filtering"`; tiếp tục nếu còn cursor. Khi có lỗi, `retryCursor` là vị trí thử lại riêng; chỉ dùng sau khi đã xử lý lỗi hoặc chờ hết thời gian yêu cầu.

Phản hồi lấy từ bộ đệm có thể ghi `cacheHit: true`, `sourceProxyUsed: true`, `proxyUsed: false`, `requests: 0`: dữ liệu đã được lấy qua proxy trước đó, lần đọc bộ đệm không phát sinh request mới.

## 7. Lấy tương tác và thông tin bài

Gọi `POST /api/social/post/metrics` với URL hoặc ID hệ thống:

```json
{
  "url": "https://www.youtube.com/watch?v=_Bs0iDvSXps"
}
```

API trả các chỉ số nền tảng thực sự cung cấp, có thể gồm reactions, shares, comments, views, saved, reshares hoặc repost. Không phải nền tảng nào cũng công khai tất cả chỉ số. Không dùng một chỉ số thay cho chỉ số khác, và không hiểu trường thiếu/chưa đọc được là 0.

Gọi `POST /api/social/post/info` với cùng dạng đầu vào để đọc thông tin bài. Dữ liệu bài nằm trong `post`; các trường thực tế phụ thuộc payload công khai. Với Facebook, các request share/details riêng trên cổng 3804 vẫn được giữ để kiểm tra bài chia sẻ và thông tin liên quan theo hợp đồng hiện có.

## 8. Lấy thông tin một bình luận cụ thể

Gọi `POST /api/social/comment/info`. Nên dùng ID hệ thống kèm `type`, `index` khi có:

```json
{
  "id": "4010681799144319866_18117754451045497",
  "platform": "instagram",
  "type": "snsComment",
  "index": "master202643"
}
```

Có thể dùng URL bình luận được nền tảng hỗ trợ, ví dụ YouTube có tham số `lc`. API cố gắng tìm đúng bình luận trong cửa sổ dữ liệu công khai có giới hạn; kết quả nằm trong `comment`. `COMMENT_NOT_IN_PUBLIC_WINDOW` không chứng minh bình luận đã bị xóa.

Trả lời Threads có cấu trúc URL như bài đăng; chỉ nhìn URL không phải lúc nào cũng xác định được vai trò bình luận. Bản ghi ES5 có thể cung cấp loại tương ứng.

## 9. Nhận diện nguồn, bài và ID

Gọi `POST /api/social/resource/resolve`:

```json
{
  "url": "https://www.facebook.com/1794121197534939",
  "kind": "source"
}
```

Khi tra bằng ID nguồn, bắt buộc truyền `kind: "source"`:

```json
{
  "id": "6920202806",
  "platform": "instagram",
  "kind": "source",
  "type": "snsTopic",
  "index": "master202643"
}
```

Các trường cần đọc: `platform`, `kind`, `type`, `id`, `systemId` khi xác minh được, `url`, `idVerified`, `evidence`, `verificationScope`, `liveStatus`.

`verificationScope: "stored_record"` và `liveStatus: "not_checked"` nghĩa là ánh xạ ID đã khớp bản ghi ES5, chưa xác nhận URL còn truy cập được hiện tại. Chỉ dựa vào tên hiển thị không đủ để khẳng định username hoặc ID. Với Instagram, tra nguồn bằng ID số phải đối chiếu ID tác giả và username của bài mẫu trước khi dựng URL nguồn.

## 10. Tìm kiếm từ khóa

Gọi `POST /api/social/search` cho Threads hoặc YouTube. Ví dụ yêu cầu 20 bài mới nhất:

```json
{
  "platform": "youtube",
  "keyword": "cà phê",
  "limit": 20,
  "order": "latest"
}
```

Có thể dùng `keywords` là danh sách từ 1 đến 10 từ khóa thay cho `keyword`; không dùng đồng thời hai trường. Chế độ nhiều từ khóa không nhận cursor chung; phản hồi có `results` và `unstartedKeywords` nếu phải dừng trước khi xử lý hết.

Khả năng xác minh sắp xếp mới nhất của tìm kiếm hiện còn hạn chế. Nếu không xác minh được, API báo trạng thái/lý do tương ứng; không coi kết quả xếp hạng liên quan là 20 bài mới nhất đã xác minh.

## 11. Đọc trạng thái và xử lý lỗi

Không chỉ dựa vào HTTP 200. Luôn đọc `status`, `reason`, dữ liệu, `coverage`, `ordering` và các trường xác minh ID.

| Trạng thái | Cách hiểu và xử lý |
|---|---|
| `ok` | Thao tác có kết quả hợp lệ; vẫn kiểm tra phạm vi/độ đầy đủ |
| `partial` | Chỉ lấy được một phần hoặc còn khả năng chưa xác minh |
| `resolved` | Nhận diện được tài nguyên; kiểm tra phạm vi bằng chứng |
| `unavailable` | Không lấy được dữ liệu trong điều kiện hiện tại; không đồng nghĩa đã xóa |
| `unauthorized` | HTTP 401: thiếu/sai Bearer key; kiểm tra cấu hình riêng, không gửi key qua URL/body |
| `invalid_input` | Đầu vào không hợp lệ; sửa trước khi gọi lại |
| `auth_required` | Nền tảng yêu cầu đăng nhập; dừng lượt đọc ẩn danh |
| `security_checkpoint` | Gặp yêu cầu kiểm tra bảo mật; dừng, không vượt chặn |
| `rate_limited` | Bị giới hạn; tuân thủ `Retry-After`/`retryAfterMs` |
| `proxy_error` | Lỗi kết nối/cấp proxy; kiểm tra cấu hình và nhà cung cấp |
| `busy` | Dịch vụ đang hết năng lực xử lý; chờ theo phản hồi |
| `error` | Có lỗi thực thi; đọc `reason`, giữ cursor phù hợp nếu có |

Không tự đổi proxy để vượt giới hạn nền tảng. Không coi lỗi, yêu cầu đăng nhập hay thiếu dữ liệu là nguồn die hoặc bài không có bình luận. Khi có `Retry-After`, chờ đủ trước khi thử lại.

## 12. Kết quả kiểm tra và giới hạn hiện tại

Đã lấy được 12 loại mẫu bài/bình luận từ ES5 cho bốn nền tảng, gồm Facebook Page/User/Group. Bộ kiểm thử mã nguồn hiện có 162/162 ca đạt. Collection có 105 request mẫu và 210 đoạn script đã được kiểm tra cú pháp, đồng thời hợp lệ theo schema Postman v2.1. Điều này không có nghĩa mọi request thực tế đều lấy được dữ liệu từ nền tảng.

Các lần chạy thực tế đã xác minh đường lấy nguồn, thông tin bài, tương tác và một số bình luận cụ thể. Hai mẫu bài/bình luận Threads lấy từ ES5 chưa đọc được qua dữ liệu công khai; nguồn Threads và bài đối chứng khác vẫn đọc được. Không kết luận hai mẫu đó đã bị xóa.

Những giới hạn cần giữ khi tích hợp:

- Không đảm bảo đọc được nội dung bị ẩn, riêng tư, đã xóa hoặc hạn chế theo quyền xem.
- Phân trang ẩn danh bổ sung của Threads/Instagram và một số thứ tự trả lời chưa được xác minh đầy đủ; kết quả có thể chỉ là cửa sổ công khai.
- Thứ tự cũ nhất và độ đầy đủ toàn bộ bình luận/trả lời chưa được chứng minh cho mọi nền tảng.
- YouTube lấy nguồn từ mục Videos; chưa gộp toàn bộ Shorts, phát trực tiếp và bài Community.
- Request mẫu hoặc truy vấn gốc của nền tảng có thể hết hiệu lực; khi đó API phải báo lỗi rõ ràng.
- Chế độ tối đa có trần 20.000; cần xem cursor, lý do dừng và phạm vi xác minh trước khi khẳng định đã lấy hết.

File `es5-samples.json` trong gói lưu mẫu tham chiếu. File `live-test-report.json` tổng hợp bằng chứng kiểm tra thực tế; các mã kỹ thuật trong JSON được giữ nguyên để phục vụ đối chiếu.
