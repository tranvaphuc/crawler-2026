import json,pathlib,sqlite3,collections,datetime,urllib.parse,zipfile
root=pathlib.Path('outputs/news-priority-sites-2026-11-16')
sites=json.loads((root/'candidates.json').read_text());manifest=json.loads((root/'activation-candidates.json').read_text());accepted={r['domain']:r for r in manifest['accepted']};rejected={r['domain']:r for r in manifest['rejected']}
registry=json.loads((root/'registry-domain-status.json').read_text());registry={r['domain']:r for r in registry}
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row;db.execute('PRAGMA busy_timeout=30000');now=datetime.datetime.now(datetime.timezone.utc);since=int((now-datetime.timedelta(hours=1)).timestamp()*1000)
counts=collections.defaultdict(dict)
for r in db.execute('select site,parse_status,count(*) n from article_links group by site,parse_status'):counts[r['site']][r['parse_status']]=r['n']
outbox=collections.defaultdict(dict)
for r in db.execute("select json_extract(doc,'$._source.siteName') site,state,count(*) n from outbox group by site,state"):outbox[r['site']][r['state']]=r['n']
receipts=collections.defaultdict(collections.Counter);recent=collections.Counter();last={};domains=sorted(set([s['domain'] for s in sites]+['offb.vn']),key=len,reverse=True)
host_cache={}
for r in db.execute('select url,status,imported_at from import_receipts'):
 h=r['url'].split('://',1)[-1].split('/',1)[0].split(':',1)[0].removeprefix('www.');
 if h not in host_cache:host_cache[h]=next((d for d in domains if h==d or h.endswith('.'+d)),None)
 site=host_cache[h]
 if not site:continue
 if site=='offb.vn':site='offb.com.vn'
 receipts[site][r['status']]+=1
 if r['imported_at']>=since:recent[site]+=1
 last[site]=max(last.get(site,0),r['imported_at'])
errors=collections.defaultdict(list)
for r in db.execute("select site,error,count(*) n from article_links where parse_status='fail' group by site,error order by n desc"):
 if len(errors[r['site']])<4:errors[r['site']].append({'reason':r['error'],'count':r['n']})
rows=[]
def strings(x):
 if isinstance(x,dict):
  for k,v in x.items():
   if k in ['error','code','reason'] and isinstance(v,str):yield v
   elif k in ['trials','errors','issues','reasons','regression','pages','articles']:yield from strings(v)
 elif isinstance(x,list):
  for v in x:yield from strings(v)
for source in sites:
 d=source['domain'];configured=d in registry;qualified=d in accepted;issues=list(dict.fromkeys(strings(rejected.get(d,{}))))
 latest=None
 for stage in ['camau/repair','manual/repair','round4/repair','round4/audit','round3/audit','round2/repair','round2/audit','repair','audit']:
  f=root/stage/d/'result.json'
  if f.exists():
   try:r=json.loads(f.read_text())
   except:continue
   if latest is None:latest={'stage':stage,'approved':bool(r.get('approved')),'checkedAt':r.get('checkedAt'),'errors':collections.Counter(strings(r)).most_common(6)}
   if not qualified and not issues and not r.get('approved'):issues=[k for k,v in collections.Counter(strings(r)).most_common(4)]
 if not qualified and not issues:issues=['Chưa đủ 3 nội dung khác nhau và 2 mẫu tải lại độc lập đạt điều kiện hiện tại']
 row={'domain':d,'configured':configured,'qualifiedCurrentGate':qualified,'qualificationStage':accepted.get(d,{}).get('stage'),'parserType':registry.get(d,{}).get('parserType'),'articleStatuses':counts.get(d,{}),'outbox':outbox.get(d,{}),'esReceipts':dict(receipts.get(d,{})),'esReceiptsLastHour':recent[d],'lastEsReceiptAt':datetime.datetime.fromtimestamp(last[d]/1000,datetime.timezone.utc).isoformat() if d in last else None,'currentIssues':issues,'topArticleErrors':errors.get(d,[]),'latestAudit':latest}
 if d=='offb.com.vn':row['nativePublisher']='offb.vn';row['nativePublisherArticleStatuses']=counts.get('offb.vn',{})
 if d=='msn.com':
  f=root/'msn/audit/msn.com/result.json'
  if f.exists():
   m=json.loads(f.read_text());row['dispatchValidation']=m.get('dispatchValidation');row['verifiedPublisherUrls']=[a.get('originalUrl') for a in m.get('articles',[]) if a.get('state')=='parsed']
  row['receiptNote']='MSN chuyển bài sang nhà xuất bản gốc; không đếm biên nhận nguồn gốc thành biên nhận msn.com'
 rows.append(row)
summary={'requestedSites':len(rows),'configured':sum(r['configured'] for r in rows),'qualifiedCurrentGate':sum(r['qualifiedCurrentGate'] for r in rows),'notQualifiedCurrentGate':sum(not r['qualifiedCurrentGate'] for r in rows),'withAnyEsReceipt':sum(bool(r['esReceipts']) for r in rows),'withEsReceiptLastHour':sum(r['esReceiptsLastHour']>0 for r in rows),'createdReceipts':sum(r['esReceipts'].get('created',0) for r in rows),'existingReceipts':sum(r['esReceipts'].get('existing',0) for r in rows)}
report={'capturedAt':now.isoformat(),'summary':summary,'datePolicy':{'originalFirst':True,'updatedWhenOriginalMissing':True,'missingHour':'00:00 Asia/Ho_Chi_Minh'},'notes':['Biên nhận ES gồm lịch sử đã có; không có nghĩa toàn bộ được ghi mới trong đợt này.','Đã cấu hình không đồng nghĩa tất cả bài của site đều qua kiểm tra hiện tại.','Luồng 2 done là đã đưa outbox; chỉ biên nhận created/existing xác nhận ES.','Nguồn thiếu chứng cứ hoặc lỗi kết nối được ghi rõ, không coi là thành công.'],'sites':rows}
(root/'site-report-final.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
lines=['BÁO CÁO KIỂM TRA 135 NGUỒN','Thời điểm UTC: '+report['capturedAt'],'Tổng hợp: '+json.dumps(summary,ensure_ascii=False),'Quy tắc: ưu tiên ngày đăng gốc; thiếu ngày đăng dùng ngày cập nhật; thiếu giờ 00:00 giờ Việt Nam.','Biên nhận ES gồm lịch sử, không phải số bài mới của riêng đợt này.','']
for r in rows:
 lines.extend([r['domain'],f"  Cấu hình: {'có' if r['configured'] else 'chưa'}; qua kiểm tra hiện tại: {'có' if r['qualifiedCurrentGate'] else 'chưa'}",'  Luồng 2: '+json.dumps(r['articleStatuses'],ensure_ascii=False),'  Biên nhận ES: '+json.dumps(r['esReceipts'],ensure_ascii=False)+f"; 60 phút gần nhất: {r['esReceiptsLastHour']}"])
 if r['currentIssues']:lines.append('  Vướng mắc: '+'; '.join(r['currentIssues']))
 if r.get('receiptNote'):lines.append('  '+r['receiptNote'])
 lines.append('')
(root/'site-report-final.txt').write_text('\n'.join(lines))
print(json.dumps({'capturedAt':report['capturedAt'],'summary':summary},ensure_ascii=False))
