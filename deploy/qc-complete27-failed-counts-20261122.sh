set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});try{console.log(JSON.stringify(db.prepare("SELECT site,parse_status,count(*) n FROM article_links WHERE site IN ('molistar.com','saoexpress.vn') GROUP BY site,parse_status").all()));}finally{db.close();}
NODE
