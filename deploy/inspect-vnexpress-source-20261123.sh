set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
console.log(JSON.stringify({seeds:db.prepare('SELECT * FROM seed_sources WHERE site=?').all('vnexpress.net')}));
console.log(JSON.stringify({articles:db.prepare('SELECT parse_status,error,count(*) n FROM article_links WHERE site=? GROUP BY 1,2').all('vnexpress.net')}));
console.log(JSON.stringify({overlay:db.prepare('SELECT * FROM parser_overlays WHERE site=?').get('vnexpress.net')}));
console.log(JSON.stringify({tables:db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('tasks','events','outbox','failed_urls','import_receipts')").all()}));db.close();
NODE
