# Thử Tesla trên 76 nguồn — 11/11/2026

**Chưa có nguồn nào được xác minh crawler live từ máy này.** HTTP trực tiếp báo ECONNREFUSED, Chrome báo net::ERR_CONNECTION_REFUSED. Các kết quả dưới đây lấy từ công cụ web không cung cấp tài khoản và có thể là cache/index.

Theo yêu cầu: gặp login/đăng ký/gói trả phí để đọc thì loại nguồn. Không có bằng chứng thành công thì chưa bật crawler. Không dùng lỗi công cụ để kết luận website vĩnh viễn không crawl được.

## Kết quả

- **40 ứng viên có nội dung bài đọc được qua công cụ**: chưa phải 40 nguồn crawler live đã chạy.
- **6 nguồn loại vì tài khoản/thuê bao hoặc giới hạn quyền đọc**: Caixin, Economic Times, Inc42, Mint, Caixin Global, Rednote. ET được loại thận trọng do HTML chứa luồng đăng nhập; Mint là bản Premium gifted, không coi như public ổn định.
- **30 nguồn chưa bật**: chưa xác minh search/bài, bị chặn hoặc chỉ có profile cache.
- Trong 40 ứng viên: **Reddit** trả được search Tesla + bài; **Business Standard, Indian Express, Moneycontrol** trả danh sách topic/tag Tesla + bài; **36 nguồn còn lại** mới đọc được bài mẫu.

**Nhiều URL thử search bên dưới là route ứng viên, chưa xác nhận từ form của website.** Kết quả không mở được chỉ là chưa xác minh, không phải bằng chứng site không hỗ trợ search. Topic/tag được ghi riêng, không gộp thành search tự do. Cả 76 nguồn được tìm thêm bằng truy vấn Tesla giới hạn domain qua công cụ tìm kiếm; kết quả đó chỉ dùng để tìm URL bài mẫu.

## Nhóm có nội dung mẫu — ứng viên thử crawl

