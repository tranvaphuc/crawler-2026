import json,re,unicodedata,collections,hashlib,csv
from pathlib import Path
root=Path('outputs/project-refresh-2026-11-10')
def read(n):return json.loads((root/n).read_text(encoding='utf-8'))
def dump(n,v):(root/n).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def norm(s):return re.sub(r'[^\w]+',' ',''.join(c for c in unicodedata.normalize('NFD',str(s).lower().replace('đ','d')) if unicodedata.category(c)!='Mn')).strip()
def compact(s):return re.sub(r'\W','',norm(s))
def colnum(s):
 n=0
 for c in s:n=n*26+ord(c)-64
 return n
raw=read('keyword-cells-original.json');topics=read('topics-original.json');projects=read('projects-current.json');cache=read('keyword-sheets-cache.json');inventory=read('keyword-sheet-inventory.json')
sheetmap={(r['documentId'],r['sheet']['name']):r['sheet'] for r in cache}
meta={(r['documentId'],r['sheet']):r for r in inventory}
subjectrows=[];seen=set()
for t in topics:
 k=(t['projectIds'],t['topicId'],t['subject'],t['role'])
 if k in seen:continue
 seen.add(k);subjectrows.append({**t,'level':1 if t['role']=='Mainbrand' else 2,'evidence':('Danh sách '+t.get('sourceSheet','Sheet1')+', dòng '+str(t['row']))})
byproject=collections.defaultdict(list)
for p in projects:
 ids=set(re.findall(r'[a-f0-9]{24}',p['projectIds']))
 byproject[p['project']]=[t for t in subjectrows if t['projectIds'] in ids or norm(t['project'])==norm(p['project'])]
# Recover keyword matrices whose headings are brand names rather than Main/Sub.
extra=[];covered={(r['project'],r['documentId'],r['sheet'],r['cell']) for r in raw}
docs={d['id']:d for d in read('plans-manifest.json')}
for item in cache:
 sh=item['sheet'];sn=norm(sh['name']);doc=docs[item['documentId']]
 if re.search(r'spam|tag|label|sentiment|key projects|campaign keyword|phan loai',sn):continue
 rows={int(k):v for k,v in sh['rows'].items()};md=meta[(item['documentId'],sh['name'])]
 headers=md['headers'];first=min([r[0] for r in headers] or [999999])
 # Recover only actual keyword columns, never explanatory/project-info sheets.
 if not re.search(r'keyword|tu khoa|\bkws?\b',sn):continue
 for no,row in rows.items():
  if no<2 or no>=first:continue
  for col,cell in row.items():
   v=cell['text'].strip()
   if not v or len(v)>350 or re.fullmatch(r'[\d.]+',v) or 'http' in v:continue
   prev=next((rows[rn][col]['text'].strip() for rn in range(no-1,max(0,no-5),-1) if col in rows.get(rn,{}) and rows[rn][col]['text'].strip()),'')
   # Plain STT + brand columns, or a headerless one-column keyword list.
   left=next((x['text'] for c,x in row.items() if colnum(c)==colnum(col)-1),'')
   numeric_left=bool(re.fullmatch(r'[\d.]+',left))
   eligible=(numeric_left and no>=3) or (not headers and len(row)==1 and no>=2)
   if not eligible:continue
   if re.search(r'^(keyword|main|sub|stt|no |chu de|note|brand|hashtag|link|danh sach|doi thu)',norm(v)):continue
   for p in doc['projects']:
    key=(p['project'],item['documentId'],sh['name'],f'{col}{no}')
    if key in covered:continue
    covered.add(key)
    extra.append(dict(project=p['project'],projectIds=p['projectIds'],projectStatus=p['status'],subject='',roleOriginal='',kind='main',value=v,mainContext=v,subContext='',group=col,block=0,documentId=doc['id'],planUrl=doc['url'],sheet=sh['name'],cell=f'{col}{no}',row=no,rowContext=' | '.join(f'{c}: {x["text"]}' for c,x in row.items()),sheetState=sh['state'],recovery='HEADERLESS_MATRIX'))
