set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
python3 - <<'PY'
import json,sqlite3,subprocess,hashlib
from pathlib import Path
root=Path('/var/lib/news-flow/stability-20261123');db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
r={'skippedReasons':[dict(x) for x in db.execute("SELECT error,count(*) n FROM article_links WHERE parse_status='skipped' GROUP BY error")], 'baomoiArticles':[dict(x) for x in db.execute('SELECT status,count(*) n,max(at) latest FROM baomoi_original_articles GROUP BY status')],'baomoiSources':[dict(x) for x in db.execute('SELECT status,count(*) n FROM baomoi_original_sources GROUP BY status')]};db.close()
r['branchService']=subprocess.check_output(['systemctl','show','news-flow-baomoi-original','-p','MainPID,NRestarts,ExecMainStartTimestamp,ActiveState'],text=True);r['branchEventsAfterFix']={};r['branchDeferReasons']={}
for line in subprocess.check_output(['journalctl','-u','news-flow-baomoi-original','--since','2026-11-23 01:24:29 UTC','-o','cat','--no-pager'],text=True).splitlines():
 try:v=json.loads(line)
 except ValueError:continue
 if not isinstance(v,dict):continue
 k=v.get('event','unknown');r['branchEventsAfterFix'][k]=r['branchEventsAfterFix'].get(k,0)+1
 if k=='original_es_read_deferred':r['branchDeferReasons'][v.get('reason')]=r['branchDeferReasons'].get(v.get('reason'),0)+1
 r['latestBranchEvent']={k:v[k] for k in ['event','admitted','paidAiCalls','articles','sources'] if k in v}
r['codeSha']={p:hashlib.sha256(Path('/opt/news-flow/current/'+p).read_bytes()).hexdigest() for p in ['scripts/run_baomoi_original_branch.mjs','src/newsFlow/originalReconciliationRead.mjs']}
(root/'news-closeout.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
PY
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/stability-20261123/news-closeout.json "$upload_dir/.qc-stability-news-closeout.json"
