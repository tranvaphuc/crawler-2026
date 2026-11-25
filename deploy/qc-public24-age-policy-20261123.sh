set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';const root='/var/lib/news-flow/qc-public24-20261123',runner=fs.readFileSync('scripts/run_news_three_flow.mjs','utf8'),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),r={at:new Date().toISOString(),productionProcessor:runner.match(/const processor=new ThreeFlowProcessor\([^\n]+/)?.[0],qcSkipped:db.prepare("SELECT site,url,parse_key,task_id,error,first_at FROM article_links WHERE site IN ('tieudungso.vn','edition.cnn.com') AND parse_status='skipped' AND error LIKE 'outside_new_article_window%'").all()};db.close();fs.writeFileSync(root+'/age-policy.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));
NODE