raw+=extra
stop={'sources','source','main','sub','loai','labels','label','client','brand','keywords','keyword','food','retail','feed','farm','corp sustainability','stt','type','topic','chu the','nguon','link','paid','owned','private','public','topic name','sub brand','thuong hieu','doi thu','note','n a','none','null','scope of work','project information','keyword list','fanpage','website','facebook','youtube','tiktok','threads','instagram'}
generic={'ban','mua','xa lo','co san','xa kho','sale','shop','combo','gia','vang','trang suc','thiet ke','tuyen dung','leadership','benefit','technology innovation','great place to work','san pham','dich vu','ngan hang','bao hiem','benh vien','ban lanh dao','nhan cuoi','kim cuong roi','vang mieng','16 cho','xe tai nho','xe 16 cho'}
rewrite={'gaz':'xe Gaz','nab':'NAB Vietnam','be':'ứng dụng Be','now':'ShopeeFood Now','go':'siêu thị GO','go viet nam':'siêu thị GO Việt Nam','cake':'ngân hàng số Cake','mb':'ngân hàng MB','cp':'thực phẩm CP','c p':'thực phẩm C.P','315':'y tế 315','msb':'ngân hàng MSB','bid':'ngân hàng BIDV','tcb':'ngân hàng Techcombank','tpb':'ngân hàng TPBank','ctg':'ngân hàng VietinBank','vcb':'ngân hàng Vietcombank','vpb':'ngân hàng VPBank','vib':'ngân hàng VIB','acb':'ngân hàng ACB','agr':'ngân hàng Agribank','ai h':'bệnh viện AIH','aih':'bệnh viện AIH'}
rewrite.update({'be':'Be Group','define':'dự án DEFINE CapitaLand','visa':'thẻ Visa','jcb':'thẻ JCB','kubo':'siêu thị Kubo','robins':'trung tâm mua sắm Robins','robin':'trung tâm mua sắm Robins','come home':'nội thất Come Home','metro':'siêu thị Metro','mega':'siêu thị Mega Market','mm':'MM Mega Market','axon':'Axon Vietnam','bos ch':'Bosch Vietnam'})
rewrite.update({'monte':'váng sữa Monte','milk tiger':'sữa Milk Tiger','msn':'Masan MSN','mwg':'Thế Giới Di Động MWG','mikado':'gạch Mikado','sharp':'Sharp Việt Nam','man moi':'nhà hàng Mặn Mòi'})
def split(v):
 # Keep Boolean/field queries intact for a separate review; do not strip exclusions.
 if re.search(r'\b(?:AND|OR|NOT)\b|siteName:|siteId:|content:|title:|description:|\+\s*["\w]|-\s*\(',v):return [v],True
 if '"' in v or '“' in v:
  quoted=re.findall(r'["“]([^"”]+)["”]',v)
  residual=re.sub(r'["“][^"”]+["”]','',v)
  parts=quoted+[p for p in re.split(r'[,;\n]+',residual) if p.strip(' ,;')]
 else:parts=re.split(r'[,;\n]+',v)
 return [re.sub(r'\s+',' ',p).strip(' \t"“”•–') for p in parts if p.strip(' \t"“”•–')],False
def column_subject(r):
 sh=sheetmap.get((r['documentId'],r['sheet']));md=meta.get((r['documentId'],r['sheet']))
 if not sh or not md:return ''
 rows={int(k):v for k,v in sh['rows'].items()};hs=[x[0] for x in md['headers'] if x[0]<r['row']]
 cutoff=max(hs) if hs else min(r['row'],6)
 c=r.get('group') or re.sub(r'\d','',r['cell'])
 for rn in range(cutoff-1,max(0,cutoff-5),-1):
  val=rows.get(rn,{}).get(c,{}).get('text','').strip()
  if val and len(val)<90 and norm(val) not in stop and not re.search(r'keyword|tu khoa|^stt$|^no\.?$',norm(val)) and not re.fullmatch(r'[\d.]+',val):return val
 return ''
