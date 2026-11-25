set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/stability-20261123
install -o root -g root -m 0700 -d "$root/code-before"
cp /opt/news-flow/current/scripts/run_baomoi_original_branch.mjs "$root/code-before/original-runner.mjs"
install -o news-flow -g news-flow -m 0644 "$upload_dir/.qc-stability-original-read.mjs" /opt/news-flow/current/src/newsFlow/originalReconciliationRead.mjs
install -o news-flow -g news-flow -m 0644 "$upload_dir/.qc-stability-original-read-test.mjs" /opt/news-flow/current/test/news-original-reconciliation-read.test.mjs
python3 - <<'PY'
import hashlib,json,os
from pathlib import Path
p=Path('/opt/news-flow/current/scripts/run_baomoi_original_branch.mjs');raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()=='b15ae4c8e799ad2804520c9961929b5102f6cb50e2c7c5afbb3e9d85ba7d3aeb';s=raw.decode();eol='\r\n' if b'\r\n' in raw else '\n'
anchor="import {articleKey} from '../src/newsFlow/identity.mjs';";assert s.count(anchor)==1;s=s.replace(anchor,anchor+eol+"import {reconcileOriginalArticlesWhenAvailable} from '../src/newsFlow/originalReconciliationRead.mjs';")
old='await reconcileOriginalArticles(state,registry,es);';assert s.count(old)==2;s=s.replace(old,"if(!await reconcileOriginalArticlesWhenAvailable(state,registry,es,{onDeferred:report})){if(!once&&!stopped)await wait(10000);continue;}")
new=s.encode();st=p.stat();temp=p.with_suffix('.mjs.qc-stability');temp.write_bytes(new);os.chmod(temp,st.st_mode);os.chown(temp,st.st_uid,st.st_gid);os.replace(temp,p)
Path('/var/lib/news-flow/stability-20261123/news-code-deployment.json').write_text(json.dumps({'file':str(p),'beforeSha':hashlib.sha256(raw).hexdigest(),'afterSha':hashlib.sha256(new).hexdigest()},indent=2))
PY
cd /opt/news-flow/current
if ! /opt/news-flow/node/bin/node --test test/news-original-reconciliation-read.test.mjs test/news-baomoi-original-branch.test.mjs test/news-baomoi-original-link.test.mjs > "$root/tests-news-vps.txt" 2>&1; then
  cp "$root/code-before/original-runner.mjs" scripts/run_baomoi_original_branch.mjs
  tail -n 24 "$root/tests-news-vps.txt"
  exit 1
fi
tail -n 9 "$root/tests-news-vps.txt"
systemctl restart news-flow-baomoi-original
systemctl is-active news-flow-baomoi-original
for name in news-code-deployment.json tests-news-vps.txt; do install -o "$SUDO_USER" -m 0600 "$root/$name" "$upload_dir/.qc-stability-$name"; done
