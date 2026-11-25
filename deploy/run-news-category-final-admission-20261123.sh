#!/bin/bash
set -euo pipefail
cd /opt/news-flow/current
while ! python3 - <<'PY'
import sqlite3
r='/var/lib/news-flow/category-coverage-20261123';a=sqlite3.connect('file:'+r+'/audit.sqlite?mode=ro',uri=True);p=sqlite3.connect('file:'+r+'/applications.sqlite?mode=ro',uri=True);p.execute('ATTACH DATABASE ? AS scan',[r+'/audit.sqlite'])
ready=not a.execute("SELECT 1 FROM pages WHERE state!='done' LIMIT 1").fetchone() and not p.execute('SELECT 1 FROM scan.articles a LEFT JOIN article_applications p ON p.key=a.key WHERE p.key IS NULL LIMIT 1').fetchone();raise SystemExit(0 if ready else 1)
PY
do sleep 30; done
/opt/news-flow/node/bin/node scripts/admit_news_category_backfill_20261123.mjs --final
