set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --test test/news-reviewed-recovery.test.mjs test/news-original-reconciliation-read.test.mjs test/news-qdnd-seo-headline.test.mjs test/news-strict-publication.test.mjs test/news-structured-page-url.test.mjs test/news-native-id-redirect.test.mjs test/news-publisher-dispatch-redirect.test.mjs
python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
print('SEED_FAILURE_MARKERS',json.dumps([dict(r) for r in d.execute("SELECT url_key,site,role,reason,last_at FROM url_failures WHERE site IN ('tuyengiao.vn','voh.com.vn','dulich.thethaovanhoa.vn') AND role!='article'")]))
PY
