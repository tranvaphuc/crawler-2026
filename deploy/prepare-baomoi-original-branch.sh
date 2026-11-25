set -euo pipefail
umask 077
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
previous=/opt/news-flow/releases/20261119-baomoi-remaining-08b
release=/opt/news-flow/releases/20261120-baomoi-original-03
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test ! -e "$release"
stage=$(mktemp -d /var/lib/news-flow/baomoi-original-stage.XXXXXX)
tar -xzf "$upload_dir/.baomoi-original-branch-patch.tgz" -C "$stage"
cp -a "$previous" "$release"
python3 - "$release" "$stage" <<'PY'
import sys,json,hashlib,shutil
from pathlib import Path
release,stage=map(Path,sys.argv[1:])
for change in json.loads((stage/'outputs/baomoi-original-branch-manifest.json').read_text()):
 p=release/change['file']
 assert hashlib.sha256(p.read_bytes()).hexdigest()==change['sha256'],change['file']
 s=p.read_text()
 for a,b in change['replacements']:
  assert s.count(a)==1,(change['file'],a)
  s=s.replace(a,b)
 p.write_text(s)
for directory in ['src/newsFlow','src/web','scripts','test','deploy']:
 for p in (stage/directory).glob('*'):
  if p.is_file():
   target=release/directory/p.name
   target.parent.mkdir(parents=True,exist_ok=True)
   shutil.copyfile(p,target)
   target.chmod(0o644)
PY
mkdir -p /var/lib/news-flow/baomoi-original-branch-20261120
chown news-flow:news-flow /var/lib/news-flow/baomoi-original-branch-20261120
cd "$release"
/opt/news-flow/node/bin/node --test test/news-baomoi-original-branch.test.mjs test/news-xahoi-original-clock.test.mjs test/news-baomoi-original-link.test.mjs test/news-source-qualification.test.mjs test/news-three-flow.test.mjs test/news-publisher-url-scopes.test.mjs test/source-exclusions.test.mjs > /var/lib/news-flow/baomoi-original-branch-20261120/server-tests.tap 2>&1 || { tail -n 55 /var/lib/news-flow/baomoi-original-branch-20261120/server-tests.tap; exit 1; }
tail -n 9 /var/lib/news-flow/baomoi-original-branch-20261120/server-tests.tap
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/audit_baomoi_original_branch.mjs > /var/lib/news-flow/baomoi-original-branch-20261120/preflight.log 2>&1 || { tail -n 35 /var/lib/news-flow/baomoi-original-branch-20261120/preflight.log; exit 1; }
tail -n 6 /var/lib/news-flow/baomoi-original-branch-20261120/preflight.log
