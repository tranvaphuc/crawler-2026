set -euo pipefail
python3 - <<'PY'
import json,sqlite3,collections
root='/var/lib/news-flow/recovery-all-20261123/';d=sqlite3.connect(root+'audit.sqlite');d.row_factory=sqlite3.Row;live=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);live.row_factory=sqlite3.Row
counts=collections.Counter();by=collections.Counter();samples=[]
for r in d.execute("SELECT e.*,c.site,c.url,s.id,s.checked_at staged_at FROM es_readbacks e JOIN cohort c USING(parse_key) JOIN stage_results s USING(parse_key) WHERE e.status LIKE '%mismatch'"):
 p=json.loads(r['details']);counts.update(p.get('differences',[]));by[(r['site'],','.join(p.get('differences',[])))]+=1
 if r['status']=='created_field_mismatch' or 'publishedDate' in p.get('differences',[]):
  rec=live.execute('SELECT * FROM import_receipts WHERE id=?',(r['id'],)).fetchone();samples.append({'site':r['site'],'url':r['url'],'status':r['status'],'details':p,'stagedAt':r['staged_at'],'receipt':dict(rec) if rec else None})
print(json.dumps({'mismatchFields':dict(counts),'bySite':[{'site':s,'fields':f,'n':n} for (s,f),n in by.most_common(25)],'samples':samples},ensure_ascii=False))
PY
