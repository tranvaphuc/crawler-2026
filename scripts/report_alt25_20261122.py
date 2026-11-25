import json,hashlib
from pathlib import Path
from collections import Counter
from datetime import datetime,timezone,timedelta
root=Path('outputs/news-alt25-2026-11-22')
read=lambda name:json.loads((root/name).read_text(encoding='utf-8'))
routes,follow,final,extra,api=map(read,['routes.json','followup.json','final-check.json','extra-inspection.json','coindesk-api.json'])
old=json.loads(Path('outputs/news-closeout25-2026-11-22/source-closeout.json').read_text(encoding='utf-8'))
assert len(routes['sites'])==25 and len({s['site'] for s in routes['sites']})==25
assert set(s['site'] for s in routes['sites'])==set(old['cohort'])
assert routes['aiLedgerUnchanged'] and final['aiLedgerUnchanged']
assert all(s['matches'] for s in final['parserFiles']) and all(s['unchanged'] for s in final['configUnchanged'])
assert all(s['error'] is None and s['restricted'] and s['esGate']=='NEWS_PUBLICATION_OR_ACCESS_UNCONFIRMED' for s in final['cnnNativeReplay'])
assert len(final['restoredSourceControls'])==10 and all(s['exactFieldMatch'] for s in final['restoredSourceControls'])
findings={
 '2saigon.vn':'Feed/query REST vẫn reset. DNS A/NS kiểm tra độc lập bằng system, Cloudflare và Google đều ENOTFOUND; không phải chỉ một resolver VPS.',
 'coindesk.com':'AMP của bài mới vẫn 429. RSS outputType=xml có 25 item nhưng không có toàn văn. CoinDesk Data API chính thức /news/v1/source/list trả 401, Err.type=2; cần credential riêng của publisher, không phải AI API key.',
 'dailo.vn':'RSS/feed.xml/news-sitemap, HTTP và mobile đã thử; HTTPS vẫn chứng chỉ hết hạn, mobile timeout. Không tìm được host/representation TLS hợp lệ để đưa vào production.',
 'danhgiaxe.com':'RSS/feed/news-sitemap 404; output=amp và print=1 chỉ trả cùng HTML không có original clock. Đã đọc app.js: các endpoint tìm thấy là carline/view-count/account/deal, không có API publication bài.',
 'dulichgiaitri.com':'RSS là HTML homepage, feed.xml/news-sitemap 404; AMP/print không bổ sung ngày đăng. Đã đọc các JS autoload/theme: mã WordPress chép vào giao diện, chưa có endpoint original publication hoạt động.',
 'edition.cnn.com':'Tìm được CNN Lite: hai URL index 200 và 32 bài 200 với toàn văn, canonical và datePublished/dateModified riêng. Sáu mẫu đóng băng đã parse đúng original time sau bản vá URL JSON-LD. Cả 32 schema đều isAccessibleForFree=false; giữ gate truy cập, chưa bật nguồn/ghi ES. Đây là đường đọc mới đã xác minh, không còn chỉ kết luận CNN bị 403.',
 'emagazine24.net':'Đã thử feed RSS2/Atom qua query/index.php và REST query/_embed; tất cả 403. Không có representation đầy đủ công khai hoạt động qua proxy hiện có.',
 'finance.biggo.com':'Tìm thêm API public /news/local/list?region=us trả 200. Hai miền vùng publisher khai báo finance.biggo.com.tw và finance.biggo.jp vẫn 403 cho cùng UUID. Đã đọc JS/API setup; các trường đọc được vẫn thuộc listing/truncated content, chưa có toàn văn đủ điều kiện.',
 'giacavattu.com.vn':'Thử thêm một endpoint feed /gprss.aspx: 404. Không burst trang chủ/bài. Dữ liệu lưu vẫn chỉ có ngày cập nhật, chưa có original publication đủ điều kiện.',
 'gialaitv.vn':'Feed RSS2/Atom, feed từng bài và category đều 403. REST qua index.php và wp-json trả HTTP503 nhưng body ghi “You are not authorized to perform this action.”: xác định lại là bị từ chối quyền API. ?p=879422 đọc đúng bài, vẫn chỉ có đồng hồ cập nhật.',
 'hanoitimes.vn':'Đã thử thêm rss, rss.xml, feed.xml, rss.htm, news-sitemap và RSS tin mới: đều 401. Chưa có bằng chứng chuyển miền chính thức cung cấp cùng bài.',
 'kinhteplus.com.vn':'RSS/feed/sitemap/HTTP vẫn gặp leaf certificate hết hạn; mobile reset. Không tìm được đường HTTPS hợp lệ.',
 'laodongdongnai.vn':'RSS2/Atom qua query/index.php và hai kiểu REST đều 500. Backend public này chưa cung cấp bài qua các representation thay thế đã thử.',
 'ngoisaovietnam.vn':'index.php trả homepage 200; RSS/feed/news-sitemap 404. Đã đọc JS first-party nhưng không có endpoint bài thay thế; các pretty URL bài vẫn chưa khôi phục.',
 'nguoinoitieng.vn':'HTTPS feed/RSS/sitemap, www và AMP/print đều trả Account Suspended; HTTP feed 404. HTTP200 không được tính là bài hoặc feed thành công.',
 'nhansac.vn':'REST query qua index.php, REST _embed và API từng post hoạt động 200; shortlink ?p=48 cũng đúng bài. Nội dung vẫn lặp: API khác không cung cấp body đúng hơn để thay thế. Giữ guard nội dung trùng.',
 'tamnhin.kienthuc.net.vn':'RSS/feed/news-sitemap và RSS mobile đã thử đều reset. Không tìm được đường công khai đầy đủ mới hoạt động.',
 'thoibaobatdongsan.net':'Feed query/index.php chỉ trả HTML thông báo đóng; RSS rỗng hoặc 404. Chưa có bài để xác minh dù frontend một số đường trả200.',
 'tieudungso.vn':'Feed RSS2/Atom và REST qua cả index.php/wp-json đều lỗi TLS EPROTO. Không có payload để parser hay AI sửa.',
 'tieudungthoinay.vn':'RSS/feed/news-sitemap/robots đều404. Không phát hiện đường bài thay thế hoạt động.',
 'tintuctoday.net':'RSS/feed/sitemap trả cùng HTML chứ không phải feed; AMP/print không có original clock. JS first-party chỉ ra /ajax/load-new-news, đường này đã kiểm không cung cấp đồng hồ đăng gốc. Không dùng ngày ảnh hoặc ngày sự kiện.',
 'travelguide.org.vn':'RSS/feed/news-sitemap404; AMP/print là cùng bài không có publication. Đã đọc JS first-party, không có endpoint original publication mới.',
 'truyenhinh.baobinhduong.vn':'RSS/feed/sitemap, /api/video/ và host API apife tiếp tục timeout. Các API chính xác khai báo trong Nuxt cũng đã kiểm ở lượt trước; chưa có route đạt deadline production.',
 'vietnamfdi.vn':'RSS/feed/news-sitemap/robots đều timeout. Không có payload mới để xác minh timezone; việc sửa selector và URL JSON-LD không thay thế bằng chứng múi giờ còn thiếu.',
 'vinh24h.vn':'RSS/feed/news-sitemap/robots tiếp tục timeout. Chưa có endpoint trả dữ liệu gốc đầy đủ trong các đường đã thử.',
}
assert set(findings)==set(old['cohort'])
cases=[]
for prior in old['cases']:
 s=next(s for s in routes['sites'] if s['site']==prior['site'])
 cases.append({'site':s['site'],'fullSourceRestored':False,'currentFinding':findings[s['site']],
  'newPublicRoutes':s['jobs'],'additionalChecks':[p for p in follow['checks'] if p['site']==s['site']],
  'reopenWhen':prior['reopenWhen'],'previousCause':prior['reason'],'runtimeConfigChanged':False})
