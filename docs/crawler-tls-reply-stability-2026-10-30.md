# Tối ưu TLS và kiểm tra retry/clear — 30/10/2026

Mốc kết quả cuối: **09:02:43 ICT**; audit kiểm tra tới 09:03:54. Bản chính deploy 08:51:52, operation `/var/lib/crawler-v8/tls-reply-stability-y7c9Rs`. Bản sửa tên structured log của observer chỉ restart dashboard lúc 09:01:08; backup `/var/lib/crawler-v8/queue-audit-log-8kuDIY`.

## Thay đổi đã triển khai

- Pool giữ nhiều session khỏe cho cùng post thay vì hủy session trước khi có session mới; tối đa 70 idle, TTL 30 giây, ownership độc quyền, kiểm tra lease/terminal/busy và scope `facebook.comments`.
- Context cache theo đúng operation/source/bootstrap URL/native post ID và session, tối đa 8 entry/session, TTL 60 giây. Cookie thay đổi thì context cũ hết hiệu lực; không dùng actor/author map của post khác. Context/cookie/credentials chỉ ở RAM, không vào checkpoint.
- Khi reply đang active phải đổi proxy, thử lấy session khỏe trên endpoint khác từ pool trước khi acquire và bắt tay TLS mới. Trong cửa sổ 08:52–08:55 có 39 lần `reply_retry_hit`; 08:59–09:02 có 61 hit/2 miss. Đây là retry request trong ticket đang active, không retry ticket failed.
- Deadline origin TLS 15 giây giữ riêng; HTTP 60 giây/read 180 giây và budget retry100 giữ nguyên. Worker reply70, import80, bulk tối đa2 request đồng thời/80 item/5MiB không đổi.
- Bull Board ghi durable HTTP audit trước mutation, trả503 nếu không ghi được; ghi tài khoản/IP/UA family/method/queue/action/job/status/operation ID, không ghi auth/cookie/raw payload. Observer riêng ghi Redis `failed→waiting`, clean, remove failed và checkpoint13queue, tiếp tục sau restart. HTTP200 chỉ chứng minh handler thành công; cần đối chiếu Redis để xác nhận tác động.

## Queue và throughput

| Phiên bản | Giờ ICT | Reply waiting, mỗi30giây | Completed / phút |
|---|---|---|---|
| Trước tối ưu | 08:28:10–08:31:10 | 7817→7771→7736→7703→7668→7616→7578 | 386 / 128.6 |
| Pool/context v1 | 08:33:54–08:36:54 | 7408→7350→7265→7189→7110→7041→6992 | 445 / 148.3 |
| Pool/context v1, lần 2 | 08:37:11–08:40:12 | 6960→6894→6843→6786→6733→6662→6606 | 412 / 137.3 |
| Cookie guard | 08:43:25–08:46:25 | 6317→6291→6220→6150→6078→5995→5927 | 412 / 137.3 |
| Cookie guard, lần 2 | 08:46:56–08:49:56 | 5864→5806→5741→5677→5601→5532→5461 | 403 / 134.3 |
| Reply retry dùng pool | 08:52:23–08:55:23 | 5199→5169→5096→5026→4964→4908→4861 | 389 / 129.6 |
| Có deploy source giữa cửa sổ | 08:55:46–08:58:46 | 4814→4743→4707→4705→4703→4659→4609 | 341 / 113.6 |
| Sau restart source | 08:59:43–09:02:43 | 4477→4404→4355→4307→4260→4219→4172 | 381 / 127.0 |

Từ baseline 08:28:10 đến 09:02:43, waiting **7817→4172**. Ba cửa sổ của bản reply retry mới có **21 mẫu, 20 lần chuyển đều giảm**, **5199→4172** trong10phút19.554giây. Failed reply0 toàn bộ; active70 ngoài một mẫu40 lúc shutdown. Riêng cửa sổ ổn định sau restart 08:59:43–09:02:43: **4477→4172**, 381 completed (~127/phút), active70/failed0.

Không quy toàn bộ mức giảm backlog cho TLS: lượng root/fanout đầu vào khác nhau; throughput completed cuối vẫn gần baseline128.6/phút. Completed gồm policy skip, không phải số document ES duy nhất. Chưa đủ bằng chứng cam kết queue giảm liên tục dài hạn khi source/fanout tăng hoặc proxy gặp sự cố.

