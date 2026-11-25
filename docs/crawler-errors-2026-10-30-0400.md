# Báo cáo lỗi crawler lúc 04:00 — 30/10/2026

**Cửa sổ lỗi chốt:** 30/10/2026 00:46:47.308 → 30/10/2026 04:00:20.967 ICT, tương đương 00:46:47 → 04:00:20 ngày 30/10/2026.

**Dữ liệu live bổ trợ:** queue/counter đọc lúc 30/10/2026 04:01:45.553; ES5 đọc lúc 30/10/2026 04:01:49.219. Các mẫu sau 04:00 dùng cho tình trạng hiện tại, không cộng vào số lỗi đã chốt.

[Toàn bộ 148 nhóm + 1–2 case thật mỗi nhóm](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md) · [CSV lọc theo queue/phase/code](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-groups.csv) · [Bằng chứng JSON đã khử bí mật](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-evidence.json)

## Việc cần xử lý trước

1. **P1 — đường TLS qua proxy:** 30.602 bản ghi request_error ở bước TLS bị reset, chiếm **87,9% các bản ghi request_error**, trung bình **24,33 giây/lần**. Chưa xác định được bên nào cắt kết nối; không kết luận mọi proxy hỏng hoặc platform chặn IP.
2. **P1 — author UID:** 1.226 job không lấy được UID có bằng chứng, cộng 1 job profile HTTP 500. Các job fail này liên quan **1.126 profile key khác nhau**. Cần kiểm tra parser/route profile; không điền authorId từ source hay parent.
3. **P1 — khoảng trống chẩn đoán:** 3.641 request_error trước CONNECT không có native code; 1.831 quan sát timeout ở phase unobserved; 12 lỗi API Threads trong HTTP 200 chưa giữ native API code. Các nhóm này được giữ riêng, chưa thể chốt nguyên nhân sâu.
4. **P1 — FB reply backlog:** pending tăng **7.827 → 10.094** trong cửa sổ; worker reply vẫn đủ 70. Cần xử lý tốc độ đọc/tỷ lệ retry và tốc độ phát sinh reply job. Import ES5 hiện không phải nút thắt quan sát được.
5. **P2 — dữ liệu/reader:** hai post Instagram có createdAt=null bị chặn đúng validation; một Threads reply thiếu đường phân trang native; 24 request báo lease hết hạn khi wire đã đủ cần xem ranh giới TTL với decode/drain.

Đây là phiên **chỉ thu thập và báo cáo**. Không đổi retry/concurrency, không restart, không clear/retry thêm job trong phiên 04:00. Những đề xuất dưới đây chưa được triển khai.

## Cách đếm và độ đầy đủ

| Mức quan sát | Số bản ghi | Ý nghĩa |
|---|---:|---|
| request_error | 34.817 | Request HTTP/transport được quan sát lỗi, kể cả khi lượt đọc sau đó phục hồi |
| read_retry | 61.706 | Lượt đọc thất bại chuyển sang retry, có cả auth/API/HTTP/network |
| read_failure | 5.495 | Lượt đọc kết thúc không thành công; phần lớn được policy đánh dấu done/skipped |
| job_failed | 1.234 | Ticket kết thúc fail, gồm 1.227 UID và 7 job của main worker |

**Không cộng bốn hàng thành số request độc lập.** Có 103.252 bản ghi quan sát ở nhiều mức. 102.025 event của main worker trong journal + 1.227 event UID local khớp đúng 103.252 event ledger. Không thấy worker_error, counter_error, feeder_error hoặc error_event_store_failed trong cửa sổ; log UID cũng không có lỗi lưu telemetry. Không đo tổng số HTTP request thành công nên không tính được tỷ lệ lỗi HTTP trên toàn bộ traffic.

Đã xác minh riêng một chuỗi redirect có hai request_error record (cha HTTP 301 và request con reset khi chờ header) cho một chuỗi thất bại. Do đó 34.817 là số bản ghi quan sát, không khẳng định 34.817 sự cố kết nối độc lập.

Có **148 groupKey theo ngữ cảnh** và **79 chữ ký lỗi đầy đủ khi bỏ riêng queue/platform**. Alias NETWORK_ERROR của reader và UPSTREAM_NETWORK_ERROR của transport vẫn tách theo mức quan sát. Mỗi nhóm giữ nguyên phase, code gốc, native code, CONNECT/HTTP status, API code, operation/query/stage, exception/cause, encoding và wire state. Phụ lục không gộp các reset TLS/header/body thành một ECONNRESET.

Các nhóm ví dụ chỉ có một job được ghi rõ “1 job”; không tạo thêm case giả. Trường `—` là chưa ghi hoặc không áp dụng, tuyệt đối không đồng nghĩa bằng 0 hay thành công. Các case chỉ giữ đường dẫn công khai và metadata, không có cookie/token/body hay credential proxy.

## Các lỗi request phân biệt theo nơi xảy ra

| Phase | Native / HTTP | request_error | Thời gian TB | Bằng chứng và cách phân biệt |
|---|---|---:|---:|---|
| `proxy_tls` | `ECONNRESET` / HTTP `—` | 30.602 | 24,33 s | Chưa có HTTP response; reset khi TLS qua tunnel chưa xong. |
| `proxy_connect` | `—` / HTTP `—` | 3.641 | 20,90 s | Chưa ghi CONNECT/socket origin; native code còn thiếu. |
| `http_response` | `—` / HTTP `429` | 327 | 1,07 s | Origin HTTP 429; code chủ động bỏ body. |
| `response_headers` | `ECONNRESET` / HTTP `—` | 216 | 0,72 s | Socket/TLS đã có, chưa nhận header; nhiều case reuse. |
| `response_body` | `PROXY_EXPIRED` / HTTP `200` | 24 | 5,47 s | 24/24 wireComplete=true; TTL timer, chưa xác nhận decode kết thúc. |
| `response_body` | `ECONNRESET` / HTTP `200` | 3 | 19,45 s | 3 event, wireComplete=false: body chưa đủ. |
| `http_response` | `—` / HTTP `500` | 2 | 2,22 s | HTTP 500 thật; alias retry được đếm ở mức khác. |
| `response_body` | `ECONNRESET` / HTTP `301` | 1 | 35,55 s | 1 event cha redirect; phải đối chiếu lỗi request con. |
| `proxy_tls` | `PROXY_EXPIRED` / HTTP `—` | 1 | 2,01 s | Lease timer hết hạn trong TLS, khác reset native. |