report={'at':final['at'],'all25AlternativeRoutesChecked':True,'fullyRestoredSources':0,
 'changesDeployed':{'issue':'Native JSON-LD mainEntityOfPage.url was ignored when binding publication evidence to the original article.',
 'files':final['parserFiles'],'priorityRule':'WebPage.url is a fallback only; explicit conflicting Article.url/WebPage @id remain blocked.',
 'preserved':['original publication time','access restriction flag','ES admission gate','source configuration and existing queues','AI usage ledger'],
 'tests':{'localPassed':80,'vpsPassed':35,'newRegressionCases':7,'existingSourceControlDocumentsMatched':10}},
 'discovery':{'routeUrls':len(routes['jobs']),'routeWireRequestsIncludingRedirects':routes['wireRequests'],
 'cnnArticleChecks':6+sum(c['kind']=='cnn' for c in follow['checks']),
 'additionalChecks':len(follow['checks']),'coinDeskApiRequests':len(api['checks'])},
 'paidAiCallsInThisPass':0,'paidAiUsdInThisPass':0,'astraUsed':False,'aiLedgerUnchanged':True,
 'budget':{'qcTotalCeilingUsd':15,'projectDailyCeilingUsd':2,'existingDailyMaxCalls':200},
 'coindeskOfficialDocs':'https://developers.coindesk.com/documentation/data-api/news_v1_article_list',
 'cases':cases,'services':final['services']}
