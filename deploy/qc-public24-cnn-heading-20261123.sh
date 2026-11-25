set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-public24-20261123
install -o root -g root -m 0600 "$upload_dir/.qc-public24-cnn-patch.py" "$root/cnn-patch.py"
python3 "$root/cnn-patch.py"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-public24-cnn-heading.mjs" "$root/cnn-heading.mjs"
cd /opt/news-flow/current
cp test/news-cnn-lite.test.mjs "$root/cnn-test-before.mjs"
rollback() {
  python3 - <<'PY'
import hashlib,json
from pathlib import Path
root=Path('/var/lib/news-flow/qc-public24-20261123'); m=json.loads((root/'cnn-helper-manifest.json').read_text()); p=Path(m['path'])
if hashlib.sha256(p.read_bytes()).hexdigest()==m['afterSha']:p.write_bytes(Path(m['backup']).read_bytes())
Path('/opt/news-flow/current/test/news-cnn-lite.test.mjs').write_bytes((root/'cnn-test-before.mjs').read_bytes())
PY
  systemctl start news-flow-seed news-flow-parse
}
trap rollback EXIT
systemctl stop news-flow-seed news-flow-parse
python3 - <<'PY'
import hashlib,json
from pathlib import Path
m=json.loads(Path('/var/lib/news-flow/qc-public24-20261123/cnn-helper-manifest.json').read_text()); p=Path(m['path']); new=Path(m['candidate']).read_bytes()
assert hashlib.sha256(p.read_bytes()).hexdigest()==m['beforeSha']
assert hashlib.sha256(new).hexdigest()==m['afterSha']
p.write_bytes(new)
PY
install -o news-flow -g news-flow -m 0640 "$upload_dir/.qc-public24-cnn-test.mjs" test/news-cnn-lite.test.mjs
/opt/news-flow/node/bin/node --test test/news-cnn-lite.test.mjs test/news-structured-page-url.test.mjs test/news-strict-publication.test.mjs test/configurable-news-parser.test.mjs test/news-publication-adapter-identity.test.mjs test/news-tieudungplus-mobile.test.mjs test/news-original-publication-contract.test.mjs test/news-three-flow.test.mjs test/news-flow-durable-completion.test.mjs > "$root/tests-vps.txt" 2>&1
tail -n 9 "$root/tests-vps.txt"
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/cnn-heading.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
for name in tests-vps.txt cnn-helper-manifest.json cnn-heading-recovery.json; do install -o "$SUDO_USER" -m 0600 "$root/$name" "$upload_dir/.qc-public24-$name"; done