Native ECONNRESET cho biết kết nối bị peer đóng cưỡng bức, không chỉ đích danh proxy hay origin. Trong báo cáo, vị trí TLS/header/body đến từ trace thực tế; không suy ra chủ thể gây lỗi từ errno. [Tài liệu Node.js 24 về system errors](https://nodejs.org/docs/latest-v24.x/api/errors.html#common-system-errors).

## Giải thích, giới hạn và việc cần làm theo từng loại

### 1. Reset trong TLS qua tunnel

RQ=30.602; RT=30.597; RF=2; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa kết luận được:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

Đây là nhóm chiếm phần lớn thời gian chờ quan sát được. Với riêng step mất trung bình 24,33 s, chuỗi 100 lần retry có thể tiêu khoảng 40 phút cho một job; đây là ước tính theo thời gian step, không phải thời gian đo được cho mọi job. Cần so theo endpoint hash/target/operation trước khi quy lỗi nhà cung cấp hay platform.

**Case thật và ngữ cảnh chi tiết:** [G003](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:151), [G005](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:289), [G006](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:356), [G007](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:423), [G008](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:490), [G009](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:557), [G010](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:622), [G011](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:687) … (18 nhóm; xem phụ lục đầy đủ).

### 2. Thất bại trước CONNECT, thiếu native cause

RQ=3.641; RT=3.640; RF=1; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa kết luận được:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

**Case thật và ngữ cảnh chi tiết:** [G026](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1684), [G027](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1751), [G028](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1818), [G029](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1885), [G030](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1952), [G032](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2088), [G033](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2153), [G035](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2287) … (16 nhóm; xem phụ lục đầy đủ).

### 3. Reset khi chờ response header

RQ=216; RT=216; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa kết luận được:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

**Case thật và ngữ cảnh chi tiết:** [G047](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3075), [G054](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3536), [G055](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3601), [G065](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4265), [G066](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4334), [G079](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5188), [G082](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5389), [G083](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5456) … (20 nhóm; xem phụ lục đầy đủ).

### 4. Reset giữa body HTTP 200

RQ=3; RT=3; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Đã có HTTP 200 và nhận được một phần bytes, sau đó reset; wireComplete=false cho thấy body chưa được xác nhận đủ.

**Chưa kết luận được:** Không phải reset CONNECT/TLS. Content-Encoding br không đồng nghĩa lỗi giải nén: không có native Z_DATA_ERROR/Brotli decode error.

**Hướng xử lý:** Đối chiếu responseAborted, byte counts và route; không parse body thiếu thành dữ liệu hoàn chỉnh. Thử lại cùng request shape có kiểm soát và giữ cursor.

**Case thật và ngữ cảnh chi tiết:** [G114](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7461), [G117](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7665), [G135](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8714), [G140](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8994).

### 5. Event redirect HTTP 301 truyền lỗi request con

RQ=1; RT=0; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Response cha HTTP 301 đã complete nhưng được gắn lỗi khi request redirect con thất bại. Đây là ca cần xem liên kết redirect, không mặc định là mất body 301.

**Chưa kết luận được:** Transport truyền exception từ request con vào finish của cha; nhãn phase của cha có thể gây hiểu nhầm. Không tính parent và child thành hai sự cố độc lập.

**Hướng xử lý:** Liên kết parentRequestId/causeRequestId; đối chiếu trace cùng job và trình bày lỗi con là nguyên nhân quan sát chính. Không sửa runtime trong phiên báo cáo này.

**Case thật và ngữ cảnh chi tiết:** [G133](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8598).

Đối chiếu bổ sung cùng job `17a618c59eb29e61dac213d1973adf542ac27fdd10ffacc1187a7780347fa3a8` lúc **01:54:34 ICT**: request cha số 1 có HTTP 301, wireComplete=true và elapsed=35.549 ms. Request con số 2 tới `https://www.facebook.com/groups/otoplusvn/posts/29475038065491446/` bị ECONNRESET khi **chờ header**, elapsed=25.613 ms; read_retry cũng xác nhận phase=response_headers. Vì vậy event body/301 là lỗi truyền từ request con, không phải body 301 bị đứt. Hai request_error record này thuộc cùng chuỗi thất bại; giữ nguyên số bản ghi nhưng không tính thành hai sự cố độc lập. Chưa xác định peer cắt request con.

### 6. Timeout không có phase quan sát

RQ=0; RT=1.829; RF=1; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa kết luận được:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

**Case thật và ngữ cảnh chi tiết:** [G019](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1215), [G048](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3142), [G049](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3205), [G050](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3266), [G059](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3871), [G074](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4867), [G091](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5994), [G100](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6591).

### 7. Timeout trong read_work

RQ=0; RT=62; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Lượt đọc chạm timeout tại read_work; transport có mã UPSTREAM_TIMEOUT và không có HTTP response hoàn chỉnh gắn cho lỗi.

**Chưa kết luận được:** read_work chưa tách được bước con trong adapter; chưa có bằng chứng errno của socket.

**Hướng xử lý:** Tách budget toàn lượt với timeout từng request/permit và thêm stage con; so checkpoint đang giữ trước khi thay đổi timeout.

**Case thật và ngữ cảnh chi tiết:** [G056](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3666).

### 8. Timeout sau timing cuối HTTP 200 đã complete

RQ=0; RT=1; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Lượt đọc báo timeout trong khi timing cuối cùng là HTTP 200, wireComplete=true và decodedEndedMs đã có. Request cuối được ghi nhận đã hoàn tất.

**Chưa kết luận được:** Không thể suy ra timeout của chính response 200 này; có thể là budget toàn lượt đọc hoặc bước tiếp theo không được ghi trace.

**Hướng xử lý:** Đánh dấu deadline scope, bắt đầu/kết thúc từng parser và request tiếp theo; liên kết timeout với request ID. Không diễn giải thành mất body hay HTTP timeout đã được chứng minh.

**Case thật và ngữ cảnh chi tiết:** [G129](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8381).

### 9. Origin HTTP 429

RQ=327; RT=327; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa kết luận được:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

327 request_error được ghi cho HTTP 429; 302 RT mang UPSTREAM_HTTP_429 và 25 RT mang HTTP_429 là cách gói ở reader khác nhau. Không có proxy CONNECT 429 trong cửa sổ này.

**Case thật và ngữ cảnh chi tiết:** [G042](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2746), [G043](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2811), [G051](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3329), [G060](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3934), [G062](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4068), [G064](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4200), [G072](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4730), [G075](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4928) … (10 nhóm; xem phụ lục đầy đủ).

### 10. Facebook GraphQL rate limit, API 1675004 trong HTTP 200

RQ=0; RT=1.201; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Facebook GraphQL trả lỗi được reader phân loại rate limit bên trong HTTP 200; native API code được giữ là 1675004, query CommentListComponentsRootQuery.

**Chưa kết luận được:** Chưa giữ native message chi tiết, nên không gán nghĩa mở rộng cho riêng mã 1675004 ngoài classifier hiện tại; không phải HTTP 429.

**Hướng xử lý:** Đối chiếu native error envelope/query và áp lực theo operation. Xác nhận cách chờ/Retry-After phù hợp trước khi đổi policy; không xem tất cả là lỗi TCP/TLS.

**Case thật và ngữ cảnh chi tiết:** [G023](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1483), [G090](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5923).

### 11. Facebook source rate limit, native API code chưa ghi

RQ=0; RT=204; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Reader Facebook source phân loại rate limit trong HTTP 200, nhưng native API code không được giữ ở biến thể này.

**Chưa kết luận được:** Không đủ thông tin để nói nó trùng API 1675004 của comment; cần giữ riêng nhóm apiCode chưa ghi.

**Hướng xử lý:** Giữ error.code/subcode và dấu hiệu thông báo đã khử bí mật từ source adapter; đối chiếu request shape và hạn mức source.

**Case thật và ngữ cảnh chi tiết:** [G044](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2878), [G105](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6909), [G122](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7969), [G136](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8771).

### 12. Auth gate HTTP 200 ở bootstrap

RQ=0; RT=23.490; RF=4.692; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa kết luận được:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

Có 28.182 lượt đọc auth gate: 23.490 retry và 4.692 kết thúc theo policy. Đây không phải 28.182 ticket fail. Không có mẫu source_restriction confirmed=true trong nhóm auth; các cổng sau khi đã có dữ liệu công khai vẫn không chứng minh source private.

**Case thật và ngữ cảnh chi tiết:** [G001](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:11), [G002](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:80), [G004](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:218), [G016](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1016), [G034](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2218), [G052](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3396), [G057](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3727), [G058](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3798) … (10 nhóm; xem phụ lục đầy đủ).

#### Auth theo bằng chứng (không gộp “đòi login” thành private)

| Queue | Classification / stage | Confirmed | Lượt đọc |
|---|---|---|---:|
| `facebook-comment` | `unverified` / `initial` | false | 9.051 |
| `facebook-reply` | `unverified` / `initial` | false | 7.130 |
| `facebook-group-source` | `unverified` / `initial` | false | 6.818 |
| `facebook-group-source` | `login_after_public_data` / `after_public_data` | false | 2.812 |
| `facebook-page-source` | `unverified` / `initial` | false | 1.808 |
| `facebook-user-source` | `unverified` / `initial` | false | 435 |
| `facebook-page-source` | `login_after_public_data` / `after_public_data` | false | 119 |
| `instagram-source` | `login_after_public_data` / `after_public_data` | false | 17 |
| `facebook-user-source` | `login_after_public_data` / `after_public_data` | false | 9 |
| `instagram-comment` | `login_after_public_data` / `after_public_data` | false | 7 |
| `instagram-source` | `unverified` / `initial` | false | 3 |

### 13. Login/checkpoint Meta sau body 200

RQ=0; RT=26; RF=1; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Reader Meta nhận diện login/checkpoint trong body HTTP 200; một số case xảy ra sau khi đã nhận dữ liệu công khai.

**Chưa kết luận được:** Không có source_restriction confirmed=true; chưa chứng minh source private hay endpoint bị chặn.

**Hướng xử lý:** Phân biệt login, checkpoint và gate sau dữ liệu bằng tín hiệu native đã khử bí mật. Đối chiếu cùng source/route, không suy ra privacy từ một trang login.

**Case thật và ngữ cảnh chi tiết:** [G070](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4596), [G094](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6185).

### 14. Comments không khả dụng ở query root

RQ=0; RT=0; RF=567; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Native Facebook response không cung cấp comments/replies dùng được ở query CommentListComponentsRootQuery trong HTTP 200; policy hiện tại kết thúc job.

**Chưa kết luận được:** Không chứng minh comment count bằng 0, bài đã xóa hoặc source private. Chưa có raw error envelope để chốt lý do không khả dụng.

**Hướng xử lý:** Mở case tương ứng và kiểm tra native connection/error envelope, quyền anonymous và query root/reply. Giữ dữ liệu hợp lệ đã đọc; không đổi unavailable thành empty-success.

**Case thật và ngữ cảnh chi tiết:** [G031](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2019).

### 15. Replies không khả dụng ở query depth-1

RQ=0; RT=0; RF=40; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Native Facebook response không cung cấp comments/replies dùng được ở query Depth1CommentsListPaginationQuery trong HTTP 200; policy hiện tại kết thúc job.

**Chưa kết luận được:** Không chứng minh comment count bằng 0, bài đã xóa hoặc source private. Chưa có raw error envelope để chốt lý do không khả dụng.

**Hướng xử lý:** Mở case tương ứng và kiểm tra native connection/error envelope, quyền anonymous và query root/reply. Giữ dữ liệu hợp lệ đã đọc; không đổi unavailable thành empty-success.

**Case thật và ngữ cảnh chi tiết:** [G061](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3999).

### 16. Public items không trả về

RQ=0; RT=0; RF=135; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Reader không nhận được các item công khai mong đợi tại operation comments dù HTTP 200; job kết thúc theo policy.

**Chưa kết luận được:** Có thể là không có dữ liệu trong phạm vi đọc, gate, cấu trúc khác hoặc thiếu item; telemetry hiện tại chưa chứng minh riêng nguyên nhân nào.

**Hướng xử lý:** Đối chiếu native end/empty proof, identity, publication window và container item trong case. Không coi HTTP 200 hay việc job completed là bằng chứng crawl đủ.

Phụ lục giữ riêng bootstrap/source/comments và từng platform. Không kết luận tất cả các trường hợp là empty source hợp lệ.

**Case thật và ngữ cảnh chi tiết:** [G053](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3469), [G063](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4135), [G067](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4399), [G102](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6714), [G103](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6782), [G120](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7850).

### 17. Public data comment không trả về

RQ=0; RT=0; RF=29; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Không có dữ liệu comment công khai dùng được trong HTTP 200; policy kết thúc lượt đọc.

**Chưa kết luận được:** Chưa tách được empty hợp lệ, giới hạn anonymous hay parser không thấy node cần lấy.

**Hướng xử lý:** Ghi end/empty proof và native container/error envelope, so parent binding và cursor trong case; giữ trạng thái không xác nhận coverage.

**Case thật và ngữ cảnh chi tiết:** [G068](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4466), [G086](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5653).

### 18. Feed Facebook không khả dụng

RQ=0; RT=0; RF=15; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Reader Facebook không có feed công khai dùng được trong HTTP 200 ở source này.

**Chưa kết luận được:** Không đồng nghĩa source không tồn tại, bị xóa hoặc private; không có bằng chứng native đủ cho kết luận đó.

**Hướng xử lý:** Kiểm tra route source, canonical binding và native feed/error node bằng case công khai, giữ nhóm unavailable riêng khỏi HTTP lỗi.

**Case thật và ngữ cảnh chi tiết:** [G092](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6057), [G098](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6459), [G126](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8217).

### 19. Threads API error trong HTTP 200, thiếu API code

RQ=0; RT=0; RF=12; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Reader báo lỗi với chữ ký đã ghi trong bảng dưới.

**Chưa kết luận được:** Bằng chứng chưa đủ để kết luận nguyên nhân sâu hơn.

**Hướng xử lý:** Đối chiếu metadata và native response của 1–2 case; bổ sung trường còn thiếu trước khi sửa policy.

Đã đối chiếu publicApiIssue trong socialApiErrors.js: adapter hiện trả status/reason nhưng không giữ code/message của native envelope. Vì vậy 12 lỗi này chưa thể phân loại sâu chỉ từ log hiện có. Cần giữ native code/subcode và dấu hiệu thông báo đã khử bí mật khi sửa adapter sau phiên báo cáo.

**Case thật và ngữ cảnh chi tiết:** [G078](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5123), [G139](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8940).

### 20. Proxy manager unavailable lúc assignment

RQ=0; RT=37; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Client không hoàn tất thao tác xin proxy/lease với proxy manager.

**Chưa kết luận được:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

**Case thật và ngữ cảnh chi tiết:** [G069](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4535), [G101](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6652), [G104](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6848), [G108](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7106), [G130](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8436), [G137](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8827), [G142](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9107), [G147](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9378).

### 21. Proxy manager unavailable trong read_work

RQ=0; RT=1; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Lỗi proxy manager nổi lên trong read_work; mã tổng hợp có nhưng không có timing request manager chi tiết.

**Chưa kết luận được:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

**Case thật và ngữ cảnh chi tiết:** [G144](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9214).

### 22. Lease hết hạn tại heartbeat

RQ=0; RT=37; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Lease đã hết hạn khi kiểm tra heartbeat trước khi tiếp tục đọc; đây là vòng đời lease, không phải lỗi HTTP response.

**Chưa kết luận được:** Không có bằng chứng target platform lỗi; thời điểm hết hạn không đo được từ body do chưa có request mới.

**Hướng xử lý:** Đối chiếu expiresAt/heartbeat và thay lease theo policy giữ cursor. Phân loại như sự kiện vòng đời cần theo dõi, tách khỏi sự cố mạng.

**Case thật và ngữ cảnh chi tiết:** [G080](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5259), [G084](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5523), [G093](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6124), [G107](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7043), [G109](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7169), [G145](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9266).

### 23. Lease hết hạn khi body wire đã đủ

RQ=24; RT=24; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Timer hết hạn lease/proxy khi xử lý response body. Trong 24 request_error của nhóm này, HTTP 200 và wireComplete=true: dữ liệu wire đã nhận đủ.

**Chưa kết luận được:** Không phải bằng chứng socket bị reset hay proxy provider từ chối. decodedEndedMs chưa có ở các case kiểm tra; chưa phân biệt được drain/decode chậm hay TTL còn quá ít.

**Hướng xử lý:** Kiểm tra TTL còn lại trước request và ranh giới đóng lease với giải nén xong. Bảo toàn cursor, cân nhắc đổi lease trước khi bắt đầu request gần hết TTL; không gộp với Z_DATA_ERROR hay ECONNRESET.

Ví dụ G076 nhận wire xong ở 1.739 ms, timer phát lúc 2.210 ms, HTTP 200/br, wireComplete=true và chưa có decodedEndedMs. G071 có wireBufferedBytes=12.803. Đây là bằng chứng cần xem drain/decode/TTL, không phải bằng chứng Z_DATA_ERROR.

**Case thật và ngữ cảnh chi tiết:** [G071](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4665), [G076](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4993), [G077](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5058), [G106](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6976), [G121](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7915).

### 24. Lease hết hạn trong TLS

RQ=1; RT=1; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Lease/proxy chạm hạn khi còn ở bước TLS qua tunnel; event có elapsedMs và chưa có HTTP response.

**Chưa kết luận được:** Khác với native reset TLS; mã này do timer/TTL của ứng dụng, không chứng minh peer chủ động cắt kết nối.

**Hướng xử lý:** Kiểm tra TTL trước CONNECT/TLS và lifecycle release, giữ riêng khỏi nhóm TLS ECONNRESET.

**Case thật và ngữ cảnh chi tiết:** [G112](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7352).

### 25. Lease hết hạn chưa có phase hoặc trong read_work

RQ=0; RT=8; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** Reader hoặc transport báo lease/proxy hết hạn, nhưng phase hiện tại chưa định vị thêm được.

**Chưa kết luận được:** Thiếu mốc expiresAt và bước con nên chưa xác nhận nó hết hạn trước hay sau request.

**Hướng xử lý:** Ghi TTL và lifecycle stage vào event, giữ nguyên phân loại chưa xác định thay vì đoán lỗi socket.

**Case thật và ngữ cảnh chi tiết:** [G110](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7230), [G111](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7291), [G127](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8274), [G132](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8545).

### 26. HTTP 500 ở source/reply

RQ=2; RT=2; RF=0; JF=0. Các mức không được cộng thành request độc lập.

**Quan sát:** HTTP 500 đã được ghi nhận ở operation replies, khác với TLS hoặc API lỗi trong HTTP 200.

**Chưa kết luận được:** Không có native body/request ID để quy trách nhiệm backend platform hay intermediary; đây là response 500 thực sự được quan sát.

**Hướng xử lý:** Đối chiếu route và request ID đúng case; kiểm tra lại sau có giới hạn. Alias request_error và read_retry có thể là hai lớp của cùng một lỗi, không cộng thành hai request.

Chỉ thấy 2 request_error HTTP 500 trong main worker; có thêm 1 lỗi HTTP 500 của UID ở mục riêng bên dưới. Không gộp hai operation này.

**Case thật và ngữ cảnh chi tiết:** [G125](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8160), [G128](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8326), [G143](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9160), [G148](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9431).

### 27. UID profile không trả numeric author ID có chứng cứ

RQ=0; RT=0; RF=0; JF=1.226. Các mức không được cộng thành request độc lập.

**Quan sát:** Worker UID không thu được numeric author ID có bằng chứng khớp chính profile. Theo nhánh code, phản hồi profile phải là HTTP 200 mới ra mã này; telemetry của lỗi này chưa lưu riêng status/response hash.

**Chưa kết luận được:** Không có failed-response snapshot nên chưa phân biệt được schema profile mới, thiếu preload, route khác hoặc nội dung không cung cấp UID. Không chứng minh author bị xóa hay tài khoản riêng tư.

**Hướng xử lý:** Kiểm tra hai profile opaque trong case, ghi response hash/canonical route/số UID candidate của snapshot fail; đối chiếu parser profileUidFromSnapshot và fallback GraphQL có sẵn. Chỉ dùng UID có bằng chứng, không lấy siteId/parentId làm authorId.

Có 1.226 job fail trong nhóm, trên tổng 1.227 UID job fail. 1.126 profile key riêng trong các UID failure; profile nhiều nhất lặp 4 job. Hai case trong phụ lục có author.id=null và opaqueId=pfbid…; link profile lookup đã dựng đúng hàm uidLookupUrl. Chưa có failed snapshot nên không bịa nguyên nhân HTML cụ thể.

**Case thật và ngữ cảnh chi tiết:** [G022](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1406).

### 28. UID profile HTTP 500

RQ=0; RT=0; RF=0; JF=1. Các mức không được cộng thành request độc lập.

**Quan sát:** Lượt lấy profile của worker UID nhận HTTP 500. Đây là lỗi HTTP ở bước lookup profile, tách khỏi thiếu UID trong HTTP 200.

**Chưa kết luận được:** Không có response body lỗi đã khử bí mật nên chưa biết backend platform, route hay tầng trung gian nào trả 500.

**Hướng xử lý:** So cùng profile qua phiên/route khác khi điều tra, giữ status và request ID nếu upstream có. Không chuyển thành lỗi UID không tồn tại; chỉ retry có giới hạn sau quyết định vận hành.

**Case thật và ngữ cảnh chi tiết:** [G146](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9318).

### 29. Instagram thiếu publication timestamp

RQ=0; RT=0; RF=0; JF=2. Các mức không được cộng thành request độc lập.

**Quan sát:** Validation chặn trước khi gửi ES5. Cả hai payload Instagram kiểm tra lại đều có data.item.createdAt=null.

**Chưa kết luận được:** Không có timestamp native nên chưa xác định được bài có nằm trong cửa sổ 72 giờ. Đây không phải lỗi bulk hay mapping ES5.

**Hướng xử lý:** Hydrate ngày đăng từ permalink/response native có xác minh ID, lưu provenance rồi retry có kiểm soát sau khi sửa producer. Không điền giờ hiện tại, ngày của parent hoặc ngày phỏng đoán.

Hai case được retry từ reset và fail lại ngay 00:46:52. Cả hai data.item.createdAt=null. ES5 chưa được gọi cho hai document này; validation đang bảo vệ dữ liệu đúng.

**Case thật và ngữ cảnh chi tiết:** [G116](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7588).

### 30. Threads thiếu phân trang reply native

RQ=0; RT=0; RF=0; JF=1. Các mức không được cộng thành request độc lập.

**Quan sát:** Reader Threads không có đường phân trang reply native đã xác minh nên không thể chứng minh coverage đầy đủ. Case có expectedPublicCount=3, observedUnique=1 và replyCountMismatches=1.

**Chưa kết luận được:** hasMore=false trong một trường pagination không đồng nghĩa đã đọc hết: coverage.exhausted=false và complete=false. Chưa chứng minh bài không còn reply.

**Hướng xử lý:** Kiểm tra connection con, parent ID/scopeCode và cursor/URL reply trong native payload. Giữ dữ liệu đã quan sát, bổ sung parser phân trang reply; không ép complete=true.

**Case thật và ngữ cảnh chi tiết:** [G134](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8655).

### 31. Job hết ngân sách retry — giữ riêng nguyên nhân cuối

Có **4 job main worker** chạm 100 retries trong cửa sổ: YouTube source 3, Instagram comment 1. Không dùng RETRY_LIMIT_EXHAUSTED làm nguyên nhân duy nhất; chi tiết cuối:

| Queue | Nguyên nhân / phase cuối | JF | Case |
|---|---|---:|---|
| `youtube-source` | `UPSTREAM_NETWORK_ERROR` / `proxy_tls` / native `ECONNRESET` | 2 | [G119](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7773) |
| `instagram-comment` | `UPSTREAM_NETWORK_ERROR` / `proxy_connect` / native `—` | 1 | [G138](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8879) |
| `youtube-source` | `UPSTREAM_TIMEOUT` / `unobserved` / native `—` | 1 | [G141](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9049) |

Ba job YouTube kiểm tra lại đều lưu observedUnique=30, complete=false, hasMore=true; chưa chứng minh hoàn tất source. Instagram comment lưu observedUnique=1.950 trên expectedPublicCount=51.365, complete=false và CONTINUATION_PENDING. Những số quan sát này **không phải** xác nhận từng row đã có trong ES5. Cần xử lý kết nối và xem việc giữ worker qua 100 retry; phương án nhường slot phải giữ cursor/ngân sách và do người vận hành quyết định.

## Throughput và backlog từng queue

Counter bên dưới được đọc lúc **30/10/2026 04:01:45.553**, nên khoảng counter dài hơn cửa sổ lỗi khoảng 85 giây. Mọi tốc độ là **job hoàn tất/phút**, không phải bài/comment mới, không phải nguồn duy nhất; “completed” có cả done/skipped theo policy. Các job vừa fail sau 04:00 không được cộng ngược vào thống kê lỗi đã chốt.

| Queue | Job completed thêm | Job/phút sau reset | Pending lúc baseline | Pending 03:59:24 | Active / budget 03:59 | Fail trong cửa sổ |
|---|---:|---:|---:|---:|---|---:|
| `facebook-page-source` | 2.813 | 14,43 | 878 | 815 | 30 / 30 | 0 |
| `facebook-group-source` | 3.854 | 19,77 | 6.832 | 3.048 | 60 / 60 | 0 |
| `facebook-user-source` | 998 | 5,12 | 413 | 1.196 | 10 / 10 | 0 |
| `instagram-source` | 124 | 0,64 | 307 | 184 | 5 / 5 | 0 |
| `youtube-source` | 124 | 0,64 | 477 | 353 | 5 / 5 | 3 |
| `threads-source` | 385 | 1,97 | 853 | 470 | 5 / 5 | 0 |
| `facebook-comment` | 19.544 | 100,24 | 61 | 110 | 109 / 150 | 0 |
| `facebook-reply` | 17.955 | 92,09 | 7.827 | 10.094 | 70 / 70 | 0 |
| `instagram-comment` | 220 | 1,13 | 44 | 10 | 5 / 5 | 1 |
| `youtube-comment` | 4.869 | 24,97 | 88 | 59 | 30 / 30 | 0 |
| `threads-comment` | 425 | 2,18 | 75 | 10 | 5 / 5 | 1 |
| `es5-import` | 251.306 | 1288,94 | 512 | 15 | 15 / 80 | 2 |
| `find-uid` | 1.816 | 9,31 | 108 | 1 | 1 / 20 local (spec 3) | 1.227 |

Baseline được chụp khi queue còn pause: dùng waiting+paused+active+delayed, không đọc waiting=0 thành không có backlog. Mẫu 03:59:24 là snapshot journal cuối nằm trong cửa sổ; ảnh live 04:01:45 ở JSON evidence có thể khác.

- **FB User/Page:** lần lượt nạp vòng mới lúc 02:09:08 và 02:09:47. Inventory vòng User=1.771, Page=2.725; waiting tăng sau refill không tự chứng minh queue kẹt. Các round bắt đầu trước cửa sổ báo cáo, không tính toàn bộ observed posts của round là dữ liệu mới của đêm này.
- **FB reply:** pending 7.827 → 10.094 (+2.267) dù active=70. Đầu vào/continuation sinh nhanh hơn số job rời queue; cần xử lý sức đọc/retry, không quy cho ES5.
- **IG/YouTube source:** khoảng 0,64 job/phút với 5 worker mỗi queue; chưa hết inventory. Retry và timeout giữ slot là điểm cần xử lý. Threads source khoảng 1,97 job/phút.
- **find-uid:** budget spec ghi 3 nhưng worker local cấu hình thực tế 20; ảnh đầu cửa sổ ghi active=20. Đây là độ lệch mô tả cấu hình đã có, không phải thay đổi trong phiên 04:00.
- **Counter thiếu cần sửa:** flow_counters.find-uid.failed không tăng (vẫn 6.116) dù ledger/log local có 1.227 job fail. Worker local cập nhật stats.failed và flow_jobs nhưng không cộng global failed counter. Dùng ledger/failed tickets cho UID; không kết luận “UID không lỗi” từ delta counter=0.

### So với mẫu kiểm tra trước reset

| Luồng | Mẫu 00:11–00:13 (job/phút) | Sau reset, TB khoảng 3h15 (job/phút) |
|---|---:|---:|
| `facebook-page-source` | 13,5 | 14,43 |
| `facebook-group-source` | 33,0 | 19,77 |
| `facebook-user-source` | 4,5 | 5,12 |
| `instagram-source` | 0,0 | 0,64 |
| `youtube-source` | 2,0 | 0,64 |
| `threads-source` | 1,5 | 1,97 |
| `facebook-comment` | 105,5 | 100,24 |
| `facebook-reply` | 87,5 | 92,09 |
| `instagram-comment` | 0,5 | 1,13 |
| `youtube-comment` | 24,5 | 24,97 |
| `threads-comment` | 3,5 | 2,18 |

Hai mẫu khác độ dài, inventory, số auth gates và vòng nguồn; không phải thử nghiệm A/B và không đủ để quy thay đổi cho riêng lần deploy. Mẫu Group giảm từ 33 xuống khoảng 19,77 job/phút cần đọc cùng 2.557 lần AUTH_REQUIRED terminal của queue này, không chỉ nhìn CPU hay tốc độ import.

## ES5 và import

- Trong cửa sổ chốt: **246.382 lượt document ghi/cập nhật được ES5 ack**, qua 15.431 batch, khoảng **21,21 lượt/giây**, **0 item bulk thất bại**. Đây là write/update operations; chưa đo được số document mới duy nhất.
- Bulk latency đầy đủ từ journal: p50=298 ms, p95=736 ms, max=2.874 ms.
- Import pending baseline=512; snapshot 03:59 có waiting=0, active=15. Lớn nhất trong 264 snapshot là 589 (waiting+active), không có xu thế tích dồn hàng chục nghìn như trước tối ưu.
- Các bucket 15 phút trọn vẹn từ 01:00 đến 04:00 đạt khoảng 20,15–22,60 lượt ghi/s; bucket đầu/cuối không trọn nên không dùng để so tốc độ.
- Lúc 04:01:49: cluster green, pending task=0, unassigned=0; bulk queue=0/rejected=0 ở cả 5 node. Main crawler active, không automatic restart, memory cgroup khoảng 1,21 GiB tại lúc thu thập.
- Heap hot-1=85%, hot-3=83%, CPU hot-1=76%, hot-3=45%: áp lực sẵn có cần theo dõi; không phải bằng chứng bulk đang nghẽn. Hai import job fail là validation createdAt=null, không phải lỗi ghi ES5.
- Không sử dụng index_failed toàn cluster để quy lỗi cho crawler này. Không thực hiện write/reindex/query test gây thay đổi ES5 trong phiên báo cáo.

| Khoảng ICT | Bulk item ack | Item/s (chỉ bucket đủ 15 phút) | Item fail |
|---|---:|---:|---:|
| 00:45–01:00 | 13.704 | bucket không trọn | 0 |
| 01:00–01:15 | 18.131 | 20,15 | 0 |
| 01:15–01:30 | 18.334 | 20,37 | 0 |
| 01:30–01:45 | 19.989 | 22,21 | 0 |
| 01:45–02:00 | 19.323 | 21,47 | 0 |
| 02:00–02:15 | 18.672 | 20,75 | 0 |
| 02:15–02:30 | 18.885 | 20,98 | 0 |
| 02:30–02:45 | 19.785 | 21,98 | 0 |
| 02:45–03:00 | 19.525 | 21,69 | 0 |
| 03:00–03:15 | 19.949 | 22,17 | 0 |
| 03:15–03:30 | 20.095 | 22,33 | 0 |
| 03:30–03:45 | 19.349 | 21,50 | 0 |
| 03:45–04:00 | 20.340 | 22,60 | 0 |
| 04:00–04:15 | 301 | bucket không trọn | 0 |

## Những nhóm chưa thể chốt nguyên nhân và chỗ trace còn thiếu

| Nhóm | Thiếu gì | Việc cần thêm trước khi kết luận |
|---|---|---|
| 3.641 request_error phase proxy_connect | Không native code/CONNECT status/socket timing | DNS/TCP/CONNECT cause của agent, errno/syscall, địa chỉ peer không kèm credential |
| 1.831 quan sát timeout unobserved (1.829 RT + 1 RF + 1 JF) | Không request timing, không native ETIMEDOUT | Budget scope và stage trước/sau request, giữ trace khi dispose |
| 12 API Threads trong HTTP 200 | Adapter bỏ native code/message | code/subcode và dấu hiệu lỗi được khử bí mật, không log nguyên body/token |
| 204 FB source rate-limit RT không apiCode | Thiếu mã native để so với 1675004 | Giữ error envelope ở source adapter |
| 1.226 UID_NOT_RETURNED | Không failed snapshot/status/route evidence riêng trong ledger | HTTP status, final public route, response hash, canonical route, candidate UID paths/count; không tự điền UID |
| 1 parent redirect 301 mang reset | Error request con bị truyền sang phase cha | Parent/child request IDs và cause phase; không đếm như hai sự cố độc lập |
| 1 timeout với timing HTTP 200 complete | Timing cuối không chỉ được bước đang timeout | Stage/deadline của lượt đọc tiếp theo |
| 24 expiry body đã đủ wire | Chưa có decodedEndedMs/TTL còn lại trong event | Ranh giới lease expiry, drain/decode và event-loop lag; không đổi thành lỗi giải nén |
| UID global failed counter | Không tăng khi worker local fail | Cộng counter bằng handler idempotent, so ledger làm chuẩn; chưa sửa trong phiên này |

Không có quan sát trong cửa sổ cho: native DNS ENOTFOUND/EAI_AGAIN, ECONNREFUSED, lỗi certificate/TLS validation, proxy CONNECT 407/429, native Z_DATA_ERROR/Brotli decode error, lỗi ES bulk/mapping, Mongo/Redis hoặc runtime exception/telemetry-storage failure. Do không có case thật, báo cáo không tạo ví dụ giả cho các nhóm này. Không có quan sát không phải bảo đảm chúng không thể xảy ra.

## Ma trận đầy đủ 148 nhóm

Mỗi hàng trỏ tới giải thích, giới hạn và 1–2 case thật đầy đủ (timestamp Việt Nam, job ID, source/post, timings, bytes, wire completion). Các variant cùng mã gốc nhưng khác phase/status/operation/native code/encoding vẫn là các hàng riêng.

| Nhóm | Queue / platform | Original reason | Phase / native | HTTP / API | Operation / query | RQ / RT / RF / JF | Case chi tiết |
|---|---|---|---|---|---|---|---|
| G001 | facebook-group-source / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 7027 / 2544 / 0 | [G001](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:11) |
| G002 | facebook-comment / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 7929 / 1043 / 0 | [G002](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:80) |
| G003 | youtube-comment / youtube | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | comments / — | 4210 / 4210 / 0 / 0 | [G003](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:151) |
| G004 | facebook-reply / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 6360 / 712 / 0 | [G004](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:218) |
| G005 | facebook-comment / facebook | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 6970 / 0 / 0 / 0 | [G005](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:289) |
| G006 | facebook-comment / facebook | NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 0 / 6969 / 0 / 0 | [G006](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:356) |
| G007 | facebook-reply / facebook | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 5663 / 0 / 0 / 0 | [G007](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:423) |
| G008 | facebook-reply / facebook | NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 0 / 5663 / 0 / 0 | [G008](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:490) |
| G009 | facebook-group-source / facebook | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 4540 / 0 / 0 / 0 | [G009](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:557) |
| G010 | facebook-group-source / facebook | NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 0 / 4539 / 0 / 0 | [G010](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:622) |
| G011 | facebook-page-source / facebook | NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 0 / 2392 / 0 / 0 | [G011](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:687) |
| G012 | facebook-page-source / facebook | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 2392 / 0 / 0 / 0 | [G012](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:752) |
| G013 | threads-comment / threads | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | comments / — | 1135 / 1135 / 0 / 0 | [G013](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:817) |
| G014 | youtube-source / youtube | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | source / — | 1051 / 1049 / 2 / 0 | [G014](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:884) |
| G015 | instagram-comment / instagram | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | comments / — | 955 / 955 / 0 / 0 | [G015](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:949) |
| G016 | facebook-page-source / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 1602 / 308 / 0 | [G016](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1016) |
| G017 | facebook-user-source / facebook | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 1418 / 0 / 0 / 0 | [G017](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1085) |
| G018 | facebook-user-source / facebook | NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | bootstrap / bootstrap | 0 / 1417 / 0 / 0 | [G018](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1150) |
| G019 | facebook-group-source / facebook | UPSTREAM_TIMEOUT | unobserved / — | — / — | source / — | 0 / 1339 / 0 / 0 | [G019](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1215) |
| G020 | threads-source / threads | ECONNRESET | proxy_tls / ECONNRESET | — / — | source / — | 0 / 1280 / 0 / 0 | [G020](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1276) |
| G021 | threads-source / threads | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | source / — | 1280 / 0 / 0 / 0 | [G021](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1341) |
| G022 | find-uid / facebook | FACEBOOK_PROFILE_UID_NOT_RETURNED | uid_lookup / — | — / — | local_curl_profile / — | 0 / 0 / 0 / 1226 | [G022](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1406) |
| G023 | facebook-comment / facebook | FACEBOOK_RATE_LIMITED | http_response / — | 200 / 1675004 | comments / CommentListComponentsRootQuery | 0 / 1193 / 0 / 0 | [G023](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1483) |
| G024 | instagram-source / instagram | ECONNRESET | proxy_tls / ECONNRESET | — / — | source / — | 0 / 988 / 0 / 0 | [G024](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1554) |
| G025 | instagram-source / instagram | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | source / — | 988 / 0 / 0 / 0 | [G025](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1619) |
| G026 | facebook-comment / facebook | NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 0 / 932 / 0 / 0 | [G026](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1684) |
| G027 | facebook-comment / facebook | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 932 / 0 / 0 / 0 | [G027](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1751) |
| G028 | youtube-comment / youtube | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | comments / — | 369 / 369 / 0 / 0 | [G028](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1818) |
| G029 | facebook-reply / facebook | NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 0 / 675 / 0 / 0 | [G029](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1885) |
| G030 | facebook-reply / facebook | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 675 / 0 / 0 / 0 | [G030](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:1952) |
| G031 | facebook-comment / facebook | COMMENTS_UNAVAILABLE | http_response / — | 200 / — | comments / CommentListComponentsRootQuery | 0 / 0 / 567 / 0 | [G031](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2019) |
| G032 | facebook-group-source / facebook | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 547 / 0 / 0 / 0 | [G032](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2088) |
| G033 | facebook-group-source / facebook | NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 0 / 547 / 0 / 0 | [G033](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2153) |
| G034 | facebook-user-source / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 386 / 51 / 0 | [G034](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2218) |
| G035 | facebook-page-source / facebook | NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 0 / 344 / 0 / 0 | [G035](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2287) |
| G036 | facebook-page-source / facebook | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 344 / 0 / 0 / 0 | [G036](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2352) |
| G037 | threads-source / threads | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | source / — | 136 / 136 / 0 / 0 | [G037](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2417) |
| G038 | threads-comment / threads | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | comments / — | 130 / 130 / 0 / 0 | [G038](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2482) |
| G039 | youtube-source / youtube | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | source / — | 126 / 126 / 0 / 0 | [G039](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2549) |
| G040 | instagram-comment / instagram | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | comments / — | 107 / 106 / 1 / 0 | [G040](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2614) |
| G041 | instagram-source / instagram | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | source / — | 105 / 105 / 0 / 0 | [G041](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2681) |
| G042 | threads-source / threads | UPSTREAM_HTTP_429 | http_response / — | 429 / — | source / — | 104 / 104 / 0 / 0 | [G042](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2746) |
| G043 | instagram-comment / instagram | UPSTREAM_HTTP_429 | http_response / — | 429 / — | comments / — | 99 / 99 / 0 / 0 | [G043](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2811) |
| G044 | facebook-group-source / facebook | FACEBOOK_RATE_LIMITED | http_response / — | 200 / — | source / — | 0 / 196 / 0 / 0 | [G044](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2878) |
| G045 | facebook-user-source / facebook | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 170 / 0 / 0 / 0 | [G045](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:2945) |
| G046 | facebook-user-source / facebook | NETWORK_ERROR | proxy_connect / — | — / — | bootstrap / bootstrap | 0 / 170 / 0 / 0 | [G046](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3010) |
| G047 | youtube-comment / youtube | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | comments / — | 78 / 78 / 0 / 0 | [G047](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3075) |
| G048 | youtube-source / youtube | UPSTREAM_TIMEOUT | unobserved / — | — / — | source / — | 0 / 149 / 1 / 0 | [G048](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3142) |
| G049 | facebook-page-source / facebook | UPSTREAM_TIMEOUT | unobserved / — | — / — | source / — | 0 / 148 / 0 / 0 | [G049](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3205) |
| G050 | youtube-comment / youtube | UPSTREAM_TIMEOUT | unobserved / — | — / — | comments / — | 0 / 115 / 0 / 0 | [G050](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3266) |
| G051 | threads-comment / threads | UPSTREAM_HTTP_429 | http_response / — | 429 / — | comments / — | 47 / 47 / 0 / 0 | [G051](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3329) |
| G052 | facebook-comment / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 70 / 9 / 0 | [G052](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3396) |
| G053 | youtube-comment / youtube | PUBLIC_ITEMS_NOT_RETURNED | http_response / — | 200 / — | comments / — | 0 / 0 / 74 / 0 | [G053](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3469) |
| G054 | facebook-group-source / facebook | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | source / — | 70 / 0 / 0 / 0 | [G054](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3536) |
| G055 | facebook-group-source / facebook | NETWORK_ERROR | response_headers / ECONNRESET | — / — | source / — | 0 / 70 / 0 / 0 | [G055](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3601) |
| G056 | instagram-source / instagram | UPSTREAM_TIMEOUT | read_work / UPSTREAM_TIMEOUT | — / — | source / — | 0 / 62 / 0 / 0 | [G056](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3666) |
| G057 | facebook-group-source / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 46 / 13 / 0 | [G057](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3727) |
| G058 | facebook-reply / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 49 / 9 / 0 | [G058](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3798) |
| G059 | instagram-comment / instagram | UPSTREAM_TIMEOUT | unobserved / — | — / — | comments / — | 0 / 50 / 0 / 0 | [G059](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3871) |
| G060 | instagram-source / instagram | UPSTREAM_HTTP_429 | http_response / — | 429 / — | source / — | 23 / 23 / 0 / 0 | [G060](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3934) |
| G061 | facebook-reply / facebook | COMMENTS_UNAVAILABLE | http_response / — | 200 / — | replies / Depth1CommentsListPaginationQuery | 0 / 0 / 40 / 0 | [G061](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:3999) |
| G062 | threads-comment / threads | UPSTREAM_HTTP_429 | http_response / — | 429 / — | comments / — | 23 / 12 / 0 / 0 | [G062](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4068) |
| G063 | threads-source / threads | PUBLIC_ITEMS_NOT_RETURNED | http_response / — | 200 / — | source / — | 0 / 0 / 29 / 0 | [G063](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4135) |
| G064 | threads-source / threads | UPSTREAM_HTTP_429 | http_response / — | 429 / — | source / — | 21 / 7 / 0 / 0 | [G064](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4200) |
| G065 | facebook-page-source / facebook | NETWORK_ERROR | response_headers / ECONNRESET | — / — | source / — | 0 / 21 / 0 / 0 | [G065](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4265) |
| G066 | facebook-page-source / facebook | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | source / — | 21 / 0 / 0 / 0 | [G066](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4334) |
| G067 | facebook-page-source / facebook | PUBLIC_ITEMS_NOT_RETURNED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 0 / 20 / 0 | [G067](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4399) |
| G068 | threads-comment / threads | PUBLIC_DATA_NOT_RETURNED | http_response / — | 200 / — | comments / — | 0 / 0 / 20 / 0 | [G068](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4466) |
| G069 | facebook-group-source / facebook | PROXY_MANAGER_UNAVAILABLE | proxy_assignment / — | — / — | source / — | 0 / 20 / 0 / 0 | [G069](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4535) |
| G070 | instagram-source / instagram | LOGIN_OR_CHECKPOINT | http_response / — | 200 / — | source / — | 0 / 19 / 1 / 0 | [G070](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4596) |
| G071 | facebook-group-source / facebook | PROXY_EXPIRED | response_body / PROXY_EXPIRED | 200 / — | source / — | 9 / 9 / 0 / 0 | [G071](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4665) |
| G072 | instagram-comment / instagram | UPSTREAM_HTTP_429 | http_response / — | 429 / — | comments / — | 9 / 9 / 0 / 0 | [G072](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4730) |
| G073 | facebook-page-source / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 14 / 3 / 0 | [G073](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4797) |
| G074 | facebook-user-source / facebook | UPSTREAM_TIMEOUT | unobserved / — | — / — | source / — | 0 / 14 / 0 / 0 | [G074](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4867) |
| G075 | threads-source / threads | HTTP_429 | http_response / — | 429 / — | source / — | 0 / 14 / 0 / 0 | [G075](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4928) |
| G076 | facebook-page-source / facebook | PROXY_EXPIRED | response_body / PROXY_EXPIRED | 200 / — | source / — | 6 / 6 / 0 / 0 | [G076](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:4993) |
| G077 | instagram-source / instagram | PROXY_EXPIRED | response_body / PROXY_EXPIRED | 200 / — | source / — | 6 / 6 / 0 / 0 | [G077](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5058) |
| G078 | threads-source / threads | UPSTREAM_API_ERROR | http_response / — | 200 / — | source / — | 0 / 0 / 11 / 0 | [G078](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5123) |
| G079 | facebook-reply / facebook | NETWORK_ERROR | response_headers / ECONNRESET | — / — | replies / Depth1CommentsListPaginationQuery | 0 / 11 / 0 / 0 | [G079](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5188) |
| G080 | youtube-comment / youtube | PROXY_EXPIRED | proxy_heartbeat / PROXY_EXPIRED | — / — | comments / — | 0 / 11 / 0 / 0 | [G080](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5259) |
| G081 | threads-comment / threads | HTTP_429 | http_response / — | 429 / — | comments / — | 0 / 11 / 0 / 0 | [G081](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5322) |
| G082 | facebook-reply / facebook | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | replies / Depth1CommentsListPaginationQuery | 11 / 0 / 0 / 0 | [G082](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5389) |
| G083 | instagram-comment / instagram | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | comments / — | 5 / 5 / 0 / 0 | [G083](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5456) |
| G084 | facebook-group-source / facebook | PROXY_EXPIRED | proxy_heartbeat / PROXY_EXPIRED | — / — | source / — | 0 / 10 / 0 / 0 | [G084](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5523) |
| G085 | facebook-user-source / facebook | NETWORK_ERROR | response_headers / ECONNRESET | — / — | source / — | 0 / 9 / 0 / 0 | [G085](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5584) |
| G086 | instagram-comment / instagram | PUBLIC_DATA_NOT_RETURNED | http_response / — | 200 / — | comments / — | 0 / 0 / 9 / 0 | [G086](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5653) |
| G087 | facebook-comment / facebook | NETWORK_ERROR | response_headers / ECONNRESET | — / — | comments / CommentListComponentsRootQuery | 0 / 9 / 0 / 0 | [G087](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5720) |
| G088 | facebook-comment / facebook | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | comments / CommentListComponentsRootQuery | 9 / 0 / 0 / 0 | [G088](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5791) |
| G089 | facebook-user-source / facebook | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | source / — | 9 / 0 / 0 / 0 | [G089](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5858) |
| G090 | facebook-comment / facebook | FACEBOOK_RATE_LIMITED | http_response / — | 200 / 1675004 | comments / CommentListComponentsRootQuery | 0 / 8 / 0 / 0 | [G090](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5923) |
| G091 | threads-comment / threads | UPSTREAM_TIMEOUT | unobserved / — | — / — | comments / — | 0 / 8 / 0 / 0 | [G091](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:5994) |
| G092 | facebook-page-source / facebook | FEED_UNAVAILABLE | http_response / — | 200 / — | source / — | 0 / 0 / 8 / 0 | [G092](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6057) |
| G093 | facebook-page-source / facebook | PROXY_EXPIRED | proxy_heartbeat / PROXY_EXPIRED | — / — | source / — | 0 / 8 / 0 / 0 | [G093](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6124) |
| G094 | instagram-comment / instagram | LOGIN_OR_CHECKPOINT | http_response / — | 200 / — | comments / — | 0 / 7 / 0 / 0 | [G094](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6185) |
| G095 | facebook-user-source / facebook | AUTH_REQUIRED | http_response / — | 200 / — | bootstrap / bootstrap | 0 / 7 / 0 / 0 | [G095](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6256) |
| G096 | threads-comment / threads | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | comments / — | 3 / 3 / 0 / 0 | [G096](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6327) |
| G097 | threads-source / threads | ECONNRESET | response_headers / ECONNRESET | — / — | source / — | 0 / 6 / 0 / 0 | [G097](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6394) |
| G098 | facebook-group-source / facebook | FEED_UNAVAILABLE | http_response / — | 200 / — | source / — | 0 / 0 / 6 / 0 | [G098](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6459) |
| G099 | threads-source / threads | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | source / — | 6 / 0 / 0 / 0 | [G099](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6526) |
| G100 | instagram-source / instagram | UPSTREAM_TIMEOUT | unobserved / — | — / — | source / — | 0 / 6 / 0 / 0 | [G100](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6591) |
| G101 | youtube-source / youtube | PROXY_MANAGER_UNAVAILABLE | proxy_assignment / — | — / — | source / — | 0 / 5 / 0 / 0 | [G101](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6652) |
| G102 | youtube-comment / youtube | PUBLIC_ITEMS_NOT_RETURNED | http_response / — | 200 / — | comments / — | 0 / 0 / 5 / 0 | [G102](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6714) |
| G103 | instagram-source / instagram | PUBLIC_ITEMS_NOT_RETURNED | http_response / — | 200 / — | source / — | 0 / 0 / 5 / 0 | [G103](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6782) |
| G104 | facebook-page-source / facebook | PROXY_MANAGER_UNAVAILABLE | proxy_assignment / — | — / — | source / — | 0 / 5 / 0 / 0 | [G104](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6848) |
| G105 | facebook-group-source / facebook | FACEBOOK_RATE_LIMITED | http_response / — | 200 / — | source / — | 0 / 5 / 0 / 0 | [G105](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6909) |
| G106 | youtube-comment / youtube | PROXY_EXPIRED | response_body / PROXY_EXPIRED | 200 / — | comments / — | 2 / 2 / 0 / 0 | [G106](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:6976) |
| G107 | instagram-comment / instagram | PROXY_EXPIRED | proxy_heartbeat / PROXY_EXPIRED | — / — | comments / — | 0 / 4 / 0 / 0 | [G107](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7043) |
| G108 | facebook-comment / facebook | PROXY_MANAGER_UNAVAILABLE | proxy_assignment / — | — / — | comments / CommentsListComponentsPaginationQuery | 0 / 3 / 0 / 0 | [G108](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7106) |
| G109 | youtube-source / youtube | PROXY_EXPIRED | proxy_heartbeat / PROXY_EXPIRED | — / — | source / — | 0 / 3 / 0 / 0 | [G109](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7169) |
| G110 | facebook-page-source / facebook | PROXY_EXPIRED | unobserved / — | — / — | source / — | 0 / 3 / 0 / 0 | [G110](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7230) |
| G111 | facebook-group-source / facebook | PROXY_EXPIRED | unobserved / — | — / — | source / — | 0 / 3 / 0 / 0 | [G111](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7291) |
| G112 | youtube-comment / youtube | PROXY_EXPIRED | proxy_tls / PROXY_EXPIRED | — / — | comments / — | 1 / 1 / 0 / 0 | [G112](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7352) |
| G113 | instagram-source / instagram | UPSTREAM_HTTP_429 | http_response / — | 429 / — | source / — | 1 / 1 / 0 / 0 | [G113](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7407) |
| G114 | facebook-user-source / facebook | NETWORK_ERROR | response_body / ECONNRESET | 200 / — | source / — | 0 / 2 / 0 / 0 | [G114](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7461) |
| G115 | facebook-comment / facebook | NETWORK_ERROR | response_headers / ECONNRESET | — / — | comments / CommentsListComponentsPaginationQuery | 0 / 2 / 0 / 0 | [G115](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7517) |
| G116 | es5-import / instagram | EXACT_PUBLICATION_DATE_REQUIRED | import_validate / — | — / — | es5-import / — | 0 / 0 / 0 / 2 | [G116](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7588) |
| G117 | facebook-user-source / facebook | UPSTREAM_NETWORK_ERROR | response_body / ECONNRESET | 200 / — | source / — | 2 / 0 / 0 / 0 | [G117](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7665) |
| G118 | instagram-source / instagram | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | source / — | 1 / 1 / 0 / 0 | [G118](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7719) |
| G119 | youtube-source / youtube | UPSTREAM_NETWORK_ERROR | proxy_tls / ECONNRESET | — / — | source / — | 0 / 0 / 0 / 2 | [G119](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7773) |
| G120 | youtube-source / youtube | PUBLIC_ITEMS_NOT_RETURNED | http_response / — | 200 / — | source / — | 0 / 0 / 2 / 0 | [G120](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7850) |
| G121 | youtube-source / youtube | PROXY_EXPIRED | response_body / PROXY_EXPIRED | 200 / — | source / — | 1 / 1 / 0 / 0 | [G121](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7915) |
| G122 | facebook-page-source / facebook | FACEBOOK_RATE_LIMITED | http_response / — | 200 / — | source / — | 0 / 2 / 0 / 0 | [G122](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:7969) |
| G123 | facebook-comment / facebook | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | comments / CommentsListComponentsPaginationQuery | 2 / 0 / 0 / 0 | [G123](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8038) |
| G124 | facebook-reply / facebook | UPSTREAM_NETWORK_ERROR | response_headers / ECONNRESET | — / — | bootstrap / bootstrap | 1 / 0 / 0 / 0 | [G124](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8105) |
| G125 | facebook-reply / facebook | FACEBOOK_SERVER_ERROR | http_response / — | 500 / — | replies / Depth1CommentsListPaginationQuery | 0 / 1 / 0 / 0 | [G125](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8160) |
| G126 | facebook-page-source / facebook | FEED_UNAVAILABLE | http_response / — | 200 / — | source / — | 0 / 0 / 1 / 0 | [G126](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8217) |
| G127 | instagram-source / instagram | PROXY_EXPIRED | read_work / PROXY_EXPIRED | — / — | source / — | 0 / 1 / 0 / 0 | [G127](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8274) |
| G128 | facebook-reply / facebook | UPSTREAM_HTTP_500 | http_response / — | 500 / — | replies / Depth1CommentsListPaginationQuery | 1 / 0 / 0 / 0 | [G128](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8326) |
| G129 | threads-comment / threads | UPSTREAM_TIMEOUT | http_response / — | 200 / — | comments / — | 0 / 1 / 0 / 0 | [G129](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8381) |
| G130 | threads-comment / threads | PROXY_MANAGER_UNAVAILABLE | proxy_assignment / — | — / — | comments / — | 0 / 1 / 0 / 0 | [G130](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8436) |
| G131 | facebook-reply / facebook | NETWORK_ERROR | response_headers / ECONNRESET | — / — | bootstrap / bootstrap | 0 / 1 / 0 / 0 | [G131](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8489) |
| G132 | youtube-comment / youtube | PROXY_EXPIRED | unobserved / — | — / — | comments / — | 0 / 1 / 0 / 0 | [G132](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8545) |
| G133 | facebook-reply / facebook | UPSTREAM_NETWORK_ERROR | response_body / ECONNRESET | 301 / — | bootstrap / bootstrap | 1 / 0 / 0 / 0 | [G133](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8598) |
| G134 | threads-comment / threads | NATIVE_REPLY_PAGINATION_UNAVAILABLE | source_read / — | — / — | comments / — | 0 / 0 / 0 / 1 | [G134](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8655) |
| G135 | facebook-reply / facebook | NETWORK_ERROR | response_body / ECONNRESET | 200 / — | replies / Depth1CommentsListPaginationQuery | 0 / 1 / 0 / 0 | [G135](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8714) |
| G136 | facebook-page-source / facebook | FACEBOOK_RATE_LIMITED | http_response / — | 200 / — | source / — | 0 / 1 / 0 / 0 | [G136](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8771) |
| G137 | threads-source / threads | PROXY_MANAGER_UNAVAILABLE | proxy_assignment / — | — / — | source / — | 0 / 1 / 0 / 0 | [G137](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8827) |
| G138 | instagram-comment / instagram | UPSTREAM_NETWORK_ERROR | proxy_connect / — | — / — | comments / — | 0 / 0 / 0 / 1 | [G138](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8879) |
| G139 | threads-source / threads | UPSTREAM_API_ERROR | http_response / — | 200 / — | source / — | 0 / 0 / 1 / 0 | [G139](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8940) |
| G140 | facebook-reply / facebook | UPSTREAM_NETWORK_ERROR | response_body / ECONNRESET | 200 / — | replies / Depth1CommentsListPaginationQuery | 1 / 0 / 0 / 0 | [G140](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:8994) |
| G141 | youtube-source / youtube | UPSTREAM_TIMEOUT | unobserved / — | — / — | source / — | 0 / 0 / 0 / 1 | [G141](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9049) |
| G142 | instagram-comment / instagram | PROXY_MANAGER_UNAVAILABLE | proxy_assignment / — | — / — | comments / — | 0 / 1 / 0 / 0 | [G142](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9107) |
| G143 | facebook-group-source / facebook | UPSTREAM_HTTP_500 | http_response / — | 500 / — | source / — | 1 / 0 / 0 / 0 | [G143](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9160) |
| G144 | instagram-source / instagram | PROXY_MANAGER_UNAVAILABLE | read_work / PROXY_MANAGER_UNAVAILABLE | — / — | source / — | 0 / 1 / 0 / 0 | [G144](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9214) |
| G145 | instagram-source / instagram | PROXY_EXPIRED | proxy_heartbeat / PROXY_EXPIRED | — / — | source / — | 0 / 1 / 0 / 0 | [G145](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9266) |
| G146 | find-uid / facebook | FACEBOOK_PROFILE_HTTP_500 | uid_lookup / — | 500 / — | local_curl_profile / — | 0 / 0 / 0 / 1 | [G146](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9318) |
| G147 | youtube-comment / youtube | PROXY_MANAGER_UNAVAILABLE | proxy_assignment / — | — / — | comments / — | 0 / 1 / 0 / 0 | [G147](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9378) |
| G148 | facebook-group-source / facebook | FACEBOOK_SERVER_ERROR | http_response / — | 500 / — | source / — | 0 / 1 / 0 / 0 | [G148](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-cases.md:9431) |

## Thứ tự đề nghị để người vận hành quyết định

1. Lấy hai case TLS cùng route nhưng khác endpoint hash; A/B có giới hạn và thu CONNECT/TLS timing. Chốt tầng lỗi trước khi đổi provider hoặc tăng worker.
2. Lấy hai profile pfbid trong nhóm UID, giữ failed-response metadata và kiểm tra native route/parser/fallback. 1.126 profile key cho thấy đây không chỉ là một profile bị lặp nhiều lần. Nếu dùng bảng map UID, phải có bằng chứng khớp đúng profile.
3. Bổ sung native cause cho CONNECT/manager, budget stage cho timeout và API code cho Threads; sửa counter failed UID để dashboard phản ánh đúng.
4. Đánh giá chính sách retry 100 lần theo loại lỗi và cơ chế nhường slot giữ checkpoint, đặc biệt 5 worker IG/YouTube. Chưa áp dụng thay đổi nào trong báo cáo.
5. Khôi phục timestamp native cho hai post Instagram và kiểm tra phân trang replies Threads; tiếp tục giữ validation/coverage guard.
6. Theo dõi FB reply backlog và tốc độ phát sinh continuation sau khi giảm retry chờ; import ES5 có headroom quan sát được.

## Nguồn bằng chứng và tái lập

- Operation reset đã hoàn tất: `/var/lib/crawler-v8/error-taxonomy-reset-XX2Rsp`; giữ baseline từ `baseline.json.at`, không đổi theo lần reload code sau đó.
- Backup trước reset đọc kiểm chứng đủ 375.722 record Mongo / 2.224 ticket Bull; retry thành công 2.224, dọn 373.498 orphan history. Không clear lần nữa các fail mới để làm đẹp dashboard.
- Remote: `errors-0400-20261030.json`, `journal-0400-20261030.json`, `es-0400-20261030.json` trong operation directory. Bộ evidence local còn có metadata 10 job fail, thống kê auth/request timings và log UID.
- Main source: `src/services/crawlerErrorDetails.js`, `src/services/socialHttpTransport.js`, `src/services/socialApiErrors.js`, `src/services/metaCommentPagination.js`, `scripts/local_find_uid_worker.mjs`, `scripts/crawler_queue_flow.mjs`.
- Lưu ý sửa nhãn có audit: ba event UID từng bị Error dùng chung gắn tên hai lần đã được chuẩn hóa trước báo cáo; dữ liệu trước sửa nằm trong `diagnostic-label-corrections.ejsonl`. Không xóa event, đổi timestamp hoặc đổi số lượng để sửa nhãn.
- Một lần graceful reload code đã được thực hiện trước phiên báo cáo trong cửa sổ (journal flow_started=2); phiên 04:00 không restart service. Không có automatic restart hay lỗi lưu event.

Báo cáo và phụ lục được tạo tự động từ snapshot đã chốt; không dùng các lời giải thích ở đây như bằng chứng đã xác minh được bên gây lỗi khi trường native/cause còn thiếu.
