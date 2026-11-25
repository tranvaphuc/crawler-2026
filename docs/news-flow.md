# Luồng news HTTP → ES5

Điều phối hiện tại được đối chiếu và sửa theo eastdata; xem `docs/news-eastdata-flow.md` về hai channel, FIFO, backpressure và trạng thái processed của URL.

Luồng độc lập trong `src/newsFlow`, chạy bằng Node **>=22.13** (SQLite tích hợp). Dùng Axios qua proxy cho mọi request bài, danh mục và API/feed công khai. Không cần Redis/MongoDB cho luồng này.

## Luồng xử lý

1. Nạp 544 source từ `config/web-sources/news`; dùng bản `antt.vn.validated.json`. Nạp lại category hiện tại, không dùng bản inventory cũ. Tổng tại lúc build: **13.783 URL seed** gồm trang chủ và category.
2. Homepage và category cùng FIFO trong SQLite WAL. Hai channel discovery/article có ngân sách riêng. Queue bài ưu tiên đồng hồ bài mới đã quan sát trong card, tiếp theo link mới/được thấy lại trên seed; claim giữ đúng thứ tự batch, refresh batch mỗi 2 giây. Backlog cũ chỉ dùng phần nền; timestamp trong card chỉ dùng điều phối, không thay thế ngày đăng đã xác minh. Mỗi publisher có lịch seed bền vững riêng: chỉ thêm lượt sau tối thiểu 5 phút khi site đã hết seed pending/running và hết cooldown. Các site còn backlog/cooldown không giữ site khác; URL đang chờ được gộp giữa các vòng. Không còn ngưỡng 100 seed toàn hệ thống.
3. Lấy link bài từ seed, bỏ category đã biết, paging, utility, tag/search, file/media. Không theo next page, không tự thêm category chưa cấu hình.
4. Trong mỗi HTML bài, tiếp tục đưa các link bài hiển thị vào queue. Mỗi URL request tối đa một lần trong vòng, kể cả redirect/API/feed được nhiều bài dùng chung. URL lỗi được lưu bền vào `url_failures` để kiểm tra riêng về sau; không tự retry ở vòng mới, khi hết cooldown hoặc khi parser đổi cấu hình. URL bài đã xử lý có catalog processed nên không tải lại khi seed gặp lại. Link trong HTML bài hợp lệ được lưu vào queue trước lookup feed, parse nội dung và ghi ES; trang category/non-article không được mở rộng như bài. Chỉ thao tác kiểm tra/refresh thủ công rõ ràng mới được vượt chặn URL lỗi. Conditional GET dùng ETag/Last-Modified nếu publisher hỗ trợ.
5. Parser cấu hình + adapter HTTP công khai xử lý HTML/JSON; worker kiểm tra độc lập title, body coverage, description và ngày xuất bản. Bài lấy qua aggregator phải xác định publisher thật, dùng cấu hình và identity publisher đó.
6. Giữ riêng bài lỗi parse, ngày thiếu giờ/phút/timezone, giờ tương lai, canonical khác publisher, nội dung hạn chế hoặc description dùng chung đã phát hiện. Không tự điền `now` thành giờ đăng. Chưa gọi model trả phí trong runtime; sự kiện quarantine và bằng chứng phục vụ sửa parser offline rồi kiểm tra holdout.
7. Bài hợp lệ trong **24 giờ gần nhất** vào outbox. Bài cũ vẫn lấy link hiển thị nhưng không import lịch sử. Có thể đổi `--max-age-hours`.
8. Outbox ưu tiên publishedDate mới; bulk refresh riêng để không đợi refresh_interval chung, rồi đối soát sau ghi. Writer tra URL/alias và native ID trên `master*`, kiểm tra đủ shard và mapping, giữ nguyên document đã có. Chỉ `create` bài mới; lỗi đối soát không được đi tiếp thành import.

## ID, field và time đã đối chiếu

