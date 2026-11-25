> Cập nhật mới: hai bản ghi ES đã sửa, bổ sung sửa layout và kiểm chứng thực tế. Xem [báo cáo ES/layout mới](customer-layout-es-repair-2026-11-18.md). Phần dưới là snapshot lịch sử.

# Rà soát và sửa lỗi các nguồn còn hoạt động — 09:33 ngày 18/11/2026 (UTC+7)

Đã kiểm tra HTTP thật 147 seed đang lỗi của 21 nguồn, gồm một nguồn kế thừa và Hanoitimes làm đối chứng truy cập. 135 seed trả được link bài; phục hồi 127 seed đúng publisher. 8 seed còn lại chuyển sang English VOV riêng theo lựa chọn của người dùng.

Đã kiểm tra 167 bài đại diện từng nhóm lỗi của 34 publisher bằng processor/gate thật trong trạng thái cách ly. 38 mẫu lỗi cũ qua được gate trước sửa bổ sung. Sau sửa và bổ sung nguồn, 51 tài liệu được đưa vào đối soát ES: 49 khớp URL, publisher, tiêu đề, ngày và có nội dung từ 100 ký tự; 2 trường hợp dưới đây chưa đạt và không được tính thành công đầy đủ.

Sửa đã triển khai: (1) phục hồi seed đã xác minh khỏi chặn lỗi cũ; (2) Business Times ref chỉ được coi là alias khi cùng bài công khai có bằng chứng độc lập; (3) VnEconomy ưu tiên ngày gốc JSON-LD, giữ RSS dự phòng; (4) English VOV riêng, tách seed tiếng Anh; (5) chặn media lấy mỗi tên tác giả làm thân bài, đã kiểm chứng trên chính HTML SGGP lỗi. 47 kiểm thử khác nhau đạt trên local và VPS (27 kiểm thử hợp đồng/danh tính + 20 kiểm thử trường dữ liệu/media).

Tuyên giáo và Tài nguyên Môi trường từng bị giữ do lỗi cũ: seed đã chạy lại thành công ở chế độ thường. 3 bài Tuyên giáo còn bị chặn được review, rồi kiểm tra lại chế độ thường thành công; không chỉ đổi nhãn trạng thái. 1.037 lỗi ngày VnEconomy được mở lại có chọn lọc; đây là số được đưa lại vào xử lý, không phải số bài thành công. Luồng thường giữ nguyên cửa sổ tuổi bài và các điều kiện ghi dữ liệu.

Không dùng Astra. Không khởi tạo cuộc gọi AI API trả phí trong lượt này. Ledger ai_usage giữ nguyên tích lũy; cấu hình ngân sách 2 USD/ngày, giới hạn 200 lượt/ngày và model API gpt-5.4-mini không đổi. Không cấu hình hay tuyên bố giới hạn chi phí ứng dụng Codex/ChatGPT.

