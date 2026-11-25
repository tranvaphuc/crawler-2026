set -euo pipefail
python3 - <<'PY'
import sqlite3,json
r='/var/lib/news-flow/category-coverage-20261123';d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.execute('ATTACH DATABASE ? AS reviewed',['file:'+r+'/transient-reviews-v2.sqlite?mode=ro']);d.row_factory=sqlite3.Row
reasons=['NETWORK_POOL_CLOSED','NETWORK_POOL_FAILED','NETWORK_WORKER_FAILED','service_interrupted_no_retry','request_deadline_exceeded','ECONNRESET','rate_limited']
sql="SELECT a.site,a.error,count(*) n FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.parse_status='fail' AND a.error IN ("+','.join('?' for _ in reasons)+") AND NOT EXISTS(SELECT 1 FROM reviewed.reviews r WHERE r.parse_key=a.parse_key) GROUP BY 1,2"
print(json.dumps({'remainingFreshChecks':[dict(x) for x in d.execute(sql,reasons)]}))
PY