ID eastdata: `md5(URIjs(url).domain() + title + url)` với encoding **Latin-1**, không phải UTF-8. URL và title dùng đúng dữ liệu bài; chuẩn hóa queue không được thay preimage ID. Đã chạy hàm ID trích từ eastdata và so với 30 document ES5 thật, khớp 30/30.

Trước khi tạo mới, tra URL với các biến thể http/https, www và slash; native ID được giới hạn publisher và loại article/video. Nếu title/slug đổi mà tìm thấy document cũ, giữ nguyên `_id`, `_index`, `insertedDate`, publishedDate và các counter của document cũ. Xung đột hay nhiều document cùng identity sẽ giữ riêng để review.

DTO chỉ gửi các field theo mapping `newsTopic`: `insertedDate`, `publishedDate`, `authorId`, `author`, `siteId`, `siteName`, `title`, `content`, `description`, `url`, `picture`, `likes`, `comments`, `shares`, `interactions`, `ds.source`. Không gửi thông tin debug/extracted vào ES. Author fallback là tên/siteId như mẫu ES5; có tác giả thì dùng MD5 Latin-1 của siteId + author theo parser cũ.

`publishedDate` là thời gian đăng gốc đã xác minh, chuyển UTC ISO; không dùng dateModified. Index `masterGGGGWW` tính theo tuần ISO ở **Asia/Ho_Chi_Minh**, độc lập timezone VPS. Đã kiểm tra cả hai phía mốc thứ Hai bằng document thật. `insertedDate` mới dùng UTC thực; code cũ có nhánh cộng dư 7 giờ, không sao chép lỗi đó và không sửa document lịch sử.

Create-only xử lý race ID bằng 409. Sau create có đối soát lại; nếu phát hiện producer cũ tạo identity khác cùng URL thì chỉ rollback document vừa tạo của luồng này với đúng version, không sửa document cũ. Để đảm bảo duy nhất khi chạy production, cần chuyển quyền ghi news sang một producer: ES5 không có unique constraint toàn bộ URL giữa các ID/index nếu nhiều hệ thống độc lập cùng ghi và đổi title cùng lúc.

## Proxy và vận hành

11 proxy đã cấp nằm ở `outputs/news-flow-runtime/proxies.credentials.json`, thuộc gitignore. Không đưa secret vào repo hay log. Format: JSON array `{id,host,port,username,password}`. Có thể chỉ định `NEWS_PROXY_FILE` hoặc `--proxy-file`. ES5 dùng `ES5_HOST` từ `.env`; không in endpoint/credential.

Proxy giữ theo publisher trong vòng. Mặc định 32 task đồng thời (16 discovery + 16 article), 2 parser worker; một task mỗi publisher, tối thiểu 3 giây giữa các request cùng host. 403/429 làm pause host theo Retry-After, không đổi proxy để vượt block. Lỗi proxy không fallback request trực tiếp. TLS luôn xác minh chứng chỉ. IP khác nhau không bảo đảm publisher sẽ chấp nhận request.

SQLite lưu queue, request cache, identity ledger và outbox để phục hồi. Sau crash, request đang chạy được đánh dấu gián đoạn và không gọi lại URL đó trong cùng vòng. Một process giữ lock/heartbeat cho một database. Chạy daemon bằng một service; không mở hai DB ghi cùng một nguồn để chạy song song.

Response nén được khử trùng theo hash. Body của vòng đã xong giữ một giờ, metadata queue/vòng 24 giờ, cache 24 giờ, bằng chứng lỗi 2 ngày và events 7 ngày; identity ledger giữ để chống trùng. Theo dõi dung lượng database/WAL, backlog và thời gian chờ trên VPS. Quarantine cần được đọc và sửa; không coi lỗi là đã import thành công.

## Chạy

```sh
node scripts/preflight_news_es5.mjs
node scripts/probe_news_proxies.mjs
node scripts/verify_news_flow_live.mjs
node scripts/run_news_flow.mjs --once --sites kenh14.vn --max-requests 10 --duration-seconds 120
```

