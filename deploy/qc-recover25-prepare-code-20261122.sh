set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-recover25-20261122
install -d -o root -g root -m 0700 "$root/code-before" "$root/code-candidate"
install -o root -g root -m 0600 "$upload_dir/.qc-recover25-integration.py" "$root/integration.py"
python3 "$root/integration.py" /opt/news-flow/current "$root/code-candidate"
install -o root -g root -m 0600 "$upload_dir/.qc-recover25-cnn-lite.mjs" "$root/code-candidate/newsCnnLite.mjs"
install -o news-flow -g news-flow -m 0640 "$upload_dir/.qc-recover25-cnn-test.mjs" /opt/news-flow/current/test/news-cnn-lite.test.mjs
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';const root='/var/lib/news-flow/qc-recover25-20261122',manifest=JSON.parse(fs.readFileSync(root+'/code-candidate/manifest.json')),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});try{for(const f of manifest)fs.copyFileSync(f.file,root+'/code-before/'+f.file.split('/').at(-1));fs.writeFileSync(root+'/code-before/ledger.json',JSON.stringify(db.prepare('SELECT * FROM ai_usage ORDER BY day').all()));}finally{db.close();}
NODE
