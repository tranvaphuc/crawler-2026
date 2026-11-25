set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-recover25-20261122
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
NEW_HELPER="$upload_dir/.qc-recover25-cnn-lite-v2.mjs" /opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';const root='/var/lib/news-flow/qc-recover25-20261122',file='src/web/newsCnnLite.mjs',sha=x=>createHash('sha256').update(x).digest('hex');assert.equal(sha(fs.readFileSync(file)),sha(fs.readFileSync(root+'/code-candidate/newsCnnLite.mjs')));fs.copyFileSync(file,root+'/newsCnnLite-before-refinement.mjs');fs.copyFileSync(process.env.NEW_HELPER,file+'.qc-tmp');fs.chmodSync(file+'.qc-tmp',0o644);fs.renameSync(file+'.qc-tmp',file);
NODE
install -o news-flow -g news-flow -m 0640 "$upload_dir/.qc-recover25-cnn-test-v2.mjs" test/news-cnn-lite.test.mjs
if ! /opt/news-flow/node/bin/node --test test/news-cnn-lite.test.mjs test/news-structured-page-url.test.mjs test/news-strict-publication.test.mjs test/configurable-news-parser.test.mjs test/news-publication-adapter-identity.test.mjs test/news-tieudungplus-mobile.test.mjs test/news-original-publication-contract.test.mjs test/news-three-flow.test.mjs test/news-flow-durable-completion.test.mjs > "$root/tests-vps.txt" 2>&1; then
 cp "$root/newsCnnLite-before-refinement.mjs" src/web/newsCnnLite.mjs
 exit 1
fi
tail -n 9 "$root/tests-vps.txt"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/tests-vps.txt" "$upload_dir/.qc-recover25-tests-vps.txt"
