# Catalog dùng chung

Code và dữ liệu cập nhật ngày 25/11/2026 được lưu cùng Git. SQLite đầy đủ vượt 100 MB nên được lưu dưới dạng `catalog.sqlite.gz`, kèm SHA-256 trong `manifest.json`.

Trên Mac, chạy từ thư mục repo:

```sh
git pull --ff-only origin main
python3 scripts/sync_source_keyword_catalog.py
```

Nếu chưa có catalog, script giải nén snapshot đã kiểm tra checksum vào `outputs/source-keyword-catalog-2026-11-19/source-keyword-catalog.sqlite`. Nếu đã có, script sao lưu vào `.cache/catalog-backups/` rồi áp dụng bản cập nhật trong một transaction, giữ các bản ghi khác trên máy. Chạy lại không thêm trùng dữ liệu. Có thể dùng `--db /duong/dan/catalog.sqlite` để chọn catalog khác. Python 3.10 trở lên, không cần cài thêm package.

## Cập nhật 25/11/2026

- Thêm 17 cách viết keyword/tag cho Shopee và ShopeeFood: 16 nhóm chính và 1 alias. Keyword có bằng chứng từ plan; kết quả tìm kiếm từng nền tảng giữ trạng thái `NOT_CHECKED`, hashtag ngoài phạm vi news giữ `OUT_OF_SCOPE`.
- Đổi YouTube MB Bank từ `@mbbank1926` sang `@VietnamMBBank`, xác minh channel ID `UCYVmBDUk-7_QsOpqTMjzrBg`. Giữ URL cũ, bằng chứng và liên kết dự án BIDV/HDBank.
- Đồng bộ toàn bộ 22 dòng source spam Panasonic thành 21 URL riêng biệt, gồm 3 URL mới. Lưu đủ các ô nguồn khi plan có URL trùng.
- Đồng bộ 36 từ khóa loại trừ theo nhóm sản phẩm Panasonic, gồm `Nhật cũ` bổ sung ở 4 nhóm.

`updates/2026-11-25.json` chứa bản cập nhật có thể đọc và đối chiếu theo project/tab/ô gốc. Các bảng `source_exclusions` và `keyword_exclusions` lưu loại trừ theo dự án. View `monitoring_source_catalog` bỏ nguồn bị loại trừ cho đúng dự án; `source_exclusion_catalog` và `keyword_exclusion_catalog` dùng để đọc danh sách loại trừ. `source_catalog` tiếp tục giữ toàn bộ bản ghi để tra cứu. Phần loại trừ chưa được triển khai vào crawler/VPS đang chạy.

## Kiểm tra và tạo snapshot

```sh
python3 -m unittest discover -s test -p test_catalog_sync.py -v
python3 scripts/sync_source_keyword_catalog.py --package
```

Chỉ tạo lại snapshot sau khi đã áp dụng và kiểm tra catalog. Không commit raw plan, thông tin đăng nhập hoặc thư mục backup.
