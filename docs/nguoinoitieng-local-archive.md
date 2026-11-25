# Kho hồ sơ nguoinoitieng.tv trên PC

Mục tiêu: thu thập hồ sơ công khai trên nguoinoitieng.tv, giữ nhiều dữ liệu nguồn nhất có thể, phục vụ lọc người Việt Nam kể cả người đang ở nước ngoài. Crawler không gọi AI API và không sửa luồng news/forum hay dữ liệu VPS.

Thư mục dữ liệu: `outputs/nguoinoitieng-2026-11-18/`.

## Dữ liệu

- `celebrities.sqlite`: cơ sở dữ liệu chính, có thể đọc trong lúc crawler chạy bằng kết nối SQLite read-only.
- `progress.json`: thống kê được cập nhật mỗi 30 giây; không đồng nghĩa đã crawl xong.
- `crawler.stdout.log`, `crawler.stderr.log`: nhật ký tiến trình.
- `all-profiles.jsonl`: mọi hồ sơ đã đọc, mỗi dòng là một JSON độc lập.
- `vietnamese.jsonl`: người được nguồn mô tả là Việt/gốc Việt, cộng các trường hợp suy luận từ nơi sinh Việt Nam; phải xem trường `vietnam_classification` khi lọc.
- `vietnamese.json`: cùng tập dữ liệu đó dưới dạng một mảng JSON chuẩn.
- `vietnamese-explicit.jsonl`: nguồn có câu mô tả danh tính Việt/gốc Việt.
- `needs-review.jsonl`: chưa đủ dữ liệu hoặc có mâu thuẫn; giữ lại để tránh mất người Việt sinh ở nước ngoài.
- `non-person.jsonl`: nhóm, kênh, tác phẩm, nhân vật hư cấu và các danh mục không chắc là một cá nhân.

JSON/JSONL được xuất mỗi 5 phút, khi kết thúc/dừng hoặc chạy lệnh export. SQLite được ghi ngay sau mỗi trang thành công. File xuất giữa chừng chỉ là snapshot tại thời điểm xuất. File được thay thế qua file tạm để tránh người đọc gặp bản ghi dang dở.

Các bảng:

| Bảng | Nội dung |
|---|---|
| `profiles` | Tên, nghề, ngày sinh gốc, nước sinh, nơi sống/làm việc, phân loại, JSON đầy đủ |
| `platform_links` | URL, nền tảng, nhãn, ngữ cảnh, mức độ gán cho chủ thể |
| `classification_evidence` | Câu bằng chứng, quy tắc và URL nguồn |
| `pages` | HTML gốc nén gzip, SHA-256, URL cuối, thời điểm và HTTP status |
| `crawl_queue` | Tất cả URL phát hiện, nguồn phát hiện, trạng thái, số lần thử và lỗi |
| `listing_edges` | Hồ sơ xuất hiện trên trang danh sách nào, nghề và liên kết tỉnh/thành |
| `crawl_meta` | Thông tin phiên chạy |

JSON hồ sơ còn có tên thật trích xuất, ngày/tháng/năm sinh đã tách, tuổi do nguồn ghi, chiều cao/cân nặng gốc, trường liên hệ nguồn công bố, tất cả phần tiểu sử và HTML của từng phần, ảnh (URL/alt/title), liên kết hồ sơ liên quan, phân loại nghề/ngày sinh/cung, metadata và các trường thiếu. HTML gốc được giữ để bổ sung bộ trích xuất mà không phải tải lại.

## Phân loại và giới hạn bằng chứng

`vietnamese_explicit`: tiểu sử có mô tả Việt/gốc Việt/Việt kiều. Đây là khẳng định của website, không phải xác minh giấy tờ quốc tịch.

