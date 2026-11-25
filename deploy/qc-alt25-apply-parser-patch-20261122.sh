set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-alt25-20261122
cd /opt/news-flow/current
restore_on_failure() {
 if test "${applied:-0}" = 1; then
  ROOT="$root" /opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {createHash} from 'node:crypto';const sha=x=>createHash('sha256').update(x).digest('hex'),r=JSON.parse(fs.readFileSync(process.env.ROOT+'/parser-patch-plan.json'));for(const f of r.files){const current=sha(fs.readFileSync(f.file));if(current===f.beforeSha)continue;if(current!==f.afterSha){console.error('ROLLBACK_SKIPPED_CONCURRENT_CHANGE:'+f.file);continue;}const st=fs.statSync(f.file),temp=f.file+'.qc-alt25-rollback';fs.copyFileSync(f.backup,temp);fs.chmodSync(temp,st.mode&0o777);fs.chownSync(temp,st.uid,st.gid);fs.renameSync(temp,f.file);}
NODE
 fi
 systemctl start news-flow-seed news-flow-parse
}
trap restore_on_failure EXIT
systemctl stop news-flow-seed news-flow-parse
applied=1
ROOT="$root" /opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';const root=process.env.ROOT,sha=x=>createHash('sha256').update(x).digest('hex'),r=JSON.parse(fs.readFileSync(root+'/parser-patch-plan.json')),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});try{for(const f of r.files){assert.equal(sha(fs.readFileSync(f.file)),f.beforeSha);assert.equal(sha(fs.readFileSync(f.candidate)),f.afterSha);}fs.writeFileSync(root+'/parser-apply-before.json',JSON.stringify({at:new Date().toISOString(),aiUsage:db.prepare('SELECT * FROM ai_usage ORDER BY day').all()}));for(const f of r.files){const st=fs.statSync(f.file),temp=f.file+'.qc-alt25-tmp';fs.copyFileSync(f.candidate,temp);fs.chmodSync(temp,st.mode&0o777);fs.chownSync(temp,st.uid,st.gid);fs.renameSync(temp,f.file);}}finally{db.close();}
NODE
/opt/news-flow/node/bin/node --test test/news-structured-page-url.test.mjs test/news-strict-publication.test.mjs test/configurable-news-parser.test.mjs test/news-publication-adapter-identity.test.mjs test/news-tieudungplus-mobile.test.mjs test/news-original-publication-contract.test.mjs > "$root/parser-after-tests.txt" 2>&1
tail -n 9 "$root/parser-after-tests.txt"
systemctl start news-flow-seed news-flow-parse
applied=0
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/parser-after-tests.txt" "$upload_dir/.qc-alt25-parser-after-tests.txt"
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id,MainPID,ActiveState,NRestarts
