import json,csv,re,unicodedata,collections
from pathlib import Path
from urllib.parse import quote
r=Path('outputs/project-refresh-2026-11-10');d=r/'completion'
def load(n):return json.loads((r/n).read_text(encoding='utf8'))
def tsv(n):return list(csv.DictReader((d/n).open(encoding='utf8'),delimiter='\t'))
def norm(s):
 text=unicodedata.normalize('NFKD',str(s)).casefold().replace('đ','d')
 return re.sub(r'[^\w]+','',''.join(c for c in text if not unicodedata.combining(c)))
def ids(s):return set(re.findall(r'[a-f0-9]{24}',s or '',re.I))
def save(n,x):(d/n).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
evidence=[]
for f,platform in [('browser-accepted.tsv','YouTube'),('browser-accepted-continuation.tsv','YouTube'),('browser-facebook-final.tsv','Facebook')]:
 for x in tsv(f):evidence.append({'query':x['query'],'platform':platform,'outcome':'ACCEPTED','evidence':x['headline'],'url':('https://www.youtube.com/results?search_query=' if platform=='YouTube' else 'https://www.facebook.com/search/posts/?q=')+quote(x['query']),'checkedDate':'10–11/11/2026'})
for x in load('completion/browser-other-platforms.json'):
 evidence.append({'query':x['query'],'platform':x['platform'],'outcome':'ACCEPTED','evidence':x['headline'],'url':x['url'],'checkedDate':'10–11/11/2026'})
for x in load('search-evidence.json'):
 if x['outcome'].startswith('Có data đúng chủ thể') or x['query'] in ['siêu thị GO','Be Group'] and 'Có data đúng' in x['outcome']:
  evidence.append({**x,'outcome':'ACCEPTED','checkedDate':'10–11/11/2026'})
for x in load('completion/batch-accepted-observations.json'):
 evidence.append({'query':x['q'],'platform':'YouTube','outcome':'ACCEPTED','evidence':' | '.join(x['t']),'url':'https://www.youtube.com/results?search_query='+quote(x['q']),'checkedDate':'11/11/2026'})
unique={}
for e in evidence:unique[(norm(e['query']),e['platform'])]=e
evidence=list(unique.values());ev=collections.defaultdict(list)
for x in evidence:ev[norm(x['query'])].append(x)
replacements={norm(x['original']):x['query'] for x in tsv('keyword-replacements.tsv')}
subject_alias={norm(x['subject']):x['query'] for x in tsv('additional-topic-queries.tsv')}
subject_alias.update({norm(x['subject']):x['query'] for x in tsv('subject-aliases.tsv')})
excluded={norm(x['query']):x['reason'] for x in tsv('keyword-exclusion-decisions.tsv')}
projects=load('projects-current.json');primary=load('keywords-priority.json');subjects=load('subjects-leveled.json')
by_name=collections.defaultdict(list)
for p in projects:by_name[norm(p['project'])].append(p)
def current(name):
 candidates=by_name.get(norm(name),[])
 return next((p for p in candidates if p['status']!='stop'),candidates[0] if candidates else {'project':name,'projectIds':'','status':'ngoài danh sách hiện tại','url':''})
def clean_subject(s):
 s=s.strip().rstrip('.,/ ')
 s=re.sub(r'^Thương hiệu\s+','',s,flags=re.I)
 s=re.sub(r'\s+(?:MS|2023|2026)\s*[,;]?$', '',s,flags=re.I)
 for prefix in ['NAB - ','CapitaLand - ','An Cường - ','SPX - ']:
  if s.casefold().startswith(prefix.casefold()):s=s[len(prefix):]
 s=re.sub(r'\s+-\s+(?:SHB|PNJ|Đối thủ Monte)$','',s,flags=re.I)
 return s.strip(' ;,.')
def resolve_query(text):
 for s in [text,clean_subject(text)]:
  candidates=[subject_alias.get(norm(s)),replacements.get(norm(s)),s]
  for q in candidates:
   if q and norm(q) in ev:return ev[norm(q)][0]['query']
 return None