`vietnamese_external_supported`: có bằng chứng đối chiếu độc lập được đọc và ghi trong `config/nguoinoitieng-reviewed-evidence.json`, khớp cả mã hồ sơ lẫn tên. Ví dụ Maggie Q được đối chiếu với bài phỏng vấn trực tiếp của TheWrap do nguồn chính không ghi rõ gốc Việt. Không được hiểu cờ này là đã xác minh quốc tịch Việt Nam.

`vietnamese_origin_supported`: nguồn ghi sinh tại Việt Nam, chưa có mô tả quốc tịch khác mâu thuẫn. Đây là **suy luận**, được lưu tách khỏi nhóm có câu mô tả rõ.

`needs_review`: chỉ có nơi sống/làm việc Việt Nam hoặc bằng chứng mâu thuẫn. Cư trú ở Việt Nam không đủ để xác định người Việt.

`foreign_identity_reported` và `unresolved_origin`: vẫn giữ trong DB, không tự xóa; người gốc Việt sinh ở nước ngoài có thể thiếu mô tả nguồn và cần đối chiếu sau.

Không suy quốc tịch từ tên hay việc bài viết dùng tiếng Việt. Thông tin của website có thể cũ/sai. Tất cả nhận định đều có nguồn và thời điểm lấy.

Liên kết ở trường thông tin chính được gắn `subject_profile_link`. Link xuất hiện trong tiểu sử có thể thuộc người khác, được gắn `biography_link_requires_review`. Crawler loại nút chia sẻ, giữ URL nguyên gốc; không tự coi tài khoản là chính chủ hoặc tự coi link đang còn hoạt động. Trường `verification` ghi rõ chưa kiểm chứng độc lập. Hồ sơ không có link sẽ có cờ thiếu, không tạo link đoán.

## Chạy, tiếp tục và xuất

Từ thư mục dự án:

```powershell
node scripts/crawl_nguoinoitieng.mjs --concurrency 6 --interval 120
node scripts/crawl_nguoinoitieng.mjs --export
```

Chỉ có một crawler được chạy trên cùng DB. Chạy lại tiếp tục hàng đợi, không xóa dữ liệu đã có. Mặc định retry lỗi tạm tối đa 4 lần, giảm tốc khi 429/503, không dùng proxy để đi vòng chặn. Để dừng an toàn, tạo file `STOP` trong thư mục dữ liệu, đợi tiến trình xuất xong; xóa riêng file `STOP` trước khi tiếp tục.

Sau khi sửa parser, dừng crawler rồi trích xuất lại từ HTML đã lưu:

```powershell
node scripts/crawl_nguoinoitieng.mjs --reparse
node scripts/crawl_nguoinoitieng.mjs --reclassify
```

`--reclassify` chỉ chạy lại quy tắc phân loại và bằng chứng đối chiếu trên JSON đã lưu, không tải lại trang. Hai lệnh bảo trì cần chạy khi crawler đã dừng.

## Ví dụ lọc SQL

```sql
-- Chỉ người có mô tả Việt/gốc Việt rõ trong nguồn và có URL trường chính.
SELECT name, occupation, source_url, birth_country, residence
FROM vietnamese_explicit
WHERE has_platform_link = 1;

-- Lọc nghề và năm sinh, giữ phân loại để biết đâu là suy luận.
SELECT name, real_name, birth_year, residence, vietnam_status
FROM people_filterable
WHERE included_vietnamese = 1
  AND occupation_slug IN ('ca-si', 'dien-vien', 'tiktoker', 'youtuber')
  AND birth_year BETWEEN 1990 AND 2010;

-- Link Facebook được nguồn gán ở trường thông tin của chính hồ sơ.
SELECT p.name, l.url, p.vietnam_status
FROM profiles p JOIN platform_links l USING(source_id)
WHERE p.included_vietnamese=1
  AND l.platform='facebook'
  AND l.attribution='subject_profile_link';

-- Kiểm tra còn việc hoặc lỗi không; hàng đợi hết chỉ chứng minh phủ các URL đã phát hiện.
SELECT kind,status,count(*) FROM crawl_queue GROUP BY kind,status;
```