Preflight cần source eastdata ở `../eastdata` để chứng minh hàm ID; lưu proof ở `outputs/news-flow-build-2026-11-12/identity-proof.json`. Khi chuyển VPS, copy file proof đã xác minh cùng runtime secret qua kênh riêng. Writer kiểm tra fingerprint cluster trước khi chạy, không dùng proof của cluster khác.

Mặc định dry-run: fetch/parse/đối soát ES thật nhưng không ghi. Chạy nhiều site bằng `--sites 'kenh14.vn,tuoitre.vn'`. Smoke test có budget sẽ để lại task chờ, không phải báo cáo toàn bộ site đã hoàn thành. Dùng `--state` mới để cô lập mỗi lần thử.

```sh
# Daemon dry-run toàn bộ registry
node scripts/run_news_flow.mjs
# Chạy writer sau khi kiểm tra report/mapping/preflight
node scripts/run_news_flow.mjs --write
# Kiểm tra riêng một link có sẵn
node scripts/run_news_flow.mjs --once --sites kenh14.vn --url 'https://kenh14.vn/URL-BAI.chn' --no-expand
```

DB mặc định tách `dry-run.sqlite` và `write.sqlite`; không dùng DB dry-run cho writer. `--once` chỉ tạo một vòng seed rồi xử lý queue, graph link có thể lớn. Dùng `--max-requests`/`--duration-seconds` cho kiểm tra có giới hạn. SIGINT/SIGTERM dừng nhận task mới và chờ request đang xử lý. Report in JSON, gồm request thật, task/outbox theo trạng thái, backlog; events `verified` có publication evidence/timezone/lag. `created` là đã xác nhận ghi, `existing` là giữ nguyên bài cũ, `held` là cần kiểm tra, `pending` là chưa hoàn tất.

## Mục tiêu 20 phút

Chu kỳ seed 5 phút chưa tự bảo đảm SLA 20 phút. Với 13.783 seed và link đệ quy, phải đo thông lượng, tốc độ phát sinh bài, backlog và lag trên VPS thực. Benchmark có giới hạn chỉ chứng minh flow chạy đúng, không chứng minh đã quét 544 site hay toàn bộ category trong 20 phút. Dùng các metric để điều chỉnh concurrency/interval và phân bổ seed sau khi đo, vẫn giữ giới hạn mỗi publisher.

Service mẫu: `deploy/news-flow.service.example`. File này chưa được cài, chưa tự bật production writer.

## Kiểm thử

```sh
npm run test:news-flow
```

Kiểm thử có proxy HTTP giả lập loopback và mock ES5: dedup mỗi vòng, redirect, cache304, proxy auth/cooldown, crash recovery, ID/time/index, mapping, document đổi title, duplicate race và parse/field quarantine. Kiểm tra ES5 thật dùng script live chỉ đọc; không có bulk import production trong quá trình build.


Production dùng hai service: crawler/parser `news-flow.service --external-writer` chỉ ghi outbox, importer `news-flow-writer.service` chỉ đối soát và bulk create ES5. Hai process dùng chung SQLite WAL và shared slice4CPU/4GiB. Crawler restart không reset sending của writer; writer restart không recover các task/request crawl. Lease riêng ngăn hai writer cùng xử lý; chỉ importer sở hữu lease mới được gửi mutation ES. Lỗi news URL giữ nguyên review ledger và không tự retry.


Từ release17, admission queue bài dùng parse_admissions với canonical articleKey (bỏ slash cuối path, www và khác biệt HTTP/HTTPS, tracking/fragment; giữ path case và query có ý nghĩa). Ledger ghi atomically ngay khi enqueue, không bị prune với tasks/catalog, nên URL đã từng vào parse queue không tự vào lại ở vòng sau hoặc sau restart. Các phát hiện lại chỉ cập nhật ưu tiên của task hiện có. Không dùng ES hoặc ES identity để quyết định admission. Giữ nguyên URL request, url_key transport và ID legacy; seed polling vẫn lặp theo vòng như cũ. Chỉ refresh/check thủ công rõ ràng mới được vượt dấu đã xử lý; không có workflow tự retry.
