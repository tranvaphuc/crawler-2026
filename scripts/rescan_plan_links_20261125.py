"""Fetch one fresh read-only plan snapshot and compare source links with the archive."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from urllib.request import Request, urlopen
from zipfile import is_zipfile

from collect_catalog_platform_audit import master_documents, MASTER_ID
from extract_project_sources import read_book, urls
import audit_full_plan_links as plan_roster
from audit_full_plan_contents import inspect_sources, review_sources, CREDENTIAL_TEXT, PRIMARY_CONTENT_OWNERS, fold
from build_source_keyword_catalog import url_key

ROOT=Path('outputs/plan-link-rescan-2026-11-25')
CATALOG=Path('outputs/source-keyword-catalog-2026-11-19')
ARCHIVE_ROOTS=[
 CATALOG/'cross-platform-audit/full-plan-audit/browser-plans',
 CATALOG/'cross-platform-audit/full-plan-audit/public-plans',
 CATALOG/'cross-platform-audit/browser-plans',
 CATALOG/'cross-platform-audit/public-plans',
 CATALOG/'plan-refresh/coverage-current/public-plans',
 CATALOG/'plan-refresh/browser-plans',
 CATALOG/'plan-refresh/public-plans',
 Path('outputs/project-refresh-2026-11-10/plans'),
 Path('outputs/project-sources-2026-10-21/plans')]

def write(name,value):
 p=ROOT/name;p.parent.mkdir(parents=True,exist_ok=True)
 tmp=p.with_suffix(p.suffix+'.partial');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');tmp.replace(p)

def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
def stamp():return datetime.now(timezone.utc).isoformat()
def baseline(ident):
 for folder in ARCHIVE_ROOTS:
  p=folder/(ident+'.xlsx')
  if p.is_file() and is_zipfile(p):return p
 return None

def fetch(doc):
 row={**doc,'checked_at':stamp(),'live_file':None,'baseline_file':str(p) if (p:=baseline(doc['id'])) else None}
 target=ROOT/'public-plans'/(doc['id']+'.xlsx')
 if doc['kind']!='spreadsheets':return {**row,'status':'NON_SHEET_PLAN_REQUIRES_REVIEW'}
 endpoint=f"https://docs.google.com/spreadsheets/d/{doc['id']}/export?format=xlsx"
 try:
  with urlopen(Request(endpoint,headers={'User-Agent':'Mozilla/5.0'}),timeout=35) as response:
   if urlsplit(response.url).hostname=='accounts.google.com':return {**row,'status':'AUTH_REQUIRED'}
   data=response.read(75*1024*1024+1)
   if len(data)>75*1024*1024:return {**row,'status':'EXPORT_SIZE_LIMIT'}
   if not data.startswith(b'PK'):return {**row,'status':'NOT_XLSX'}
   tmp=target.with_suffix('.partial');tmp.write_bytes(data)
   if not is_zipfile(tmp):return {**row,'status':'INVALID_XLSX'}
   tmp.replace(target)
   return {**row,'status':'FETCHED','live_file':str(target),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 except HTTPError as error:return {**row,'status':'HTTP_'+str(error.code)}
 except (URLError,TimeoutError,OSError) as error:return {**row,'status':'READ_ERROR','error_type':type(error).__name__}

def prepare():
 ROOT.mkdir(exist_ok=True);(ROOT/'public-plans').mkdir(exist_ok=True)
 if not (ROOT/'master.xlsx').is_file():
  master=fetch({'id':MASTER_ID,'kind':'spreadsheets','projects':[]})
  if master['status']!='FETCHED':raise RuntimeError('MASTER_'+master['status'])
  (ROOT/'master.xlsx').write_bytes(Path(master['live_file']).read_bytes())
 docs=master_documents(ROOT/'master.xlsx')
 plan_roster.ROOT=ROOT
 plan_roster.roster()
 roster=read('roster.json');scoped={d['id']:d for d in roster['documents']}
 seen={d['id'] for d in docs}
 for d in roster['documents']:
  if d['id'] not in seen:docs.append({**d,'projects':[[p,'running'] for p in d['projects']]});seen.add(d['id'])
 previous={}
 for file in [CATALOG/'plan-refresh/master-documents.json',CATALOG/'cross-platform-audit/plan-document-coverage.json']:
  if file.exists():previous.update({d['id']:d for d in json.loads(file.read_text(encoding='utf-8'))})
 old_roster=json.loads((CATALOG/'cross-platform-audit/full-plan-audit/roster.json').read_text(encoding='utf-8'))
 previous.update({d['id']:d for d in old_roster['documents']})
 result=[]
 for doc in docs:
  current=scoped.get(doc['id'])
  projects=current['projects'] if current else {p:[] for p,s in doc['projects']}
  result.append({**doc,'projects':projects,'project_statuses':dict(doc['projects']),
    'active_projects':[p for p in projects if p in set(roster['active_projects'])],
    'new_in_master':doc['id'] not in previous})
 write('manifest.json',result)
 write('master-delta.json',{'new_documents':[d for d in result if d['new_in_master']],
   'removed_document_ids':sorted(set(previous)-{d['id'] for d in result}),
   'new_active_projects':sorted(set(roster['active_projects'])-set(json.loads((CATALOG/'cross-platform-audit/full-plan-audit/roster.json').read_text(encoding='utf-8'))['active_projects']))})
 print(json.dumps({'documents':len(result),'active_projects':len(roster['active_projects']),'new_master_documents':sum(d['new_in_master'] for d in result)},ensure_ascii=False),flush=True)

def authenticated():
 """Merge browser exports and discover only newly referenced topic-index plans."""
 existing={d['id']:d for d in read('access.json')}
 if not (ROOT/'access-public.json').exists():write('access-public.json',list(existing.values()))
 prepare()
 exports={r['id']:r for r in read('authenticated-fetch.json')}
 denied={'1-DCGa7Qvp3uB7LxDQw7E0VUa_G3OGNdj','1-e_cLtG_oP1Wr-06WGGoMKUuTu0FWAHL',
 '1C9POuBVia-bnij-4B1K0D-XBoMTtp_B_nOQGXHbBzAg','1D02Dcv4f0oVqTyw_QuEvhcGj8ZhXSMjegan2nDgiDZQ',
 '1G8JfySGNkJMhP6FM721tMAXD5fUgcJqeetd3B8S4JSA','1mktKZlOefI-QQS-y1l6GL4NB-DKor8CJ'}
 output=[];new=[]
 for doc in read('manifest.json'):
  if doc['id'] not in existing:new.append(doc);continue
  row={**existing[doc['id']],**doc}
  if doc['id'] in exports:
   row.update({**exports[doc['id']],'status':'FETCHED','public_fetch_status':existing[doc['id']]['status'],'retrieval':'authenticated_browser','checked_at':stamp()})
  elif doc['id'] in denied:row.update(status='AUTHENTICATED_ACCESS_DENIED',retrieval='authenticated_browser')
  elif doc['id']=='1UjesStmfSyEGlkz7uZxnedFlMBYMzx_7':row.update(status='DRIVE_VIEWABLE_EXPORT_UNAVAILABLE',retrieval='authenticated_browser')
  output.append(row)
 if new:
  with ThreadPoolExecutor(max_workers=4) as pool:
   for row in pool.map(fetch,new):output.append(row);print(json.dumps({'newly_referenced':row['id'],'status':row['status'],'projects':list(row['projects'])}),flush=True)
 write('access.json',sorted(output,key=lambda d:d['id']))
 print(json.dumps({'documents':len(output),'additional_topic_documents':len(new),'statuses':dict(Counter(d['status'] for d in output))}),flush=True)

def download():
 docs=read('manifest.json');log=ROOT/'fetch.jsonl'
 if log.exists() and log.stat().st_size:raise RuntimeError('SNAPSHOT_ALREADY_FETCHED_USE_COMPARE_OR_NEW_DIRECTORY')
 result=[]
 with ThreadPoolExecutor(max_workers=8) as pool,log.open('w',encoding='utf-8') as handle:
  work=[pool.submit(fetch,d) for d in docs]
  for task in as_completed(work):
   row=task.result();result.append(row);handle.write(json.dumps(row,ensure_ascii=False)+'\n');handle.flush()
   if len(result)%10==0 or len(result)==len(docs):print(json.dumps({'checked':len(result),'total':len(docs),'status':dict(Counter(r['status'] for r in result))}),flush=True)
 write('access.json',sorted(result,key=lambda d:d['id']))

def link_key(value):
 u=urlsplit(value)
 if u.hostname=='fireant.vn' or (u.hostname or '').endswith('.fireant.vn'):return None
 host=(u.hostname or '').lower().removeprefix('www.')
 if not host or u.username or u.password:return None
 query=[(k,v) for k,v in parse_qsl(u.query,keep_blank_values=True) if not k.lower().startswith('utm_') and k.lower() not in {'fbclid','gclid','fref','ref','locale','hl','lang'}]
 return host+(u.path.rstrip('/') or '/')+('?' + urlencode(sorted(query)) if query else '')

def inventory(path):
 sheets=list(read_book(path));links={};cells={};plans={}
 for sh in sheets:
  for row in sh['rows'].values():
   for c in row.values():
    if CREDENTIAL_TEXT.search(c.get('text','')):continue
    signature=tuple((c.get(k) or '').strip() for k in ['text','link','note','formula'])
    if signature[3] and not any(signature[1:3]):signature=('',*signature[1:])
    if any(signature):cells[sh['name']+'!'+c['ref']]=signature
    for url in urls(c):
     try:key=link_key(url)
     except ValueError:continue
     if key:links.setdefault(key,[]).append({'url':url,'sheet':sh['name'],'cell':c['ref']})
    for d in plan_roster.plan_links(c):plans.setdefault(d['id'],[]).append({**d,'sheet':sh['name'],'cell':c['ref']})
 return sheets,links,cells,plans

def compare():
 docs=read('access.json');groups=defaultdict(list);content=[];unresolved=[];new_links=[];new_plan_links=[];diffs=[];bad=[]
 source_flags={};new_keys_by_doc={}
 for index,doc in enumerate(docs,1):
  if doc['status']!='FETCHED':continue
  try:
   fresh,links,current_cells,planrefs=inventory(doc['live_file'])
   if doc['baseline_file']:
    _,old_links,old_cells,old_planrefs=inventory(doc['baseline_file'])
    comparison='CHANGED' if current_cells!=old_cells else 'IDENTICAL'
   else:old_links,old_cells,old_planrefs={},{},{};comparison='NO_BASELINE'
   added=set(links)-set(old_links);new_keys_by_doc[doc['id']]=added
   diffs.append({'id':doc['id'],'projects':list(doc['projects']),'active_projects':doc['active_projects'],'comparison':comparison,
    'changed_cells':sum(current_cells.get(k)!=old_cells.get(k) for k in current_cells.keys()|old_cells.keys()),
    'new_external_link_keys':len(added),'removed_external_link_keys':len(set(old_links)-set(links)),
    'live_file':doc['live_file'],'baseline_file':doc['baseline_file']})
   for k in sorted(added):
    new_links.append({'document_id':doc['id'],'projects':list(doc['projects']),'active_projects':doc['active_projects'],
      'plan_url':doc['url'],'link_key':k,'origins':links[k],'comparison':comparison})
   for ident,proofs in planrefs.items():
    if ident not in old_planrefs:new_plan_links.append({'parent_document_id':doc['id'],'projects':list(doc['projects']),'linked_document_id':ident,'origins':proofs,'comparison':comparison})
   scoped={**doc,'copy_status':'LIVE_AUTHENTICATED' if doc.get('retrieval')=='authenticated_browser' else 'LIVE_PUBLIC','content_owner':PRIMARY_CONTENT_OWNERS.get(doc['id'])}
   inspect_sources(scoped,fresh,groups,content,unresolved,[])
  except Exception as error:bad.append({'document_id':doc['id'],'error_type':type(error).__name__})
  if index%20==0:print(json.dumps({'compared_index':index,'new_links':len(new_links),'source_groups':len(groups)}),flush=True)
 db=sqlite3.connect((CATALOG/'source-keyword-catalog.sqlite').resolve().as_uri()+'?mode=ro',uri=True)
 try:
  candidates,conflicts=review_sources(db,groups)
  known_projects={r[0] for r in db.execute('SELECT project_name FROM projects')}
 finally:db.close()
 active=set(read('roster.json')['active_projects'])
 for r in candidates:
  r['active_project']=r['project'] in active;r['known_project']=r['project'] in known_projects
  fresh_proofs=[]
  for p in r['proofs']:
   ident=re.search(r'/d/([\w-]+)',p['planUrl'])
   if ident and link_key(p['url']) in new_keys_by_doc.get(ident[1],set()):fresh_proofs.append(p)
  r['new_since_snapshot']=bool(fresh_proofs);r['new_link_proofs']=fresh_proofs
 missing=[r for r in candidates if r['new_source'] or r['new_membership']]
 write('document-diff.json',diffs);write('new-links.json',new_links);write('new-linked-plans.json',new_plan_links)
 write('source-additions.json',missing);write('all-source-comparison.json',candidates)
 write('review.json',{'unresolved_project_scope':unresolved,'conflicts':conflicts,'read_errors':bad})
 write('new-content-references.json',[p for p in content if (m:=re.search(r'/d/([\w-]+)',p['planUrl'])) and link_key(p['url']) in new_keys_by_doc.get(m[1],set())])
 counts=Counter(d['status'] for d in docs)
 summary={'checked_at':stamp(),'documents':len(docs),'live_documents':counts['FETCHED'],'access_statuses':dict(counts),
  'comparisons':dict(Counter(d['comparison'] for d in diffs)),'new_external_links_by_document':len(new_links),
  'unique_new_external_link_keys':len({r['link_key'] for r in new_links}),
  'source_project_pairs_missing_from_catalog':len(missing),'unique_source_keys_missing_from_catalog':len({r['source_key'] for r in missing if r['new_source']}),
  'active_source_project_pairs_missing':sum(r['active_project'] for r in missing),
  'active_source_pairs_new_since_snapshot':sum(r['active_project'] and r['new_since_snapshot'] for r in missing),
  'new_linked_plan_references':len(new_plan_links),'unresolved_project_scope':len(unresolved),'conflicts':len(conflicts),'read_errors':bad,
  'catalog_modified':False,'note':'Only FETCHED files are current evidence. Failed/private plans are not silently replaced by archive copies. Source URLs are candidates until reviewed; stopped projects remain separate.'}
 write('summary.json',summary);print(json.dumps(summary,ensure_ascii=False),flush=True)

def review():
 """Separate real link additions from existing catalog entries and references."""
 summary=read('summary.json');docs=read('access.json');roster=read('roster.json')
 required={d['id']:set(d['projects']) for d in roster['documents']}
 active=set(roster['active_projects'])
 observed=[r for r in read('all-source-comparison.json') if r['new_since_snapshot']]
 accepted=[];stopped=[];already=[];scoped_out=[];exclusions=[]
 source_keys=set()
 checks=read('mbbank-youtube-check.json') if (ROOT/'mbbank-youtube-check.json').exists() else []
 checked_urls={link_key(c['url']):c for c in checks}
 for row in observed:
  for p in row['new_link_proofs']:source_keys.add(link_key(p['url']))
  proofs=[p for p in row['new_link_proofs'] if (m:=re.search(r'/d/([\w-]+)',p['planUrl'])) and row['project'] in required.get(m[1],set())]
  target={k:row[k] for k in ['project','channel','identity','type','new_source','new_membership']}
  target['proofs']=row['new_link_proofs'];target['required_running_plan_proofs']=proofs
  if verified:=next((checked_urls[link_key(p['url'])] for p in row['new_link_proofs'] if link_key(p['url']) in checked_urls),None):
   target['live_link_check']=verified
  if any(re.search(r'\b(?:source spam|nguon spam|blacklist|exclude|loai tru|khong (?:can )?thu thap)\b',fold(p['sheet'])) for p in row['new_link_proofs']):
   target['reason']='Plan lists these sources as exclusions/spam; do not treat them as monitoring-source additions.'
   exclusions.append(target);continue
  if row['new_source'] or row['new_membership']:
   if row['project'] in active and proofs:accepted.append(target)
   elif row['project'] not in active:stopped.append(target)
   else:scoped_out.append(target)
  else:already.append(target)
 references=read('new-content-references.json');reference_keys={link_key(p['link'] if 'link' in p else p['url']) for p in references}
 unclassified=[r for r in read('new-links.json') if r['link_key'] not in source_keys|reference_keys]
 blocked=[{'id':d['id'],'url':d['url'],'projects':list(d['projects']),'status':d['status'],'required_running_plan':d['id'] in required} for d in docs if d['status']!='FETCHED']
 result={'checked_at':stamp(),'documents':summary['documents'],'live_documents':summary['live_documents'],
   'running_plan_documents':len(required),'running_plan_documents_read':sum(d['id'] in required and d['status']=='FETCHED' for d in docs),
   'new_external_link_keys':summary['unique_new_external_link_keys'],
   'running_source_project_additions':len(accepted),'running_unique_source_additions':len({tuple(r['identity']) for r in accepted}),
   'stopped_source_project_additions':len(stopped),'new_source_links_already_in_catalog':len(already),
   'source_exclusion_additions':len(exclusions),
   'new_content_reference_occurrences':len(references),'unique_content_reference_links':len(reference_keys),
   'unclassified_new_links':len(unclassified),'new_plan_documents':len(read('master-delta.json')['new_documents']),
   'blocked_documents':len(blocked),'blocked_running_plans':[r for r in blocked if r['required_running_plan']],
   'running_source_additions':accepted,'stopped_source_additions':stopped,'already_catalogued_sources':already,
   'source_exclusions':exclusions,
   'noncurrent_plan_scope_candidates':scoped_out,'new_content_references':references,'unclassified_links':unclassified,
   'supplementary_link_checks':checks,
   'catalog_modified':False}
 write('reviewed-result.json',result)
 write('running-source-additions.json',accepted)
 write('source-exclusions.json',exclusions)
 write('blocked-plans.json',blocked)
 lines=['KẾT QUẢ QUÉT LINK TRONG PLAN — 25/11/2026',
   f"Tài liệu đọc được: {summary['live_documents']}/{summary['documents']}.",
   f"Plan đang chạy đọc được: {result['running_plan_documents_read']}/{len(required)}.",
   f"Link ngoài khác snapshot cũ: {result['new_external_link_keys']}.",
   f"Source bổ sung cho project đang chạy: {len(accepted)} lượt gán, {result['running_unique_source_additions']} URL nguồn.",
   f"Source mới thuộc danh sách spam/loại trừ trong plan: {len(exclusions)}.",
   f"Link bài viết tham chiếu mới: {len(reference_keys)}.",'']
 for label,items in [('SOURCE ĐANG CHẠY CẦN BỔ SUNG',accepted),('SOURCE SPAM/LOẠI TRỪ MỚI THEO PLAN',exclusions),('SOURCE CỦA PROJECT STOP',stopped),('SOURCE ĐÃ CÓ TRONG CATALOG',already)]:
  lines.append(label)
  if not items:lines.append('Không có.')
  for r in items:
   p=r['proofs'][0];lines.extend([f"{r['project']} | {r['channel']} | {p['url']}",f"Plan: {p['planUrl']} | {p['sheet']}!{p['cell']}"])
   if check:=r.get('live_link_check'):lines.append(f"Kiểm tra link: HTTP {check.get('http_status')} | {check.get('title')} | Channel ID {check.get('channel_id')}")
  lines.append('')
 lines.append('KIỂM TRA LINK YOUTUBE MỚI/CŨ')
 for c in checks:lines.append(f"{c['url']} | HTTP {c.get('http_status')} | Channel ID: {c.get('channel_id') or 'Chưa có'}")
 lines.append('')
 lines.append('LINK BÀI VIẾT THAM CHIẾU MỚI')
 for p in references:lines.append(f"{p['project']} | {p['sheet']}!{p['cell']} | {p.get('url',p.get('link'))}")
 lines.extend(['','LINK MỚI CẦN RÀ SOÁT THÊM'])
 for r in unclassified:
  p=r['origins'][0];lines.append(f"{', '.join(r['projects'])} | {p['sheet']}!{p['cell']} | {p['url']}")
 lines.extend(['','PLAN CHƯA ĐỌC ĐƯỢC'])
 for r in blocked:lines.append(f"{', '.join(r['projects'])} | {r['status']} | {r['url']}")
 (ROOT/'ket-qua-quet-link.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
 print(json.dumps({k:v for k,v in result.items() if not isinstance(v,list)},ensure_ascii=False),flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('stage',choices=['prepare','fetch','authenticated','compare','review','all']);args=parser.parse_args()
 if args.stage in ['prepare','all']:prepare()
 if args.stage in ['fetch','all']:download()
 if args.stage=='authenticated':authenticated()
 if args.stage in ['compare','all']:compare()
 if args.stage in ['review','all']:review()
