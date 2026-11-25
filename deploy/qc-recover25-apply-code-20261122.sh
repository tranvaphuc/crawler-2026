set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-recover25-20261122
cd /opt/news-flow/current
rollback() {
 /opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {createHash} from 'node:crypto';const root='/var/lib/news-flow/qc-recover25-20261122',sha=x=>createHash('sha256').update(x).digest('hex'),manifest=JSON.parse(fs.readFileSync(root+'/code-candidate/manifest.json'));for(const f of manifest){if(sha(fs.readFileSync(f.file))!==f.afterSha)continue;const st=fs.statSync(f.file);fs.copyFileSync(root+'/code-before/'+f.file.split('/').at(-1),f.file);fs.chmodSync(f.file,st.mode&0o777);fs.chownSync(f.file,st.uid,st.gid);}
NODE
 systemctl start news-flow-seed news-flow-parse
}
trap rollback EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';const root='/var/lib/news-flow/qc-recover25-20261122',sha=x=>createHash('sha256').update(x).digest('hex'),manifest=JSON.parse(fs.readFileSync(root+'/code-candidate/manifest.json'));for(const f of manifest){assert.equal(sha(fs.readFileSync(f.file)),f.beforeSha);assert.equal(sha(fs.readFileSync(f.candidate)),f.afterSha);}for(const f of manifest){const st=fs.statSync(f.file),temp=f.file+'.qc-recover25-tmp';fs.copyFileSync(f.candidate,temp);fs.chmodSync(temp,st.mode&0o777);fs.chownSync(temp,st.uid,st.gid);fs.renameSync(temp,f.file);}fs.copyFileSync(root+'/code-candidate/newsCnnLite.mjs','src/web/newsCnnLite.mjs');fs.chmodSync('src/web/newsCnnLite.mjs',0o644);
NODE
/opt/news-flow/node/bin/node --test test/news-cnn-lite.test.mjs test/news-structured-page-url.test.mjs test/news-strict-publication.test.mjs test/configurable-news-parser.test.mjs test/news-publication-adapter-identity.test.mjs test/news-tieudungplus-mobile.test.mjs test/news-original-publication-contract.test.mjs test/news-three-flow.test.mjs test/news-flow-durable-completion.test.mjs > "$root/tests-vps.txt" 2>&1
tail -n 9 "$root/tests-vps.txt"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/tests-vps.txt" "$upload_dir/.qc-recover25-tests-vps.txt"
