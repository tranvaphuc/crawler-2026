set -euo pipefail
systemctl start news-flow-import.service news-flow-parse.service news-flow-seed.service
systemctl is-active news-flow-seed.service news-flow-parse.service news-flow-import.service
python3 - <<'PY'
import sqlite3,json,pathlib,time,hashlib
url='https://suckhoecong.vn/nguyen-nhan-viem-hong-keo-dai-va-cach-khac-phuc-trieu-chung-viem-hong-d104794.html'
site='suckhoecong.vn'
root=pathlib.Path('/var/lib/news-flow/suckhoecong-targeted-retry-20261116');root.mkdir(exist_ok=True)
d=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite',timeout=30);d.row_factory=sqlite3.Row
d.execute('BEGIN IMMEDIATE')
try:
 rows=d.execute('SELECT * FROM article_links WHERE site=? AND url=?',(site,url)).fetchall();assert len(rows)==1,'TARGET_NOT_UNIQUE'
 row=dict(rows[0]);assert row['parse_status']=='fail','TARGET_NOT_FAILED'
 assert row['error'] in ['NEWS_PUBLICATION_OWNERSHIP_UNCONFIRMED','NEWS_ORIGINAL_PUBLICATION_QUARANTINED'],'UNEXPECTED_FAILURE'
 assert not d.execute("SELECT 1 FROM tasks WHERE url=? AND state IN ('pending','running')",(url,)).fetchone(),'TARGET_ALREADY_ACTIVE'
 receipts=[dict(r) for r in d.execute("SELECT * FROM import_receipts WHERE url LIKE 'https://suckhoecong.vn/%' ORDER BY id")]
 assert len(receipts)>=7978,'IMPORT_HISTORY_MISSING'
 history_hash=hashlib.sha256(json.dumps(receipts,sort_keys=True).encode()).hexdigest()
 done_before=d.execute("SELECT count(*) FROM article_links WHERE site=? AND parse_status='done'",(site,)).fetchone()[0]
 failure=[dict(r) for r in d.execute('SELECT * FROM url_failures WHERE site=? AND url_key=?',(site,url))]
 backup={'at':time.time(),'target':row,'failure':failure,'receiptsCount':len(receipts),'receiptsHash':history_hash,'doneBefore':done_before,'aiBefore':[dict(r) for r in d.execute('SELECT * FROM ai_usage ORDER BY day')]}
 (root/('before-'+str(time.time_ns())+'.json')).write_text(json.dumps(backup,ensure_ascii=False,indent=2))
 n=d.execute("UPDATE article_links SET parse_status='pending',error=NULL WHERE parse_key=? AND site=? AND url=? AND parse_status='fail'",(row['parse_key'],site,url)).rowcount
 assert n==1,'NOT_EXACTLY_ONE_REQUEUED'
 removed=d.execute('DELETE FROM url_failures WHERE site=? AND role=\'article\' AND url_key=?',(site,url)).rowcount
 assert d.execute("SELECT count(*) FROM article_links WHERE site=? AND parse_status='done'",(site,)).fetchone()[0]==done_before
 assert hashlib.sha256(json.dumps([dict(r) for r in d.execute("SELECT * FROM import_receipts WHERE url LIKE 'https://suckhoecong.vn/%' ORDER BY id")],sort_keys=True).encode()).hexdigest()==history_hash
 d.commit()
 print(json.dumps({'requeued':n,'url':url,'targetFailureRemoved':removed,'oldDoneUnchanged':done_before,'receiptsPreserved':len(receipts),'paidAiCalls':0}))
except:
 d.rollback();raise
finally:d.close()
PY