final={};rejected=[];topic_decisions=[]
def add(project,subject,query,level,proof,plan='',origin='',original=None,topicId=''):
 assert level in (1,2)
 if norm(query) not in ev:raise ValueError('UNVERIFIED '+query)
 if project.startswith('ACBS') and 'miraeasset' in norm(query):query='chứng khoán Mirae Asset'
 p=current(project);e=ev[norm(query)];q=e[0]['query'];key=(norm(project),norm(q),level)
 if key not in final:final[key]={'project':project,'projectIds':p['projectIds'],'projectStatus':p['status'],'subject':subject,'level':level,'role':'Main' if level==1 else 'Competitor','query':q,'originalKeywords':[],'rawSubjects':[],'roleEvidence':[],'plans':[],'origins':[],'topicIds':[],'platforms':list(dict.fromkeys(x['platform'] for x in e)),'searchEvidence':[x['platform']+': '+x['evidence'] for x in e],'searchUrls':[x['url'] for x in e],'checkedDate':'10–11/11/2026'}
 row=final[key]
 for name,values in [('originalKeywords',original or []),('rawSubjects',[subject]),('roleEvidence',[proof]),('plans',[plan]),('origins',[origin]),('topicIds',[topicId])]:
  for v in values:
   if v and v not in row[name]:row[name].append(v)
 return row
for k in primary:
 q=resolve_query(replacements.get(norm(k['query']),k['query']))
 if q:
  add(k['project'],k['subject'],q,k['level'],k['roleEvidence'],k['planUrl'],k['sheet']+'!'+','.join(k['cells']),k['originalKeywords'])
 else:rejected.append({'project':k['project'],'subject':k['subject'],'query':k['query'],'level':k['level'],'decision':'EXCLUDED','reason':excluded.get(norm(k['query']),'Chưa có kết quả search xác nhận đúng chủ thể. Không đưa vào list đã chốt.'),'planUrl':k['planUrl'],'origin':k['sheet']+'!'+','.join(k['cells'])})
# Project IDs, rather than old project labels, determine which current project owns a topic.
latest={}
for t in subjects:
 matches=[p for p in projects if ids(t.get('projectIds','')) & ids(p['projectIds'])]
 if not matches:matches=by_name.get(norm(t['project']),[])
 for p in matches:
  key=(norm(p['project']),norm(t['subject']))
  score=2 if 'Tháng 726' in t['evidence'] else 1
  if key not in latest or score>latest[key][0]:latest[key]=(score,p,t)
for _,p,t in latest.values():
 subject=t['subject'];level=t['level'];q=resolve_query(subject)
 if p['project']=='BIDV' and norm(subject)=='bidv':level=1;t={**t,'evidence':t['evidence']+'; sửa nhãn competitor mâu thuẫn với chủ thể main BIDV trong plan dự án'}
 if ' - Đối thủ ' in subject:
  # X - Đối thủ Y means X is the competitor tracked against Y.
  entity=subject.split(' - Đối thủ ',1)[0]
  q=resolve_query(entity)
  level=2
 if p['project']=='Bệnh Viện Quốc Tế Mỹ' and q and norm(q)==norm('Bệnh viện Quốc tế Mỹ AIH'):level=1;t={**t,'evidence':t['evidence']+'; AIH là chủ thể main của dự án Bệnh Viện Quốc Tế Mỹ theo plan'}
 if q and level in (1,2):
  add(p['project'],subject,q,level,t['evidence']+(' (chủ thể đứng trước nhãn Đối thủ là competitor)' if level!=t['level'] else ''),t.get('planUrl',''),'Roster dòng '+str(t['row']),[subject],t.get('topicId',''))
  topic_decisions.append({'project':p['project'],'subject':subject,'topicId':t.get('topicId',''),'level':level,'decision':'ACCEPTED','query':q,'evidence':t['evidence']})
 else:
  reason='Tên nhóm phân tích hoặc mã topic không phải một chủ thể search riêng.' if re.fullmatch(r'[a-f0-9]{24}',subject,re.I) or 'Competitors' in subject or subject in ['Ban Lãnh Đạo Mới','Các case mất tiền'] else 'Chưa có query đã search ra đúng chủ thể cụ thể; loại khỏi list search.'
  topic_decisions.append({'project':p['project'],'subject':subject,'topicId':t.get('topicId',''),'level':level,'decision':'EXCLUDED','query':'','evidence':t['evidence'],'reason':reason})
for x in tsv('project-main-queries.tsv'):
 p=current(x['project']);q=resolve_query(x['query'])
 if q:add(x['project'],x['subject'],q,1,x['evidence']+'; danh sách dự án dòng '+str(p.get('row','')),p['url'],'Main của dự án')