| Nguồn | Kết quả và phần chưa xử lý xong |
|---|---|
| e.vnexpress.net | Seed lỗi đã đọc lại được. Các bài quiz còn chỉ có widget động; một số longform/video thiếu vùng thân bài hoặc mật độ link cao, chưa xử lý xong các layout này. |
| businesstimes.com.sg | Đã sửa ref gây xung đột canonical cho bài công khai; 2 URL ref qua luồng thật. Bài thuê bao tiếp tục bị giữ; 1 URL không ref vẫn xung đột danh tính bài. |
| theinvestor.vn | Nguồn lấy được bài thường; mẫu lỗi còn là trang chuyên đề hoặc bài thiếu trường native. |
| pvn.vn | Bài chữ lấy được; video/emagazine và trang giới thiệu còn thiếu trường hoặc không đạt kiểm tra nội dung. |
| nangluongvietnam.vn | Seed lỗi phục hồi được; 1 bài cũ vẫn không gắn chắc JSON-LD với URL, chưa nới điều kiện ghi. |
| moit.gov.vn | Không nằm trong nhóm seed lỗi ở snapshot kiểm tra; giữ cấu hình ngày/giờ đã xác nhận. |
| sbv.gov.vn | Seed /vi/trang-chu đọc lại được; root vẫn có lượt timeout. Có bài qua luồng thật, còn trang/URL đặc thù bị firewall hoặc không khớp canonical. |
| tapchinganhang.gov.vn | Seed đã đọc lại; 1 bài timeout cũ qua luồng thật. Các trang .docs, ấn phẩm .paper và một số trang thiếu ngày/thân bài vẫn chưa được lấy như bài tin. |
| kinhtedothi.vn | Một số seed phục hồi; còn 1 timeout và 3 trang không phát hiện link bài trong HTTP trả về. |
| luatvietnam.vn | Bài tin có mẫu qua luồng thật. Các văn bản pháp luật, trang danh mục và một số video chưa có đủ trường ngày/thân bài theo parser tin. |
| tuyengiao.vn | Đã phục hồi seed và gỡ chặn URL cũ. 3 bài qua review rồi chạy lại chế độ thường đều thành công, có đối chiếu ES. |
| tietkiemnangluong.com.vn | Bài chữ vẫn lấy được. Video, infographic, emagazine và tài liệu đặc thù còn thiếu tiêu đề/thân bài hoặc xung đột danh tính. |
| baotainguyenmoitruong.vn | Seed alias và miền đích nongnghiepmoitruong.vn đã đọc lại được. 6 mẫu miền đích qua luồng thật; vẫn còn infographic/video, bài mâu thuẫn ngày hoặc canonical không đủ chắc. |
| hanoitimes.vn | Kiểm tra lại vẫn HTTP 401; chưa lấy được bài công khai mới. Không thay bằng dữ liệu cũ để báo thành công. |
| dealstreetasia.com | Seed nội dung phục hồi, có bài miễn phí qua luồng thật. Bài thuê bao/research hoặc quyền công khai không xác định vẫn giữ lại; newsletter không phải seed bài tin. |
| haiquanonline.com.vn | Lấy qua miền kế thừa. Còn lỗi layout emagazine, .media, infographic và trang danh mục .region. |
| baodansinh.vn | Kho bài lưu trữ vẫn theo cấu hình đã xác nhận; không có nhóm seed lỗi mới trong snapshot này. |
| kinhtetrunguong.vn | 1 bài lỗi mạng cũ qua luồng thật; các bản tin dạng tập hợp nhiều link vẫn bị giữ do mật độ link cao. |
| baobariavungtau.com.vn | Dùng SGGP riêng theo xác nhận; bài Lai Châu từ domain cũ được loại khỏi phạm vi. Một số SGGP media/redirect khác publisher chưa lấy được. |
| laodong.vn | Nhiều seed cookie cũ đã phục hồi. Có bài qua luồng thật; còn media không có văn bản, sai vùng nội dung hoặc xung đột danh tính ở từng bài. |
| tienphong.vn | Seed lỗi đọc lại được; 2 bài lỗi cũ qua luồng thật. Còn media, bài mật độ link cao và một số canonical khác. |
| daidoanket.vn | Có bài lỗi cũ qua luồng thật; seed chính không có lỗi trong snapshot này. |
| plo.vn | Giữ luồng chuyên trang /plo/ đã kiểm chứng, không gộp toàn bộ Tuổi Trẻ. |
| daibieunhandan.vn | Không có seed cần phục hồi trong snapshot; giữ cấu hình hiện tại. |
| thoibaonganhang.vn | Seed lỗi phục hồi được; 2 bài lỗi cũ qua luồng thật. Một số layout/ngày JSON-LD khác vẫn cần rà soát. |
| thoibaotaichinhvietnam.vn | Không có seed cần phục hồi trong snapshot; giữ cấu hình hiện tại. |
| bnews.vn | Seed lỗi đã đọc lại, 2 bài qua luồng thật. Còn bài không đủ bằng chứng JSON-LD/múi giờ, không tự đoán giờ. |
| baotintuc.vn | Có bài lỗi cũ qua luồng thật; seed /4/ không phát hiện link bài. Còn canonical và layout riêng ở một số bài. |
| kinhtechungkhoan.vn | Các seed chuyên mục trước chặn/500 đã đọc lại được; 3 bài qua luồng thật. Homepage trả về không phát hiện bài trong lượt kiểm tra. |
| baoxaydung.vn | 2 bài lỗi cũ qua luồng thật; giữ luồng cùng domain hiện có. |
| 1thegioi.vn | Có bài lỗi cũ qua luồng thật; giữ cấu hình hiện có. |
| thitruongtaichinhtiente.vn | Có bài lỗi cũ qua luồng thật; giữ cấu hình hiện có. |
| nguoidothi.net.vn | Seed phục hồi và có bài qua luồng thật. Phát hiện 1 bản ghi ES cũ lệch ngày so với native; chưa ghi đè bản ghi đó. Còn 1 HTTP 500 và một số layout cũ. |
| baodaklak.vn | Bài thường vẫn lấy được; còn trang chuyên mục, báo in, emagazine, video/infographic không có văn bản native hoặc chưa xác minh đồng hồ. |
| vneconomy.vn | Đã sửa ưu tiên ngày gốc JSON-LD thay vì phụ thuộc RSS còn giữ URL; 5 bài qua gate và luồng ES thật. Còn layout mật độ link cao; 1.037 lỗi ngày cũ được mở lại để xử lý theo cửa sổ tuổi bài hiện hành. |
| nld.com.vn | Giữ chuyên trang /nld/ đã kiểm chứng; còn 1 dạng media không có văn bản gốc. |
| vov.vn | Seed tiếng Việt phục hồi. 8 seed tiếng Anh đã chuyển sang nguồn English VOV riêng theo yêu cầu; còn media/ấn phẩm in, xung đột canonical và 3 trang VOV Plus rỗng. |
| en.vietnamplus.vn | Seed lỗi đọc lại, 5 bài lỗi cũ qua luồng thật và ES. Còn một số video/media không có văn bản hoặc layout thiếu thân bài. |
| english.vov.vn | Nguồn mới riêng theo yêu cầu. 5 bài qua parser, 3 bài qua luồng live và ES; đã thêm 9 seed và ngừng 8 seed tiếng Anh trong luồng VOV tiếng Việt. |