Phạm vi phát hiện gồm sitemap được công bố trong robots.txt, các trang tỉnh/thành Việt Nam và phân trang nghề nghiệp, cùng liên kết hồ sơ liên quan. Mục mới nhất chỉ có 5 trang và sitemap chỉ chứa số ít hồ sơ mới, nên không dùng riêng hai nguồn này để tuyên bố đầy đủ. Độ phủ cần đánh giá bằng hàng đợi, lỗi và đối chiếu các trang nghề nghiệp; không thể khẳng định chứa mọi người Việt nổi tiếng ngoài những gì website công bố.

## Theo dõi đến khi xong và báo cáo tổng

Người dùng đã yêu cầu ngày 18/11/2026 tiếp tục đến hết site, giữ dữ liệu người Việt, rồi báo tổng số người Việt và số người có link nền tảng. Automation trong chính chat này: `b-o-k-t-qu-crawl-ng-i-vi-t`, kiểm tra mỗi 30 phút. Không gửi báo cáo tiến độ định kỳ khi tiến trình vẫn tăng dữ liệu. Sau báo cáo cuối tạo `completion-notified.json` và tắt automation để không báo lặp.

Một shell sandbox có thể không thấy PID của crawler đang chạy trên host; không suy ra tiến trình đã chết chỉ vì `Get-Process` không có kết quả. Đối chiếu thời điểm cập nhật log/progress và số bản ghi trước khi khởi chạy lại, tránh trùng tiến trình.

Nếu log/progress vẫn cập nhật nhưng `max(profiles.fetched_at)` và số hồ sơ không tăng hơn 10 phút, kiểm tra sáu job đang chạy và lỗi trước khi kết luận còn tiến triển. Ngày 19/11/2026 lúc 00:52 ICT đã phục hồi một lần kẹt ở 49.936 hồ sơ: xác minh đúng PID/lệnh trên host, dừng riêng tiến trình đó, giữ DB và sao lưu log rồi tiếp tục hàng đợi. Chi tiết ở `recovery-last.json`. `scripts/nguoinoitieng_http.mjs` hiện đặt deadline độc lập 45 giây bao trùm cả fetch và đọc body, kể cả khi transport không phản hồi abort; đã có mock test cho cả hai kiểu kẹt. Không khởi chạy thêm crawler nếu dữ liệu đã tăng lại.

Ngày 19/11/2026 lúc 03:51 ICT đã áp dụng thêm bản sửa hiệu năng export, giữ nguyên 93.375 hồ sơ đã có. `EXPLAIN QUERY PLAN` xác nhận truy vấn `needs-review` trước đó chọn index trạng thái rồi sắp xếp `profile_json` dung lượng GB cho từng batch. Export hiện buộc duyệt index khóa chính `source_id` theo keyset để không tạo bước sắp xếp đó. Chi tiết ở `recovery-export-last.json` và `export-query-validation.json`; 16 kiểm thử crawler/HTTP/report đều đạt. Khi native SQLite đang export đồng bộ, timer progress có thể chậm; kiểm tra file `.tmp`, query plan và thời điểm lưu hồ sơ để phân biệt đang xuất với đang crawl.

```powershell
# Báo cáo tạm, có thể đọc DB trong lúc crawler đang chạy:
node scripts/report_nguoinoitieng.mjs

# Chỉ được báo cáo cuối sau khi hết pending/running/failed và đã kiểm tra độ phủ:
node scripts/report_nguoinoitieng.mjs --final
```

File `summary-current.json` là số liệu tạm; `summary-final.json` là số liệu khi hàng đợi không còn việc hoặc lỗi. `vietnamese-people-current.jsonl` / `vietnamese-people.jsonl` nhóm các hồ sơ cùng tên chuẩn hóa dấu câu và cùng ngày sinh đầy đủ; không gộp chỉ theo tên hoặc link tài khoản chung. `duplicate-review-current.json` / `duplicate-review.json` giữ các nhóm đã gộp để kiểm tra lại. Tên khác hoặc ngày sinh mâu thuẫn vẫn có thể trùng; số người sau gộp cần được mô tả cùng giới hạn này. Dữ liệu đầy đủ của mọi hồ sơ nguồn vẫn nằm trong DB và các file `vietnamese.json` / `vietnamese.jsonl`.

