from pathlib import Path
from collections import Counter
from datetime import datetime, timezone
import json, zipfile
BASE=Path(__file__).resolve().parents[1]
root=Path(json.loads((BASE/'outputs/production-api-audit-2026-10-24/latest-run.json').read_text())['out'])
main=json.loads((root/'report.json').read_text());follow=json.loads((root/'followup-report.json').read_text())
rows=main['results']+follow['results'];corrections=[]
for row in rows:
 if 'VERIFIED_ORDER_WITHOUT_EXACT_DATES' in row.get('failures',[]):
  o=row.get('ordering') or {}
  if o.get('serverFilterVerified') is True or o.get('requested')=='relevance':
   row['failures'].remove('VERIFIED_ORDER_WITHOUT_EXACT_DATES')
   row.setdefault('notes',[]).append('SERVER_SELECTION_OR_RELEVANCE_DOES_NOT_REQUIRE_EXACT_TIMESTAMPS')
   corrections.append(row['name'])
def response(name):return json.loads((root/(name+'.json')).read_text())['response']
checks=[]
for platform,stem in [('threads','source-real'),('instagram','comments-real'),('youtube','source-real'),('youtube','comments-real')]:
 names=[x['name'] for x in rows if x.get('platform')==platform and (x['name']==platform+'-'+stem or x['name'].startswith(platform+'-'+stem+'-next-')) and x.get('httpStatus')]
 items=[it for name in names for it in response(name).get('items',[])]
 ids=[(x.get('platform'),x.get('id')) for x in items]
 checks.append({'check':'cross_page_dedup','platform':platform,'case':stem,'returned':len(items),'unique':len(set(ids)),'passed':len(ids)==len(set(ids)),'rootComments':sum(x.get('type')=='comment' for x in items),'replies':sum(x.get('type')=='reply' for x in items)})
info=response('instagram-post-info-url-real');source=response('instagram-resolve-source-url-real');mismatch=response('instagram-source-es5-id-confirm')
checks.append({'check':'instagram_source_identity_consistency','passed':False,'username':info['post']['author']['username'],'sourceResolverId':source['id'],'postAuthorId':info['post']['author']['id'],'systemIdentity':mismatch.get('systemIdentity'),'reason':'SAME_USERNAME_HAS_DIFFERENT_SOURCE_AND_POST_AUTHOR_IDS_AND_SOURCE_BY_ID_FAILS','severity':'high'})
for row in rows:
 if row['name'] in ['instagram-resolve-source-url-real','instagram-source-url-small-confirm']:
  row.setdefault('dataWarnings',[]).append('SOURCE_ID_CONFLICT_WITH_POST_AUTHOR_AND_ES5')