cosmetics=[('M.O.I Cosmetics','M.O.I Cosmetics'),('Lemonade','Lemonade Cosmetics'),('Ofélia','Ofelia Cosmetics'),('Vacosi','mỹ phẩm Vacosi'),('Black Rouge','son Black Rouge'),('Romand','son Romand'),('3CE','son 3CE'),('Merzy','son Merzy'),('BBIA','son Bbia'),('Peripera','son Peripera'),('CLIO','cushion Clio'),('Laneige','Laneige'),('Judydoll','Judydoll'),('Into You','son Into You'),('Colorkey','son Colorkey'),('Maybelline','Maybelline'),("L’Oréal Paris",'L’Oreal Paris'),('MAC Cosmetics','MAC Cosmetics'),('YSL Beauty','YSL Beauty'),('Dior Beauty','Dior Beauty'),('La Roche-Posay','La Roche Posay'),('CeraVe','CeraVe'),('Bioderma','Bioderma'),('SVR','mỹ phẩm SVR'),('Cocoon','mỹ phẩm Cocoon'),('Some By Mi','Some By Mi'),('Skin1004','Skin1004'),('Anessa','Anessa'),('Cetaphil','Cetaphil'),('Simple','sữa rửa mặt Simple')]
for subject,q in cosmetics:
 if resolve_query(q):add('Ngành Mỹ Phẩm',subject,resolve_query(q),1,'Quy ước cho dự án theo dõi toàn ngành: các nhãn trong phạm vi là chủ thể chính (Level 1). Plan không chỉ định một brand mốc hoặc một danh sách competitor; không suy đoán brand mốc từ thứ tự keyword.',current('Ngành Mỹ Phẩm')['url'],'Sheet Keyword; nhãn hàng và alias cùng nhóm',[subject])
ci=[('Sony camera','Sony 相機',1),('Xperia','Xperia 手機',1),('Sony 1000XM6','Sony 1000XM6',1),('Canon camera','Canon 相機',2),('Fujifilm camera','Fujifilm 相機',2),('Nikon camera','Nikon 相機',2),('Huawei smartphone','Huawei 手機',2)]
for subject,q,level in ci:
 if resolve_query(q):add('Tocanan - CI Project - Gửi Data Qua API',subject,resolve_query(q),level,'Plan Project CI - 7 Keywords (01/05/2026–31/03/2027), C10 chỉ định Main brand: Sony; Sony/Xperia/tai nghe Sony cùng nhóm main, các nhãn hãng khác là competitor.',current('Tocanan - CI Project - Gửi Data Qua API')['url'],'C10 và bảng Main/Product/Model, cập nhật 04/11/2026',[subject])
# Unilever brands are checked against the company's official Vietnam/global brand catalog, not the main/sub keyword header.
unilever_owned=[('Sunsilk','dầu gội Sunsilk'),('Clear Men','dầu gội Clear Men'),('TRESemmé','dầu gội TRESemmé'),('Lifebuoy','Lifebuoy Việt Nam'),('Hazeline','Hazeline'),('Vaseline','Vaseline Việt Nam'),('Rexona','Rexona Việt Nam'),('OMO','bột giặt OMO'),('Surf','bột giặt Surf'),('Comfort','nước xả Comfort'),('Sunlight','Nước rửa chén Sunlight'),('Vim','Vim Việt Nam'),('Knorr','Knorr Việt Nam')]
unilever_competitors=[('Head & Shoulders','dầu gội Head Shoulders'),('Pantene','dầu gội Pantene'),('Colgate','Colgate Việt Nam'),('Sensodyne','Sensodyne Việt Nam'),('Palmolive','Palmolive Việt Nam'),('Nivea','Nivea Việt Nam'),('Garnier','Garnier Việt Nam'),('Thái Dương','dầu gội Thái Dương'),('Downy','downy'),('Ariel','Bột giặt Ariel'),('Tide','bột giặt Tide'),('Aba','bột giặt Aba'),('Attack','bột giặt Attack'),('Lix','bột giặt Lix'),('NET','bột giặt NET'),('Mỹ Hảo','nước rửa chén Mỹ Hảo'),('Gift','nước lau sàn Gift'),('Chin-su','nước mắm Chin-su'),('Nam Ngư','nước mắm Nam Ngư'),('Aji-ngon','Hạt nêm Ajingon'),('Ajinomoto','bột ngọt Ajinomoto'),('Maggi','hatnemmaggi'),('Barona','Các loại sốt khác Barona'),('Cholimex','Các loại sốt khác Cholimex'),('Vedan','Hạt nêm Vedan')]
for level,items in [(1,unilever_owned),(2,unilever_competitors)]:
 for subject,q in items:
  if resolve_query(q):add('Unilever_Pitch',subject,resolve_query(q),level,'Đối chiếu nhãn Unilever https://www.unilever.com.vn/brands/ và https://www.unilever.com/brands/; '+('nhãn trong nhóm Unilever' if level==1 else 'nhãn khác cùng ngành được liệt kê trong plan (suy luận vai trò cạnh tranh)'),current('Unilever_Pitch')['url'],'Plan Unilever Personal Care / Home Care / Knorr',[subject])