- [https://aajtak.in/](https://aajtak.in/)
- [https://www.asiae.co.kr/](https://www.asiae.co.kr/)
- [https://www.business-standard.com/](https://www.business-standard.com/)
- [https://www.chinanews.com.cn/](https://www.chinanews.com.cn/)
- [https://cn.technode.com/](https://cn.technode.com/)
- [https://www.donga.com/](https://www.donga.com/)
- [https://www.edaily.co.kr/](https://www.edaily.co.kr/)
- [https://en.tmtpost.com/](https://en.tmtpost.com/)
- [https://entrackr.com/](https://entrackr.com/)
- [https://financialexpress.com/](https://financialexpress.com/)
- [https://www.fnnews.com/](https://www.fnnews.com/)
- [https://www.hani.co.kr/](https://www.hani.co.kr/)
- [https://www.hankyung.com/](https://www.hankyung.com/)
- [https://heraldcorp.com/](https://heraldcorp.com/)
- [https://www.hindustantimes.com/](https://www.hindustantimes.com/)
- [https://huanqiu.com/](https://huanqiu.com/)
- [https://indianexpress.com/](https://indianexpress.com/)
- [https://www.joongang.co.kr/](https://www.joongang.co.kr/)
- [https://www.khan.co.kr/](https://www.khan.co.kr/)
- [https://www.medianama.com/](https://www.medianama.com/)
- [https://www.mk.co.kr/](https://www.mk.co.kr/)
- [https://www.moneycontrol.com/](https://www.moneycontrol.com/)
- [https://www.mt.co.kr/](https://www.mt.co.kr/)
- [https://www.ndtv.com/](https://www.ndtv.com/)
- [https://news.cctv.com/](https://news.cctv.com/)
- [https://www.thepaper.cn/](https://www.thepaper.cn/)
- [https://theqoo.net/](https://theqoo.net/)
- [https://timesofindia.indiatimes.com/](https://timesofindia.indiatimes.com/)
- [https://tousu.sina.com.cn/](https://tousu.sina.com.cn/)
- [https://www.chinadaily.com.cn/](https://www.chinadaily.com.cn/)
- [https://www.huxiu.com/](https://www.huxiu.com/)
- [https://www.insight.co.kr/](https://www.insight.co.kr/)
- [https://www.koreaherald.com/](https://www.koreaherald.com/)
- [https://www.koreatimes.co.kr/](https://www.koreatimes.co.kr/)
- [https://www.reddit.com/](https://www.reddit.com/)
- [https://www.teamblind.com/](https://www.teamblind.com/)
- [https://www.xinhuanet.com/](https://www.xinhuanet.com/)
- [https://www.yicai.com/](https://www.yicai.com/)
- [https://www.yna.co.kr/](https://www.yna.co.kr/)
- [https://yourstory.com/](https://yourstory.com/)

## Nhóm loại vì đăng nhập / quyền thuê bao

- [https://www.caixin.com/](https://www.caixin.com/): Nội dung thu phí cần tài khoản có đúng gói theo FAQ Caixin; loại toàn nguồn theo quy tắc không login.
- [https://economictimes.indiatimes.com/](https://economictimes.indiatimes.com/): HTML bài Tesla chứa các luồng yêu cầu đăng nhập để đọc tiếp và ETPrime. Loại thận trọng theo quy tắc; chưa xác minh modal nào thực sự bật trong trình duyệt.
- [https://inc42.com/](https://inc42.com/): Bài Tesla chứa yêu cầu đăng nhập/đăng ký để đọc tiếp, bao gồm chế độ private. Loại toàn nguồn.
- [https://www.livemint.com/](https://www.livemint.com/): Mẫu được gắn nhãn Mint Premium và gifted; không coi quyền đọc từ bản tặng/cache là truy cập công khai ổn định.
- [https://www.caixinglobal.com/](https://www.caixinglobal.com/): Bài mẫu yêu cầu đăng ký để đọc; loại toàn nguồn.
- [https://www.rednote.com/](https://www.rednote.com/): Root và Explore chuyển sang trang login trong lượt kiểm tra trước; không vào luồng search không-login.

## Nhóm chưa bật vì chưa xác minh

- [https://36kr.com/](https://36kr.com/): Chưa có bài Tesla mẫu xác minh được.
- [https://www.bhaskar.com:443/](https://www.bhaskar.com:443/): Công cụ bị robots.txt chặn
- [https://section.blog.naver.com/BlogHome.naver](https://section.blog.naver.com/BlogHome.naver): Công cụ bị robots.txt chặn
- [https://top.cafe.daum.net/](https://top.cafe.daum.net/): Search cafe Daum chưa truy cập được; chưa có bài Tesla mẫu.
- [https://section.cafe.naver.com/ca-fe/](https://section.cafe.naver.com/ca-fe/): Quyền cafe tùy thành viên/công khai; chưa kiểm tra được search Tesla.
- [https://www.chosun.com/](https://www.chosun.com/): Bài mẫu chỉ trả một iframe, không có nội dung bài.
- [https://www.ifeng.com/](https://www.ifeng.com/): Chưa có bài Tesla mẫu xác minh được.
- [https://news.163.com/](https://news.163.com/): Không có mẫu trên news.163.com trong lượt tìm; không đại diện toàn bộ www.163.com.
- [https://news.naver.com/](https://news.naver.com/): Công cụ bị robots.txt chặn
- [https://news.qq.com/](https://news.qq.com/): Search và bài mẫu chưa xác minh; trang chủ chỉ trả iframe.
- [https://news.sina.com.cn/](https://news.sina.com.cn/): Tìm được trang tag Tesla nhưng chưa có bài mẫu hợp lệ trong lượt chọn; search chưa mở được.
- [https://news.sohu.com/](https://news.sohu.com/): Timeout
- [https://www.people.com.cn/](https://www.people.com.cn/): Kết quả trả về không đủ phù hợp làm bài mẫu; các bài ở subdomain chưa kiểm thử.
- [https://www.sedaily.com/](https://www.sedaily.com/): Chưa tìm được mẫu Tesla phù hợp qua công cụ; không kết luận site không có bài.
- [https://www.thehindu.com/](https://www.thehindu.com/): Công cụ bị robots.txt chặn
- [https://tieba.baidu.com/](https://tieba.baidu.com/): 403
- [https://weibo.com/](https://weibo.com/): Profile Tesla trả bio và bài từ dữ liệu cache khoảng 4 tháng; search Tesla chưa xác minh. Chưa chốt crawler live.
- [https://www.bilibili.com/](https://www.bilibili.com/): HTTP status không mong đợi
- [https://www.clien.net/](https://www.clien.net/): Công cụ bị robots.txt chặn
- [https://www.consumercomplaints.in/](https://www.consumercomplaints.in/): Không tìm được bài Tesla mẫu qua công cụ; không chứng minh không có nội dung.
- [https://www.dcinside.com/](https://www.dcinside.com/): Truy vấn giới hạn www.dcinside.com không đại diện các bài ở gall.dcinside.com; search thử chưa mở được.
- [https://www.douyin.com/](https://www.douyin.com/): Trang search và video không có nội dung đọc được; chưa phân biệt JS và login.
- [https://www.hankookilbo.com/](https://www.hankookilbo.com/): Cache miss
- [https://www.instagram.com/](https://www.instagram.com/): Chưa có bài Tesla mẫu xác minh được.
- [https://www.nate.com/](https://www.nate.com/): Truy vấn giới hạn www.nate.com không đại diện news.nate.com; chưa kiểm thử được search.
- [https://www.naver.com/](https://www.naver.com/): Không có kết quả mẫu trên host trang chủ; search Naver Tesla chưa mở được.
- [https://www.ppomppu.co.kr/](https://www.ppomppu.co.kr/): 403
- [https://www.quora.com/](https://www.quora.com/): Cache miss
- [https://www.toutiao.com/](https://www.toutiao.com/): Bài không có nội dung đọc được; trang chủ yêu cầu JavaScript.
- [https://www.zhihu.com/signin?next=%2F](https://www.zhihu.com/signin?next=%2F): URL ban đầu là signin; search Tesla không truy cập được, bài mẫu timeout. Chưa đủ bằng chứng xác định login của toàn site.

## Bảng 76 nguồn và bằng chứng

| # | Nguồn | Kết luận | Search Tesla | Bài/profile mẫu | Ghi chú |
|---:|---|---|---|---|---|
| 1 | [36kr.com/](https://36kr.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://36kr.com/search/articles/Tesla) — Không truy cập được bằng công cụ | Chưa có | Chưa có bài Tesla mẫu xác minh được. |
| 2 | [aajtak.in/](https://aajtak.in/) | Ứng viên; chưa xác minh live | [URL thử](https://www.aajtak.in/search?query=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.aajtak.in/technology/tech-news/story/tesla-roadster-flying-car-upside-down-demo-2026-viral-video-ttecr-dskc-2672053-2026-10-16) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 3 | [www.asiae.co.kr/](https://www.asiae.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://www.asiae.co.kr/search/index.htm?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.asiae.co.kr/en/article/automobile/2026110621370449753) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 4 | [www.bhaskar.com:443/](https://www.bhaskar.com:443/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.bhaskar.com/search/?query=Tesla) — Không truy cập được bằng công cụ | Chưa có | Công cụ bị robots.txt chặn |
| 5 | [section.blog.naver.com/BlogHome.naver](https://section.blog.naver.com/BlogHome.naver) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.naver.com/search.naver?where=blog&query=Tesla) — Không truy cập được bằng công cụ | Chưa có | Công cụ bị robots.txt chặn |
| 6 | [www.business-standard.com/](https://www.business-standard.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.business-standard.com/search?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.business-standard.com/industry/auto/tesla-refunds-early-india-bookings-for-model-3-signaling-entry-is-near-125042600102_1.html) | Đọc được danh sách chủ đề Tesla và nội dung bài mẫu qua công cụ; search tự do và crawler live chưa xác minh. |
| 7 | [top.cafe.daum.net/](https://top.cafe.daum.net/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.daum.net/search?w=cafe&q=Tesla) — Không truy cập được bằng công cụ | Chưa có | Search cafe Daum chưa truy cập được; chưa có bài Tesla mẫu. |
| 8 | [section.cafe.naver.com/ca-fe/](https://section.cafe.naver.com/ca-fe/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.naver.com/search.naver?where=article&query=Tesla) — Không truy cập được bằng công cụ | Chưa có | Quyền cafe tùy thành viên/công khai; chưa kiểm tra được search Tesla. |
| 9 | [www.caixin.com/](https://www.caixin.com/) | LOẠI — tài khoản/quyền đọc | [URL thử](https://search.caixin.com/search/search.jsp?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.caixin.com/2026-05-12/102443435.html) | Nội dung thu phí cần tài khoản có đúng gói theo FAQ Caixin; loại toàn nguồn theo quy tắc không login. |
| 10 | [www.chinanews.com.cn/](https://www.chinanews.com.cn/) | Ứng viên; chưa xác minh live | [URL thử](https://sou.chinanews.com.cn/search.do?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.chinanews.com.cn/cj/2026/09-17/10698197.shtml) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 11 | [www.chosun.com/](https://www.chosun.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.chosun.com/nsearch/?query=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.chosun.com/english/industry-en/2026/11/10/ZXHRRVCYINECZGPPWO76XYSMOI/) | Bài mẫu chỉ trả một iframe, không có nội dung bài. |
| 12 | [cn.technode.com/](https://cn.technode.com/) | Ứng viên; chưa xác minh live | [URL thử](https://cn.technode.com/?s=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://cn.technode.com/post/2024-12-13/tesla-china-ass/) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 13 | [www.donga.com/](https://www.donga.com/) | Ứng viên; chưa xác minh live | [URL thử](https://search.donga.com/?query=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.donga.com/en/article/all/20261017/6422431/1) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 14 | [economictimes.indiatimes.com/](https://economictimes.indiatimes.com/) | LOẠI — tài khoản/quyền đọc | [URL thử](https://economictimes.indiatimes.com/topic/tesla) — Danh sách topic/tag Tesla đọc được; không phải search tự do | [Mẫu](https://economictimes.indiatimes.com/news/international/world-news/us-sec-seeks-to-close-elon-musk-tesla-settlement-fund/articleshow/135722752.cms) | HTML bài Tesla chứa các luồng yêu cầu đăng nhập để đọc tiếp và ETPrime. Loại thận trọng theo quy tắc; chưa xác minh modal nào thực sự bật trong trình duyệt. |
| 15 | [www.edaily.co.kr/](https://www.edaily.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://www.edaily.co.kr/search/news/?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02974966612749944) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 16 | [en.tmtpost.com/](https://en.tmtpost.com/) | Ứng viên; chưa xác minh live | [URL thử](https://en.tmtpost.com/search?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://en.tmtpost.com/news/7054946) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 17 | [entrackr.com/](https://entrackr.com/) | Ứng viên; chưa xác minh live | [URL thử](https://entrackr.com/search?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://entrackr.com/news/elon-musks-tesla-begins-hiring-in-india-8731746) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 18 | [financialexpress.com/](https://financialexpress.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.financialexpress.com/?s=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.financialexpress.com/market/global-markets/dow-jumps-over-1000-points-after-us-midterm-election-results-tesla-and-spacex-slide/4377153/lite/) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 19 | [www.fnnews.com/](https://www.fnnews.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.fnnews.com/search?search_txt=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.fnnews.com/news/202507091100314441) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 20 | [www.hani.co.kr/](https://www.hani.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://www.hani.co.kr/arti/SEARCH/advanced.html?searchword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.hani.co.kr/arti/society/society_general/1286225.html) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 21 | [www.hankyung.com/](https://www.hankyung.com/) | Ứng viên; chưa xác minh live | [URL thử](https://search.hankyung.com/search/news?query=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.hankyung.com/article/202611044623P) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 22 | [heraldcorp.com/](https://heraldcorp.com/) | Ứng viên; chưa xác minh live | [URL thử](https://biz.heraldcorp.com/search?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://mbiz.heraldcorp.com/article/10929034) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 23 | [www.hindustantimes.com/](https://www.hindustantimes.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.hindustantimes.com/search?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.hindustantimes.com/cities/bengaluru-news/tesla-car-spotted-on-bengaluru-roads-sparks-buzz-on-social-media-101704086139187.html) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 24 | [huanqiu.com/](https://huanqiu.com/) | Ứng viên; chưa xác minh live | [URL thử](https://s.huanqiu.com/s?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://3w.huanqiu.com/a/0d8d78/4DbtS4qU9j9?agt=103) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 25 | [www.ifeng.com/](https://www.ifeng.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.ifeng.com/sofeng/search.action?q=Tesla&c=1) — Không truy cập được bằng công cụ | Chưa có | Chưa có bài Tesla mẫu xác minh được. |
| 26 | [inc42.com/](https://inc42.com/) | LOẠI — tài khoản/quyền đọc | [URL thử](https://inc42.com/?s=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://inc42.com/buzz/tesla-signals-india-entry-with-new-hiring-plans/) | Bài Tesla chứa yêu cầu đăng nhập/đăng ký để đọc tiếp, bao gồm chế độ private. Loại toàn nguồn. |
| 27 | [indianexpress.com/](https://indianexpress.com/) | Ứng viên; chưa xác minh live | [URL thử](https://indianexpress.com/search/?search=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://indianexpress.com/article/business/tesla-roadster-unveil-spacex-thrusters-launch-2028-elon-musk-10924036/) | Đọc được danh sách chủ đề Tesla và nội dung bài mẫu qua công cụ; search tự do và crawler live chưa xác minh. |
| 28 | [www.joongang.co.kr/](https://www.joongang.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://www.joongang.co.kr/search?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.joongang.co.kr/article/25476453) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 29 | [www.khan.co.kr/](https://www.khan.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://www.khan.co.kr/search.html?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.khan.co.kr/en/article/202611062200017) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 30 | [www.livemint.com/](https://www.livemint.com/) | LOẠI — tài khoản/quyền đọc | [URL thử](https://www.livemint.com/search?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.livemint.com/global/tesla-cybercabs-hit-austin-streets-in-expansion-of-robotaxi-service-11788509239589.html) | Mẫu được gắn nhãn Mint Premium và gifted; không coi quyền đọc từ bản tặng/cache là truy cập công khai ổn định. |
| 31 | [www.medianama.com/](https://www.medianama.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.medianama.com/?s=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.medianama.com/2021/02/223-tesla-bitcoins-corporate-ownership/) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 32 | [www.mk.co.kr/](https://www.mk.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://www.mk.co.kr/search?word=Tesla) — Cache miss | [Mẫu](https://www.mk.co.kr/en/stock/12179557) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 33 | [www.moneycontrol.com/](https://www.moneycontrol.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.moneycontrol.com/news/tags/tesla.html) — Danh sách topic/tag Tesla đọc được; không phải search tự do | [Mẫu](https://www.moneycontrol.com/automobile/tesla-opens-new-experience-centre-in-noida-article-14048751.html) | Đọc được danh sách chủ đề Tesla và nội dung bài mẫu qua công cụ; search tự do và crawler live chưa xác minh. |
| 34 | [www.mt.co.kr/](https://www.mt.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://search.mt.co.kr/searchNewsList.html?srchWord=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.mt.co.kr/en/stock/2026/11/06/2026110616414131112) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 35 | [www.ndtv.com/](https://www.ndtv.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.ndtv.com/search?searchtext=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.ndtv.com/auto/tesla-india-opens-new-experience-centre-in-hyderabad-details-11648717) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 36 | [news.163.com/](https://news.163.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.163.com/search?keyword=Tesla) — Không truy cập được bằng công cụ | Chưa có | Không có mẫu trên news.163.com trong lượt tìm; không đại diện toàn bộ www.163.com. |
| 37 | [news.cctv.com/](https://news.cctv.com/) | Ứng viên; chưa xác minh live | [URL thử](https://search.cctv.com/search.php?qtext=Tesla&type=web) — Không truy cập được bằng công cụ | [Mẫu](https://news.cctv.com/2025/11/11/ARTIlIeBPjwf4mHl57AIMRA6251111.shtml) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 38 | [news.naver.com/](https://news.naver.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.naver.com/search.naver?where=news&query=Tesla) — Không truy cập được bằng công cụ | Chưa có | Công cụ bị robots.txt chặn |
| 39 | [news.qq.com/](https://news.qq.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://i.news.qq.com/gw/search?query=Tesla) — Không truy cập được bằng công cụ | Chưa có | Search và bài mẫu chưa xác minh; trang chủ chỉ trả iframe. |
| 40 | [news.sina.com.cn/](https://news.sina.com.cn/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.sina.com.cn/?q=Tesla&c=news) — Không truy cập được bằng công cụ | Chưa có | Tìm được trang tag Tesla nhưng chưa có bài mẫu hợp lệ trong lượt chọn; search chưa mở được. |
| 41 | [news.sohu.com/](https://news.sohu.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.sohu.com/?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://news.sohu.com/a/902836979_100026275) | Timeout |
| 42 | [www.people.com.cn/](https://www.people.com.cn/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.people.cn/s?keyword=Tesla) — Không truy cập được bằng công cụ | Chưa có | Kết quả trả về không đủ phù hợp làm bài mẫu; các bài ở subdomain chưa kiểm thử. |
| 43 | [www.sedaily.com/](https://www.sedaily.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.sedaily.com/Search/News?scText=Tesla) — Không truy cập được bằng công cụ | Chưa có | Chưa tìm được mẫu Tesla phù hợp qua công cụ; không kết luận site không có bài. |
| 44 | [www.thehindu.com/](https://www.thehindu.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.thehindu.com/search/#gsc.q=Tesla) — Công cụ bị robots.txt chặn | Chưa có | Công cụ bị robots.txt chặn |
| 45 | [www.thepaper.cn/](https://www.thepaper.cn/) | Ứng viên; chưa xác minh live | [URL thử](https://www.thepaper.cn/searchResult.jsp?inpsearch=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.thepaper.cn/newsDetail_forward_34361347) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 46 | [theqoo.net/](https://theqoo.net/) | Ứng viên; chưa xác minh live | [URL thử](https://theqoo.net/square?search_target=title_content&search_keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://theqoo.net/square/4377235601?page=3) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 47 | [tieba.baidu.com/](https://tieba.baidu.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://tieba.baidu.com/f?kw=tesla) — 403 | [Mẫu](https://tieba.baidu.com/f?kw=tesla) | 403 |
| 48 | [timesofindia.indiatimes.com/](https://timesofindia.indiatimes.com/) | Ứng viên; chưa xác minh live | [URL thử](https://timesofindia.indiatimes.com/topic/tesla) — Công cụ bị robots.txt chặn | [Mẫu](https://timesofindia.indiatimes.com/city/hyderabad/tesla-opens-experience-centre-in-hyderabad/articleshow/131806230.cms) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 49 | [tousu.sina.com.cn/](https://tousu.sina.com.cn/) | Ứng viên; chưa xác minh live | [URL thử](https://tousu.sina.com.cn/index/search/?keywords=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://tousu.sina.com.cn/complaint/view/17401504208/?sld=5791a47e6d00c1de5df64b8a8c14f651) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 50 | [weibo.com/](https://weibo.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://s.weibo.com/weibo?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://weibo.com/teslaofficial?index=1&tabtype=album&uid=3615027564) | Profile Tesla trả bio và bài từ dữ liệu cache khoảng 4 tháng; search Tesla chưa xác minh. Chưa chốt crawler live. |
| 51 | [www.bilibili.com/](https://www.bilibili.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.bilibili.com/all?keyword=Tesla) — Trang báo browser cũ | [Mẫu](https://www.bilibili.com/list/491190876?bvid=BV1qtquB1EMX&oid=115851860711448) | HTTP status không mong đợi |
| 52 | [www.caixinglobal.com/](https://www.caixinglobal.com/) | LOẠI — tài khoản/quyền đọc | [URL thử](https://www.caixinglobal.com/search/?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.caixinglobal.com/2025-02-12/tesla-opens-shanghai-megapack-factory-102287597.html) | Bài mẫu yêu cầu đăng ký để đọc; loại toàn nguồn. |
| 53 | [www.chinadaily.com.cn/](https://www.chinadaily.com.cn/) | Ứng viên; chưa xác minh live | [URL thử](https://newssearch.chinadaily.com.cn/en/search?query=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.chinadaily.com.cn/a/202607/31/WS6a6c407ba310986e2b4685e5.html) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 54 | [www.clien.net/](https://www.clien.net/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.clien.net/service/search?q=Tesla) — Không truy cập được bằng công cụ | Chưa có | Công cụ bị robots.txt chặn |
| 55 | [www.consumercomplaints.in/](https://www.consumercomplaints.in/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.consumercomplaints.in/?search=Tesla) — Không truy cập được bằng công cụ | Chưa có | Không tìm được bài Tesla mẫu qua công cụ; không chứng minh không có nội dung. |
| 56 | [www.dcinside.com/](https://www.dcinside.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.dcinside.com/combine/q/Tesla) — Không truy cập được bằng công cụ | Chưa có | Truy vấn giới hạn www.dcinside.com không đại diện các bài ở gall.dcinside.com; search thử chưa mở được. |
| 57 | [www.douyin.com/](https://www.douyin.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.douyin.com/search/Tesla) — Không có nội dung đọc được | [Mẫu](https://www.douyin.com/video/7682561857625869574) | Trang search và video không có nội dung đọc được; chưa phân biệt JS và login. |
| 58 | [www.hankookilbo.com/](https://www.hankookilbo.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.hankookilbo.com/Search?searchText=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.hankookilbo.com/news/article/A2026110622440005505?did=NA) | Cache miss |
| 59 | [www.huxiu.com/](https://www.huxiu.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.huxiu.com/search/0/Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.huxiu.com/article/4898005.html?f=rss) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 60 | [www.insight.co.kr/](https://www.insight.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://www.insight.co.kr/search?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.insight.co.kr/news/578065) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 61 | [www.instagram.com/](https://www.instagram.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.instagram.com/explore/search/keyword/?q=Tesla) — Cache miss | Chưa có | Chưa có bài Tesla mẫu xác minh được. |
| 62 | [www.koreaherald.com/](https://www.koreaherald.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.koreaherald.com/search?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.koreaherald.com/article/10929035) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 63 | [www.koreatimes.co.kr/](https://www.koreatimes.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://www.koreatimes.co.kr/search?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.koreatimes.co.kr/economy/others/20261018/tesla-boom-raises-concerns-over-korean-auto-insurers-loss-ratios) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 64 | [www.nate.com/](https://www.nate.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.daum.net/nate?w=tot&q=Tesla) — Không truy cập được bằng công cụ | Chưa có | Truy vấn giới hạn www.nate.com không đại diện news.nate.com; chưa kiểm thử được search. |
| 65 | [www.naver.com/](https://www.naver.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://search.naver.com/search.naver?query=Tesla) — Không truy cập được bằng công cụ | Chưa có | Không có kết quả mẫu trên host trang chủ; search Naver Tesla chưa mở được. |
| 66 | [www.ppomppu.co.kr/](https://www.ppomppu.co.kr/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.ppomppu.co.kr/search_bbs.php?keyword=tesla&order_type=date) — Cache miss | [Mẫu](https://www.ppomppu.co.kr/search_bbs.php?keyword=tesla&order_type=date) | 403 |
| 67 | [www.quora.com/](https://www.quora.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.quora.com/search?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.quora.com/Electrical-Engineering-What-are-the-inspiring-stories-of-great-Nikola-Tesla) | Cache miss |
| 68 | [www.reddit.com/](https://www.reddit.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.reddit.com/search/?q=Tesla) — Kết quả search Tesla đọc được qua công cụ web | [Mẫu](https://www.reddit.com/r/Eesti/comments/1j7tncz/tesla_autode_omanikud/) | Đọc được kết quả search Tesla và bài/bình luận từ kết quả qua công cụ; phân trang và crawler live chưa xác minh. |
| 69 | [www.teamblind.com/](https://www.teamblind.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.teamblind.com/search/Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.teamblind.com/kr/post/FSD%EC%9D%98-%EA%B2%B0%EC%A0%95%EC%A0%81-%EC%88%9C%EA%B0%84%EB%93%A4-%EB%AA%A8%EC%9D%8C-r3zktmry) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 70 | [www.toutiao.com/](https://www.toutiao.com/) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.toutiao.com/search/?keyword=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.toutiao.com/article/7507206911478809099/) | Bài không có nội dung đọc được; trang chủ yêu cầu JavaScript. |
| 71 | [www.rednote.com/](https://www.rednote.com/) | LOẠI — tài khoản/quyền đọc | [URL thử](https://www.rednote.com/search_result?keyword=Tesla) — Không truy cập được bằng công cụ | Chưa có | Root và Explore chuyển sang trang login trong lượt kiểm tra trước; không vào luồng search không-login. |
| 72 | [www.zhihu.com/signin?next=%2F](https://www.zhihu.com/signin?next=%2F) | CHƯA BẬT — chưa xác minh | [URL thử](https://www.zhihu.com/search?type=content&q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.zhihu.com/en/answer/55281029) | URL ban đầu là signin; search Tesla không truy cập được, bài mẫu timeout. Chưa đủ bằng chứng xác định login của toàn site. |
| 73 | [www.xinhuanet.com/](https://www.xinhuanet.com/) | Ứng viên; chưa xác minh live | [URL thử](https://so.news.cn/#search/0/Tesla) — 403 | [Mẫu](https://www.xinhuanet.com/english/2018-03/24/c_137061335.htm) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 74 | [www.yicai.com/](https://www.yicai.com/) | Ứng viên; chưa xác minh live | [URL thử](https://www.yicai.com/search?keys=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.yicai.com/brief/103398108.html) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 75 | [www.yna.co.kr/](https://www.yna.co.kr/) | Ứng viên; chưa xác minh live | [URL thử](https://www.yna.co.kr/search/index?query=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://www.yna.co.kr/view/AKR20261106183100009) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |
| 76 | [yourstory.com/](https://yourstory.com/) | Ứng viên; chưa xác minh live | [URL thử](https://yourstory.com/search?q=Tesla) — Không truy cập được bằng công cụ | [Mẫu](https://yourstory.com/2025/02/elon-musk-tesla-india-hiring-pm-modi-us-meet) | Công cụ đọc được nội dung bài Tesla mẫu, không thấy thông báo bắt login để đọc trong mẫu; chưa xác minh search/phân trang và truy cập live. |

## Bằng chứng chính

- [Search Tesla Reddit](https://www.reddit.com/search/?q=Tesla) và [bài mở từ kết quả](https://www.reddit.com/r/teslacanada/comments/1tfpfj5/tesla_ruined_our_life/): trả kết quả, bài và bình luận; chưa xác minh phân trang.
- [Business Standard topic](https://www.business-standard.com/topic/tesla-in-india), [bài mẫu](https://www.business-standard.com/industry/auto/tesla-refunds-early-india-bookings-for-model-3-signaling-entry-is-near-125042600102_1.html): đọc được danh sách và bài; không có nghĩa mọi bài Premium đều mở.
- [Indian Express topic](https://indianexpress.com/about/tesla/), [bài mẫu](https://indianexpress.com/article/business/tesla-roadster-unveil-spacex-thrusters-launch-2028-elon-musk-10924036/): đọc được danh sách và bài.
- [Moneycontrol tag](https://www.moneycontrol.com/news/tags/tesla.html), [bài mẫu](https://www.moneycontrol.com/automobile/tesla-opens-new-experience-centre-in-noida-article-14048751.html): đọc được danh sách và bài; không khẳng định nội dung PRO mở.
- [Caixin FAQ](https://www.caixin.com/subscribe/): bài thu phí cần tài khoản có đúng gói; loại theo quy tắc.
- [Caixin Global mẫu](https://www.caixinglobal.com/2025-02-12/tesla-opens-shanghai-megapack-factory-102287597.html): có yêu cầu đăng ký để đọc.
- [Inc42 mẫu](https://inc42.com/buzz/tesla-signals-india-entry-with-new-hiring-plans/): HTML có yêu cầu đăng nhập để đọc tiếp và private mode.
- [Economic Times mẫu](https://economictimes.indiatimes.com/news/international/world-news/us-sec-seeks-to-close-elon-musk-tesla-settlement-fund/articleshow/135722752.cms): có luồng đọc tiếp bằng tài khoản/ETPrime. Chưa xác minh luồng nào bật trong UI; loại thận trọng.
- [Mint mẫu](https://www.livemint.com/global/tesla-cybercabs-hit-austin-streets-in-expansion-of-robotaxi-service-11788509239589.html): được đánh dấu bài Premium gifted; loại theo yêu cầu không dựa vào quyền tặng/thuê bao.
- [Rednote Explore](https://www.rednote.com/explore): chuyển login trong lượt kiểm tra trước.
- [Weibo Tesla profile](https://weibo.com/teslaofficial?index=1&tabtype=album&uid=3615027564): công cụ trả nội dung cache khoảng 4 tháng. Search không xác minh được; chưa bật.

Không có thay đổi cấu hình crawler hay tài khoản nào trong repository. Cần kiểm tra bằng phiên trình duyệt chưa đăng nhập và mạng hoạt động để chuyển ứng viên thành nguồn crawl xác nhận.