Thống kê link đếm người có ít nhất một tài khoản được nguồn đặt trong trường chính thuộc Facebook, Instagram, TikTok, YouTube, Threads, Twitter/X, LinkedIn hoặc Zalo. Không cộng website thường, Wikipedia, nhóm, bài đăng, link nhắc trong tiểu sử và nút chia sẻ. Mỗi người chỉ tính một lần trong tổng có link; các cột nền tảng có thể chồng lấp. Có link không đồng nghĩa đã xác minh tài khoản chính chủ hoặc link còn hoạt động. Tách rõ nhóm có mô tả/bằng chứng Việt/gốc Việt và nhóm suy luận từ nơi sinh khi báo kết quả cuối.

## Kiểm tra cuối ngày 19/11/2026

Crawler kết thúc tự nhiên lúc 21:19 UTC ngày 18/11: 102.709 URL hồ sơ đã tải, tương ứng 102.543 ID hồ sơ nguồn (có URL đổi slug), 10.271 trang danh mục và 8 sitemap. 37 liên kết hỏng trong nội dung nguồn đã được đối chiếu với hồ sơ hợp lệ đã thu thập, lưu bảng `source_link_resolutions` cùng toàn bộ lỗi gốc; không bỏ qua lỗi bằng cách xóa hàng đợi. `coverage-verification.json` kiểm tra 10.279 trang danh mục/sitemap lưu trữ, 572 danh mục nghề, không có liên kết hợp lệ bị thiếu hoặc lỗ phân trang đã phát hiện.

Đã rà soát trích đoạn chỉ xuất thân trong hồ sơ chưa rõ và các trường hợp Việt/gốc Việt có nơi sinh nước ngoài; căn cứ thủ công lưu `config/nguoinoitieng-reviewed-evidence.json`, thay đổi phân loại giữ ở `classification_review_log`. Không đoán nguồn gốc theo tên. Các trường hợp còn thiếu căn cứ vẫn ở nhóm không được tính, giữ nguyên dữ liệu gốc và danh sách `remaining-source-review.json`. Đây là giới hạn dữ liệu, không phải chứng nhận đã xác minh quốc tịch cho mọi hồ sơ.

Đã đọc `duplicate-review.json` và ngữ cảnh tiểu sử các nhóm. Hai nghệ danh Andree được gộp bằng tên thật/ngày sinh và bài VOH. Năm nhóm trùng tên/ngày sinh được giữ riêng vì tên đầy đủ mâu thuẫn hoặc thiếu căn cứ: Quỳnh Nga, Minh Thư, Thu Hà, Hoàng Lan, Xuân Đức. Quyết định có điều kiện kiểm tra tên/ID/ngày sinh ở `config/nguoinoitieng-reviewed-identities.json`. Không gộp theo tài khoản cơ quan dùng chung. Các ngày sinh bất khả thi của nguồn được giữ nguyên, không dùng để gộp tự động; danh sách nằm trong `verification-final.json`.

Sau khi không còn tiến trình crawler ghi DB, xuất lại rồi tạo báo cáo và kiểm tra độc lập theo thứ tự:

```powershell
node scripts/crawl_nguoinoitieng.mjs --export
node scripts/report_nguoinoitieng.mjs --final
node scripts/verify_nguoinoitieng_final.mjs
```

