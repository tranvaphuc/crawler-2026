# Import bài cũ, chỉ lấy comment cho bài trong 72 giờ

Triển khai lúc **15:35:57 ngày 02/11/2026**, giờ Việt Nam. Chính sách mới áp dụng cho bài đã được source reader trả về trên các nền tảng của crawler.

## Hành vi

- Bài quá 72 giờ vẫn đi qua luồng import ES5 bình thường, giữ kiểm tra native ID, tác giả, ngày đăng, mapping và acknowledgement từng item. Bỏ điều kiện skip bài cũ ở source loop và hai điều kiện OUTSIDE_ROLLING_WINDOW trong writer.
- Không tạo comment target mới cho bài quá 72 giờ. Nếu target đã tồn tại, cập nhật commentEligible=false sau ES ACK, giữ counter native và provenance. Không đổi số comment trên ES thành 0 chỉ vì không crawl comment.
- Scanner comment xét ngày đăng gốc của bài, không chỉ lastInteractionAt. Nó hỗ trợ ngày lưu dạng ISO string và BSON Date.
- Job comment/reply đã queued cũng kiểm tra tuổi bài trước từng native read, bao gồm retry và continuation. Bài hết cửa sổ kết thúc done/skipped với POST_OUTSIDE_COMMENT_WINDOW, không gọi reader hay đổi proxy vì điều kiện tuổi bài. Comment đã tồn tại trong ES không bị xóa; dữ liệu comment đã được thu và chờ import vẫn qua các bước xác thực hiện có.
- **Chính sách hiện tại, cập nhật lúc 16:45:44 theo xác nhận mới:** trang đầu vẫn được nextpage nếu còn cursor, bài ghim quá 72 giờ không làm dừng phân trang ở bất kỳ trang nào. Từ trang 2, gặp bài không ghim quá 72 giờ thì import batch đã trả về rồi dừng nextpage. Bài cũ vẫn không lấy comment/reply. Thay thế chính sách dừng ngay từ trang đầu đã triển khai lúc 16:24.

## Kiểm thử và canary

Local: **356/356 đạt**. Trên Node24 với các module runtime thực tế: **103/103 kiểm thử trực tiếp liên quan đạt**. Broad suite có3lỗi đã tồn tại ở baseline, không phải regression của bản sửa: getter-only Mongo error classification và2legacy comment-repair cases. Baseline còn có một lần lỗi test TLS reuse; case này đạt trong suite focused. Không đưa các thay đổi ngoài phạm vi lên production để làm xanh suite.

Canary đọc bài thật của group FPT Polytechnic Tây Nguyên:

- Post2376394296497709, ngày đăng **17/09/2026 10:41:02 Việt Nam**, author và identity native hợp lệ.
- Ghi qua validated bulk writer vào master202638/fbGroupTopic, ID980857079384778_2376394296497709.
- ES get khớp publication, author, siteId, URL và counter. Counter11 là số native từ bài, không phải11comment được crawl trong canary.
- allowCreate=false, commentEligible=false, commentWindowExpired=true; không có target mới, số job comment trước/sau đều0, native comment reads=0. Job gate trả POST_OUTSIDE_COMMENT_WINDOW.

## Triển khai và kiểm tra thực tế

Thay3file: scripts/crawler_queue_flow.mjs, src/services/crawlerPostHandoff.js, src/services/crawlerQueueFlow.js. Có backup/hash/owner/mode guards và rollback khi readiness lỗi. Drain/restart9vai trò server vì runner được dùng chung; **16checkpoint mẫu Mongo/Bull giữ nguyên**. Proxy manager/API/queue board không restart; concurrency, topology và runtime env không đổi. Không retry/clear hàng loạt ticket cũ.

Kiểm tra lúc **15:38:32**: cả9vai trò active, NRestarts=0, pulse/PID khớp; tất cả30hash profile runtime khớp. Đã có **55job old-comment done/skipped** và **0bài quá72h thỏa bộ lọc comment**. ES có bài ngày26–30/10 được worker ghi sau deployment, không có comment target tương ứng; ví dụ143847679007386_1578652427634017, ngày26/10, counter12 vẫn được giữ.

Một số sự kiện BullMQ extendLocks vẫn xuất hiện. Đối chiếu cho thấy cùng groupKey/call-site trước và sau deploy; không tuyên bố đã xử lý lỗi lock này hoặc toàn hệ thống không còn lỗi. Không thấy bằng chứng đây là lỗi mới của chính sách tuổi bài.

Backup/evidence server: /var/lib/crawler-v8/old-post-import-no-comments-20261102-a/. Evidence local: outputs/old-post-import-no-comments-2026-11-02/ gồm QA, canary, manifest, deployment, verification và đối chiếu runtime event.

## Xác nhận dừng nextpage — 16:24:20 ICT

Đã triển khai riêng src/services/crawlerQueueFlow.js. Bộ test liên quan local và Node24 runtime đều 37/37 đạt, gồm biên đúng 72 giờ, batch trộn mới/cũ, bài ghim, phase collecting và comment gate. Drain/restart coordinator và 4 source worker; 16 mẫu checkpoint Mongo/Bull không đổi. 30 hash profile khớp, cấu hình và PID proxy/API/board giữ nguyên. Backup/evidence server: /var/lib/crawler-v8/source-age-stop-20261102-a/.

## Cập nhật ngoại lệ trang đầu và bài ghim — 16:45:44 ICT

Triển khai riêng src/services/crawlerQueueFlow.js. Local 44/44 test đạt; Node24 runtime 55/55 đạt, gồm biên 72 giờ, trang đầu, bài ghim ở mọi trang, batch trộn ghim/không ghim, phase collecting và native exhaustion. Giữ nguyên các bản sửa import/schema/views=0. Drain/restart coordinator và 4 source worker; 16 checkpoint mẫu giữ nguyên, 32 hash profile khớp, cấu hình và proxy/API/board không đổi. Backup server /var/lib/crawler-v8/source-first-page-pins-20261102-a/.
