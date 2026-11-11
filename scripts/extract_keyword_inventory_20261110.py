import sys,json,re,unicodedata,collections
from pathlib import Path
from extract_project_sources import read_book
sys.stdout.reconfigure(encoding='utf-8')
root=Path('outputs/project-refresh-2026-11-10')
def norm(t):return re.sub(r'[-_]+',' ',''.join(c for c in unicodedata.normalize('NFD',str(t).lower().replace('đ','d')) if unicodedata.category(c)!='Mn')).strip()
def ci(c):
 n=0
 for x in c:n=n*26+ord(x)-64
 return n
def dump(name,obj): (root/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
manifest=json.loads((root/'plans-manifest.json').read_text(encoding='utf-8'))
cached=collections.defaultdict(list)
if (root/'keyword-sheets-cache.json').exists():
 for item in json.loads((root/'keyword-sheets-cache.json').read_text(encoding='utf-8')):
  sh=item['sheet'];sh['rows']={int(k):v for k,v in sh['rows'].items()};cached[item['documentId']].append(sh)
raw=[];sheets=[];candidates=[];cache=[]
for d in manifest:
 if d.get('status')!='DOWNLOADED':continue
 for s in (cached[d['id']] if cached else read_book(d['file'])):
  sn=norm(s['name']); headers=[]
  for no,row in s['rows'].items():
   hit={}
   for c,v in row.items():
    t=norm(v['text'])
    if len(t)>90:continue
    typ=''
    if re.search(r'^(main\s*(key|kw)|tu khoa chinh|mainkey)',t) or t in ('main','single keyword','kw auto','updated keywords'):typ='main'
    elif re.search(r'^(sub\s*(key|kw)|tu khoa phu|subkey)',t) or t in ('sub','combine keywords'):typ='sub'
    elif re.search(r'^(negative|spam|exclude|loai tru)',t):typ='exclude'
    elif re.fullmatch(r'(topic|chu the|brand|thuong hieu|subject|topic name|ten chu the|ten topic)',t):typ='subject'
    elif re.fullmatch(r'(keywords?|key words?|kws?|tu khoa|bo tu khoa|search keywords?)',t):typ='main'
    elif re.fullmatch(r'(type of topic|topic type|loai chu the|type|loai|main/competitor)',t):typ='role'
    elif re.fullmatch(r'(hashtags?|hashtag keywords?)',t):typ='hashtag'
    if typ:hit[c]=typ
   if any(x in ('main','sub') for x in hit.values()):headers.append((no,hit))
  relevant=bool(re.search(r'key|\bkw|tu khoa',sn)) or bool(headers)
  if not relevant:continue
  cache.append({'documentId':d['id'],'sheet':s})
  # Ignore analytical data sheets even if a keyword column appears in their report.
  report=bool(re.search(r'^data$|raw data|monthly query|paid link|seeding link|report|dashboard',sn))
  sheets.append(dict(documentId=d['id'],projects=[p['project'] for p in d['projects']],sheet=s['name'],rows=len(s['rows']),headers=headers,report=report,sample=[{'row':no,'values':{c:v['text'] for c,v in row.items()}} for no,row in list(s['rows'].items())[:8]]))
  if report:continue
  if not headers:
   # Headerless brand matrices: each column is a separately named subject.
   for rn,row in list(s['rows'].items())[:6]:
    vals={c:v['text'].strip() for c,v in row.items() if v['text'].strip()}
    if len(vals)>=2 and all(len(v)<65 and not re.search(r'\b(stt|note|date|keyword|scope|definition|dinh nghia)\b',norm(v)) for v in vals.values()):
     if sn in ('keywords','keywords competitors','keywords mainbrand','keywords competitors') or sn=='tu khoa':
      headers.append((rn,{c:'main' for c in vals}));break
  active=None; subject=''; role=''; main='';sub='';block=0;groups={};states={}
  hs={no:h for no,h in headers}
  for no,row in sorted(s['rows'].items()):
   vals={c:v['text'].strip() for c,v in row.items() if v['text'].strip()}
   if no in hs:
    incoming=hs[no]
    # A second header row such as STT/Keywords inherits the Main/Sub/Exclude
    # section immediately above it. Parallel brand columns remain independent.
    old=active or {}
    active={}
    for c,k in incoming.items():
     if k=='main' and norm(vals.get(c,'')) in ('keyword','keywords','tu khoa'):
      prior=[(ci(cc),kk) for cc,kk in old.items() if ci(cc)<=ci(c)]
      if prior:k=max(prior)[1]
     active[c]=k
    groups={}; current='';firstMain=next((c for c,k in active.items() if k=='main'),'')
    for c,k in sorted(active.items(),key=lambda x:ci(x[0])):
     if k=='main':current=c
     groups[c]=current or firstMain
    subject='';role='';main='';sub='';states={};block+=1;continue
   context=' | '.join(f'{c}: {t}' for c,t in vals.items())
   if not active:
    if vals:candidates.append(dict(documentId=d['id'],sheet=s['name'],row=no,projects=[p['project'] for p in d['projects']],rowContext=context))
    continue
   sc=[c for c,k in active.items() if k=='subject'];rc=[c for c,k in active.items() if k=='role']
   newsubject=next((vals[c] for c in sc if c in vals),'')
   if newsubject and newsubject!=subject:subject=newsubject;main='';sub='';block+=1
   role=next((vals[c] for c in rc if c in vals),role)
   if any(vals.get(c) for c,k in active.items() if k=='main'):main='\n'.join(vals[c] for c,k in active.items() if k=='main' and vals.get(c))
   if any(vals.get(c) for c,k in active.items() if k=='sub'):sub='\n'.join(vals[c] for c,k in active.items() if k=='sub' and vals.get(c))
   for col,kind in active.items():
    if col not in vals or kind in ('subject','role'):continue
    value=vals[col]
    if re.fullmatch(r'[\d.]+|[-–—]+|n/?a|none|null',norm(value)):continue
    group=groups.get(col,col); state=states.setdefault(group,{'main':'','sub':''})
    if kind in ('main','sub'):state[kind]=value
    groupSubject=subject
    if not groupSubject:
     for rn in range(max(1,no-1),max(0,no-8),-1):
      prev=s['rows'].get(rn,{})
      val=prev.get(group,{}).get('text','').strip()
      if val and len(val)<80 and rn not in hs and not re.fullmatch(r'[\d.]+',val) and rn<min(hs or {999999:None}):groupSubject=val;break
    for p in d['projects']:
     raw.append(dict(project=p['project'],projectIds=p['projectIds'],projectStatus=p['status'],subject=groupSubject,roleOriginal=role,kind=kind,value=value,mainContext=state['main'],subContext=state['sub'],group=group,block=block,documentId=d['id'],planUrl=d['url'],sheet=s['name'],cell=f'{col}{no}',row=no,rowContext=context,sheetState=s['state']))
dump('keyword-cells-original.json',raw);dump('keyword-sheet-inventory.json',sheets);dump('keyword-unparsed-rows.json',candidates)
dump('keyword-sheets-cache.json',cache)
print(json.dumps(dict(cells=len(raw),sheets=len(sheets),unparsedRows=len(candidates),kinds=dict(collections.Counter(r['kind'] for r in raw))),ensure_ascii=False))
