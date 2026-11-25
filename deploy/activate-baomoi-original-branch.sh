set -euo pipefail
umask 077
previous=/opt/news-flow/releases/20261119-baomoi-remaining-08b
release=/opt/news-flow/releases/20261120-baomoi-original-03
test "$(readlink -f /opt/news-flow/current)" = "$previous"
cd "$release"
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 644 "$upload_dir/.bootstrap-baomoi-original.mjs" scripts/bootstrap_baomoi_original_branch.mjs
python3 - <<'PY'
import json
p=json.load(open('/var/lib/news-flow/baomoi-original-branch-20261120/preflight.json'))
assert p['paidAiCalls']==0 and p['esWrites']==0
passed={r['host'] for r in p['results'] if r['approved']}
assert {'petrovietnam.petrotimes.vn','xahoi.congly.vn'} <= passed
PY
systemctl stop news-flow-seed.service news-flow-parse.service
restore_on_failure(){ systemctl stop news-flow-baomoi-original.service || true; ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow-seed.service news-flow-parse.service; }
trap restore_on_failure ERR
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/bootstrap_baomoi_original_branch.mjs
install -m 644 deploy/news-flow-baomoi-original.service /etc/systemd/system/news-flow-baomoi-original.service
ln -sfn "$release" /opt/news-flow/current
systemctl daemon-reload
systemctl start news-flow-seed.service news-flow-parse.service
systemctl enable --now news-flow-baomoi-original.service
systemctl is-active news-flow-seed.service news-flow-parse.service news-flow-import.service news-flow-baomoi-original.service
trap - ERR
readlink -f /opt/news-flow/current
