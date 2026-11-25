# Tổng quan crawler — 02/11/2026, 15:55–15:56 ICT

Hệ thống đang chạy và ghi ES, nhưng còn lỗi import YouTube và độ phủ Facebook group thấp. Kiểm tra chỉ đọc; không sửa cấu hình, restart hay retry các job lỗi.

## Dịch vụ và lưu trữ

- 9 vai trò crawler và proxy manager active; NRestarts=0 trong snapshot. 13/13 queue không pause, mỗi queue có worker kết nối.
- Mongo ping OK, Redis PONG. ES5 green, 5 node, 100% shard active.
- Máy crawler 8 CPU, load 1/5/15 phút: 13,82 / 14,92 / 14,73. RAM available 15,16 GiB; đĩa trống khoảng 159,38 GiB. CPU/load cao là điểm cần theo dõi.
- UID worker và tunnel trên Mac đang chạy, concurrency 7 (kiểm tra 15:49).

## Tốc độ ES

- 15:50:15–15:55:38: 30.704 lượt ghi ACK, khoảng 95 lượt/giây; 298 job import lỗi theo chênh lệch counter.
- 15:40:22–15:55:38: 89.510 lượt ghi ACK, khoảng 97,7 lượt/giây; 1.180 job import lỗi theo counter.
- Đây là lượt ghi thành công, bao gồm upsert/ghi lại; không phải số document mới duy nhất.

## Queue tại 15:55:38

| Queue | Chờ | Đang chạy | Delayed | Failed lưu lại |
|---|---:|---:|---:|---:|
| facebook-page-source | 1497 | 45 | 0 | 2982 |
| facebook-group-source | 6228 | 159 | 2 | 842 |
| facebook-user-source | 1715 | 35 | 0 | 2312 |
| instagram-source | 204 | 10 | 0 | 349 |
| youtube-source | 339 | 10 | 0 | 554 |
| threads-source | 317 | 12 | 0 | 655 |
| facebook-comment | 151 | 150 | 0 | 1219 |
| facebook-reply | 0 | 5 | 0 | 1571 |
| instagram-comment | 5 | 5 | 0 | 122 |
| youtube-comment | 1 | 8 | 0 | 111 |
| threads-comment | 5 | 5 | 0 | 89 |
| es5-import | 1904 | 80 | 0 | 1679 |
| find-uid | 0 | 0 | 0 | 4095 |

Failed là số ticket đang lưu trong queue, không phải toàn bộ lỗi mới trong khoảng đo. Queue biến động liên tục.

## Độ phủ nguồn trong 2 giờ, snapshot 15:55:45

Verified là nguồn có receipt xác minh thành công; chưa có nghĩa mọi bài của nguồn đã import ES. Các round probe một group không đại diện vòng quét toàn bộ.

| Nguồn | Tổng eligible | Đã thử | Verified | Độ phủ verified |
|---|---:|---:|---:|---:|
| facebook-page-source | 2725 | 2725 | 2708 | 99.4% |
| facebook-group-source | 8423 | 7766 | 2423 | 28.8% |
| facebook-user-source | 1771 | 1771 | 1769 | 99.9% |
| instagram-source | 246 | 246 | 234 | 95.1% |
| youtube-source | 555 | 555 | 543 | 97.8% |
| threads-source | 690 | 690 | 618 | 89.6% |

Group còn 657 nguồn chưa được thử trong cửa sổ 2 giờ. Tốc độ verified gần nhất 37,27 nguồn/phút, thấp hơn 70,19 nguồn/phút cần cho 8.423 nguồn/2 giờ. Ước tính ở tốc độ này cần khoảng 226 phút; đây là ngoại suy, không phải thời gian hoàn thành cam kết.

## Lỗi và rủi ro đang có

1. Import: 262 sự kiện job_failed do `ES5_UNMAPPED_FIELD_views` trong 5 phút trước 15:55:38. Mẫu mới nhất là video YouTube; 1.572 job failed cùng nguyên nhân từ 15:35:57. Validator chặn trước khi ghi ES, cần sửa mapping/serialization rồi xử lý lại đúng job. Tại thời điểm đọc import còn 1.904 chờ, 80 active.
2. ES có 3 sự kiện `es_rejected_execution_exception` trong 5 phút. Cluster green không loại trừ quá tải ghi cục bộ.
3. Proxy vẫn phục vụ nhưng background ring chỉ 28/34 key ready, 27 pending replacement. Có job thất bại do PROXY_ENDPOINTS_UNAVAILABLE ở group/page/user/comment. Facebook rate limit và lỗi TLS/timeout vẫn tồn tại trong snapshot trước đó.
4. UID có 20 sự kiện job_failed do FACEBOOK_PROFILE_ERROR_ROUTE trong 5 phút; counter 5,39 phút có 9 completed và 26 failed. Worker chạy không có nghĩa tất cả lookup thành công.
5. BullMQ extendLocks ở group đã xuất hiện trước và sau deploy; vẫn là vấn đề chưa khép lại.

## Chính sách bài quá 72 giờ

Đã deploy lúc 15:35:57: bài cũ vẫn đi qua import ES, không gọi đọc comment/reply. Query scanner hiện có 0 bài quá 72 giờ khớp điều kiện chọn comment. Canary trước đó đã ghi bài Facebook ngày 17/09 vào master202638 và không tạo comment target. Lỗi mapping nói trên có thể làm một số bài cũ YouTube chưa vào ES; không được diễn giải chính sách thành mọi import đều thành công.

Ưu tiên tiếp theo: lỗi mapping views và job import thất bại; áp lực ES/proxy; độ phủ group.
