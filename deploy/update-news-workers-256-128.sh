#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=$(readlink -f /opt/news-flow/current)
release=/opt/news-flow/releases/20261114-17
test "$previous" = /opt/news-flow/releases/20261114-16
test ! -e "$release"
test "$(nproc)" -ge 24
python3 - <<'PY'
from pathlib import Path
mem=dict((k,int(v.split()[0])) for k,v in (l.split(':',1) for l in Path('/proc/meminfo').read_text().splitlines()))
assert mem['MemAvailable'] >= 20*1024*1024, 'INSUFFICIENT_HOST_MEMORY_FOR_WORKER_SCALE'
PY
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
test "$writer_pid" -gt 0
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-flow-workers-256-128.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
python3 - "$previous" "$release" <<'PY'
import sys,hashlib
from pathlib import Path
a,b=map(Path,sys.argv[1:]);changes={'src/newsFlow/threeFlowCapacity.mjs':[('n1>128','n1>256'),('articleHtmlWorkers:Math.min(4,','articleHtmlWorkers:Math.min(8,'),('parserWorkers:Math.min(8,','parserWorkers:Math.min(16,')],'src/newsFlow/networkPool.mjs':[('workers>8','workers>16')],'src/newsFlow/seedDiscoveryPool.mjs':[('maxQueue:128','maxQueue:256')],'src/newsFlow/threeFlowRuntime.mjs':[('workers>128','workers>256')]}
def manifest(root):
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['src/newsFlow','src/web','config/web-sources'] for p in (root/folder).rglob('*') if p.is_file() and str(p.relative_to(root)) not in changes}
assert manifest(a)==manifest(b), 'UNEXPECTED_FLOW_OR_PARSER_CHANGE'
for name,replacements in changes.items():
 expected=(a/name).read_text()
 for old,new in replacements:
  assert old in expected
  expected=expected.replace(old,new)
 assert expected==(b/name).read_text(), 'CHANGE_BEYOND_WORKER_LIMITS: '+name
assert (a/'package.json').read_bytes()==(b/'package.json').read_bytes()
c=dict(l.split('=',1) for l in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in l)
assert float(c['AI_DAILY_BUDGET_USD'].strip('"'))==2
assert int(c['AI_DAILY_MAX_CALLS'].strip('"'))==200
print('ONLY_WORKER_CAPACITY_LIMITS_CHANGED_AI_BUDGET_PRESERVED')
PY
export PATH=/opt/news-flow/node/bin:$PATH
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/worker-scale-256-128-tests.tap 2>&1"; then
 tail -n 90 /var/lib/news-flow/worker-scale-256-128-tests.tap
 exit 1
fi
tail -n 9 /var/lib/news-flow/worker-scale-256-128-tests.tap
backup=/var/lib/news-flow/diagnostics/workers-before-20261114-17
test ! -e "$backup"
install -d -o root -g root -m 700 "$backup"
for role in seed parse; do cp -p "/etc/systemd/system/news-flow-$role.service" "$backup/news-flow-$role.service"; done
cp -p /etc/systemd/system/news-flow.slice "$backup/news-flow.slice"
rollback(){
 trap - ERR
 systemctl stop news-flow-seed.service news-flow-parse.service || true
 for role in seed parse; do install -o root -g root -m 644 "$backup/news-flow-$role.service" "/etc/systemd/system/news-flow-$role.service"; done
 install -o root -g root -m 644 "$backup/news-flow.slice" /etc/systemd/system/news-flow.slice
 ln -sfn "$previous" /opt/news-flow/current
 systemctl daemon-reload
 systemctl set-property news-flow.slice CPUQuota=1600% MemoryMax=16G
 systemctl start news-flow-seed.service news-flow-parse.service
}
trap rollback ERR
systemctl stop news-flow-seed.service news-flow-parse.service
for role in seed parse; do install -o root -g root -m 644 "$upload_dir/.news-workers-$role.service" "/etc/systemd/system/news-flow-$role.service"; done
install -o root -g root -m 644 "$upload_dir/.news-workers.slice" /etc/systemd/system/news-flow.slice
systemd-analyze verify /etc/systemd/system/news-flow-seed.service /etc/systemd/system/news-flow-parse.service /etc/systemd/system/news-flow.slice
ln -sfn "$release" /opt/news-flow/current
systemctl daemon-reload
systemctl set-property news-flow.slice CPUQuota=2000% MemoryMax=24G
systemctl start news-flow-seed.service news-flow-parse.service
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
test "$(systemctl show news-flow.slice -p CPUQuotaPerSecUSec --value)" = 20s
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p NRestarts -p CPUQuotaPerSecUSec -p MemoryMax
systemctl show news-flow.slice -p CPUQuotaPerSecUSec -p MemoryMax
trap - ERR
rm -f -- "$upload_dir/.news-flow-workers-256-128.tar.gz"
echo WORKERS_256_128_DEPLOYED_IMPORTER_PID_PRESERVED