Kiểm tra cuối đọc SQLite ở chế độ read-only, chạy `quick_check`, kiểm tra JSON trong DB, stream từng bản ghi JSON/JSONL để so SHA-256 nội dung, đối chiếu ID/tổng và thống kê người/link với báo cáo. Không nạp toàn bộ `vietnamese.json` vào một chuỗi Node vì file vượt giới hạn chuỗi ~512 MB. Báo cáo theo người đã nhóm nằm trong `vietnamese-people.jsonl`, còn toàn bộ thông tin của từng hồ sơ ở `vietnamese.json`/`vietnamese.jsonl` và DB. Bộ đếm cuối còn loại đường dẫn tìm kiếm, ảnh/album và các URL nội dung bị nguồn đặt nhầm vào trường tài khoản.

## Tra ID mạng xã hội ngày 25/11/2026

Theo yêu cầu mới, bỏ qua người không có link. Chỉ xử lý Facebook, TikTok, YouTube, Threads và Instagram từ nhóm 13.804 người có link. Hai người chỉ có Twitter/X được giữ trong JSON theo người nhưng không có tài khoản thuộc lần tra này. Dữ liệu đã crawl không có link Threads.

Kết quả lưu riêng ở `outputs/nguoinoitieng-2026-11-18/platform-ids-2026-11-25/`, không sửa kho SQLite hoặc các bản xuất ban đầu:

- `people-platform-ids.jsonl`: từng người cùng URL gốc và ID/trạng thái của từng link.
- `accounts.jsonl`: tài khoản sau chuẩn hóa và gộp link trùng, có danh sách mã người sử dụng link đó.
- `resolution-journal.jsonl`: kết quả ghi nối tiếp, kết quả cuối cùng của mỗi khóa tài khoản có hiệu lực.
- `summary.json`: số liệu hiện tại, bao gồm riêng `resolved`, `unresolved` và `pending`.
- `nguoinoitieng-platform-ids.xlsx`: hai bảng lọc theo người và theo tài khoản; ID được lưu dạng chuỗi.
- `verification-platform-ids.json`: đối chiếu toàn bộ người/link/ID JSON với bản xuất Excel, kiểm tra ID không bị làm tròn.

`id_type` phân biệt `profile_id`, `page_id`, `url_account_id`, `channel_id` và `user_id`. Facebook UID của hồ sơ và ID Page được giữ ở hai trường riêng. Route chỉ trả UID hồ sơ không được tự coi là đã tìm thấy Page ID. Handle không được dùng thay native ID. `method=url_structure` lấy ID ngay trong URL và chưa kiểm tra tài khoản còn hoạt động; cache có `observed_at` và `live_checked=false`.

Tra công khai Facebook dùng route khớp URL, loại Error/Login/Checkpoint và ID của người xem. Instagram chỉ chấp nhận canonical `pk` khớp username, TikTok chỉ nhận user ID khớp `uniqueId`. Một link YouTube `/user/` cũ cần đối chiếu metadata chính với canonical của chính trang trả về. Không đoán ID từ tên, tài khoản liên quan hay nội dung bài đăng. Link chưa tra được không chứng minh tài khoản đã bị xóa hoặc chủ thể không dùng mạng xã hội.

```powershell
# Chuẩn bị hoặc xuất lại từ journal hiện có, không gọi mạng:
node scripts/resolve_nguoinoitieng_platform_ids.mjs

# Tiếp tục những tài khoản chưa được xử lý:
node scripts/resolve_nguoinoitieng_platform_ids.mjs --live

# Chỉ chạy lại các tài khoản unresolved khi có căn cứ hoặc điều kiện truy cập mới:
node scripts/resolve_nguoinoitieng_platform_ids.mjs --live --retry-unresolved

python scripts/verify_nguoinoitieng_platform_ids.py
```

Không chạy hai lượt resolver cùng lúc. Dừng khi gặp giới hạn truy cập, checkpoint hoặc session không khớp tài khoản. Phiên UID cục bộ đã lưu được kiểm tra bổ sung ngày 25/11 nhưng không khớp tài khoản đăng nhập mong đợi; không đổi tài khoản hay làm mới credentials. Lượt này không gọi AI API và không đổi luồng news/forum.
