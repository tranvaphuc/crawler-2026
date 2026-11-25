set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
stage=/var/lib/news-flow/category-runtime-stage-20261123
base=$(readlink -f /opt/news-flow/current)
python3 - "$upload_dir/.category-health.tar.gz" "$base" "$stage" <<'PY'
import sys,json,hashlib,tarfile
from pathlib import Path
bundle,base,stage=map(Path,sys.argv[1:])
with tarfile.open(bundle) as t:
 for item in json.load(t.extractfile('health-patch.json')):
  if hashlib.sha256((base/item['path']).read_text().encode()).hexdigest()!=item['beforeSha']:raise RuntimeError('LIVE_BASE_CHANGED:'+item['path'])
  (stage/item['path']).write_bytes(t.extractfile(item['path']).read())
 (stage/'test/news-discovery-health.test.mjs').write_bytes(t.extractfile('test/news-discovery-health.test.mjs').read())
PY
cd "$stage"
/opt/news-flow/node/bin/node --test test/news-discovery-health.test.mjs test/news-category-coverage.test.mjs test/news-parser-throughput.test.mjs > health-tests.tap 2>&1
tail -n 12 health-tests.tap
systemctl stop news-flow-seed
trap 'systemctl start news-flow-seed' EXIT
python3 - "$upload_dir/.category-health.tar.gz" "$base" <<'PY'
import sys,json,hashlib,tarfile,shutil
from pathlib import Path
bundle,base=map(Path,sys.argv[1:])
with tarfile.open(bundle) as t:
 items=json.load(t.extractfile('health-patch.json'))
 for item in items:
  if hashlib.sha256((base/item['path']).read_text().encode()).hexdigest()!=item['beforeSha']:raise RuntimeError('LIVE_BASE_CHANGED:'+item['path'])
 for item in items:
  dst=base/item['path'];backup=dst.with_name(dst.name+'.before-category-health-20261123');shutil.copy2(dst,backup);dst.write_bytes(t.extractfile(item['path']).read())
 (base/'test/news-discovery-health.test.mjs').write_bytes(t.extractfile('test/news-discovery-health.test.mjs').read())
PY
systemctl start news-flow-seed
trap - EXIT
systemctl is-active news-flow-seed news-flow-parse news-flow-import
