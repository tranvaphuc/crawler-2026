# Facebook source: sửa context ẩn danh — 02/11/2026

Đã triển khai lúc **13:47:34 giờ Việt Nam**. Kiểm tra lúc **13:49:38** xác nhận ba worker nguồn Facebook active, NRestarts=0, pulse mới và đúng PID. Đồng thời giữ nguyên Page45 / Group160 / User35; manager, coordinator và các worker còn lại không restart.

## So sánh request

| Thành phần | Request thành công | Crawler trước sửa | Kết luận từ thử nghiệm |
|---|---|---|---|
| Luồng đọc | POST GraphQL với context có sẵn | GET trang nguồn lấy context; gặp login thì dừng trước POST | Đây là chỗ dừng quá sớm cần sửa |
| Cookie/HTTP | Cookie thiết bị Chrome; thử đầu bằng curl HTTP/2 | Cookie ẩn danh trong phiên, HTTP Node | Request cung cấp vẫn trả 2 bài bằng Node và khi bỏ cookie Chrome |
| Header | UA/client hints đầy đủ | UA rút gọn, bỏ cookie/header xác thực và client hints | Bản sửa đọc được với header hiện tại |
| Template | Timeline doc_id29067006279619311 | Page/User doc_id27938457129160881, capture cũ | Template cũ vẫn đọc được với context mới |
| Phân trang | Count2, cursor đã chụp | Count theo job, native cursor trong checkpoint | Giữ nguyên tiến độ crawler |

Revision/form trong `request-comparison.json` được so với HAR template. Khi gửi thực tế, crawler thay LSD/revision/SiteData bằng context vừa lấy; không được hiểu mọi giá trị cũ trong HAR là giá trị trên wire.

## Bản sửa

`src/services/facebookAnonymousGraphql.js` bổ sung nhánh dành riêng cho source: nếu bootstrap nguồn trả HTTP200 ở URL login và chưa có bằng chứng hạn chế nguồn được xác nhận, lấy context mới từ trang gốc Facebook trên chính phiên/proxy đó, rồi gọi query native. Trang login tổng quát chỉ được dùng để cấp context khi có actor ẩn danh tường minh USER_ID=0 và LSD hợp lệ; không xem trang đó là dữ liệu nguồn.

`src/services/facebookContentHttp.js` bật nhánh này cho source, kể cả khi tiếp tục cursor sau đổi phiên. Context ở RAM và thuộc cùng phiên; referer vẫn là nguồn đang đọc. Không cài hoặc lưu cookie/token Chrome vào cấu hình/checkpoint/job. Comment/reply giữ bootstrap hiện có.

GraphQL tiếp tục quyết định quyền đọc. HTTP401, checkpoint, actor đăng nhập, context thiếu bằng chứng, hạn chế nguồn xác nhận, GraphQL auth/security/rate errors và chứng cứ empty-source giữ kiểm tra tương ứng. Không thay retry limit, worker budget, proxy ring hoặc ràng buộc import identity/date/parent/ES acknowledgement.

## Kiểm chứng

- Local: **282 đạt / 1 bỏ qua / 0 lỗi**, skip do Node20 thiếu zstd. Node24 staging với test/fixture hiện tại: **283/283 đạt**, không skip. Test mới thất bại trên module trước sửa và đạt sau sửa.
- Canary trên pool background, không dùng cookie/token Chrome: GET group997265710295664 trả login, lấy context mới ở trang gốc, hai POST GraphQL trả **6 bài qua 2 trang**, không trùng ID, có native author ID/ngày đăng/URL. Cả hai trang dùng một lease và tiếp tục native cursor.
- Backup/cài hai file bằng hash guard, giữ owner/mode; drain/restart đúng ba source worker. **16 checkpoint mẫu** giữ nguyên digest dữ liệu Mongo/Bull và cursor trước/sau cài. Tất cả hash của profile runtime30file khớp.
- Sau triển khai, đọc lại **3 bài Group vừa được ES5 acknowledge**: tồn tại, có author ID, publication/URL/siteId khớp flow target và insertedDate mới. Không thấy reader_exception/runtime_error/partial_delivery_error của ba queue nguồn trong cửa sổ kiểm tra.
- Rate limit và nguồn thất bại vẫn còn. Đây là sửa lỗi dừng ở bootstrap; chưa chứng minh mọi group hoặc SLA2giờ đã đạt. Outcome sau restart có thể gồm job tiếp tục checkpoint; không dùng làm benchmark nhân quả.

Backup/bằng chứng server: `/var/lib/crawler-v8/source-context-fix-20261102-a/`. Bằng chứng local: `outputs/facebook-source-context-fix-2026-11-02/` gồm comparison, manifest, canary, deployment, verification và local test log. Request/cookie/token tạm đã xóa local/server; giữ attachment gốc của người dùng.
