# Kiểm tra tiếp FB reply, TLS/UID và ES5 — 08:16 ngày 30/10/2026

**Chốt lỗi:** 30/10 07:50:11 → 30/10 08:16:01 ICT (25.83 phút). **Đo queue riêng:** 30/10 08:13:01 → 30/10 08:16:01 ICT, bảy mẫu cách 30 giây. ES stats tại 30/10 08:16:01; error reporter đọc snapshot queue/counter bổ trợ lúc 30/10 08:16:23, không coi snapshot đọc sau là đúng cutoff của event.

Phiên này chỉ đọc/kiểm tra, ghi báo cáo vào workspace. Không deploy, restart, retry, clean hay sửa dữ liệu production. Tám file runtime khớp SHA-256 với manifest deploy cuối. Service vẫn active, NRestarts=0, bắt đầu tiến trình từ 07:46:22 ICT. Log không có lần flow_started/stop_requested mới trong cửa sổ; không có runtime/storage error trong các nhóm đã theo dõi.

## FB reply: đang giảm ở mẫu mới, toàn khoảng vẫn có đợt tăng

- Mẫu mới: **8,690 → 8,431**, giảm cả 6 khoảng, active **70**, failed **0** xuyên suốt. Giảm ròng **86.28 ticket/phút**.
- 457 ticket hoàn tất trong cửa sổ mới (**152.24/phút**), gồm 3 done/skipped theo policy cũ. Ticket completion không phải số reply duy nhất đã import.
- Từ lần trước: **8,727 → 8,431**, chỉ giảm ròng **296** trong 25.83 phút, khoảng **11.46/phút**. Có 3506 ticket hoàn tất, gồm 68 policy skips.
- Không gọi toàn khoảng là “giảm đều”: journal có **14 nhịp tăng / 22 nhịp giảm** giữa 37 snapshot. Thấp nhất quan sát **8,302 lúc 30/10 07:57:50**, sau đó lên **8,867 lúc 30/10 08:09:23**. Nhiều job mới sinh đã bù phần lớn số hoàn tất. Đây là suy luận từ pending/completed; chưa có counter admission độc lập cho từng cửa sổ, nên không gán toàn bộ biến động cho proxy hoặc ES.

| Giờ ICT | Reply waiting | Active | Failed | Import waiting / active | UID waiting / active / failed |
|---|---:|---:|---:|---|---|
| 30/10 08:13:01 | 8,690 | 70 | 0 | 13 / 27 | 1775 / 20 / 1 |
| 30/10 08:13:31 | 8,645 | 70 | 0 | 31 / 34 | 1696 / 20 / 0 |
| 30/10 08:14:01 | 8,591 | 70 | 0 | 11 / 30 | 1609 / 19 / 0 |
| 30/10 08:14:31 | 8,538 | 70 | 0 | 61 / 53 | 1536 / 20 / 0 |
| 30/10 08:15:01 | 8,513 | 70 | 0 | 141 / 72 | 1459 / 20 / 0 |
| 30/10 08:15:31 | 8,472 | 70 | 0 | 7 / 18 | 1382 / 20 / 0 |
| 30/10 08:16:01 | 8,431 | 70 | 0 | 11 / 22 | 1298 / 20 / 0 |

Pool trong mẫu mới: 38 lần dùng lại context đúng post, 437 lần chỉ dùng lại transport cùng scope rồi bootstrap post mới, 24 miss. Không thay worker budget/cursor/validation trong phiên này.

## TLS: vẫn phát sinh hai nhóm đã biết, không có group TLS mới

So groupKey đầy đủ với event ledger từ mốc reset đến lần chốt 07:50:11: **không có groupKey mới ở phase `proxy_tls`**. Toàn khoảng mới có:

| Phase | Reason/native | request_error | read_retry | Ý nghĩa |
|---|---|---:|---:|---|
| proxy_tls | PROXY_TLS_HANDSHAKE_TIMEOUT | 1,634 | 1,634 | Ứng dụng chủ động kết thúc bước TLS ở giới hạn riêng; không phải native reset |
| proxy_tls | UPSTREAM_NETWORK_ERROR / ECONNRESET | 352 | 352 | Socket đóng trước secureConnect; vẫn giữ native code và phase riêng |