rows=sorted(final.values(),key=lambda x:(x['projectStatus']=='stop',norm(x['project']),x['level'],norm(x['subject'])))
assert all(x['level'] in (1,2) and norm(x['query']) in ev and x['platforms'] and x['roleEvidence'] for x in rows)
save('keywords-final.json',rows);save('search-evidence-final.json',evidence);save('keywords-excluded-final.json',rejected);save('topic-decisions-final.json',topic_decisions)
# Record the disposition of every earlier candidate. They are aliases, not additional unverified search tasks.
lookup=collections.defaultdict(list)
for x in rows:
 for subject in x['rawSubjects']:lookup[(norm(x['project']),norm(subject))].append(x)
aliases=[]
for x in load('keywords-search.json'):
 candidates=lookup.get((norm(x['project']),norm(x['subject'])),[])
 candidates=[v for v in candidates if v['level']==x['level']]
 aliases.append({'project':x['project'],'subject':x['subject'],'level':x['level'],'originalKeywords':x['originalKeywords'],'previousCandidate':x['query'],'decision':'FOLDED_TO_VERIFIED_QUERY' if candidates else 'EXCLUDED_NO_VERIFIED_SUBJECT_QUERY','finalQueries':list(dict.fromkeys(v['query'] for v in candidates)),'planUrl':x['planUrl'],'origin':x['sheet']+'!'+','.join(x['cells'])})
save('keyword-alias-dispositions.json',aliases)
overview=[]
for p in projects:
 rr=[x for x in rows if norm(x['project'])==norm(p['project'])];ee=[x for x in rejected if norm(x['project'])==norm(p['project'])]
 overview.append({**p,'finalQueries':len(rr),'level1':sum(x['level']==1 for x in rr),'level2':sum(x['level']==2 for x in rr),'excludedPrimary':len(ee),'state':'Có list đã search và chốt' if rr else 'Không có query đủ căn cứ đưa vào list cuối'})
save('projects-final-summary.json',overview)
summary={'finalRows':len(rows),'uniqueQueries':len(set(norm(x['query']) for x in rows)),'level1':sum(x['level']==1 for x in rows),'level2':sum(x['level']==2 for x in rows),'projectsWithFinalQueries':len(set(norm(x['project']) for x in rows)),'verifiedQueryPlatformPairs':len(evidence),'excludedPrimary':len(rejected),'aliasCandidatesReviewed':len(aliases),'activeProjectsWithFinal':sum(x['status']!='stop' and x['finalQueries']>0 for x in overview),'activeProjects':sum(x['status']!='stop' for x in overview)}
save('keyword-final-summary.json',summary)
for name,data,cols in [('keyword-final.csv',rows,['project','subject','level','role','query','platforms','originalKeywords','roleEvidence','searchEvidence','searchUrls','projectStatus','plans','origins']),('keyword-excluded-final.csv',rejected,['project','subject','level','query','decision','reason','planUrl','origin']),('source-audit-final.csv',load('completion/sources-final-audit.json'),['sourceId','canonicalId','platform','name','url','projects','decision','eligible','nativeId','note','evidence'])]:
 with (d/name).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=cols,extrasaction='ignore');w.writeheader();w.writerows({k:' | '.join(map(str,v)) if isinstance(v,list) else v for k,v in row.items()} for row in data)
print(json.dumps(summary));print('ACTIVE_WITHOUT_LIST',[(x['project'],x['url']) for x in overview if x['status']!='stop' and not x['finalQueries']]);print('UNMATCHED_ACTIVE_TOPICS',[(x['project'],x['subject']) for x in topic_decisions if current(x['project'])['status']!='stop' and x['decision']=='EXCLUDED'])
