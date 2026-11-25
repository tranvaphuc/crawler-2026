# Điều phối news theo eastdata

Đối chiếu trực tiếp source tại `../eastdata`:

- `scripts/news/get-news-article-urls.js` và `workers/get-news-article-urls-worker.js`: đi qua từng site và toàn bộ `seed_urls`; pagination trong worker đang comment. Sau lượt discovery có khoảng nghỉ 5 phút.
- `scripts/news/queue/get-news-article-urls.js`: mỗi seed là job trong channel `get-news-urls`.
- `scripts/news/queue/workers/get-news-article-urls-worker.js` và `get-news-articles-worker.js`: hai channel riêng, mỗi channel concurrency 16.
- `libs/queue/master.js`: `canAddJobs()` kiểm soát lượng job inactive, không bơm không giới hạn. Producer seed dùng ngưỡng 100; producer article cũng có backpressure.
- `scripts/news/get-news-articles.js`: batch 50 URL và cursor `timeNextRound` giới hạn phạm vi batch; queue variant dùng batch 100.
- `models/news/urls.js`, worker bài: chọn URL chưa `processed`, giữ trạng thái `processed:1` sau thành công hoặc parse lỗi. Các URL trùng không liên tục tải lại ở mỗi lần quét seed.

## Bản triển khai sửa

1. Discovery và article có ngân sách worker riêng, mặc định **16 + 16**, cùng dùng giới hạn một task/publisher và spacing 3 giây/host. ES5 writer vẫn độc lập.
2. Homepage và category đều priority 100, discovery lấy **FIFO**. Bỏ cơ chế homepage 120 chen trước category cũ.
3. Producer seed có lịch riêng cho mỗi publisher, lưu trong `seed_schedule`. Cứ 5 giây kiểm tra: site hết seed pending/running, hết cooldown và đến hạn mới được nhận toàn bộ homepage/category của lượt tiếp theo. Khoảng cách giữa các lượt của từng site tối thiểu 5 phút, được giữ sau restart. Backlog/cooldown ở một site không ngăn mở lượt cho site khác; không còn ngưỡng 100 seed áp dụng toàn hệ thống. Enqueue và lịch được lưu trong cùng transaction; không tạo lượt trùng hay bỏ task cũ. Công suất xử lý vẫn quyết định khoảng cách thực tế giữa các lần đọc từng URL.
4. Worker bài nhận batch cố định tối đa 50 URL. Mỗi batch dành tối đa 10 slot cho URL chờ lâu và phần còn lại cho URL mới, phân tán theo publisher; các task trong batch được lấy FIFO. Đây là bổ sung chống bỏ đói URL, không sao chép cursor cũ nguyên xi. Publisher đang cooldown không giữ các publisher khác lại.

   Việc chọn batch chạy ở worker riêng với SQLite read-only và snapshot WAL. Index partial `(site,created,id)` của các bài pending cho phép mỗi publisher chỉ đọc một URL cũ và tối đa ba URL mới, thay vì xếp hạng toàn bộ backlog. Main thread chỉ claim theo tối đa 50 primary key rồi kiểm tra lại trạng thái, cooldown và publisher đang chạy. Chính sách chọn URL giữ nguyên; log ghi thời gian đọc batch và event-loop delay để đo hiệu năng.
5. `article_catalog` giữ trạng thái URL đã xử lý như `news_urls.processed` của eastdata. Link gặp lại vẫn được nhận diện trên HTML nhưng không tải lại bài đã xử lý. Bài cũ ngoài cửa sổ import cũng được đánh dấu đã xử lý, tránh quét lại kho lưu trữ.
6. Parse/field lỗi được giữ riêng và thử lại khi cấu hình parser thay đổi. Lỗi mạng/chặn tạm thời có cooldown tối thiểu 15 phút và vẫn tôn trọng Retry-After của host; 404 giữ ít nhất 24 giờ. `--url` là yêu cầu refresh thủ công, vẫn không lặp request trong cùng một vòng.
7. Vẫn lấy thêm link hiển thị trong từng bài theo yêu cầu người dùng; không next page, không browser, không fallback gọi thẳng khi proxy lỗi. Bộ kiểm tra ID Latin-1, field/time, outbox và create-only ES5 được giữ nguyên.

## Chuyển dữ liệu cũ

Sau khi dừng service an toàn và backup SQLite, startup mới backfill catalog từ lần xử lý hoàn tất mới nhất của mỗi URL. Các task pending trùng URL đã xử lý được chuyển `skipped`, có lý do `already_processed_url`; giữ nguyên lịch sử request, identity ledger và outbox. Các URL chưa từng xử lý vẫn nằm trong queue để worker nhận. Migration chỉ chạy một lần, không sửa document ES5.

Các kiểm thử bổ sung bao gồm: category cũ thắng homepage mới; hai channel đều có tiến triển; cooldown/backlog của một site không ngăn lượt của site khác; seed đang chạy ngăn lượt trùng của chính site đó; lịch seed giữ sau restart; enqueue/schedule rollback cùng nhau; catalog không tải lại bài cũ; retry theo thay đổi cấu hình/cooldown; refresh thủ công; migration giữ nguyên outbox/identity; batch có URL chờ lâu và không bị URL mới chen vào.

Mục tiêu 20 phút vẫn cần đo lại trên lượt production sau thay đổi; việc sửa starvation không tự chứng minh đủ công suất quét toàn bộ 13.783 seed.