## Các trường hợp chưa đạt cần tách riêng

- Người Đô Thị: bài `khai-mac-tuan-le-tho-thien-co-dien-viet-nam-54517.html`, ES `master202647 / 2ec4f7236fccfc61f1c24913948edba6`. Parser lấy ngày gốc 16/11/2026 17:33 UTC+7; ES đang có 17/11/2026 00:00 UTC+7. Writer chỉ tạo mới, giữ bản ghi hiện có; lượt này không đổi chế độ writer hay ghi đè lịch sử.
- SGGP: bài `xu-ly-chu-tai-khoan-thanh-le-lai-q1-hao-han-mini-post882282.html`, ES `master202647 / 2b2e963ef0b02f1ee9fa70ea43290bae`. Nội dung trong ES chỉ dài 10 ký tự là tên tác giả, không phải thân bài. Rule mới chặn đúng HTML này bằng `native_media_body_contains_only_byline`; bản ghi ES cũ chưa bị xóa/ghi đè.
- Business Times: URL `singapore/asean-social-security-members-meet-spore-discuss-ageing-digitalisation-and-new-work-trends` vẫn bị giữ do xung đột danh tính ở lần HTTP live, dù snapshot trước qua. Không suy từ snapshot cũ thành kết quả live thành công.
- Hanoitimes vẫn HTTP 401. Một số bài thuê bao, quiz động, ấn phẩm in, văn bản pháp luật, infographic/video thiếu văn bản gốc và bài không đủ chứng cứ ngày/canonical vẫn chưa được hỗ trợ đầy đủ. Không gọi AI để tự tạo nội dung hay đoán ngày cho các trường hợp này.

Không khẳng định mọi bài/mọi layout đã sửa xong. Bảng trên ghi rõ các lỗi còn lại thay vì đổi thành thành công để làm đẹp số liệu. Không lấy bình luận.

Bằng chứng: `outputs/customer-live-errors-20261118/results.json` (147 seed), `articles/results.json` (167 bài), `seed-recovery.json`, `pipeline-results.json`, `supplement/pipeline-results.json`, `tuy-recovery/pipeline-results.json`, `es-verification.json`, `media-guard-proof.json`, `requeue.json`, `budget-final.json`, `server-tests.tap`, `server-media-tests.tap`. Mã/cấu hình/trạng thái trước sửa được giữ tại `/var/lib/news-flow/customer-live-errors-20261118` và các snapshot trong workspace.
