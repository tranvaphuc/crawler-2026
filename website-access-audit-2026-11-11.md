# Kiểm tra truy cập 76 nguồn — 11/11/2026

Đã thử mở 76 URL bằng công cụ đọc web không cung cấp tài khoản, kiểm tra bổ sung một số search, bài và profile. Công cụ có thể trả dữ liệu chỉ mục/cache; đây chưa phải kiểm thử trình duyệt ẩn danh hay crawler end-to-end.

**Ô tìm kiếm / nút / trang search chỉ xác nhận thấy chức năng, chưa xác nhận kết quả và phân trang khi logout. ? = chưa xác minh; — = không áp dụng kiểm tra profile mạng xã hội cho nguồn báo này. Mở trang chủ không chứng minh lấy được toàn văn. 403, 429, robots.txt, JS, timeout và browser cũ không chứng minh cần login.**

| # | Nguồn | Đọc khi chưa login / kết quả thử | Search bài | Profile khi chưa login | Ghi chú |
|---:|---|---|---|---|---|
| 1 | [36kr.com/](https://36kr.com/) | Kiểm tra an ninh | ? | — | Chưa xác minh login |
| 2 | [aajtak.in/](https://aajtak.in/) | Không truy cập được | ? | — | Chưa xác minh |
| 3 | [www.asiae.co.kr/](https://www.asiae.co.kr/) | Trang chủ mở | ? | — | Chưa kiểm tra toàn văn |
| 4 | [www.bhaskar.com:443/](https://www.bhaskar.com:443/) | robots.txt | ? | — | Chưa xác minh |
| 5 | [section.blog.naver.com/BlogHome.naver](https://section.blog.naver.com/BlogHome.naver) | robots.txt | ? | ? | Chưa thử blog/profile cụ thể |
| 6 | [www.business-standard.com/](https://www.business-standard.com/) | Trang chủ mở; có Premium | ? | — | Chưa kiểm tra bài khóa |
| 7 | [top.cafe.daum.net/](https://top.cafe.daum.net/) | Không truy cập được | ? | ? | Tùy quyền cafe, chưa xác minh |
| 8 | [section.cafe.naver.com/ca-fe/](https://section.cafe.naver.com/ca-fe/) | robots.txt | Có điều kiện* | ? | Cafe riêng cần tư cách thành viên |
| 9 | [www.caixin.com/](https://www.caixin.com/) | Danh sách mở; bài thu phí cần login và gói* | ? | — | FAQ xác nhận tài khoản phải có đúng gói |
| 10 | [www.chinanews.com.cn/](https://www.chinanews.com.cn/) | Trang chủ mở | Ô tìm kiếm | — | Chưa thử kết quả |
| 11 | [www.chosun.com/](https://www.chosun.com/) | Trang chủ mở | Ô tìm kiếm | — | Chưa thử bài thành viên |
| 12 | [cn.technode.com/](https://cn.technode.com/) | Trang chủ mở | ? | — | Bài mẫu cache miss |
| 13 | [www.donga.com/](https://www.donga.com/) | Trang chủ mở | Ô tìm kiếm | — | Chưa thử kết quả |
| 14 | [economictimes.indiatimes.com/](https://economictimes.indiatimes.com/) | Trang chủ mở; có ETPrime | Ô; topic AI mở | — | Topic chưa phải search tùy ý |
| 15 | [www.edaily.co.kr/](https://www.edaily.co.kr/) | Trang chủ mở | Ô tìm kiếm | — | Có tìm thường và AI |
| 16 | [en.tmtpost.com/](https://en.tmtpost.com/) | Timeout | ? | — | Chưa xác minh |
| 17 | [entrackr.com/](https://entrackr.com/) | Bài mẫu đọc được | Ô tìm kiếm | — | Có nút Login không có nghĩa bắt buộc login |
| 18 | [financialexpress.com/](https://financialexpress.com/) | Trang chủ mở | ? | — | Chưa xác minh toàn văn |
| 19 | [www.fnnews.com/](https://www.fnnews.com/) | Trang chủ mở | Ô tìm kiếm | — | Chưa thử kết quả |
| 20 | [www.hani.co.kr/](https://www.hani.co.kr/) | 403 | ? | — | Chưa xác minh login |
| 21 | [www.hankyung.com/](https://www.hankyung.com/) | Trang chủ mở; có Premium9 | Ô tìm kiếm | — | Chưa kiểm tra bài premium |
| 22 | [heraldcorp.com/](https://heraldcorp.com/) | HTML trống | ? | — | Chưa xác minh |
| 23 | [www.hindustantimes.com/](https://www.hindustantimes.com/) | Trang chủ mở; có Premium | ? | — | Chưa thử toàn văn premium |
| 24 | [huanqiu.com/](https://huanqiu.com/) | Timeout | ? | — | Chưa xác minh |
| 25 | [www.ifeng.com/](https://www.ifeng.com/) | Trang chủ mở | Mục tìm kiếm | — | Chưa thử kết quả |
| 26 | [inc42.com/](https://inc42.com/) | Danh sách mở; có Inc42+ | ? | — | Chưa thử toàn văn premium |
| 27 | [indianexpress.com/](https://indianexpress.com/) | Trang chủ mở | Trang search mở | — | Kết quả loading; chưa xác nhận query |
| 28 | [www.joongang.co.kr/](https://www.joongang.co.kr/) | Trang chủ mở; có Plus | Giao diện AI search | — | Chưa kiểm tra quyền bài Plus |
| 29 | [www.khan.co.kr/](https://www.khan.co.kr/) | Trang chủ mở | Ô tìm kiếm | — | Chưa thử kết quả |
| 30 | [www.livemint.com/](https://www.livemint.com/) | Trang chủ mở; có Subscribe | ? | — | Chưa kiểm tra toàn văn |
| 31 | [www.medianama.com/](https://www.medianama.com/) | 403 | ? | — | Chưa xác minh login |
| 32 | [www.mk.co.kr/](https://www.mk.co.kr/) | Trang chủ mở | Ô tìm kiếm | — | Có keyword và AI |
| 33 | [www.moneycontrol.com/](https://www.moneycontrol.com/) | Trang chủ mở; có PRO | Ô; tag AI mở | ? (forum) | Tag chưa phải search tùy ý |
| 34 | [www.mt.co.kr/](https://www.mt.co.kr/) | Trang chủ mở | Nút tìm kiếm | — | Chưa thử kết quả |
| 35 | [www.ndtv.com/](https://www.ndtv.com/) | Trang chủ mở | Ô tìm kiếm | — | Chưa thử kết quả |
| 36 | [news.163.com/](https://news.163.com/) | Không truy cập được | ? | — | Chưa xác minh |
| 37 | [news.cctv.com/](https://news.cctv.com/) | Trang chủ mở | ? | — | Chưa xác minh search |
| 38 | [news.naver.com/](https://news.naver.com/) | robots.txt | ? | — | Chưa xác minh |
| 39 | [news.qq.com/](https://news.qq.com/) | Chỉ iframe | ? | — | Chưa xác minh login |
| 40 | [news.sina.com.cn/](https://news.sina.com.cn/) | Trang chủ mở | ? | — | Chưa xác minh search |
| 41 | [news.sohu.com/](https://news.sohu.com/) | Trang chủ mở | ? | — | Chưa xác minh search |
| 42 | [www.people.com.cn/](https://www.people.com.cn/) | Trang chủ mở | ? | — | Chưa xác minh search |
| 43 | [www.sedaily.com/](https://www.sedaily.com/) | 403 | ? | — | Chưa xác minh login |
| 44 | [www.thehindu.com/](https://www.thehindu.com/) | robots.txt | ? | — | Chưa xác minh paywall trong lần thử |
| 45 | [www.thepaper.cn/](https://www.thepaper.cn/) | 403 | ? | ? | Chưa xác minh |
| 46 | [theqoo.net/](https://theqoo.net/) | Danh sách mở | ? | ? | Chưa thử bài và profile |
| 47 | [tieba.baidu.com/](https://tieba.baidu.com/) | Timeout | ? | ? | Chưa xác minh |
| 48 | [timesofindia.indiatimes.com/](https://timesofindia.indiatimes.com/) | Trang chủ mở; có TOI+ | ? | — | Chưa thử bài TOI+ |
| 49 | [tousu.sina.com.cn/](https://tousu.sina.com.cn/) | Danh sách khiếu nại mở | Ô tìm kiếm | ? | Chưa thử người khiếu nại |
| 50 | [weibo.com/](https://weibo.com/) | Root chỉ điều hướng | Có chức năng; quyền logout chưa rõ | Một profile trả nội dung từ cache* | Không kết luận mọi profile cần login |
| 51 | [www.bilibili.com/](https://www.bilibili.com/) | Báo browser cũ | ? | ? | Không phải bằng chứng login |
| 52 | [www.caixinglobal.com/](https://www.caixinglobal.com/) | Trang chủ mở; có thuê bao | Ô tìm kiếm | — | Chưa thử toàn văn |
| 53 | [www.chinadaily.com.cn/](https://www.chinadaily.com.cn/) | Trang chủ mở | Ô tìm kiếm | — | Chưa thử kết quả |
| 54 | [www.clien.net/](https://www.clien.net/) | robots.txt | ? | ? | Chưa xác minh |
| 55 | [www.consumercomplaints.in/](https://www.consumercomplaints.in/) | Danh sách khiếu nại mở | Ô tìm kiếm | ? | Chưa thử profile |
| 56 | [www.dcinside.com/](https://www.dcinside.com/) | Trang chủ mở | Ô tìm kiếm | ? | Chưa thử Gallog |
| 57 | [www.douyin.com/](https://www.douyin.com/) | Please wait | ? | ? | Chưa phân biệt JS/chặn bot/auth |
| 58 | [www.hankookilbo.com/](https://www.hankookilbo.com/) | robots.txt | ? | — | Chưa xác minh |
| 59 | [www.huxiu.com/](https://www.huxiu.com/) | Trang chủ mở; có Pro | ? | ? | Chưa thử Pro/profile tác giả |
| 60 | [www.insight.co.kr/](https://www.insight.co.kr/) | Trang chủ mở | Ô tìm kiếm | — | Chưa thử kết quả |
| 61 | [www.instagram.com/](https://www.instagram.com/) | 429 ở root và profile mẫu | ? | ? | Không đủ bằng chứng kết luận cần login |
| 62 | [www.koreaherald.com/](https://www.koreaherald.com/) | Bài mẫu đọc được | Ô tìm kiếm | — | Có khu subscribers; chưa thử bài khóa |
| 63 | [www.koreatimes.co.kr/](https://www.koreatimes.co.kr/) | Trang chủ mở | ? | — | Chưa xác minh search |
| 64 | [www.nate.com/](https://www.nate.com/) | Trang chủ mở | Ô tìm kiếm | ? | Chưa thử profile |
| 65 | [www.naver.com/](https://www.naver.com/) | Khung tìm kiếm mở | Ô tìm kiếm | ? | Kết quả search chưa xác minh |
| 66 | [www.ppomppu.co.kr/](https://www.ppomppu.co.kr/) | 403 | ? | ? | Chưa xác minh |
| 67 | [www.quora.com/](https://www.quora.com/) | robots.txt | ? | ? | Search cũng không truy cập được |
| 68 | [www.reddit.com/](https://www.reddit.com/) | Bài và bình luận mẫu đọc được | Đã trả kết quả không-login* | ? | Chưa thử URL user cụ thể |
| 69 | [www.teamblind.com/](https://www.teamblind.com/) | Bài và bình luận mẫu đọc được | Ô tìm kiếm | ? | My Company mời tham gia; profile chưa thử |
| 70 | [www.toutiao.com/](https://www.toutiao.com/) | Yêu cầu JavaScript | ? | ? | Không phải bằng chứng login |
| 71 | [www.rednote.com/](https://www.rednote.com/) | Root và Explore yêu cầu login* | Chưa vào được khi logout | ? | Chưa thử URL profile riêng |
| 72 | [www.zhihu.com/signin?next=%2F](https://www.zhihu.com/signin?next=%2F) | URL đầu vào là signin; bị chặn | ? | ? | Search/profile thử cũng bị chặn; chưa kết luận toàn bộ site |
| 73 | [www.xinhuanet.com/](https://www.xinhuanet.com/) | Trang chủ mở | Liên kết tìm kiếm | — | Chưa thử kết quả |
| 74 | [www.yicai.com/](https://www.yicai.com/) | Timeout | ? | — | Chưa xác minh |
| 75 | [www.yna.co.kr/](https://www.yna.co.kr/) | robots.txt | ? | — | Chưa xác minh |
| 76 | [yourstory.com/](https://yourstory.com/) | Trang chủ mở | ? | — | Chưa kiểm tra toàn văn |

## Bằng chứng và giới hạn

- [Rednote](https://www.rednote.com/) và [Explore](https://www.rednote.com/explore): cả hai chuyển sang /login. Xác nhận yêu cầu đăng nhập cho hai URL này; chưa kiểm tra URL profile cụ thể.
- [Profile Weibo mẫu](https://weibo.com/wbsearch): trả bio và nhiều bài khi không cung cấp tài khoản nhưng nguồn cache/chỉ mục khoảng 4 tháng. Không chứng minh mọi profile đều mở live hoặc đều bắt buộc login. [Trợ giúp Weibo](https://kefu.weibo.com/faqdetail?id=21171) xác nhận có search trong profile theo nội dung/từ khóa/thời gian, không xác nhận quyền logout.
- [Reddit search AI](https://www.reddit.com/search/?q=AI): trả kết quả không cung cấp tài khoản; bài và bình luận mẫu cũng đọc được. Chưa thử profile cụ thể và toàn bộ phân trang.
- [Blind](https://www.teamblind.com/): bài và bình luận mẫu đọc được; [My Company](https://www.teamblind.com/my-company) mời tham gia. Chưa xác minh profile hay kết quả search khi logout.
- [Naver quyền hiển thị bài cafe](https://help.naver.com/service/5626/contents/22937?osType=COMMONOS) và [cafe riêng](https://help.naver.com/service/5622/contents/771?lang=ko&osType=PC): cafe/bài riêng không được index trong search; cafe riêng chỉ thành viên được vào. Đăng nhập có thể chưa đủ nếu chưa có quyền thành viên.
- [Caixin FAQ thuê bao](https://www.caixin.com/subscribe/): nội dung thu phí cần tài khoản có đúng gói còn hạn; login miễn phí không đủ.
- [Caixin Global thuê bao](https://pay.caixinglobal.com/mall/index.html?internalReferrer=BlueSubscribeButton), [Inc42+](https://inc42.com/features/), [JoongAng Plus](https://www.joongang.co.kr/plus): có sản phẩm thuê bao; cần thử bài mục tiêu để xác nhận quyền toàn văn.
- [Instagram profile mẫu](https://www.instagram.com/instagram/): trả 429; chưa xác minh login hay khả năng đọc profile công khai.
- [Zhihu URL đầu vào](https://www.zhihu.com/signin?next=%2F) vốn là trang signin. Search/profile thử không truy cập được; chưa có bằng chứng đủ để kết luận cả site cần login.

“Có search” chỉ mô tả tính năng tìm kiếm, không phải cho phép thu thập tự động. Các ô ? còn cần kiểm tra, không phải kết quả âm tính. Để xác minh profile cần URL người dùng cụ thể; để xác minh crawler cần thử bài, search, trang tiếp theo và toàn văn từ môi trường dự định chạy.
