# Khắc phục import ES — 02/11/2026

Triển khai lúc **16:32:48 ICT**; đối chiếu document ES lúc **16:41:51**, Instagram lúc thu thập evidence sau đó.

## Nguyên nhân và sửa

- Index lịch sử có youtubeTopic nhưng thiếu views, hoặc thiếu hoàn toàn native type như fbGroupTopic. 1.596 job vướng views, 16 job thiếu type trong cohort đã khôi phục.
- Loader mới kiểm tra schema trên index đích, chỉ bổ sung type/field còn thiếu từ template crawler-v8-native-types-20261102 đã cài. Không suy đoán mapping từ dữ liệu và không đổi định nghĩa field đã tồn tại. Có readback mapping, single-flight cho cold lookup; bỏ race đọc Map sau khi job khác xóa cache. Index tuần chưa tồn tại được tạo qua template hiện hành.
- YouTube views không có/không hợp lệ mặc định **0** theo yêu cầu; số native hợp lệ vẫn giữ nguyên, kể cả lớn hơn integer32.
- Bulk writer retry tối đa 3 lần với backoff 250/500/1.000 ms cho HTTP 429/502/503/504 và một số lỗi transport tạm thời. Chỉ retry item chưa ACK; item đã ACK không gửi lại ở retry của batch. Giữ trần HTTP concurrency=2, giữ giới hạn bytes/items và kiểm tra identity/version/result mỗi item. Lỗi mapping/permanent hoặc hết retry vẫn failed.
- Policy tuổi bài được cập nhật riêng lúc 16:45:44: bài quá 72 giờ vẫn import, không comment/reply; trang đầu và bài ghim được nextpage nếu còn cursor. Từ trang 2, bài không ghim quá 72 giờ mới làm dừng phân trang.

## Xác nhận

- **52/52 test** liên quan đạt ở local và staging Node24: schema lịch sử, lookup đồng thời, mapping conflict, unknown field, views mặc định 0, retry một phần, retry cạn, guard ES ACK và age window.
- Canary hai bài thật từng lỗi, một YouTube 2011 và Facebook group 2012: ghi qua validated writer, đọc lại publication/author/siteId/URL/counter; không tạo comment target cho bài cũ.
- Deploy 3 file: src/services/crawlerV8Es5.js, src/services/crawlerEs5Bulk.js, scripts/crawler_queue_flow.mjs. Drain/restart 9 vai trò. 16 checkpoint Mongo/Bull mẫu giữ nguyên; 32 file profile hash khớp; PID proxy manager/API/board, env/topology/concurrency không đổi.
- Snapshot failed 1.919 job: 1.909 qua serialize và schema validation được retry có audit, giữ ID native/job. Đối chiếu ES bằng flowId(import, type:id), tìm **đủ 1.909/1.909** document có insertedDate từ thời điểm snapshot retry, quét 111.261 hit trong các index liên quan; không dựa vào số ticket biến mất để suy luận thành công. Ticket tự xóa sau hoàn thành và cùng ID có thể được producer đưa lại ở vòng cập nhật tiếp.
- 10 bài Instagram thiếu ngày đăng: lấy lại ngày từ response native khớp post ID và source author ID, sửa/retry **8 bài**, đọc lại đủ 8 document ES khớp ngày. Khôi phục ticket bị thiếu khi Mongo còn payload, có backup gốc trước khi sửa.
- Kiểm tra lúc **16:41:14**: 9 vai trò active, ES green 5 node, không có sự kiện job_failed của es5-import từ sau deploy. Queue còn 45.223 waiting, 80 active; đây là backlog động của luồng tiếp tục chạy, không có nghĩa toàn queue đã sạch.

## Còn lại

Hai job Instagram chưa có ngày đăng xác minh; response công khai trả PUBLIC_COUNTERS_NOT_RETURNED. Giữ failed, không gán ngày crawl làm ngày đăng:

- 07fab92ec57c4fa1b7e784837ec8196ec9bc2d200a2605739e6897c1675d0468 — https://www.instagram.com/p/DfKNwVmieu1/
- fa0ab985d084b3efcfabcf2daf0868f264b4c22193d3e333a6e56f292520171d — https://www.instagram.com/reel/DfCRHk8SmUf/

Tổng đã khôi phục và xác minh ES: **1.917 document** trong 1.919 job snapshot. Không tuyên bố các lỗi proxy/rate limit của crawler đã được xử lý trong thay đổi import này.

Evidence server: /var/lib/crawler-v8/import-schema-fix-20261102-a/. Evidence local: outputs/import-schema-fix-2026-11-02/.