(root/'source-disposition.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
t=datetime.fromisoformat(final['at'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=7)))
lines=[f'NEWS: THỬ ĐƯỜNG THAY THẾ ĐỦ 25 NGUỒN — {t:%d/%m/%Y %H:%M} UTC+7','',
 'Đã thử trọn 25/25 nguồn trong một lượt. Có một lỗi parser đã sửa và triển khai; chưa có nguồn nào đủ điều kiện mở lại toàn bộ luồng nhập.',
 f"Thử {len(routes['jobs'])} URL thay thế ({routes['wireRequests']} wire request kể cả redirect), thêm 6 mẫu CNN đầu tiên và {len(follow['checks'])} kiểm tra bài/JS/miền vùng, cùng CoinDesk Data API chính thức.",
 'Các đường đã thử gồm RSS2/Atom, feed theo post/category, REST wp-json/query/index.php, AMP/print, CNN Lite, BigGo regional/listing API, sitemap và endpoint từ JavaScript first-party.',
 '', 'ĐÃ SỬA TRÊN PRODUCTION',
 '- Parser bỏ sót URL gốc tại JSON-LD mainEntityOfPage.url, gây lỗi NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND dù đúng bài có ngày đăng đầu.',
 '- Thêm hỗ trợ vào extraction, strict publication proof và publication page identity. Giữ ưu tiên URL đã khai báo; URL xung đột, ngày sửa thay ngày đăng và nội dung bị hạn chế vẫn bị chặn.',
 '- Tái hiện lỗi trước sửa trên local và VPS. Bản cuối: 80/80 kiểm thử local, 35/35 VPS; 7 kiểm thử hồi quy mới.',
 '- Replay10 bài đối chứng của Molistar/SaoExpress: toàn bộ document khớp chính xác trước/sau. Sáu bài CNN giữ nguyên datePublished gốc và vẫn bị ES access gate chặn vì flag publisher.',
 '- Seed/parse/import active, NRestarts=0 sau triển khai. Importer giữ PID1161405. Không bật giả25 nguồn, không mở hàng loạt URL lỗi, không sửa cấu hình source hoặc reset queue/ledger.',
 '', 'PHÁT HIỆN MỚI ĐÁNG CHÚ Ý',
 '- CNN Lite đọc được32 bài với full body và ngày đăng gốc; cả32 mang isAccessibleForFree=false. Đường HTTP đã tìm được, nhưng chưa đạt điều kiện quyền truy cập hiện hành để nhập.',
 '- Gialai: body API nói rõ không được phép, dù status503. Cập nhật kết luận từ lỗi backend sang API access denied; shortlink vẫn không bổ sung original clock.',
 '- BigGo: API danh sách vùng đọc được200, miền vùng của cùng publisher vẫn403; chưa có body đầy đủ.',
 '- CoinDesk: RSS không chứa body. Data API chính thức trả401; credential AI không cấp quyền CoinDesk Data API.',
 '- 2Saigon: system DNS, Cloudflare và Google đều không có bản ghi A/NS, loại trừ giả thuyết lỗi riêng DNS VPS.',
 '', 'KẾT LUẬN TỪNG NGUỒN']
for i,c in enumerate(cases,1):
 lines.extend([f"{i:02}. {c['site']}",f"    Đã thử/kết quả: {c['currentFinding']}",f"    Điều kiện mở nhập: {c['reopenWhen']}"])
lines.extend(['','NGÂN SÁCH VÀ BẰNG CHỨNG',
 'Chi phí AI API mới0USD, số lần gọi0; không dùng Astra. ai_usage không đổi. Giữ tổng QC15USD, trần dự án2USD/ngày UTC và daily call limit200 hiện hành.',
 'routes.json: từng URL thay thế và HTTP/result/evidence. followup.json: các bài CNN bổ sung, miền BigGo, JS first-party.',
 'final-check.json: publication proof CNN, gate ES,10 control document và các SHA runtime cuối. parser-tests-local.txt/parser-tests-vps.txt: kết quả kiểm thử.',
 'source-disposition.json: đủ25 hồ sơ có bằng chứng từng đường và điều kiện mở lại. Bằng chứng HTML gốc nén trên VPS và trong evidence.tar.gz.',
 'CoinDesk API docs: https://developers.coindesk.com/documentation/data-api/news_v1_article_list',
 'Không có dữ liệu gốc thiếu nào được AI viết bù; không tắt TLS, không thêm direct HTTP fallback hoặc nguồn fireant.vn.'])
(root/'QC-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'cohort':len(cases),'routes':len(routes['jobs']),'extraChecks':len(follow['checks']),'cnnArticles':report['discovery']['cnnArticleChecks'],'localTests':80,'vpsTests':35,'restored':0,'paidAiUsd':0}))
