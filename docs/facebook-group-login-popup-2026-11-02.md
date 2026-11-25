# Kiểm tra popup đăng nhập trên group 997265710295664

Ngày 02/11/2026, giờ Việt Nam. Group: [Xe Ghép - Xe Tiện chuyến Hà Nội - Thái Bình](https://www.facebook.com/groups/997265710295664).

## Quan sát trực tiếp

- Trong tab trình duyệt mới chưa đăng nhập, trang giữ URL group và hiện lời mời “See more on Facebook” có nút Close. Đóng lời mời bằng nút này hiển thị group Public và bài của Đào Tiến, permalink `https://www.facebook.com/groups/997265710295664/posts/29228833750045482/`. Đây là bằng chứng có bài công khai; không phải bằng chứng máy chủ nhận cùng phản hồi.
- Lần GET kiểm tra bằng executor/proxy manager hiện dùng trên production trả HTTP 302 từ URL group rồi HTTP 200 tại `/login/`. HTML cuối dài 360.130 byte, không có `group_feed` hoặc node có `post_id` trong các payload JSON đọc được. `facebookAnonymousContext` trả `AUTH_REQUIRED` do URL cuối là login, trước bước gọi GraphQL. Trường hợp này khác popup đặt trên feed.
- Probe với header desktop thông thường đầu tiên bị ngắt ở permit của request chuyển hướng (`PROXY_ENDPOINTS_UNAVAILABLE`); không dùng lần đó để kết luận về nội dung.
- Lần đối chiếu desktop sau đó hoàn tất: group trả HTTP 302 sang `/login/`, trang cuối HTTP 400, 1.542 byte, không có payload feed/post. Đổi riêng header desktop trong probe không khôi phục bài công khai. Probe không thay đổi header/config của worker đang chạy.

## Lịch sử group đọc lúc 12:22:27

| Vòng bắt đầu | Kết quả group | Bài quan sát được trong vòng |
|---|---|---:|
| 10:58:23 | Kết thúc 11:23:23, AUTH_REQUIRED | 6 |
| 11:24:20 | Kết thúc 11:48:51, AUTH_REQUIRED | 0 |
| 11:50:30 | Kết thúc 12:14:13, AUTH_REQUIRED | 0 |
| 12:15:22 | Chưa có kết quả kết thúc | 0 tại lúc đọc |

Nguồn: `flow_source_rounds`, `flow_source_round_results` và `flow_source_round_items` với đúng `roundId`, `sourceId`, `kind=post`. Kết quả AUTH_REQUIRED cuối vòng không đồng nghĩa cả vòng không từng thu được bài; vòng 10:58 là một ví dụ. Số bài quan sát là số được đưa vào luồng import, không chứng minh từng bài đã được ES ghi thành công.

## Kiểm thử điều kiện popup

Thêm `test/facebook-group-login-popup.test.mjs` với response fixture tự tạo, không sử dụng cookie hay token tài khoản:

1. Popup mời đăng nhập trên URL group, anonymous context hợp lệ và feed có bài: reader lấy được bài, giữ author/ngày đăng, tiếp tục cursor và lấy trang thứ hai.
2. Chuyển hẳn sang URL login: dừng trước GraphQL.
3. Bootstrap có popup nhưng native GraphQL thực sự từ chối đăng nhập: giữ kết quả AUTH_REQUIRED.

Chạy cùng các kiểm thử anonymous context, empty source, availability và post pagination: **37 đạt, 0 lỗi**. Kết quả này chứng minh luồng hiện tại không dừng chỉ vì một popup xuất hiện. Chưa có thay đổi runtime hay triển khai production trong lần kiểm tra này. Khác biệt phản hồi giữa trình duyệt và đường HTTP của máy chủ vẫn chưa được giải quyết hoặc xác định nguyên nhân; không suy diễn thành group riêng tư hay không có bài.

## Đối chiếu header lúc 12:25–12:28

Chrome Incognito Network ghi nhận GET đúng URL group trả **200**, HTML giải nén **1.229.329 byte**, `Set-Login: logged-out`. Request có cookie thiết bị `datr`, `sb`, `dpr`, `wd`; không sao chép giá trị cookie sang probe. Header navigation chính đã được đọc trực tiếp trong DevTools.

| Header | Crawler GET bootstrap thực tế | Chrome Incognito |
|---|---|---|
| User-Agent | Mozilla/5.0 | Chuỗi đầy đủ Chrome 156 / macOS |
| Accept | text/html | HTML/XHTML/XML, ảnh và các loại khác |
| Accept-Language | vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5 | Giống crawler |
| Accept-Encoding | gzip, deflate, br | Thêm zstd |
| Sec-Fetch-* | Không có | document / navigate / same-origin / ?1 |
| Sec-CH-UA* | Không có | Chromium/Chrome 156, macOS, desktop và các hints bổ sung |
| Upgrade-Insecure-Requests | Không có | 1 |
| Cookie ở request đầu | Jar mới, không có | Cookie thiết bị ẩn danh đã tồn tại |

Probe lúc **12:28:22** dùng **cùng endpoint proxy**, hai HTTP session với cookie jar mới. A dùng header bootstrap crawler; B thay User-Agent, Accept, Cache-Control, nhóm Sec-Fetch, client hints cơ bản và Upgrade-Insecure-Requests theo request Chrome quan sát được. Cả hai đều nhận **302 sang /login/** rồi **200**, không có feed/post trong HTML cuối (A 362.067 byte, B 375.961 byte).

Kết luận: có khác header, nhưng thay nhóm header này trên cùng proxy **chưa khắc phục**. Không loại trừ ảnh hưởng của cookie thiết bị, các hints/encoding chưa đối chiếu, HTTP/TLS stack hoặc đường mạng; chưa có bằng chứng quy nguyên nhân cho yếu tố cụ thể. Đây không phải phép sao chép toàn bộ request Chrome: không chuyển cookie/token, transport vẫn dùng encoding và HTTP stack của crawler. Không sửa cấu hình/header worker, không restart hay retry lại job trong production.

Evidence đã bỏ giá trị cookie: `outputs/facebook-group-header-audit-2026-11-02/evidence.json`.

## A/B bốn cookie Chrome ẩn danh lúc 12:36

Sau khi người dùng xác nhận rõ việc gửi tới `54.39.111.29`, probe dùng đúng bốn cookie thiết bị `datr`, `sb`, `dpr`, `wd` từ request Chrome đã quan sát. File tạm quyền 0600; không dùng cookie đăng nhập và không ghi giá trị cookie trong output.

Hai HTTP session bắt đầu với cùng bộ header desktop trên **cùng một lease/endpoint proxy**. A không có cookie Chrome, B thêm bốn cookie này; các cookie mới Facebook trả về được giữ riêng theo từng session. Cả hai đều chuyển hướng từ group sang `/login/`, kết thúc HTTP 200, không có feed/post trong payload JSON. A: 375.583 byte; B: 375.433 byte; cả hai không có actor đăng nhập.

Kết luận giới hạn: thêm bốn cookie ẩn danh **chưa giúp lấy được bài** với HTTP stack/proxy dùng trong phép thử. Chưa xác định được nguyên nhân khác biệt so với Chrome; không kết luận cookie không bao giờ ảnh hưởng hoặc proxy đã bị chặn. Không sửa runtime, không restart service hoặc nạp cookie vào worker.

Đã xác minh file cookie tạm **không còn tồn tại trên cả server lẫn máy local** sau thử nghiệm. Evidence chỉ lưu kết quả và tên cookie: `outputs/facebook-group-header-audit-2026-11-02/cookie-ab-result.json`.

## Toàn bộ request đã ghi từ Chrome, dùng proxy API riêng lúc 12:44

Phát lại đúng method GET, URL, **21 header thường** đã quan sát trực tiếp trong Chrome DevTools (bao gồm client hints đầy đủ, dpr, priority, viewport, zstd và bốn cookie thiết bị đã được duyệt). Header pseudo HTTP/2 được curl sinh theo URL/method. Chạy curl 8.18.0 trên server, hỗ trợ nghttp2/Brotli/zstd, không dùng HTTP/1.1 executor của các thử nghiệm trước. Request là navigation GET nên không có body. Không theo chuyển hướng, để quan sát phản hồi trực tiếp của URL group.

Proxy được cấp bằng **API credential**, `apiReserved=true`, `clientClass=api`. Trước cấp lease có 0 lease; sau cấp chỉ có 1 lease là probe, không có background lease. Generation 544 được cấp lúc 12:29:37 hôm nay; scope report gần nhất của key ở 13:12:28 ngày 01/11, trước generation hiện tại. Do đó chưa có report sử dụng ghi nhận trên generation này. Manager không có ledger request bất biến theo generation, và không chứng minh được lịch sử IP bên ngoài manager; không gọi đây là IP chưa từng được ai dùng.

Kết quả lúc **12:44:41**: curl thành công, **HTTP/2**, Facebook trả trực tiếp **302**, `Location` có path **/login/**, `Set-Login: logged-out`, **0 bài**. Chuyển toàn bộ header/cookie đã ghi sang proxy API này vẫn chưa khôi phục public feed. TLS/HTTP implementation của libcurl/OpenSSL vẫn khác Chromium; thử nghiệm chưa xác định nguyên nhân Facebook phân biệt hai đường đọc.

File request có cookie và dữ liệu response tạm được xóa sau probe; đã xác minh file request không còn ở local/server. Không sửa worker, không đưa cookie vào production. Evidence không chứa giá trị cookie: `outputs/facebook-group-header-audit-2026-11-02/full-api-request-result.json`.

## Request GraphQL do người dùng cung cấp, 13:17

Chạy nguyên POST `https://www.facebook.com/api/graphql/` từ file người dùng gửi, query `ProfileCometTimelineFeedRefetchQuery`, profile ID `100044286136937`, count 2 và cursor đã có. Không thay token/header/variables/cookie hoặc tạo bootstrap mới. Body 6.094 byte, SHA-256 `5e8c207f29631ffa64a32e0579b0035639a44cd97fc868cd2a3feba05247e3f1`. Đây là request ẩn danh (__user/av=0), chỉ có cookie thiết bị datr/sb/dpr/wd.

Chạy bằng curl qua proxy API reserved, generation 546, 0 lease trước thử. Kết quả: HTTP **200**, HTTP/2, **499.967 byte**, 9,824 giây. Dù Content-Type là text/html, body parse thành công **11 GraphQL JSON chunks**. Merge theo deferred path trả `node.timeline_list_feed_units` có đúng owner ID, 2 edges, `has_next_page=true` và end cursor.

Hai bài Beatvn parse được:

| Post ID | Giờ đăng Việt Nam | Likes | Comments | Shares |
|---|---|---:|---:|---:|
| 1826009128885274 | 12:40:36 ngày 02/11 | 1.784 | 166 | 12 |
| 1825994365553417 | 12:20:07 ngày 02/11 | 1.110 | 83 | 2 |

Có 2 GraphQL field_exception ở `save_info.save_flow`, không làm mất dữ liệu bài hoặc feed pagination. Kết quả này chứng minh request GraphQL được cung cấp vẫn đọc được feed **Beatvn** từ server qua proxy API; không chứng minh group Xe Ghép đã đọc được hoặc xác định nguyên nhân các GET bootstrap trước đó chuyển sang login.

File request chứa cookie/token và response thô tạm đã xóa trên server; bản request chuyển đổi local cũng đã xóa. Giữ nguyên attachment gốc của người dùng. Kết quả đã bỏ cookie/token: `outputs/facebook-group-header-audit-2026-11-02/user-graphql-result.json`.
