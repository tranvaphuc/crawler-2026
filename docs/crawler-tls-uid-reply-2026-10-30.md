# Điều tra TLS / UID và tối ưu FB reply — 30/10/2026

Đã triển khai lúc **30/10/2026 07:46:22 ICT**. Backup: `/var/lib/crawler-v8/tls-uid-reply-opt-Et6yq3`. Đo sau triển khai từ **30/10/2026 07:47:11 → 30/10/2026 07:50:11 ICT** (3.00 phút). Đây là cửa sổ quan sát ngắn, không cam kết mọi khoảng thời gian sau này đều giảm khi đầu vào thay đổi.

## Kết quả chính

- FB reply waiting: **9,007 → 8,727**, active giữ 70; failed **0 → 0**. Từng mẫu 30 giây được ghi ở dưới; nếu có nhịp tăng thì báo nguyên số, không gọi là mọi mẫu đều giảm.
- 468 reply ticket hoàn tất trong cửa sổ, trong đó 3 done/skipped theo policy sẵn có; 465 còn lại hoàn tất processor bình thường. Hoàn tất ticket không phải số reply duy nhất đã được ES xác nhận. Không thay policy skip để làm đẹp queue.
- ES bulk ACK 3,398 thao tác write/update, 0 item lỗi; p95 794 ms. ES health **green**, pending task 0, unassigned 0.
- UID local sau reload (đến 30/10/2026 07:50:56 ICT): 226 job resolved; 0 job failed; 0 job dùng lượt đọc kiểm chứng, 0 job phục hồi sau lượt đọc này. Con số này chỉ thuộc khoảng log sau reload, khác cửa sổ đo queue ở trên.

## TLS: xác định được tới đâu

Đối chứng 07:34–07:35 ICT ngày 30/10 dùng đúng Node v24.22.1 / OpenSSL 3.5.9 trên server, cùng target/header cho từng phép thử:

| Endpoint | Kết quả |
|---|---|
| BG0 | 4/4 lỗi sau CONNECT 200, TLS chưa hoàn tất, không có HTTP origin |
| BG1 | 4/4 cùng kiểu lỗi, gồm Facebook và Cloudflare |
| BG2 | 4/4 hoàn tất HTTP 200 |
| Không proxy | Facebook hoàn tất TLS rồi trả HTTP 302; Cloudflare hoàn tất TLS/HTTP 200 |

Probe không proxy không follow redirect nên HTTP 302 chỉ chứng minh TLS và response ban đầu hoạt động, không chứng minh đọc được profile đầy đủ. Hai endpoint lỗi còn TTL nhiều phút; không phải đợt này cắt vì hết lease. Không dùng tỷ lệ lỗi của probe lựa chọn endpoint xấu làm tỷ lệ lỗi toàn traffic.

Bắt gói đối chứng bổ sung (30/10/2026 07:40:58 → 30/10/2026 07:42:00 ICT) có 12 flow probe đủ SYN + CONNECT 200. Trong **8 flow lỗi**, proxy ACK đủ ClientHello rồi là bên đầu tiên đóng bằng **FIN**, không gửi byte TLS nào sau CONNECT; **0 TCP RST từ proxy**, **0 payload retransmission** trên chặng được bắt. FIN sequence kết thúc đúng CONNECT response, FIN ACK kết thúc đúng ClientHello. PCAP được giữ riêng trên server ở `/tmp/crawler-deep-tls.private.pcap`; chỉ metadata đã lọc được tải về.

Vì vậy, ECONNRESET ở các mẫu này là biểu hiện của TLS chưa xong khi tunnel đóng; nó không chứng minh có TCP RST. Điểm lỗi nằm ở phía tunnel/proxy hoặc đường phía sau proxy. **Chưa phân biệt được gateway, exit, kết nối exit→origin hay timeout nội bộ NCC** nếu không có log NCC. Việc cùng endpoint lỗi trên hai origin không phù hợp với giả thuyết chỉ parser Facebook hoặc một HTTP 429/login response gây ra các mẫu này. Không kết luận mọi reset lịch sử cùng nguyên nhân, hoặc tất cả endpoint đều lỗi.

