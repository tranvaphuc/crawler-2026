#!/bin/bash
set -euo pipefail
export NEWS_CATEGORY_AUDIT_ROOT=/var/lib/news-flow/category-coverage-20261123
cd /opt/news-flow/current
while true; do
 if systemctl is-active --quiet news-category-original-proof-20261123.service; then sleep 30; continue; fi
 /opt/news-flow/node/bin/node scripts/qualify_news_category_coverage.mjs
 /opt/news-flow/node/bin/node scripts/clean_news_category_false_positives.mjs
 /opt/news-flow/node/bin/node scripts/apply_news_category_coverage.mjs
 python3 scripts/report_news_category_coverage.py > "$NEWS_CATEGORY_AUDIT_ROOT/coordinator-report.log"
 if python3 - <<'PY'
import sqlite3,json,os
from pathlib import Path
r=Path(os.environ['NEWS_CATEGORY_AUDIT_ROOT']);a=sqlite3.connect('file:'+str(r/'audit.sqlite')+'?mode=ro',uri=True);apps=sqlite3.connect('file:'+str(r/'applications.sqlite')+'?mode=ro',uri=True);d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
apps.execute('ATTACH DATABASE ? AS scan',[str(r/'audit.sqlite')])
waiting=d.execute("SELECT count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.parse_status IN ('pending','queued','running')").fetchone()[0]
unconfirmed=d.execute('SELECT count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key LEFT JOIN import_receipts r ON r.id=c.es_id AND r.es_index=c.es_index WHERE a.parse_status=\'done\' AND r.id IS NULL').fetchone()[0]
held_imports=d.execute("SELECT count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key JOIN outbox o ON o.id=c.es_id WHERE a.parse_status='done' AND o.state='held'").fetchone()[0]
status={'audit_unfinished':a.execute("SELECT count(*) FROM pages WHERE state!='done'").fetchone()[0],'unadmitted_candidates':apps.execute('SELECT count(*) FROM scan.articles a LEFT JOIN article_applications p ON p.key=a.key WHERE p.key IS NULL').fetchone()[0],'waiting_backfill':waiting,'awaiting_import_confirmation':unconfirmed,'held_imports':held_imports}
status['complete']=status['audit_unfinished']==0 and status['unadmitted_candidates']==0 and waiting==0 and unconfirmed<=held_imports
(r/'coordinator-status.json').write_text(json.dumps(status,indent=2));print(json.dumps(status));raise SystemExit(0 if status['complete'] else 1)
PY
 then break; fi
 sleep 60
done
