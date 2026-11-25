set -euo pipefail
cd /opt/news-flow/current
date -u +%FT%TZ
for role in seed parse import; do
 systemctl show "news-flow-$role.service" -p Id -p ActiveState -p MainPID -p ExecMainStartTimestamp
done
/opt/news-flow/node/bin/node --input-type=module <<'JS'
import fs from 'node:fs/promises';
import {NewsRepairPool} from './src/web/newsRepairPool.mjs';
const config=JSON.parse(await fs.readFile('config/web-sources/news/suckhoecong.vn.json','utf8'));
config.publicationValidationPolicy='strict_native_publication_v1';
const pool=new NewsRepairPool(1,new URL('./src/web/newsDeepAuditWorker.mjs',import.meta.url));
try {
 const urls=['https://suckhoecong.vn/3-cach-giam-khan-tieng-tai-nha-cuc-hieu-qua-d103255.html','https://suckhoecong.vn/khan-tieng-tai-dien-4-nguyen-tac-cham-soc-thanh-quan-hieu-qua-d104790.html','https://suckhoecong.vn/thay-sua-bo-bang-sua-thuc-vat-co-the-gay-thieu-vi-chat-nghiem-trong-d104688.html'];
 for(let i=0;i<urls.length;i++){
  const html=await fs.readFile(`diagnostics/suckhoecong-time/sample-${i}.html`,'utf8');
  const r=await pool.run({sample:{domain:'suckhoecong.vn',url:urls[i],html,kind:'article'},config,learn:false});
  console.log(JSON.stringify({url:urls[i],parserError:r.error,publishedDate:r.parsed?._source.publishedDate,quality:r.quality,fieldIssues:r.fields?.issues}));
  if(r.error||r.quality?.length||r.fields?.issues?.length)process.exitCode=1;
 }
}finally{await pool.close();}
JS
python3 - <<'PY'
import sqlite3,datetime
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
print('RECENT_SOURCE_EVENTS',db.execute("SELECT at,kind,details FROM events WHERE site='suckhoecong.vn' ORDER BY id DESC LIMIT 3").fetchall())
print('SOURCE_ACTIVE_TASKS',db.execute("SELECT role,state,count(*) FROM tasks WHERE site='suckhoecong.vn' AND state IN ('pending','running') GROUP BY role,state").fetchall())
print('SOURCE_OUTBOX',db.execute("SELECT state,count(*) FROM outbox WHERE json_extract(doc,'$._source.siteName')='suckhoecong.vn' GROUP BY state").fetchall())
PY