Không có bằng chứng để đổi TLS curve/cipher, bỏ certificate validation hay tăng timeout chung. Đợt đối chứng cũ cũng đã thấy endpoint tự phục hồi mà generation giữ nguyên. Chưa gửi thông tin hay tin nhắn cho NCC.

### Thay đổi giảm thời gian chiếm worker

2.278 timing TLS đã hoàn tất trong error-event của 20 phút trước sửa có handshake p50 639 ms / p95 1.042 ms / p99 1.247 ms / max 7.706 ms, không mẫu nào >15 giây. Đây là mẫu từ các lượt có error-event, **không phải phân phối của toàn bộ kết nối thành công**.

Crawler giờ giới hạn riêng bước TLS **15 giây kể từ khi socket TLS được cấp sau CONNECT**. HTTP request vẫn 60 giây; reader attempt vẫn 180 giây; retry budget vẫn 100. Deadline này là chủ động dừng của ứng dụng, có mã riêng **`PROXY_TLS_HANDSHAKE_TIMEOUT`**, phase `proxy_tls`, giữ limit/timing và CONNECT status. Không ghi thành native ECONNRESET. Sau lỗi worker giải phóng đúng session rồi đổi endpoint bằng cơ chế hiện có. CONNECT chưa được cấp socket, header/body/decode và session đã secureConnect không chịu timer TLS này. API runtime ngoài crawler giữ cấu hình cũ.

Giới hạn này giảm thời gian chờ mẫu Facebook thường bị peer đóng sau ~26 giây; nó không sửa được phía nhà cung cấp. Kết nối TLS hợp lệ nhưng chậm quá 15 giây sẽ phải đổi endpoint; cần theo dõi nhóm timeout riêng để đánh giá trade-off.

## UID: tách nguyên nhân thật, không điền UID phỏng đoán

Đọc lại 2 profile ở báo cáo 04:00 và 3 profile mới fail, cùng transport/config local hiện tại: 4/5 trả route profile có numeric UID hợp lệ; 1/5 trả **HTTP 200 + `CometErrorRoute`**, không có target UID. Một profile đối chứng cũng có proof hợp lệ. Transport local này dùng cấu hình header/cookie sẵn có và khác anonymous proxy worker; không dùng kết quả của nó để khẳng định anonymous crawler nhìn thấy cùng nội dung. Không thay credential hoặc thêm phiên đăng nhập.

Không tìm thấy bằng chứng lỗi parser UID trong các response profile đã có proof ở đợt kiểm tra này. Các response thất bại lịch sử không có snapshot/hash/route, nên **không thể kết luận response cũ là ErrorRoute hay lỗi layout**. Việc profile hiện resolve được chỉ bác bỏ kết luận nó vĩnh viễn không có UID.

Case thật (UID trong cột kết quả chỉ lấy từ đúng target-profile route; không dùng viewer ID, source ID hay parent ID):

