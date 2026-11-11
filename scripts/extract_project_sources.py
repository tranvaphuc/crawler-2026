"""Read XLSX plans without changing them; retain every source's provenance."""
import json,re,zipfile,posixpath,sys,os,xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse,parse_qs,unquote

OUT=Path(os.environ.get('SOURCE_AUDIT_PLAN_ROOT','outputs/project-sources-2026-10-21'))
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
RID='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
URL_RE=re.compile(r'(?:https?://|www\.)[^\s<>"\x00]+',re.I)
DOMAIN_RE=re.compile(r'(?<![@\w])(?:[a-z0-9-]{1,63}\.){1,6}(?:com|vn|net|org|io|ai|tv)(?:/[^\s<>"\x00]*)?',re.I)
def read_book(path):
 z=zipfile.ZipFile(path)
 ss=[]
 if 'xl/sharedStrings.xml' in z.namelist():
  ss=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))]
 rel={r.get('Id'):r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
 for sheet in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets',NS):
  target=rel[sheet.get(RID)];target=target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/'+target)
  root=ET.fromstring(z.read(target));rows={};cells={}
  for c in root.findall('.//m:sheetData/m:row/m:c',NS):
   v=c.find('m:v',NS);text=v.text or '' if v is not None else ''
   if c.get('t')=='s':text=ss[int(text)] if text else ''
   elif c.get('t')=='inlineStr':text=''.join(c.find('m:is',NS).itertext())
   f=c.find('m:f',NS)
   if text or (f is not None and f.text):cells[c.get('r')]={'text':text,'formula':f.text if f is not None else ''}
  relpath=posixpath.dirname(target)+'/_rels/'+posixpath.basename(target)+'.rels'
  links={};comments={}
  if relpath in z.namelist():
   rels=list(ET.fromstring(z.read(relpath)));relmap={r.get('Id'):r for r in rels}
   for h in root.findall('.//m:hyperlink',NS):
    if h.get(RID) in relmap:links[h.get('ref').split(':')[0]]=relmap[h.get(RID)].get('Target','')
   for r in rels:
    if r.get('Type','').endswith('/comments'):
     cp=posixpath.normpath(posixpath.dirname(target)+'/'+r.get('Target'))
     if cp in z.namelist():
      for n in ET.fromstring(z.read(cp)).findall('.//m:comment',NS):comments[n.get('ref')]=''.join(n.find('m:text',NS).itertext())
  for ref,url in links.items():cells.setdefault(ref,{'text':'','formula':''})['link']=url
  for ref,note in comments.items():cells.setdefault(ref,{'text':'','formula':''})['note']=note
  for ref,c in cells.items():rows.setdefault(int(re.search(r'\d+',ref).group()),{})[re.sub(r'\d','',ref)]={**c,'ref':ref}
  yield {'name':sheet.get('name'),'state':sheet.get('state','visible'),'rows':rows}

def channel(url,hint=''):
 host=urlparse(url).hostname or ''
 if host.endswith(('facebook.com','fb.com','fb.watch')):return 'Facebook'
 if host.endswith(('youtube.com','youtu.be')):return 'YouTube'
 if host.endswith('tiktok.com'):return 'TikTok'
 if host.endswith('instagram.com'):return 'Instagram'
 if host in ('twitter.com','x.com','www.twitter.com','www.x.com'):return 'X'
 if host.endswith('threads.net') or host.endswith('threads.com'):return 'Threads'
 if host.endswith('linkedin.com'):return 'LinkedIn'
 if re.search(r'forum|diễn đàn|diendan',hint+' '+host,re.I) or host in ('voz.vn','tinhte.vn','webtretho.com','www.webtretho.com','www.otofun.net','otofun.net'):return 'Forum'
 if re.search(r'news|báo|bao chi|báo chí',hint,re.I):return 'News'
 return 'Website'

def urls(c):
 vals=[c.get('link',''),c.get('text',''),c.get('formula',''),c.get('note','')];seen=set()
 for val in vals:
  val=val or ''
  for m in URL_RE.finditer(val):
   u=m.group().rstrip('.,;)]}');u=u if u.startswith(('http://','https://')) else 'https://'+u
   try:
    p=urlparse(u)
    if p.hostname in ('www.google.com','google.com') and p.path=='/url':u=parse_qs(p.query).get('q',parse_qs(p.query).get('url',[u]))[0]
    host=urlparse(u).hostname or ''
    if host in ('docs.google.com','drive.google.com','accounts.google.com') or not host:continue
   except ValueError:continue
   if u not in seen:seen.add(u);yield u
 # Bare domains are common in News/Forum source tables.
 if not seen:
  for m in DOMAIN_RE.finditer(c.get('text','')):
   u='https://'+m.group().rstrip('.,;)]}')
   if urlparse(u).hostname not in ('docs.google.com','drive.google.com') and u not in seen:seen.add(u);yield u

def run():
 manifest=json.loads((OUT/'plans-manifest.json').read_text());records=[];inventory=[]
 if len(sys.argv)>1:
  manifest=[d for d in manifest if d['id']==sys.argv[1]]
  records=json.loads((OUT/'sources-raw.json').read_text());inventory=json.loads((OUT/'plan-sheets.json').read_text())
 for docindex,doc in enumerate(manifest):
  if doc.get('status')!='DOWNLOADED':continue
  print('Reading',docindex,doc['projects'][0]['project'],flush=True)
  try:sheets=list(read_book(doc['file']))
  except Exception as e:inventory.append({'documentId':doc['id'],'error':str(e)});continue
  for sh in sheets:
   inventory.append({'documentId':doc['id'],'sheet':sh['name'],'rows':len(sh['rows']),'state':sh['state']})
   headers={};section='';source_sheet=bool(re.search(r'source|nguồn|kenh|kênh|channel|fanpage|group|forum|youtube|tiktok|facebook|influencer|kol|koc',sh['name'],re.I))
   for rowno,row in sorted(sh['rows'].items()):
    for c in row.values():c['found']=list(urls(c))
    texts={k:c['text'] for k,c in row.items() if c['text']}
    if any(re.search(r'^(?:link|url|domain|channel|kênh|tên group|tên page|tên nhóm|tên nguồn|siteid|note|ghi chú)',t.strip(),re.I) for t in texts.values()):
     for col,t in texts.items():
      if not list(urls({'text':t})) and len(t)<100:headers[col]=t
    for col,t in texts.items():
     if col in ('A','B') and re.fullmatch(r'(?:FACEBOOK|FB GROUP|FB PAGE|NEWS|FORUM|YOUTUBE|TIKTOK|INSTAGRAM|BÁO CHÍ|WEBSITE)',t.strip(),re.I):section=t.strip()
    rowtext=' | '.join(f'{col}: {txt}' for col,txt in texts.items())[:2000]
    hint=sh['name']+' '+section+' '+' '.join(v['text'] for k,v in row.items() if re.search(r'channel|kênh|type|loại',headers.get(k,''),re.I))[:300]
    for col,c in row.items():
     for url in c['found']:
      ch=channel(url,hint)
      if not source_sheet and ch=='Website' and not re.search(r'source|nguồn|channel|kênh',rowtext,re.I):continue
      if re.search(r'@[^/]+\.[^/]+',urlparse(url).netloc):continue
      prior=[v['text'] for k,v in row.items() if k<col and v['text'] and not v['found'] and not re.fullmatch(r'[\d.,Ee+\-]+|[xX✓]',v['text'].strip())]
      name=prior[-1] if prior else ''
      notes=' | '.join(v['text'] for k,v in row.items() if re.search(r'note|ghi chú|remark',headers.get(k,''),re.I) and v['text'])
      note=' | '.join(v for v in [notes,c.get('note','')] if v)
      channel_note=' | '.join(v['text'] for k,v in row.items() if re.search(r'channel|kênh|type|loại',headers.get(k,''),re.I) and v['text'])
      for p in doc['projects']:
       records.append({'project':p['project'],'projectIds':p['projectIds'],'projectStatus':p['status'],'projectNote':p['note'],'channel':ch,'channelNote':channel_note or section,'sourceName':name,'inputUrl':url,'note':note,'planUrl':doc['url'],'planSheet':sh['name'],'cell':c['ref'],'sheetState':sh['state'],'rowContext':rowtext})
 # Same document may be listed more than once for one project.
 dedup={}
 for r in records:dedup[(r['project'],r['planUrl'],r['planSheet'],r['cell'],r['inputUrl'])]=r
 records=list(dedup.values())
 print('Writing',len(records),'source records',flush=True)
 with (OUT/'sources-raw.json').open('w') as f:json.dump(records,f,ensure_ascii=False,separators=(',',':'))
 (OUT/'plan-sheets.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2))
 counts={}
 for r in records:counts[r['channel']]=counts.get(r['channel'],0)+1
 print(json.dumps({'records':len(records),'uniqueUrls':len(set(r['inputUrl'] for r in records)),'channels':counts},ensure_ascii=False))
if __name__=='__main__':run()
