set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
stage=/var/lib/news-flow/category-runtime-stage-20261123
services_stopped=0
trap 'if [ "$services_stopped" = 1 ]; then systemctl start news-flow-seed news-flow-parse; fi' EXIT
install -d -m 0755 "$stage"
python3 - "$upload_dir/.category-runtime.tar.gz" "$base" "$stage" <<'PY'
import sys,json,hashlib,tarfile,shutil,os
from pathlib import Path
bundle,base,stage=Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3])
with tarfile.open(bundle) as t:
 data=json.load(t.extractfile('runtime-patch.json'))
 for item in data:
  actual=hashlib.sha256((base/item['path']).read_text().encode()).hexdigest()
  if actual!=item['beforeSha']:raise RuntimeError('LIVE_BASE_CHANGED:'+item['path'])
 shutil.copytree(base/'src',stage/'src',dirs_exist_ok=True)
 shutil.copytree(base/'test',stage/'test',dirs_exist_ok=True)
 for name in ['node_modules','config','scripts']:
  if not (stage/name).exists():(stage/name).symlink_to(base/name,target_is_directory=True)
 shutil.copyfile(base/'package.json',stage/'package.json')
 for item in data:(stage/item['path']).write_text(item['after'])
 for member in ['src/newsFlow/categoryCoverage.mjs','src/newsFlow/categoryCoverageWorker.mjs','test/news-category-coverage.test.mjs']:
  (stage/member).write_bytes(t.extractfile(member).read())
 (stage/'runtime-patch.json').write_text(json.dumps(data))
PY
cd "$stage"
/opt/news-flow/node/bin/node --test test/news-category-coverage.test.mjs test/news-three-flow.test.mjs test/news-flow-durable-completion.test.mjs test/news-parser-throughput.test.mjs test/news-strict-publication.test.mjs > "$stage/tests.tap" 2>&1
tail -n 12 "$stage/tests.tap"
systemctl stop news-flow-seed news-flow-parse
services_stopped=1
python3 - "$upload_dir/.category-runtime.tar.gz" "$base" "$stage" <<'PY'
import sys,json,hashlib,tarfile,shutil,os
from pathlib import Path
bundle,base,stage=map(Path,sys.argv[1:]);data=json.loads((stage/'runtime-patch.json').read_text())
for item in data:
 if hashlib.sha256((base/item['path']).read_text().encode()).hexdigest()!=item['beforeSha']:raise RuntimeError('LIVE_BASE_CHANGED:'+item['path'])
backup=stage/'backup';backup.mkdir(exist_ok=True)
for item in data:
 dst=base/item['path'];saved=backup/item['path'];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dst,saved)
 temp=dst.with_name(dst.name+'.category.tmp');temp.write_text(item['after']);temp.chmod(0o644);temp.replace(dst)
with tarfile.open(bundle) as t:
 for name in ['src/newsFlow/categoryCoverage.mjs','src/newsFlow/categoryCoverageWorker.mjs','scripts/apply_news_category_coverage.mjs','test/news-category-coverage.test.mjs']:
  dst=base/name;dst.write_bytes(t.extractfile(name).read());dst.chmod(0o644)
print('CATEGORY_HINTS_AND_BACKFILL_TRACKING_INSTALLED')
PY
systemctl start news-flow-seed news-flow-parse
services_stopped=0
systemctl is-active news-flow-seed news-flow-parse news-flow-import