**Restart trong phép đo:** server stop08:56:40/start08:57:05, không phải crash tự phục hồi. Đọc chat “Push job mới khi hết job waiting” (`01a18a84-1258-7da1-8e6e-acba48d51658`) xác nhận deploy riêng `crawlerSourceRounds.js` và `systemctl restart --no-block crawler-queue-flow`. Thay đổi source nạp vòng mới khi waiting hết có thể thay đổi tải đầu vào. Không dùng cửa sổ này làm bằng chứng chạy cùng một process không gián đoạn.

## Nguồn retry/clear failed

**Đã bắt được một lần thật:** 08:55:01.556, HTTP client dùng account `admin`, IP **118.69.109.6**, UA family **Chrome**, gọi `PUT /bull/api/queues/crawler-flow-find-uid/retry/failed`. Operation ID `8fd49a4e-4e4e-4902-9b86-b50f2df585ba`, HTTP200 sau18ms. Trong request có đúng **7 Redis event failed→waiting** (08:55:01.568–.569). Đây là đường quản trị Bull Board, không phải retry HTTP nội bộ của crawler. IP/account/UA chưa xác định được người cụ thể hay browser automation; không khẳng định “người bấm” hoặc “tự động”.

- Đợt1793 UID retry08:12:48 và clean import3/UID3 lúc08:13 chưa có HTTP audit tương ứng: actor vẫn chưa xác định. Không gán ngược cho client08:55.
- Worker chính `attempts:1`, `removeOnFail:false`, chỉ removeOnComplete cho ticket thành công. Read retry giữ ticket active. Source round tạo ticket mới khácID.
- UID worker local chạy từ07:39, không có cờ `--retry-failed`; nhánh này chỉ chạy nếu truyền cờ. Không thấy cron/timer/process retry-clean định kỳ phù hợp hoặc standard manual-retry operation tương ứng. Đây không phải chứng minh mọi script bên ngoài đều không tồn tại.
- Tới09:03:54 audit chỉ có7mutation thật và một selfcheck localhost với jobID không tồn tại, HTTP404; selfcheck không đổi ticket thật. Không ghi nhận clean mới. Watcher13queue không có lỗi/gap được báo. Lượt kiểm tra này không clear/retry failed ticket.

## TLS và lỗi còn tồn tại

Cửa sổ08:52:23–09:02:43, chỉ đếm đúng crawler này. Request lỗi và read retry là hai lớp quan sát cùng attempt, **không cộng hai cột thành số request**. Toàn bộ97nhóm và case đã khử bí mật nằm trong evidence; dưới đây là riêng reply:

| Mã phân biệt đầy đủ | Số quan sát theo lớp |
|---|---|
| `UPSTREAM_TIMEOUT__HTTP_RESPONSE__HTTP_200__BR__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY` | read_retry=63 |
| `PROXY_TLS_HANDSHAKE_TIMEOUT__PROXY_TLS__PROXY_TLS_HANDSHAKE_TIMEOUT__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY` | read_retry=31, request_error=30 |
| `UPSTREAM_TIMEOUT__UNOBSERVED__BOOTSTRAP__BOOTSTRAP` | read_retry=27 |
| `NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP` | read_retry=7 |
| `UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP` | request_error=7 |
| `UPSTREAM_TIMEOUT__RESPONSE_BODY__UPSTREAM_TIMEOUT__HTTP_301__WIRE_COMPLETE__BOOTSTRAP__BOOTSTRAP` | read_retry=3, request_error=3 |
| `AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP` | read_retry=6 |
| `UPSTREAM_TIMEOUT__UNOBSERVED__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY` | read_retry=5 |
| `PROXY_MANAGER_UNAVAILABLE__HTTP_RESPONSE__HTTP_200__BR__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY` | read_retry=3 |
| `COMMENTS_UNAVAILABLE__HTTP_RESPONSE__HTTP_200__BR__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY` | read_failure=2 |
| `PROXY_MANAGER_UNAVAILABLE__RESPONSE_BODY__PROXY_MANAGER_UNAVAILABLE__HTTP_301__WIRE_COMPLETE__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY` | request_error=1, read_retry=1 |
| `UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__BOOTSTRAP__BOOTSTRAP` | request_error=1 |
| `PROXY_MANAGER_UNAVAILABLE__PROXY_ASSIGNMENT__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY` | read_retry=1 |
| `NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__BOOTSTRAP__BOOTSTRAP` | read_retry=1 |

