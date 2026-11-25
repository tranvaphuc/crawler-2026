# Báo Mới → bài gốc → nguồn gốc

Đã bật trên VPS ngày 20/11/2026 giờ Việt Nam, release `/opt/news-flow/releases/20261120-baomoi-original-03`. Cả seed, parse, import và dịch vụ mới `news-flow-baomoi-original.service` đang active; dịch vụ mới không restart trong lượt kiểm chứng.

## Hành vi

- Khi xử lý bài Báo Mới, lấy `content.originalUrl` từ đối tượng bài đã xác minh ID, tiêu đề và schema; dùng trang `-r` cùng ID khi cần. Ghi bằng chứng trước cả khi bước parse nội dung Báo Mới bị lỗi.
- Lưu quan hệ bài Báo Mới/bài gốc trong SQLite, không dùng homepage của publisher hoặc URL bài liên quan làm URL bài gốc.
- Dùng lại nguồn theo registry/host/path scope; đưa bài gốc vào luồng parse/import hiện có dưới publisher gốc.
- Chuẩn hóa khóa URL; đối chiếu identity ledger, article_links và native ID hiện có. Tra cứu ES trên các index tuần với các biến thể http/https/www trước khi nhập URL chưa được biết. Tra cứu ES lỗi hoặc chưa đầy đủ thì chưa nhận bài vào hàng đợi. Bài done/fail/skipped có sẵn không bị mở lại.
- Nguồn mới chỉ được bật khi homepage tìm được bài và parser cố định qua ít nhất 3 nội dung khác nhau, bao gồm 2 trang kiểm chứng độc lập. Các cổng nội dung, quyền truy cập, ngày giờ đăng gốc và múi giờ vẫn được áp dụng. Nguồn đạt được lưu bền vững trong `baomoi_original_sources`; các tiến trình seed/article nhận cấu hình khi khởi động và mỗi lượt master. Seed mới tham gia lượt crawl thường lệ tiếp theo.
- Dịch vụ riêng quét dần các URL Báo Mới đã xử lý từ trước, 3 URL/lượt, và kiểm tra nguồn mới với số trang giới hạn. Không đợi quét hết lịch sử mới nhập bài mới. Các URL chưa chứng minh được được lưu để theo dõi, không tạo nội dung thay thế.
- FireAnt và mọi subdomain bị chặn ở bước trích xuất, nhận URL, đăng ký nguồn và HTTP.

## Kiểm chứng

74 test đạt trên đúng release VPS; 24 test hồi quy bổ sung đạt ở workspace. Bộ test mới kiểm tra chống trùng tham chiếu/URL/nguồn/native ID, trạng thái lỗi cũ, đối chiếu ES lịch sử, ES lỗi, chặn FireAnt, phục hồi nguồn sau restart, bằng chứng giờ đăng và ngân sách AI đã cạn. Không gọi AI thật trong test.

Snapshot lúc `2026-11-19T17:14:29Z`:

- 116 tham chiếu Báo Mới và 116 URL gốc duy nhất đã được ghi; chưa có khóa bài hoặc host nguồn trùng.
- Đăng ký mới `petrovietnam.petrotimes.vn` và `xahoi.congly.vn`, mỗi nguồn qua 3 bài HTTP với 2 holdout độc lập. Công Lý có adapter chỉ gắn URL vào schema thiếu URL khi canonical, OG URL, tiêu đề và giờ đăng có offset khớp đồng thời.
- Đã đối chiếu trực tiếp ES và xác nhận 4 bài được tạo sau khi bật nhánh, gồm bài từ Xã hội Công Lý, Lifestyle Zing và Người Đưa Tin.
- 57 URL nhận diện đã tồn tại; 42 URL liên kết với trạng thái sẵn có; 5 URL mới đã được nhận vào luồng; 4 URL vừa phát hiện đang chờ lượt tiếp theo. Các số này tiếp tục thay đổi khi dịch vụ chạy.
- 8 URL thuộc `baocamau.vn` chờ xác minh: mẫu hiện có ngày giờ không ghi múi giờ và schema chưa gắn URL bài. Không gán mặc định múi giờ để vượt kiểm tra.
- Hai homepage nguồn mới đã có trong `seed_sources`; tại snapshot chúng đang chờ lượt seed thường lệ. Toàn bộ 11.740 URL Báo Mới lịch sử chưa được quét hết trong lượt bàn giao này; dịch vụ tiếp tục quét nền.

Báo cáo chi tiết: `outputs/baomoi-original-branch-live-verification.json`; bằng chứng HTTP và báo cáo trên VPS: `/var/lib/news-flow/baomoi-original-branch-20261120`.

## Ngân sách

Người dùng cho phép trần 10 USD riêng đợt triển khai này. Đợt này phát sinh **0 cuộc gọi AI trả phí**; quyền tăng riêng đợt đã đóng với trạng thái `closed_unused`. Cấu hình thường lệ vẫn `AI_DAILY_BUDGET_USD=2`, giới hạn số cuộc gọi vẫn 200, không tạo ledger mới và không sửa/xóa usage đã tích lũy.

Ledger ngày UTC 19/11 đã có 204 calls / 2,8093045 USD trước khi triển khai; giá trị này được giữ nguyên và đã báo người dùng. Không tuyên bố số quá khứ này nằm trong trần 2 USD. Test xác nhận guard chặn thêm request khi ledger đã vượt trần hoặc đã chạm giới hạn calls, kể cả khi riêng trần USD được nâng lên 10.

## File chính

`src/newsFlow/baomoiOriginalBranch.mjs`, `src/newsFlow/originalSourceQualification.mjs`, `src/web/xahoiConglyOriginalNews.mjs`, `scripts/run_baomoi_original_branch.mjs`, `deploy/news-flow-baomoi-original.service`. Các thay đổi tích hợp registry/processor/runtime/transport được áp dụng bằng anchor và hash nền chính xác; giữ các khác biệt đang chạy so với workspace. Không thay cấu hình bí mật hoặc thay cơ sở dữ liệu bằng bản sao cũ.