review=[];final={};excluded=[]
for r in raw:
 if r['kind']=='exclude':excluded.append(r);continue
 if r['kind']=='sub':continue # Context pool, not independent queries or a cross-product.
 sheetnorm=norm(r['sheet']);value=r['value'];parts,complex_query=split(value)
 if re.search(r'table of content|muc luc|sow|monitoring plan|mornitoring plan|scope of work|project info',sheetnorm):
  review.append({**r,'reason':'Ngoài vùng keyword; giữ dữ liệu gốc để đối chiếu, không đưa vào search'});continue
 if re.search(r'spam|sentiment|tagging|\btag\b|labels?|phan loai|keyword theo label|xu ly tin|rule tach',sheetnorm):
  review.append({**r,'reason':'Từ khóa phân loại/spam/cảm xúc, không dùng làm search độc lập'});continue
 if complex_query:
  review.append({**r,'reason':'Query Boolean/field hoặc phép ghép cần giữ nguyên logic trước khi chuyển cho từng nền tảng'});continue
 pool=byproject[r['project']];hint=r['subject'] or column_subject(r)
 for kw in parts:
  nk=norm(kw);ck=compact(kw)
  if nk in stop or re.fullmatch(r'[\d.]+',kw) or re.match(r'^https?://',kw) or re.search(r'^(nhom|topic|stt|doi thu)\s*\d+',nk):continue
  if len(kw)>140 or re.search(r'\b(siteid|sitename|content|title|description):',kw,re.I):
   review.append({**r,'term':kw,'reason':'Nội dung dài/cấu hình; không coi là keyword search'});continue
  matches=[]
  for t in pool:
   ct=compact(t['subject']);nh=norm(hint)
   if not ct:continue
   score=0
   if ck==ct:score=1200+len(ct)
   elif compact(hint)==ct:score=1000+len(ct)
   elif len(ct)>=4 and ct in ck:score=900+len(ct)
   elif len(compact(hint))>=4 and (compact(hint) in ct or ct in compact(hint)):score=500+min(len(ct),len(compact(hint)))
   elif len(ck)>=5 and ck in ct and nk not in generic:score=100+len(ck)
   if score:matches.append((score,t))
  matches.sort(key=lambda x:x[0],reverse=True)
  subject='';role='';level=None;ev=''
  if matches and (len(matches)==1 or matches[0][0]>matches[1][0] or (matches[0][1]['role'],matches[0][1]['subject'])==(matches[1][1]['role'],matches[1][1]['subject'])):
   t=matches[0][1];subject=t['subject'];role=t['role'];level=t['level'];ev=t['evidence']
  if not subject and (compact(r['project']) in ck or (len(ck)>=5 and ck==compact(r['project'].replace(' Bank','').replace(' App','')))):
   subject=r['project'];role='Mainbrand';level=1;ev='Tên dự án khớp keyword'
  if not subject and hint and compact(hint)==compact(r['project']):
   subject=r['project'];role='Mainbrand';level=1;ev='Chủ thể ghi trực tiếp trong plan khớp dự án'
  explicit_comp=bool(re.search(r'competitor|doi thu',sheetnorm)) or norm(r['roleOriginal'])=='competitor'
  explicit_main=bool(re.search(r'mainbrand|main brand',sheetnorm)) or norm(r['roleOriginal'])=='mainbrand'
  if not subject and r['project']=='NAB' and r['sheet']=='KWs':
   if r.get('group')=='A':subject='NAB';role='Mainbrand';level=1
   else:subject=hint if hint and 'rest of' not in norm(hint) else kw;role='Competitor';level=2
   ev='Bảng so sánh NAB và nhóm competitors trong KWs'
  if not subject and (explicit_comp or explicit_main) and (not pool or (explicit_main and not hint)):
   subject=hint if hint and norm(hint) not in stop and not re.search(r'rest of|danh sach|nhom',norm(hint)) else (kw if explicit_comp and nk not in generic and len(nk)>=4 else r['project'] if explicit_main else '')
   if subject:role='Competitor' if explicit_comp else 'Mainbrand';level=2 if explicit_comp else 1;ev='Nhãn vai trò trong sheet/plan'
  if not subject:
   review.append({**r,'term':kw,'reason':'Chưa nối chắc chắn với chủ thể/vai trò; giữ riêng, không gán level theo cột Main/Sub'});continue
  if explicit_comp and role=='Mainbrand':
   review.append({**r,'term':kw,'reason':'Mâu thuẫn Mainbrand ở danh sách topic và Competitor ở tên sheet'});continue
  anchor=subject
  # Topic labels can contain the client prefix, e.g. NAB - FPT Software.
  # That prefix identifies the project association, not part of the competitor name.
  anchor=re.sub(r'^'+re.escape(r['project'])+r'\s*[-_:]\s*','',anchor,flags=re.I).strip()
  anchor=re.sub(r'\s*[-–]\s*Đối thủ.*$','',anchor,flags=re.I).strip()
  anchor=re.sub(r'^[A-Z]{1,3}_','',anchor).replace('_',' ').strip(' .')
  anchor=re.sub(r'^Chiến dịch\s*["“]?','',anchor,flags=re.I).strip(' "“”')
  if norm(anchor) in generic:anchor=r['project']
  ambiguous=nk in rewrite or nk in generic or len(ck)<=3
  query=kw;action='Giữ nguyên';reason='Keyword chứa tên/chỉ dấu chủ thể'
  if nk in rewrite:
   query=rewrite[nk];action='Bổ nghĩa';reason='Từ ngắn/đa nghĩa; thêm ngữ cảnh chủ thể'
  elif r['kind']=='sub' and compact(anchor) not in ck:
   query=anchor+' '+kw;action='Ghép với chủ thể';reason='Subkey không search độc lập'
  elif ambiguous or (compact(anchor) not in ck and (len(ck)<5 or nk in generic)):
   query=anchor if compact(anchor)==ck else kw+' '+anchor;action='Ghép với chủ thể';reason='Tránh kết quả rộng hoặc sai chủ thể'
  elif compact(anchor) not in ck and r['kind']=='main':
   # Campaigns and aliases are kept, but anchored when their identity cannot be read directly.
   if len(ck)>=5 and ck in compact(anchor) and len(kw.split())>=2:
    query=kw;action='Giữ nguyên';reason='Tên thực thể cụ thể nằm trong nhãn chủ thể'
   else:
    query=anchor if ck in compact(anchor) else kw+' '+anchor;action='Ghép với chủ thể';reason='Alias/campaign chưa đủ định danh khi search riêng'
  query=re.sub(r'\s+',' ',query).strip()
  if len(query)>160:
   review.append({**r,'term':kw,'reason':'Query ghép quá dài; cần tách nghĩa thủ công'});continue
  key=(r['project'],subject,level,norm(query))
  if key in final:
   f=final[key]
   if r['cell'] not in f['cells']:f['cells'].append(r['cell'])
   if kw not in f['originalKeywords']:f['originalKeywords'].append(kw)
   continue
  final[key]=dict(project=r['project'],projectIds=r['projectIds'],subject=subject,role=role,level=level,kind=r['kind'],originalKeywords=[kw],query=query,action=action,reason=reason,roleEvidence=ev,validation='Rà ngữ nghĩa; chưa kiểm tra live từng query',planUrl=r['planUrl'],sheet=r['sheet'],cells=[r['cell']])
final=list(final.values())
dump('keyword-cells-separated.json',raw);dump('subjects-leveled.json',subjectrows);dump('keywords-search.json',final);dump('keywords-review.json',review);dump('keywords-excluded.json',excluded)
summary={'rawCells':len(raw),'recoveredCells':len(extra),'subjects':len(subjectrows),'searchQueries':len(final),'levels':dict(collections.Counter(r['level'] for r in final)),'actions':dict(collections.Counter(r['action'] for r in final)),'reviewRows':len(review),'excludeCells':len(excluded),'projectsWithSearchQueries':len(set(r['project'] for r in final))}
dump('keyword-summary.json',summary);print(json.dumps(summary,ensure_ascii=False))
with (root/'keywords-search.csv').open('w',encoding='utf-8-sig',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(final[0]) if final else []);writer.writeheader();writer.writerows(final)
