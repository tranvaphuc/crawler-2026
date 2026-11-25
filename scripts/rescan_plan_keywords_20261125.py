"""Read keyword deltas from the fresh plan snapshots without changing the catalog."""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3

from extract_project_sources import read_book
from reconcile_plan_keywords_deep import xlsx_inventory, clean_terms, term_shape
from audit_full_plan_contents import CREDENTIAL_TEXT
from deduplicate_catalog_keywords import query_key

ROOT=Path('outputs/plan-link-rescan-2026-11-25')
OUT=ROOT/'keyword-review'

def write(name,data):
 (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def signature(entry):
 _,raw,proof=entry
 return (raw.strip().replace('\r\n','\n'),proof['kind'],proof.get('subject',''),proof.get('role',''))

def cell_map(sheets):
 output={}
 for sheet in sheets:
  rows={}
  for row in sheet['rows'].values():
   for cell in row.values():
    value=tuple((cell.get(k) or '').strip() for k in ['text','link','note','formula'])
    if value[3] and not any(value[1:3]):value=('',*value[1:])
    if any(value):rows[cell['ref']]=value
  output[sheet['name']]=rows
 return output

def main():
 OUT.mkdir(exist_ok=True)
 documents=json.loads((ROOT/'document-diff.json').read_text(encoding='utf-8'))
 access={d['id']:d for d in json.loads((ROOT/'access.json').read_text(encoding='utf-8'))}
 dbfile=Path('outputs/source-keyword-catalog-2026-11-19/source-keyword-catalog.sqlite')
 db=sqlite3.connect(dbfile.resolve().as_uri()+'?mode=ro',uri=True)
 known=defaultdict(set)
 for project,keyword in db.execute('SELECT project_name,keyword FROM keywords'):known[project].add(query_key(keyword))
 db.close()
 additions=[];removals=[];changes=[];inventories=[]
 for doc in documents:
  if doc['comparison']=='IDENTICAL':continue
  meta=access[doc['id']];fresh=list(read_book(doc['live_file']));old=list(read_book(doc['baseline_file'])) if doc['baseline_file'] else []
  before,after=cell_map(old),cell_map(fresh)
  for tab in before.keys()|after.keys():
   a,b=before.get(tab,{}),after.get(tab,{})
   for cell in a.keys()|b.keys():
    av,bv=a.get(cell,('','','','')),b.get(cell,('','','',''))
    if av!=bv and not any(CREDENTIAL_TEXT.search(v) for v in [*av,*bv]):
     changes.append({'document_id':doc['id'],'projects':doc['projects'],'sheet':tab,'cell':cell,
       'before':dict(zip(['text','link','note','formula'],av)),'after':dict(zip(['text','link','note','formula'],bv))})
  info={doc['id']:{'projects':doc['projects'],'url':meta['url'],'file':doc['live_file']}}
  current,inv=xlsx_inventory(info,book_reader=lambda _:fresh)
  info[doc['id']]['file']=doc['baseline_file'] or doc['live_file']
  previous,_=xlsx_inventory(info,book_reader=lambda _:old)
  oldkeys=Counter(signature(e) for e in previous);newkeys=Counter(signature(e) for e in current)
  oldvalues={query_key(e[1]) for e in previous};newvalues={query_key(e[1]) for e in current}
  for entries,delta,target,other in [(current,newkeys-oldkeys,additions,oldvalues),(previous,oldkeys-newkeys,removals,newvalues)]:
   for projects,raw,proof in entries:
    key=signature([projects,raw,proof])
    if not delta[key]:continue
    delta[key]-=1
    if CREDENTIAL_TEXT.search(raw):continue
    terms=[]
    for project in projects:
     for term in clean_terms(raw,project,proof['kind']):
      if term_shape(term):terms.append({'project':project,'term':term,'already_in_catalog':query_key(term) in known[project]})
    target.append({'document_id':doc['id'],'projects':projects,'active_projects':doc['active_projects'],'raw':raw,
       'proof':proof,'same_text_elsewhere_in_other_snapshot':query_key(raw) in other,'terms':terms})
  inventories.extend(inv)
  print(json.dumps({'projects':doc['projects'],'keyword_candidates_added':len(additions),'keyword_candidates_removed':len(removals),'changed_cells':len(changes)},ensure_ascii=False),flush=True)
 write('added-keyword-cells.json',additions);write('removed-keyword-cells.json',removals);write('changed-cells.json',changes)
 write('inventory.json',inventories)
 summary={'checked_at':datetime.now(timezone.utc).isoformat(),'fresh_documents':len(documents),'unchanged_documents':sum(d['comparison']=='IDENTICAL' for d in documents),
   'changed_documents_checked':len(inventories),'added_keyword_cell_candidates':len(additions),'removed_keyword_cell_candidates':len(removals),
   'added_by_kind':dict(Counter(e['proof']['kind'] for e in additions)),'catalog_modified':False}
 write('summary.json',summary);print(json.dumps(summary,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