| Job ID đã fail | Fail lúc ICT | Replay lúc ICT | Kết quả replay / profile |
|---|---|---|---|
| `e59f20bf6bf3c2c0ebbcf898afaff31a88f38a69acce32af5d998474e2509bc7` | 30/10/2026 02:53:17 | 30/10/2026 07:33:14 | UID `100035921200658`, proof `response.require.0.3.0.__bbox.require.8.3.0.initialRouteInfo.route.rootView.props.userID`; [profile](https://www.facebook.com/pfbid033poRoy8fvovh6SbzK1DDyc641fekin28gQS6yRHTargACagoGg9hVWbeHVJp3jwql) |
| `62da8b9a96a85238e198cddfa6e117f46910e9a6f2deb26215cd8488a454f39a` | 30/10/2026 04:31:43 | 30/10/2026 07:33:50 | UID `61568368923196`, proof `response.require.0.3.0.__bbox.require.8.3.0.initialRouteInfo.route.rootView.props.userID`; [profile](https://www.facebook.com/pfbid02HgomVEPe21D5uYp8EoDrXq9BMy8BGWVpkrPGi71yW4H9CCoxyHEoGERk1cirZ8mel) |
| `b295f97194e56df42f1b2e475dbbf810037ebff5590d1cea59b32249b10030ea` | 30/10/2026 04:31:48 | 30/10/2026 07:33:47 | UID `100005884842048`, proof `response.require.0.3.0.__bbox.require.8.3.0.initialRouteInfo.route.rootView.props.userID`; [profile](https://www.facebook.com/pfbid02HzAvnh2uU71PTaDh1gV1FqHkcV4jGTKSixTT2FpWwZcF4bir24FTQWcdjaGKv9fBl) |
| `df8b576b5b413cf15b072ab3e77c975fabeaafbc740a6ad2cb59347a3741a9f6` | 30/10/2026 03:13:15 | 30/10/2026 07:33:17 | UID `100016693518690`, proof `response.require.0.3.0.__bbox.require.8.3.0.initialRouteInfo.route.rootView.props.userID`; [profile](https://www.facebook.com/pfbid066BbhTWyTfNhMiAnxAuR2djUgKVo2CYaaRQmi4yADb3jP3iKH58A59An68VbMC1jl) |
| `e83df63dcc55339b9861edcfc3874e81dd3cbf289d77dd96b76cec5f480e2e3a` | 30/10/2026 07:29:33 | 30/10/2026 07:33:45 | Không có UID; comet.fbweb.CometErrorRoute; [profile](https://www.facebook.com/pfbid0QY7d2zezhWfuuLZbM7eeXbTxg6igTXqTjiFiAcmkSx3xhuHD6ZRqRwnNJjwbErhNl) |

Hash response, byte count, route name, URL và job/source/post được giữ trong evidence JSON. Không đưa HTML, cookie, CSRF, viewer ID hoặc nội dung cấu hình riêng vào báo cáo.

Các lỗi mới tách riêng: `FACEBOOK_PROFILE_ERROR_ROUTE`, `FACEBOOK_PROFILE_ROUTE_UID_MISSING`, `FACEBOOK_PROFILE_UNEXPECTED_ROUTE`, `FACEBOOK_PROFILE_PAYLOAD_MISSING`, `FACEBOOK_PROFILE_TARGET_ROUTE_MISSING`, `FACEBOOK_PROFILE_LOGIN_OR_CHECKPOINT`, `FACEBOOK_PROFILE_HTTP_<status>`; curl DNS/connect/TLS/deadline/body/decode giữ phase/code riêng như trước. ErrorRoute không tự chứng minh profile bị xóa, private hay chặn quốc gia.

Mỗi GET không trả proof ghi HTTP status, SHA-256, bytes, thời gian và route vào `flow_error_events` / `flow_uid_response_samples`; job fail giữ metadata cùng evidence. Với HTTP 200 chưa có proof, đọc kiểm chứng tối đa **1 lần thêm**, không chờ delay; chỉ nhận UID khi parser proof hiện có xác minh đúng target và không mâu thuẫn. HTTP lỗi/login/checkpoint không áp dụng lượt đọc này; UID conflict vẫn fail ngay. Không có retry vô hạn, không đổi budget của crawler, không retry hàng loạt failed job cũ. Bộ đếm failed của UID local được cập nhật cho lỗi mới; số lịch sử từng thiếu increment chưa được backfill.

## FB reply: giảm CONNECT/bootstrap lặp, giữ validation

Một native page vẫn là một Bull job, outbox/cursor/child handoff bền vững giữ nguyên. Sau một page thành công, phiên HTTP khỏe được giữ ngắn trong RAM để job kế tiếp lấy độc quyền. Cùng source/type/post URL/post ID thì có thể dùng lại context bootstrap; khác post chỉ được dùng lại transport nếu lease cùng scope `facebook.comments`, và bắt buộc xóa context/author map cũ để bootstrap lại đúng post mới. Chỉ một job được sở hữu phiên; không chia sẻ phiên đang busy, lỗi, terminal, sắp hết lease hoặc endpoint nằm trong exclusion của job. Tối đa 70 phiên nhàn rỗi, hết 30 giây thì đóng; eviction/shutdown giải phóng lease. Cookie/CSRF/session không được serialize vào checkpoint. Miss/expired dùng đường bootstrap cũ. Lỗi vẫn rotate và giữ cursor như trước.

Cơ chế này giảm handshake và bootstrap trên reply cùng post và giảm TLS cho post khác khi có transport khỏe cùng scope; không tăng worker 70, không thay thứ tự cursor, parent, chống pagination stall, native identity/date/author proof hay validation/mapping/per-item ACK của bulk. Nếu upstream auth/unavailable thì vẫn giữ policy và audit hiện có; không tính skipped là đọc đủ reply.

### Đo sau triển khai

| Giờ ICT | Reply waiting | Active | Failed | Import waiting | UID waiting |
|---|---:|---:|---:|---:|---:|
| 30/10/2026 07:47:11 | 9,007 | 70 | 0 | 12 | 0 |
| 30/10/2026 07:47:41 | 8,989 | 70 | 0 | 164 | 0 |
| 30/10/2026 07:48:11 | 8,937 | 70 | 0 | 0 | 0 |
| 30/10/2026 07:48:41 | 8,873 | 70 | 0 | 6 | 1 |
| 30/10/2026 07:49:11 | 8,817 | 70 | 0 | 0 | 0 |
| 30/10/2026 07:49:41 | 8,777 | 70 | 0 | 33 | 0 |
| 30/10/2026 07:50:11 | 8,727 | 70 | 0 | 0 | 0 |

Reply completed **155.95 ticket/phút**, pending giảm ròng **93.30 ticket/phút**. Trước sửa, sample 07:29:00 → 07:31:52 waiting 8.954 → 8.889 (~22,6/phút); đầu vào và phase source-round khác nhau nên đây là đối chiếu vận hành, **không phải A/B cô lập hoặc bằng chứng toàn bộ chênh lệch do bản vá**.

Pool events: `{"stored": 753, "hit": 73, "transport_hit": 470, "replaced": 230, "miss": 9}`. `hit` dùng lại đúng context/post; `transport_hit` chỉ dùng lại tunnel và bắt buộc bootstrap post mới.

Lỗi request TLS sau sửa (đếm request_error, không cộng read_retry cùng request):

| Queue | Phase | Reason | Native code | Số record |
|---|---|---|---|---:|
| facebook-comment | proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | PROXY_TLS_HANDSHAKE_TIMEOUT | 252 |
| youtube-comment | proxy_tls | UPSTREAM_NETWORK_ERROR | ECONNRESET | 71 |
| facebook-user-source | proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | PROXY_TLS_HANDSHAKE_TIMEOUT | 35 |
| facebook-page-source | proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | PROXY_TLS_HANDSHAKE_TIMEOUT | 32 |
| threads-source | proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | PROXY_TLS_HANDSHAKE_TIMEOUT | 30 |
| threads-comment | proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | PROXY_TLS_HANDSHAKE_TIMEOUT | 29 |
| facebook-reply | proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | PROXY_TLS_HANDSHAKE_TIMEOUT | 20 |
| youtube-source | proxy_tls | UPSTREAM_NETWORK_ERROR | ECONNRESET | 16 |
| instagram-source | proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | PROXY_TLS_HANDSHAKE_TIMEOUT | 15 |
| instagram-comment | proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | PROXY_TLS_HANDSHAKE_TIMEOUT | 10 |
| facebook-group-source | proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | PROXY_TLS_HANDSHAKE_TIMEOUT | 1 |

ES/node cuối cửa sổ:

| Node | Heap % | CPU % | Bulk queue | Bulk rejected (lifetime) |
|---|---:|---:|---:|---:|
| boom-master-new-hot-5 | 33 | 0 | 0 | 0 |
| boom-master-new-hot-4 | 47 | 5 | 0 | 0 |
| boom-master-new-hot-3 | 83 | 49 | 0 | 0 |
| boom-master-new-hot-1 | 86 | 78 | 0 | 0 |
| boom-master-new-hot-2 | 72 | 3 | 0 | 0 |

Runtime/storage error samples: **0** trong cửa sổ đo. Không dùng indexing_failed toàn cluster để gán lỗi cho crawler. Import failed cũ giữ 3 ticket; không bị clear để làm đẹp số.


## Đối chiếu reply đã lưu trong ES5

Mẫu đối chiếu lấy payload thật trước import và ES get tại 30/10/2026 07:50:28 ICT. Cả 3 khớp authorId, parentId, commentParentId, publishedDate, parentDate và URL. **2 bản có insertedDate sau enqueue; 1 bản chỉ xác minh dữ liệu đã tồn tại**, không tính bản cũ thành một write mới. Bộ mẫu này loại riêng quy ước anonymous-group để không dùng surrogate làm bằng chứng UID thật.

| Job ID | ES ID | Author ID | Kết quả |
|---|---|---|---|
| `8c3474410e37bbcb7ccd9745b1181314d543a6c98a219ad32bca47d4197da604` | `2048719349122590_2048763059118219` | `100009935263397` | Khớp dữ liệu đã tồn tại |
| `0f7f523291525f5157c444a5e0a62f71569d795a6e25669254f7776fd35601a5` | `2048353072492551_2048935055767686` | `100004000937579` | Khớp, ghi sau enqueue |
| `6cafcc1cafdcbe4bef8e3049d8d526585faa485044a9e7c1ea59d78f73f3dc43` | `2048745052453353_2048800952447763` | `100000333586616` | Khớp, ghi sau enqueue |

## Kiểm tra và phần còn lại

- Local: 128 pass, 1 zstd skip trên Node 20. Production staging Node 24: **129/129 pass**, gồm UID proof/conflict, session ownership/isolation/TTL/exclusion, TLS timer trước abort-induced reset, header/body budget, cursor/parent, shutdown, per-item bulk ACK và validation.
- Backup production gồm mã cũ, manifest SHA-256, queue/counter baseline và staging log. Graceful reload main và UID local; không xóa job, không retry failed hàng loạt, không đổi số worker, proxy ring hoặc credentials.
- Theo dõi tỷ lệ `PROXY_TLS_HANDSHAKE_TIMEOUT` so với TLS thành công; xác nhận với NCC bằng timestamp/endpoint hash/FIN metadata để phân biệt gateway/exit/backend. Chưa thể tự sửa thành phần phía NCC bằng code crawler.
- Quan sát riêng UID ErrorRoute kéo dài và các nhóm route/payload missing. Những profile không có native proof tiếp tục bị giữ failed; không lấy source/parent/viewer ID thay thế.
- Queue đang giảm trong cửa sổ đo nhưng vẫn còn backlog; khi tốc độ sinh reply lớn hơn tốc độ xử lý, backlog có thể tăng lại. Cần đối chiếu đầu vào theo source-round, không chỉ nhìn completed counter.

Mã chính: [transport](/Users/phuctran/Workspace/crawler-2026/src/services/socialHttpTransport.js), [session pool](/Users/phuctran/Workspace/crawler-2026/src/services/facebookSessionPool.js), [UID diagnostics](/Users/phuctran/Workspace/crawler-2026/src/services/facebookProfileDiagnostics.js), [local UID worker](/Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs).

[Bằng chứng đã khử bí mật](/Users/phuctran/Workspace/crawler-2026/docs/crawler-tls-uid-reply-2026-10-30-evidence.json).