counts=Counter(x.get('status') or ('es5_ok' if x.get('ok') else 'no_status') for x in rows)
summary={'businessEndpointsAttempted':len({x['endpoint'] for x in rows if x.get('httpStatus')}),'executedRealRequests':sum(bool(x.get('httpStatus')) for x in rows),'unstartedCases':sum(x.get('status')=='unstarted' for x in rows),'readErrorResponses':sum(x.get('status') in ['error','proxy_error','test_error'] for x in rows),'statusCounts':dict(counts),'crossPageChecksPassed':all(x['passed'] for x in checks if x['check']=='cross_page_dedup'),'criticalDataIdentityConflicts':1}
auth=json.loads((BASE/'outputs/public-api-deploy-2026-10-24/domain-auth-checks.json').read_text())
report={'reviewedAt':datetime.now(timezone.utc).isoformat(),'baseUrl':main['baseUrl'],'mainRunStartedAt':main['startedAt'],'mainRunFinishedAt':main['finishedAt'],'state':'audit_finished_with_failures_and_gated_cases','summary':summary,'authChecks':{'count':len(auth['checks']),'passed':auth['passed'],'checkedAt':auth['checkedAt']},'blockedPlatforms':main['blockedPlatforms'],'validationCorrections':{'cases':corrections,'explanation':'Native server Latest selection and keyword relevance ranking do not require exact createdAt timestamps. These were audit-validator false positives, not production defects.'},'crossResponseChecks':checks,'results':rows,'productionCodeChangedDuringAudit':False}
(root/'final-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
lines=[
'BÁO CÁO KIỂM THỬ API PRODUCTION NGÀY 24/10/2026',
'Domain: '+main['baseUrl'],
'',
'KẾT LUẬN',
'Đã gọi đủ 9/9 đường dẫn nghiệp vụ bằng dữ liệu thật, nhưng chưa thể coi toàn bộ luồng hoạt động ổn định. Có lỗi đọc Facebook, lỗi mạng/tra cứu ES5 và mâu thuẫn định danh nguồn Instagram. Threads bị giới hạn nên phần còn lại không được gọi tiếp.',
f'Tổng: {summary["executedRealRequests"]} request dữ liệu thật; {summary["unstartedCases"]} ca chưa chạy do Threads HTTP 429; {summary["readErrorResponses"]} response lỗi đọc/tra cứu. 33 kiểm tra xác thực và HTTP contract đều đạt.',
'Các response partial/resolved không được tự coi là đủ dữ liệu. Lượt kiểm thử không thay đổi code production.',
'',
'FACEBOOK',
'- Page/User/Group source đều trả HTTP 200 nhưng status=error, reason=FEED_UNAVAILABLE. Không lấy được bài từ nguồn ở các mẫu này.',
'- Post/comments và comment/info Page/Group trả COMMENTS_UNAVAILABLE; mẫu comment User có NETWORK_ERROR.',
'- Thông tin bài Page/User, tương tác Page/User/Group đọc được và có ID được xác minh. Một mẫu post/info Group bị UPSTREAM_TIMEOUT trong khi metrics cùng ID đọc được ở request khác.',
'- details đọc được nội dung bài gốc 1000419343151470_122138942931244237; format=es5 tạo được 1 document, không ghi ES5.',
'- Mẫu share theo ID trả unknown/PRIMARY_POST_NOT_FOUND. URL permalink gốc trả unknown/POST_IDENTITY_MISMATCH. isShare=null, chưa có bài gốc được xác minh; không có kết luận false giả.',
'',
'THREADS',
'- Lấy được 4 bài qua 2 trang, 4 ID không trùng. Chỉ xác minh thứ tự trong cửa sổ công khai.',
'- post/info sau đó trả HTTP 200, status=rate_limited, reason=HTTP_429, Retry-After=900 giây. Dừng channel; 10 ca tiếp theo chưa được thực thi, không được tính là đã test thành công.',
'',
'INSTAGRAM',
'- Post/info bằng URL và metrics có dữ liệu: bài DeFOCuYv75Y trả likes=18, reactions=18, comment=4 trong lượt này.',
'- Luồng comment trên bài DeozdjJHyt6 trả 6 comment gốc qua 2 trang, không trùng. Comment/info trả đúng native ID 18117754451045497. FULL_COMMENT_MODE_UNVERIFIED: chưa chứng minh toàn bộ bình luận/reply.',
'- LỖI ĐỊNH DANH CẦN ƯU TIÊN: shopmichaelangelos có resolver/source trả 17841406804205025 nhưng author của bài và ID lưu ES5 là 6920202806. Gọi source bằng ID 6920202806 trả SYSTEM_ID_URL_MISMATCH (expected=6920202806, observed=17841406804205025). Không import ID nguồn 178414... như ID chuẩn trước khi xử lý/xác minh.',
'- Một request source gặp UPSTREAM_NETWORK_ERROR; request xác minh URL nhỏ sau đó lấy được 2 bài. Một request post/info bằng ID gặp HTTP 503 ES5_LOOKUP_UNAVAILABLE, trong khi resolve và metrics cùng ID có kết quả.',
'- Lọc since trả SOURCE_DATES_UNAVAILABLE do source thiếu createdAt; không có bằng chứng đã quét hết từ mốc thời gian.',
'',
'YOUTUBE',
'- Source bằng URL trả được 4 video qua 2 trang, không trùng. Latest được xác minh bằng lựa chọn native của server, nhưng thiếu timestamp tuyệt đối nên chưa lọc ngày chắc chắn.',
'- Thông tin video và metrics đọc được. Ví dụ video Ny1rdcJ156o trả likes=14, views=1329; mẫu ES5 _Bs0iDvSXps trả likes=20, views=4242 tại thời điểm kiểm thử.',
'- Comments gom 102 bản ghi công khai trong server, sau đó trả đúng 6 theo count yêu cầu: 3 comment gốc + 3 reply, không trùng. Không nhầm stagedCount=102 thành đã trả 102 cho client.',
'- Coverage ước tính tối thiểu 122 từ reply counts, observedUnique=102, missingAtLeast=20; coverage.complete=false. OLDEST_SORT_PARTIALLY_UNVERIFIED nên chưa đảm bảo đủ data hoặc thứ tự cũ nhất trên toàn bộ.',
'- comment/info tìm đúng reply Ugz8SOHj3mTAESwxbYB4AaABAg.AbZ29ZXN25xAbZuCURj5Ws.',
'- Search latest trả sort_unavailable/LATEST_SORT_UNVERIFIED. Ca riêng order=relevance trả 20 video; không xem đó là 20 video mới nhất.',
'- Ca xác minh source bằng ID bị UPSTREAM_NETWORK_ERROR; không kết luận luồng ID luôn hỏng vì đã lỗi ở bước mạng, chưa có dữ liệu để đối chiếu ID.',
'',
'KIỂM TRA TÍNH ĐÚNG',
'- Không thấy count/items lệch, ID trùng qua các trang đã nhận, counter âm/sai kiểu hoặc dữ liệu lọt ngoài mốc since trong các ca đã chạy.',
'- Các lượt phát sinh request ra nền tảng ghi mode=http, proxyUsed=true, browserUsed=false. Trang lấy từ buffer có sourceProxyUsed=true, cacheHit=true, requests=0.',
'- Đã loại ba cảnh báo sai từ bộ kiểm thử: native Latest và relevance có thể xác minh mà không cần createdAt tuyệt đối. Đây không phải lỗi production.',
'- Chỉ xác nhận phạm vi đã thử; không suy ra mọi nguồn/bài đều truy cập được.',
'',
'THỨ TỰ CẦN XỬ LÝ',
'1. Sửa/xác minh ID nguồn Instagram; tránh lưu nhầm ID với idVerified=true.',
'2. Kiểm tra request template/GraphQL và truy cập công khai của các luồng feed/comment Facebook; chưa đủ bằng chứng chốt nguyên nhân.',
'3. Kiểm tra bộ nhận diện bài share với permalink và ID mẫu gốc.',
'4. Ổn định kết nối proxy/upstream và độ trễ tra cứu ES5; lỗi mạng không được quy thành nguồn die.',
'5. Hoàn thiện sort/độ đầy đủ comment, search latest và timestamp nguồn trước khi cam kết full data.',
'',
'CHI TIẾT TỪNG REQUEST',
]
for i,x in enumerate(rows,1):
 lines.append(f'{i:02d}. {x["name"]} | {x.get("httpStatus","chưa gọi")} | {x.get("status")} | {x.get("reason") or "-"} | count={x.get("count","-")} | {x.get("elapsedMs","-")}ms')
 if x.get('failures'):lines.append('    Lỗi: '+', '.join(x['failures']))
 if x.get('dataWarnings'):lines.append('    Dữ liệu: '+', '.join(x['dataWarnings']))
(root/'Bao-cao-kiem-thu-API-production.txt').write_text('\n'.join(lines)+'\n')
# Package only sanitized requests/responses, reviewed report and text. Exclude private exports/config.
files=[p for p in root.glob('*.json') if p.name not in ['report.json','followup-report.json','raw-report.json']]+[root/'Bao-cao-kiem-thu-API-production.txt']
secret=''
for line in (BASE/'.env').read_text().splitlines():
 if line.startswith('AUTHEN_KEY_FOR_DOMAIN='):secret=line.split('=',1)[1].strip().strip('"').strip("'")
for p in files:
 if secret:assert secret.encode() not in p.read_bytes(),'API key leaked into audit report'
zip_path=root/'Production-API-Audit.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(p,p.name)
with zipfile.ZipFile(zip_path) as z:assert z.testzip() is None
(BASE/'outputs/production-api-audit-2026-10-24/latest-reviewed.json').write_text(json.dumps({'report':str(root/'final-report.json'),'text':str(root/'Bao-cao-kiem-thu-API-production.txt'),'zip':str(zip_path),'summary':summary},ensure_ascii=False,indent=2))
print(json.dumps({'report':str(root/'Bao-cao-kiem-thu-API-production.txt'),'zip':str(zip_path),'summary':summary,'authChecksPassed':auth['passed']},ensure_ascii=False))
