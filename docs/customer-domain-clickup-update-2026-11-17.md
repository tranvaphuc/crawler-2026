Cập nhật kiểm tra ngày 17/11/2026: 10/11 nguồn đã có bài crawl thật và đối chiếu ES5 (3 bài/nguồn); còn Hanoitimes bị chặn truy cập.

1. bbw.vn: Đã crawl bài công khai. 5 bài mẫu qua parser; 3 bài đối chiếu ES5. Sửa JSON-LD gắn đúng URL và nội dung video công khai; giữ mô tả gốc và player. Giờ bài UTC+7 theo xác nhận. Nội dung video ngắn là mô tả nhà xuất bản, không phải transcript tự sinh.

2. pvn.vn: Đã crawl qua petrovietnam.vn. 5 bài mẫu qua parser; 3 bài đối chiếu ES5. Giữ ngày gốc; khi nguồn chỉ có ngày, giờ được lưu 00:00 UTC+7 với dấu vết defaultedClock và xác nhận của người dùng.

3. moit.gov.vn: Đã crawl. 5 bài mẫu qua parser; 3 bài đối chiếu ES5. Lấy giờ hiển thị trên chính bài, UTC+7; lưu metadata lệch giờ trong bằng chứng. Khoanh đúng thân bài, loại khối liên quan.

4. sbv.gov.vn: Đã crawl; seed chưa ổn định hoàn toàn. 4 bài mẫu qua parser; 3 bài đối chiếu ES5. Đã kiểm tra thực cả /w/, /vi/w/ và query redirect từ chuyên mục. Sửa alias cùng slug/canonical, dùng giờ bài UTC+7. Chuyên mục /vi/tin-tuc-su-kien phát hiện 14 link; root cũng phát hiện 28 link trong lượt tự động. /vi/trang-chu vẫn có lúc timeout trong giới hạn 5 giây hoặc trả HTML rỗng; giữ hai seed dự phòng đã xác minh, không tăng timeout chung.

5. haiquanonline.com.vn: Đã crawl qua miền kế thừa. 5 bài mẫu qua parser; 3 bài đối chiếu ES5 tại thuehaiquan.tapchikinhtetaichinh.vn. Domain mới được thông báo chính thức trên chuyên trang Thuế - Hải quan.

6. baodansinh.vn: Đã crawl kho bài tại Dân sinh/Dân trí. 5 bài mẫu qua parser; 3 bài đối chiếu ES5 tại dansinh.dantri.com.vn. Dùng UTC+7 theo xác nhận. Các bài mẫu là bài lưu trữ tháng 02/2025; không đổi thành ngày mới để đưa vào cửa sổ bài mới.

7. kinhtetrunguong.vn: Đã crawl qua cscltw.dcs.vn. 5 bài mẫu qua parser; 3 bài đối chiếu ES5. Dùng trang Ban Chính sách, chiến lược Trung ương. Ưu tiên ngày/giờ hiển thị trên bài UTC+7, giữ metadata lệch giờ trong bằng chứng.

8. baobariavungtau.com.vn: Thay bằng SGGP theo yêu cầu. 5 bài SGGP qua parser; 3 bài đối chiếu ES5. Ghi rõ requestedDomain cũ và publisher thay thế; tài liệu ghi siteName sggp.org.vn. Đã ngừng seed domain cũ trả nội dung Lai Châu; không gán nội dung đó thành Báo Bà Rịa - Vũng Tàu.

9. baodaklak.vn: Đã crawl. 5 bài mẫu qua parser; 3 bài đối chiếu ES5. Khoanh đúng vùng tiêu đề, thân bài và đồng hồ, tránh giờ của bài liên quan; UTC+7 theo xác nhận.

10. tietkiemnangluong.com.vn: Đã crawl. 5 bài mẫu qua parser; 3 bài đối chiếu ES5. Giữ ngày gốc; nếu chỉ có ngày, lưu 00:00 UTC+7 theo xác nhận và đánh dấu giờ mặc định.

11. hanoitimes.vn: Chưa crawl được. Trang chủ, RSS và link bài trả HTTP 401 với HTTP Basic realm="hanoitimes.vn". Người dùng cũng xác nhận không mở được. Chưa có đường đọc bài công khai đã xác minh hoặc thông tin truy cập được cấp để sửa tiếp. Không đánh dấu thành công.

Đã triển khai trên VPS; seed/parse/import hoạt động. 97 kiểm thử khác nhau đạt; 30 bài được đối chiếu đúng ID/ngày/nội dung trong ES5. Đã mở lại có chọn lọc 224 lỗi cũ để xử lý theo quy tắc hiện hành; chưa tính chúng là bài thành công. Không phát sinh cuộc gọi AI trả phí do công việc sửa này; giữ nguyên ledger ngân sách.