**Không cộng request_error với read_retry thành số request lỗi.** Nhóm reset TLS ở cửa sổ này thuộc YouTube source/comment; FB reply có **105 request_error** là deadline TLS riêng, không có native reset TLS được ghi nhận cho reply trong cửa sổ này. Không có quan sát mới về certificate/cipher/TLS decoder trong các group TLS; các lỗi phase unobserved vẫn là thiếu bằng chứng, không được tự gán về TLS.

Kết luận bắt gói từ đợt trước vẫn có giới hạn: FIN sau ClientHello đặt điểm lỗi ở tunnel/đường sau proxy; phiên này không bắt gói lại hoặc có thêm log NCC, nên không chốt sâu hơn gateway/exit/backend.

## UID: mới ghi nhận ErrorRoute thật trong ledger, một profile liên quan ba job

Có **4 request_error** và **3 job_failed** thuộc `FACEBOOK_PROFILE_ERROR_ROUTE`, phase `uid_profile_route`, **HTTP 200**, native code null. Chúng liên quan **một [profile](https://www.facebook.com/pfbid0QY7d2zezhWfuuLZbM7eeXbTxg6igTXqTjiFiAcmkSx3xhuHD6ZRqRwnNJjwbErhNl)**, không phải ba profile độc lập. Hai lượt lookup, mỗi lượt tối đa hai GET; một lượt lỗi được chia sẻ bởi nhiều job qua single-flight. Không cộng bảy event thành bảy request hay bảy profile lỗi.

Response trả `comet.fbweb.CometErrorRoute`, khoảng 2,23 MB decoded, 93 payload, không có target numeric UID được xác minh. Đây là nhóm đã có classifier và đã được tái hiện bằng probe trước đây, nhưng **lần đầu xuất hiện trong event ledger sau lần chốt 07:50**. Không phải lỗi TLS, HTTP 401/500 hay bằng chứng parser bỏ sót một UID đã có. Chưa có bằng chứng phân biệt profile bị xóa, private, hạn chế hay tình trạng khác phía Facebook; không suy diễn từ một ErrorRoute.

Hai case job thực (cùng source/post/profile; đây không phải hai nguyên nhân khác nhau):

| Job ID | Fail ICT | Post công khai | Bằng chứng |
|---|---|---|---|
| `0471c92e861064e66e196715589e7e5f1d5c60a437477410049ea770e7778e18` | 30/10 08:13:04 | [post](https://www.facebook.com/459549575287401_1832630314645980) | HTTP 200; comet.fbweb.CometErrorRoute; decoded 2,230,901 bytes; SHA256 `d568a3cb5a4a15ad7b2e472c3635a3ed404474fa153e64eb180bb0cdd388fa4a` |
| `8e0ce433dbc42dffdf4a660939776e42fcdfc77e6ceeb24d2926931b63a3b0a2` | 30/10 08:13:04 | [post](https://www.facebook.com/459549575287401_1832630314645980) | HTTP 200; comet.fbweb.CometErrorRoute; decoded 2,230,901 bytes; SHA256 `d568a3cb5a4a15ad7b2e472c3635a3ed404474fa153e64eb180bb0cdd388fa4a` |

Ledger ghi cả ba job fail dù Bull failed hiện tại đã bị clean. UID completed counter tăng **851** trong toàn cửa sổ, bao gồm job cũ được đưa lại vào queue; không gọi đây là số profile mới duy nhất. Shared failed counter tăng đúng **3** (6116→6119), khớp ba job_failed mới; không phải 3 lỗi HTTP mới.

## Biến động retry/clean trong lúc đo

Redis event stream xác nhận:

- **08:12:48 ICT:** 1.793 UID ticket nhận `waiting prev=failed`, tức được đưa lại vào queue.
- **08:13:08 ICT:** `es5-import` có `cleaned count=3`.
- **08:13:28 ICT:** `find-uid` có `cleaned count=3` sau ba job fail mới.

Không có operation tương ứng trong `flow_manual_retry_tickets` / `manualRetriedAt` hoặc manifest operation chuẩn được tìm thấy. Chưa xác định tác nhân/công cụ thực hiện; không tự kết luận người dùng, Bull Board hay một process cụ thể. Phiên kiểm tra này không thực hiện các thao tác đó.

Vì vậy **Bull failed=0 không có nghĩa lỗi đã hết hoặc ba lỗi validation đã được sửa**. Mongo vẫn giữ ba lỗi import cũ `EXACT_PUBLICATION_DATE_REQUIRED`; trong cửa sổ mới không có job_failed import mới. Một phần Mongo UID state=failed là dòng lịch sử đang được Redis retry lại và chưa tới lượt worker, không phải fresh failure. Chỉ dùng event ledger theo cutoff để đếm lỗi mới. Event stream có retention gap ở import/reply nên chỉ khẳng định các thao tác quan sát được, không gọi tổng event stream là lịch sử đầy đủ của toàn khoảng.

## Import ES5: không có bulk item lỗi; năm mẫu dữ liệu khớp

| Cửa sổ | Batch | Write/update ACK | Item lỗi | p50 / p95 / max |
|---|---:|---:|---:|---|
| 30/10 07:50:11 → 30/10 08:16:01 | 1,813 | 29,595 | 0 | 339 / 796 / 1796 ms |
| 30/10 08:13:01 → 30/10 08:16:01 | 222 | 3,271 | 0 | 346 / 734 / 1295 ms |

Đây là thao tác write/update được ACK, không phải unique inserts. Counter indexed và số bulk ACK có ranh giới cập nhật khác nhau, không ép chúng bằng nhau.

Import waiting dao động **13→31→11→61→141→7→11**, cuối mẫu active22: có burst, chưa có xu hướng tích lũy backlog trong ba phút này. ES health **green**, pending tasks **0**, unassigned **0**; tất cả năm node bulk queue=0 và lifetime rejected=0. Hot-1 vẫn heap86%/CPU76%, hot-3 heap83%/CPU50%; đây là áp lực cluster đang có, không gọi toàn cluster nhàn rỗi hoặc gán lỗi pipeline khác cho crawler.

Lấy payload reply thật trong outbox trước import, đối chiếu bằng ES get. Hai mẫu chưa xác nhận được ở vòng get đầu; recheck lúc **30/10 08:14:22 ICT** cho kết quả **5/5 found, 5/5 khớp**, insertedDate của cả năm sau enqueue. So authorId, parentId, commentParentId, publishedDate, parentDate và URL; các mẫu loại riêng quy ước anonymous-group để không dùng surrogate làm bằng chứng UID thật.

| ES ID | Author ID | Job ID | Khớp | Enqueue→insertedDate |
|---|---|---|---|---:|
| `2534010370453461_2534013277119837` | `100006986110034` | `4adbfcd2a898ea633687b17e953f0de9790333df8054746e8ab1cc9c0003bb31` | True | 15.756 s |
| `4225535594245654_4225555197577027` | `100004189388412` | `13a476c001e6882f2a0201f526cb8429724bd824b0201c9fc6055e7e8050ce12` | True | 14.152 s |
| `28805034155773128_28863835456559664` | `100003819276345` | `b6f54dc42997e375d1d0bdaaba399587a4fe13abbb7e06e580f70f32b60d6d83` | True | 13.779 s |
| `2260756914486580_2260764581152480` | `676985022` | `b8082afd4e7bb494f9d0206a636f3d70163bb3a6d17afa4ab26171c897d5cc9f` | True | 13.870 s |
| `28805034155773128_28878509125092297` | `100003819276345` | `dce0f5bfbfe4e72f1cdb2481b4f0e3ed59e7ffc65bfd11fdf7e0a8a331454567` | True | 13.171 s |

Độ trễ enqueue→insertedDate khoảng 13–16 giây trong bộ mẫu này; chưa tách queue wait khỏi preparation nên không gán là ES chậm. Bulk ACK p95 dưới một giây và queue/rejection trên ES không tăng. Không sửa dữ liệu để tạo mẫu khớp; đây là đối chiếu với payload, không phải chứng minh độc lập mọi fact trong toàn ES.

## Những nhóm mới khác và khoảng trống provenance

Có **107 groupKey** trong cửa sổ, **20 groupKey chưa có trước cutoff**; đó là tổ hợp queue/phase/reason/status/operation/query/type mới quan sát, không phải 20 nguyên nhân gốc mới. Ngoài UID, có HTTP500/502 theo context bootstrap/source, timeout context mới và một FB user GraphQL error HTTP200. Một YouTube source kết thúc retry exhaustion do timeout; các lỗi này tách khỏi TLS/UID/ES.

Một số wrapper redirect HTTP301 giữ phase `response_body` dù `wireComplete=true`, gồm timeout, manager-unavailable và reset. Không được gọi chúng là hỏng body301 hay lỗi TLS chỉ dựa vào nhãn đó: parent redirect có thể nhận lỗi truyền ngược từ request con hoặc bước permit trước request con. Cần timeline con/boundary để chốt phase thật. Báo cáo giữ nguyên raw telemetry và đánh dấu khoảng trống này, không tự đổi nativeCode thành ECONNRESET hoặc NETWORK_ERROR. Phiên này chưa sửa code phân loại.

### Toàn bộ 20 groupKey mới quan sát

Mỗi dòng giữ đầy đủ chữ ký trong evidence JSON; alias ở nhiều mức quan sát được ghi riêng. Case ID và thời gian có thật; không cộng số quan sát thành số kết nối độc lập.

**N01 — facebook-comment / UPSTREAM_TIMEOUT**: phase `http_response`, native `None`, HTTP `200`, operation `comments`, query `CommentsListComponentsPaginationQuery`, type `None`, wireComplete `True`; read_retry=15.

- `85c75a6e9afb685119b6375cd7031f9f8cc3f5c4298c935802c71889942c79cb` — 30/10 08:04:27 ICT — [URL công khai](https://www.facebook.com/1052037723261409_1752971396501368).
- `af7dc99aa4bc857cf2c12bfa06db33839a16fca5ef7836e5db14e75e70b45e65` — 30/10 07:55:30 ICT — [URL công khai](https://www.facebook.com/1029571458304263_1788038542457547).

**N02 — facebook-comment / UPSTREAM_TIMEOUT**: phase `unobserved`, native `None`, HTTP `None`, operation `comments`, query `CommentsListComponentsPaginationQuery`, type `None`, wireComplete `None`; read_retry=12.

- `f520d9d56c09fed20796de13fe5b1636c886ce481401a6c9821a1cd48d28339f` — 30/10 07:57:07 ICT — [URL công khai](https://www.facebook.com/1023069638660550_1657807175186790).
- `e378166d7e1f6c47911854702574b3e89ab3f9b86399b11adec3751ff8658ab2` — 30/10 08:02:37 ICT — [URL công khai](https://www.facebook.com/1047115346385911_1720437139053725).

**N03 — facebook-comment / UPSTREAM_TIMEOUT**: phase `unobserved`, native `None`, HTTP `None`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `None`; read_retry=5.

- `cdd5c4518eecf088c428c50c3425ced3a33fcca101f656fccfd2b56414b52425` — 30/10 07:59:34 ICT — [URL công khai](https://www.facebook.com/1046176849114245_2970739726657938).
- `e6a97e160fc8b25ce7e4c9974d89833d8bdbdd283abdb8dbe867b1eea543bb31` — 30/10 08:01:10 ICT — [URL công khai](https://www.facebook.com/1046176849114245_2971000706631840).

**N04 — find-uid / FACEBOOK_PROFILE_ERROR_ROUTE**: phase `uid_profile_route`, native `None`, HTTP `200`, operation `local_curl_profile`, query `None`, type `None`, wireComplete `None`; request_error=4.

- `e83df63dcc55339b9861edcfc3874e81dd3cbf289d77dd96b76cec5f480e2e3a` — 30/10 08:12:51 ICT — [URL công khai](https://www.facebook.com/459549575287401_1832630314645980).
- `0471c92e861064e66e196715589e7e5f1d5c60a437477410049ea770e7778e18` — 30/10 08:13:01 ICT — [URL công khai](https://www.facebook.com/459549575287401_1832630314645980).

**N05 — facebook-reply / UPSTREAM_TIMEOUT**: phase `response_body`, native `UPSTREAM_TIMEOUT`, HTTP `301`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `True`; read_retry=2, request_error=2.

- `6b9bfdbc5cf04f16d0152f36fc08d70ef334243a4c58b94532a1e19aeffc09b6` — 30/10 08:11:03 ICT — [URL công khai](https://www.facebook.com/425300617173995_1074598008910916).
- `e65d2cb4768d6596f460aa832b967fe5c9cde650acd0b16c2d06c1c6e7fe5f95` — 30/10 08:11:37 ICT — [URL công khai](https://www.facebook.com/427925904366690_2530612927431300).

**N06 — find-uid / FACEBOOK_PROFILE_ERROR_ROUTE**: phase `uid_profile_route`, native `None`, HTTP `200`, operation `local_curl_profile`, query `None`, type `Error`, wireComplete `None`; job_failed=3.

- `0471c92e861064e66e196715589e7e5f1d5c60a437477410049ea770e7778e18` — 30/10 08:13:04 ICT — [URL công khai](https://www.facebook.com/459549575287401_1832630314645980).
- `8e0ce433dbc42dffdf4a660939776e42fcdfc77e6ceeb24d2926931b63a3b0a2` — 30/10 08:13:04 ICT — [URL công khai](https://www.facebook.com/459549575287401_1832630314645980).

**N07 — facebook-comment / NETWORK_ERROR**: phase `response_headers`, native `ECONNRESET`, HTTP `None`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `None`; read_retry=3.

- `9e09b75a4671ff95af1ac8a762e91e58bf8fe2e3cd3b3e93e536e9da873925ae` — 30/10 07:57:34 ICT — [URL công khai](https://www.facebook.com/1038242099706240_3442311769299249).
- `3320f08eafc11c4255b1072113009286fe13966f8bcf1c8a3896cc5d6da3b30e` — 30/10 08:00:23 ICT — [URL công khai](https://www.facebook.com/1046176849114245_2970907906641120).

**N08 — facebook-comment / UPSTREAM_NETWORK_ERROR**: phase `response_headers`, native `ECONNRESET`, HTTP `None`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `None`; request_error=3.

- `9e09b75a4671ff95af1ac8a762e91e58bf8fe2e3cd3b3e93e536e9da873925ae` — 30/10 07:57:33 ICT — [URL công khai](https://www.facebook.com/1038242099706240_3442311769299249).
- `0cb8def0c1eb58639e92847c569905faa888ae0666b4606dd3dc9f9f437402b5` — 30/10 07:59:39 ICT — [URL công khai](https://www.facebook.com/1046176849114245_2970853643313213).

**N09 — facebook-comment / UPSTREAM_TIMEOUT**: phase `response_body`, native `UPSTREAM_TIMEOUT`, HTTP `301`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `True`; read_retry=1, request_error=1.

- `9d0b90e0f30ce82969345958f5c7a051fcc5a54fa5219774bd05131423e08fbb` — 30/10 08:04:50 ICT — [URL công khai](https://www.facebook.com/1052037723261409_1752925139839327).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N10 — facebook-reply / PROXY_MANAGER_UNAVAILABLE**: phase `response_body`, native `PROXY_MANAGER_UNAVAILABLE`, HTTP `301`, operation `replies`, query `Depth1CommentsListPaginationQuery`, type `None`, wireComplete `True`; read_retry=1, request_error=1.

- `5be49591856860f33ae04f5726cf6f16cbd8667a91a4497cc1c11829a6dc81a4` — 30/10 07:50:59 ICT — [URL công khai](https://www.facebook.com/376766752984533_2049300299064495).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N11 — threads-source / UPSTREAM_HTTP_502**: phase `http_response`, native `None`, HTTP `502`, operation `source`, query `None`, type `None`, wireComplete `True`; request_error=1.

- `3145eb52d4d0fdc288e38d0fd05bf9e85614e5c3fe8b7ec0213775be112142fe` — 30/10 08:00:37 ICT — [URL công khai](https://www.threads.com/@kancas.nt).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N12 — threads-source / UPSTREAM_HTTP_ERROR**: phase `http_response`, native `None`, HTTP `502`, operation `source`, query `None`, type `None`, wireComplete `True`; read_retry=1.

- `3145eb52d4d0fdc288e38d0fd05bf9e85614e5c3fe8b7ec0213775be112142fe` — 30/10 08:00:37 ICT — [URL công khai](https://www.threads.com/@kancas.nt).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N13 — facebook-comment / FACEBOOK_SERVER_ERROR**: phase `http_response`, native `None`, HTTP `502`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `True`; read_retry=1.

- `5fe4e0b8a472b05c3e8f2f4d5ba9b44cb287c2b4d155c8ffaab3779ebf5b7e12` — 30/10 08:05:39 ICT — [URL công khai](https://www.facebook.com/1054212581616363_2923752127995723).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N14 — facebook-reply / UPSTREAM_HTTP_500**: phase `http_response`, native `None`, HTTP `500`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `True`; request_error=1.

- `405630367a2bb48af84a879c22acef5b3939a2bd115cda748fd421c2073c2b74` — 30/10 07:56:10 ICT — [URL công khai](https://www.facebook.com/383392535931350_2260332561570662).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N15 — facebook-reply / FACEBOOK_SERVER_ERROR**: phase `http_response`, native `None`, HTTP `500`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `True`; read_retry=1.

- `405630367a2bb48af84a879c22acef5b3939a2bd115cda748fd421c2073c2b74` — 30/10 07:56:10 ICT — [URL công khai](https://www.facebook.com/383392535931350_2260332561570662).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N16 — facebook-user-source / FACEBOOK_GRAPHQL_ERROR**: phase `http_response`, native `None`, HTTP `200`, operation `source`, query `None`, type `UnrecoverableError`, wireComplete `True`; job_failed=1.

- `afcbc6293ec696c4f8ab28748763b4f9bc762e53ca1b47b89d56212d7732a3f8` — 30/10 08:13:12 ICT — [URL công khai](https://www.facebook.com/100003174065265).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N17 — facebook-reply / UPSTREAM_TIMEOUT**: phase `unobserved`, native `None`, HTTP `None`, operation `replies`, query `Depth1CommentsListPaginationQuery`, type `None`, wireComplete `None`; read_retry=1.

- `0be400b9cd95540fda82b34797aa7ac781c842845410639dd467f499b777b8cf` — 30/10 08:14:26 ICT — [URL công khai](https://www.facebook.com/433204580763100_2413198786096993).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N18 — facebook-comment / UPSTREAM_HTTP_502**: phase `http_response`, native `None`, HTTP `502`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `True`; request_error=1.

- `5fe4e0b8a472b05c3e8f2f4d5ba9b44cb287c2b4d155c8ffaab3779ebf5b7e12` — 30/10 08:05:39 ICT — [URL công khai](https://www.facebook.com/1054212581616363_2923752127995723).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N19 — facebook-comment / UPSTREAM_NETWORK_ERROR**: phase `response_body`, native `ECONNRESET`, HTTP `301`, operation `bootstrap`, query `bootstrap`, type `None`, wireComplete `True`; request_error=1.

- `0cb8def0c1eb58639e92847c569905faa888ae0666b4606dd3dc9f9f437402b5` — 30/10 07:59:39 ICT — [URL công khai](https://www.facebook.com/1046176849114245_2970853643313213).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.

**N20 — facebook-user-source / FACEBOOK_GRAPHQL_ERROR**: phase `http_response`, native `None`, HTTP `200`, operation `source`, query `None`, type `None`, wireComplete `True`; read_failure=1.

- `afcbc6293ec696c4f8ab28748763b4f9bc762e53ca1b47b89d56212d7732a3f8` — 30/10 08:13:11 ICT — [URL công khai](https://www.facebook.com/100003174065265).
- Chỉ có một job case trong nhóm; không tạo case thứ hai.


## Kiểm tra tính đầy đủ

Ledger: request_error2068, read_retry4730, read_failure516, job_failed5; tổng7319 observation ở các mức khác nhau. Main journal có7312 flow_error + UID local7 =7319. Năm terminal failures gồm UID3, Facebook-user-source GraphQL1, YouTube-source timeout1; Facebook reply/import không có terminal failure mới trong cửa sổ. Không có worker/counter/feeder/error-event-store error trong journal được đọc. Không cộng các mức này thành7319 request lỗi.

[Toàn bộ bằng chứng JSON đã khử bí mật](/Users/phuctran/Workspace/crawler-2026/docs/crawler-followup-2026-10-30-0816-evidence.json). [Báo cáo deploy trước](/Users/phuctran/Workspace/crawler-2026/docs/crawler-tls-uid-reply-2026-10-30.md).
