set -euo pipefail
umask 077
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
previous=/opt/news-flow/releases/20261120-baomoi-original-03
release=/opt/news-flow/releases/20261120-camau-original-01
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test ! -e "$release"
stage=$(mktemp -d /var/lib/news-flow/camau-stage.XXXXXX)
tar -xzf "$upload_dir/.camau-patch-20261120.tgz" -C "$stage"
cp -a "$previous" "$release"
python3 - "$release" "$stage" <<'PY'
from pathlib import Path
import sys,json,hashlib,shutil
release,stage=map(Path,sys.argv[1:])
for change in json.loads((stage/'outputs/camau-patch-manifest.json').read_text()):
 p=release/change['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==change['sha256'],change['file']
 s=p.read_text()
 for a,b in change['replacements']:
  assert s.count(a)==1
  s=s.replace(a,b)
 p.write_text(s)
for directory in ['src/web','scripts','test']:
 for source in (stage/directory).glob('*'):
  target=release/directory/source.name;shutil.copyfile(source,target);target.chmod(0o644)
PY
cd "$release"
/opt/news-flow/node/bin/node --test test/news-camau-original.test.mjs test/news-native-video-empty-description.test.mjs test/news-baomoi-remaining.test.mjs test/news-baomoi-original-branch.test.mjs test/news-strict-publication.test.mjs test/news-user-confirmed-timezone.test.mjs > /var/lib/news-flow/baocamau-remaining-20261120/server-tests.tap 2>&1 || { tail -n 45 /var/lib/news-flow/baocamau-remaining-20261120/server-tests.tap; exit 1; }
tail -n 9 /var/lib/news-flow/baocamau-remaining-20261120/server-tests.tap
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/verify_camau_candidate_20261120.mjs