- TLS: reply có30request deadline ở `proxy_tls`;31read_retry có thể lệch do ranh giới cửa sổ/restart. CONNECT200 rồi không có TLS data vẫn phù hợp bằng chứng packet capture trước: proxy ACK ClientHello rồi FIN, không RST/retransmission. Chưa xác định thành phần cụ thể giữa proxy và upstream. Pool giảm nhu cầu handshake mới, không sửa được lỗi phía NCC. Giữ nguyên kiểm tra certificate/protocol.
- `response_headers/ECONNRESET`: 1request riêng, không nhập vào TLS deadline.
- `proxy_connect`: 7request riêng, chưa có nativeCode đủ rõ; không đoán đó là TLS reset.
- Timeout `http_response`63read retry, `unobserved`32read retry vẫn cần giữ nguồn quan sát như ghi nhận. Metadata HTTP200 có thể thuộc bootstrap trước; không đủ để nói chính GraphQL đã nhận HTTP200.
- `response_body`, HTTP301/wireComplete có3timeout và1proxy-manager request: redirect lồng có thể mang metadata response trước. Chưa đủ provenance để khẳng định body301 hỏng hoặc biến thành TLS reset.
- `AUTH_REQUIRED`6read retry; `COMMENTS_UNAVAILABLE`2policy outcome theo cơ chế sẵn có. Không coi đây là thành công lấy đủ nội dung.
- UID: 10request ErrorRoute HTTP200 và7job_failed, vẫn cùng loại `FACEBOOK_PROFILE_ERROR_ROUTE`, không phải UID hợp lệ và không tự suy UID từ URL. Failed7 trong queue cuối. Retry không chữa được profile không trả proof UID.

Case TLS thật:

- 08:52:25 ICT, job `3480edc7668f209d08d807e673410e8929a06ec77d552e2cb5ce998e5b9c3048`, [post](https://www.facebook.com/1019040689567650_1699898801481832): CONNECT 200, elapsed 16376 ms, wireBytes 0, nativeCode `PROXY_TLS_HANDSHAKE_TIMEOUT`. Đây là deadline ứng dụng, không phải native TCP reset.
- 08:52:25 ICT, job `6ba25b8b4d2bc851ff56b57f0770e26b6ec366b27572713bccf7cc249476aa7c`, [post](https://www.facebook.com/1015415332998525_1909700293570020): CONNECT 200, elapsed 16096 ms, wireBytes 0, nativeCode `PROXY_TLS_HANDSHAKE_TIMEOUT`. Đây là deadline ứng dụng, không phải native TCP reset.

Mẫu phase08:58 có66–70reply đang chạy, chỉ1–7job có pending page chờ handoff; duration527ticket p5030.746s/p9556.748s. Phần lớn đang ở reader/prepare, chưa đủ telemetry để quy hết cho GET/TLS/author lookup; không có bằng chứng import là nút thắt chính.

## Validate và ES5

Native identity, UID proof, author/post/parent/date/cursor, auth gate, mapping và ACK từng bulk item được giữ nguyên. **9module bảo vệ hash không đổi**; 8file triển khai khớp manifest (observer áp hash hotfix riêng). Node production24.22.1: **183/183test pass**, zero failed; local Node20:182pass/1zstd skip. Hotfix structured log observer đã qua7test audit/observer bổ sung.

Cửa sổ cuối: **765bulk / 11097write-update ACK**, **0item lỗi**, p95832ms; không có nhóm ES import error hoặc runtime error mới. Đây là operation count, không phải unique document count. ES lúc09:02:43 green, pending task0, unassigned0, bulk queue/rejected0 trên mọi node. Heap một node87%, node khác83%; snapshot này không chứng minh cluster luôn dư tải, nhưng chưa thấy backpressure/rejection trong phép đo.

Đọc lại **5/5reply thật** trên ES5: mapping live pass, found/version hợp lệ, insertedDate mới sau enqueue, toàn bộ `_source` khớp payload trừ insertedDate động. So sánh cả author/site/nativeparent/URL/date/text/title/description/counters/delay; trường nội dung chỉ lưu hash/bytes trong evidence. Không tạo document giả và không dùng anonymous surrogate làm bằng chứng UID. Đây là kiểm tra mẫu, không thay thế validate từng item.

Evidence: [JSON](crawler-tls-reply-stability-2026-10-30-evidence.json). Báo cáo giai đoạn trước: [08:16](crawler-followup-2026-10-30-0816.md).
