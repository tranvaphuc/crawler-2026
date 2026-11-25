#!/bin/bash
set -euo pipefail
export NEWS_CATEGORY_AUDIT_ROOT=/var/lib/news-flow/category-coverage-20261123
cd /opt/news-flow/current
while ! python3 - <<'PY'
import json,sqlite3,subprocess,os
from pathlib import Path
r=Path(os.environ['NEWS_CATEGORY_AUDIT_ROOT']);a=sqlite3.connect('file:'+str(r/'audit.sqlite')+'?mode=ro',uri=True);p=sqlite3.connect('file:'+str(r/'applications.sqlite')+'?mode=ro',uri=True);d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);p.execute('ATTACH DATABASE ? AS scan',[str(r/'audit.sqlite')])
units=['news-category-audit-20261123','news-category-initial-backfill-20261123','news-category-transient-review-20261123','news-category-hint-expansion-20261123'];active=[u for u in units if subprocess.run(['systemctl','is-active','--quiet',u]).returncode==0]
review=json.loads((r/'transient-review-report.json').read_text()) if (r/'transient-review-report.json').exists() else {}
s={'at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'phase':'waiting','active':active,'audit_unfinished':a.execute("SELECT count(*) FROM pages WHERE state!='done'").fetchone()[0],'unadmitted_candidates':p.execute('SELECT count(*) FROM scan.articles a LEFT JOIN article_applications p ON p.key=a.key WHERE p.key IS NULL').fetchone()[0],'waiting_backfill':d.execute("SELECT count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.parse_status IN ('pending','queued','running')").fetchone()[0],'transient_review_complete':review.get('complete') is True and review.get('apply') is True}
frontier=json.loads((r/'hint-expansion-status.json').read_text()) if (r/'hint-expansion-status.json').exists() else {};s['hint_frontier_complete']=frontier.get('complete') is True;s['ready']=not active and not s['audit_unfinished'] and not s['unadmitted_candidates'] and not s['waiting_backfill'] and s['transient_review_complete'] and s['hint_frontier_complete'];(r/'finalization-status.json').write_text(json.dumps(s,indent=2));print(json.dumps(s));raise SystemExit(0 if s['ready'] else 1)
PY
do sleep 30; done
/opt/news-flow/node/bin/node scripts/qualify_news_category_coverage.mjs
/opt/news-flow/node/bin/node scripts/clean_news_category_false_positives.mjs
/opt/news-flow/node/bin/node scripts/apply_news_category_coverage.mjs
/opt/news-flow/node/bin/node scripts/reconcile_news_category_imports.mjs --apply
while ! python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
missing=d.execute("SELECT count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key LEFT JOIN import_receipts r ON r.id=c.es_id AND r.es_index=c.es_index WHERE a.parse_status='done' AND r.id IS NULL").fetchone()[0]
held=d.execute("SELECT count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key JOIN outbox o ON o.id=c.es_id WHERE a.parse_status='done' AND o.state='held'").fetchone()[0]
print(json.dumps({'phase':'confirming_imports','missing_receipts':missing,'explicitly_held':held}));raise SystemExit(0 if missing<=held else 1)
PY
do sleep 10; done
bash /usr/local/libexec/news-category-es-readback-20261123.sh
python3 scripts/report_news_category_coverage.py > "$NEWS_CATEGORY_AUDIT_ROOT/final-report.log"
python3 - <<'PY'
import json,sqlite3,tarfile,os,pwd,shutil,hashlib
from pathlib import Path
from datetime import datetime,timezone
r=Path(os.environ['NEWS_CATEGORY_AUDIT_ROOT'])
live_priority=Path('/var/lib/news-flow/live-priority-20261123')
for name in ['progress.json','es-live-readback.json','combined-tests.tap']:
 if (live_priority/name).exists():shutil.copyfile(live_priority/name,r/('live-priority-'+name))
s=json.loads((r/'coverage-report.json').read_text());d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
held_imports=d.execute("SELECT count(*) FROM news_category_backfill c JOIN outbox o ON o.id=c.es_id WHERE o.state='held'").fetchone()[0]
if not s['traversal_complete'] or not s['backfill_processing_complete'] or s['totals']['parsed_without_receipt']>held_imports or not s['es_readback'].get('verified'):raise RuntimeError('COVERAGE_FINAL_VERIFICATION_INCOMPLETE')
from urllib.parse import urlsplit
if any((urlsplit(x['url']).hostname or '').lower().rstrip('.')=='fireant.vn' or (urlsplit(x['url']).hostname or '').lower().rstrip('.').endswith('.fireant.vn') for x in json.loads((r/'verified-sections.json').read_text())):raise RuntimeError('EXCLUDED_SOURCE_IN_MANIFEST')
status={'at':datetime.now(timezone.utc).isoformat(),'phase':'finalized','complete_with_explicit_holds':bool(s['totals']['held'] or s['totals']['http_unconfirmed'] or held_imports),'held_imports':held_imports,'sources':s['sources'],'totals':s['totals'],'es_readback':s['es_readback'],'paid_manual_ai_calls':0};(r/'finalization-status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
files=['live-priority-progress.json','live-priority-es-live-readback.json','live-priority-combined-tests.tap','cached-breadcrumbs.json','coverage-report.json','site-coverage.csv','unconfirmed-branches.csv','held-backfill.csv','held-imports.csv','import-reconciliations.csv','hint-expansions.csv','rejected-or-unconfirmed-sections.csv','verified-sections.json','es-readback.json','primary-review-cleanup.json','transient-review-report.json','coordinator-status.json','finalization-status.json','hint-expansion-status.json','hint-expansion-progress.json','reviewed-breadcrumbs.json','manual-admission.json','manual-admission-final.json','maintenance-tests.tap','final-runtime-tests.tap','reviewed-recovery-tests.tap','review-hints-tests.tap','hint-frontier-tests.tap','summary.json']
with tarfile.open(r/'evidence-report.tar.gz','w:gz') as t:
 for name in files:
  if (r/name).exists():t.add(r/name,arcname=name)
user=os.environ.get('NEWS_CATEGORY_EXPORT_USER')
if user:
 account=pwd.getpwnam(user);dst=Path(account.pw_dir)/'.category-coverage-report-20261123.tar.gz';shutil.copyfile(r/'evidence-report.tar.gz',dst);dst.chmod(0o600);os.chown(dst,account.pw_uid,account.pw_gid)
print(json.dumps(status,ensure_ascii=False))
PY
