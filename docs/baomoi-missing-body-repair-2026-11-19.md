> Cập nhật tiếp: đã phục hồi thêm 45 trong 46 URL còn lại; 1 URL báo gốc trả 404. Xem [báo cáo xử lý 46 URL](baomoi-remaining-46-repair-2026-11-19.md). Các số liệu dưới đây là snapshot của đợt sửa đầu.

# Sửa lỗi missing_body của Báo Mới — 19/11/2026

Đã triển khai `/opt/news-flow/releases/20261119-baomoi-media-06` lúc khoảng 22:59 UTC+7. Đã phục hồi 307 bài bằng luồng crawl/parse/import thường và đối chiếu 307/307 tài liệu trong ES lúc 23:02:26: URL, publisher, tiêu đề, ngày đăng và nội dung đều khớp kết quả kiểm chứng. Không ghi đè trực tiếp ES.

Nguyên nhân: HTML server của Báo Mới hiển thị khung chờ video và ảnh GIF chờ tải; URL media thật nằm trong `__NEXT_DATA__.props.pageProps.resp.data.content.bodys`. Parser cũ không đọc các trường này. Một số trang thể thao cũng bị nhận nhầm là bài tin.

Bản sửa trong `src/web/baomoiMediaNews.mjs` đối chiếu ID bài, URL/canonical, h1, NewsArticle, ngày đăng và mô tả trước khi khôi phục video/ảnh/audio. Chỉ nhận URL HTTPS trên các CDN Báo Mới đã quan sát, không lấy thumbnail thay media. Phần chữ và chú thích native được giữ lại; tên tác giả và nhãn điều khiển audio không được dùng làm thân bài. Bài không có mô tả native bị giữ với kết quả kiểm chứng `missing_description`; không dùng tiêu đề hay mô tả do AI tạo để điền vào.

`newsLinkPolicy.mjs` nhận diện các trang trận đấu, giải đấu, đội bóng và cầu thủ dưới `/bong-da/`. Đã chuyển 16 URL được xác minh sang loại không phải bài tin.

Đợt chính rà HTTP 368 URL lỗi và 12 URL đối chứng. Có 307 bài phục hồi, 16 trang thể thao được loại, 22 bài thiếu mô tả, 22 trang trả rỗng và 1 URL bài hiện trả trang danh sách. Một timeout trong đợt rà đã kiểm tra riêng thành công. 12 đối chứng giữ nguyên kết quả: 11 bài khớp dữ liệu trước/sau; 1 bài có JSON-LD không gắn được với URL bị cả parser cũ và mới từ chối giống nhau.

Kiểm tra bổ sung URL lỗi xuất hiện giữa lúc chốt mẫu và triển khai: 1 infographic nữa không có mô tả native. Tổng phần chưa phục hồi là **46 URL: 23 thiếu mô tả, 22 trả rỗng, 1 trả trang danh sách**. Các bản ghi lỗi này không được đổi thành thành công; lý do trong ledger lịch sử có thể vẫn là `missing_body`, còn kết quả rà HTTP/parser mới nằm trong báo cáo kiểm chứng. Không thấy lỗi mới được phát hiện sau thời điểm triển khai ở snapshot 23:02:54.

Kiểm thử: 59 test trên local và 43 test trên bản VPS đều đạt. Kiểm tra hồi quy gồm danh tính, ngày gốc, media, chú thích, phần chữ gốc, dữ liệu JSON lỗi, CDN không đúng và URL thể thao. Số test nền khác nhau giữa workspace và bản VPS; bản triển khai dùng thay đổi hẹp trên parser live để giữ nguyên các thay đổi hiện hữu.

Ledger `ai_usage` giữ nguyên tích lũy. `/etc/news-flow/ai.env` vẫn có ngân sách 2 USD/ngày và giới hạn 200 lượt/ngày. Các script kiểm tra/sửa không gọi AI API trả phí. Không thay đổi điều khiển chi phí của ứng dụng Codex/ChatGPT.

Bằng chứng VPS: `/var/lib/news-flow/baomoi-repair-20261119/`, gồm `full/verification.json`, `unreviewed/verification.json`, `recovery.json`, `es-verification.json`, `server-tests.tap`, `budget-final.json` và snapshot trước phục hồi. Bản sao đợt chính trong workspace: `outputs/baomoi-repair-20261119/proof/`.
