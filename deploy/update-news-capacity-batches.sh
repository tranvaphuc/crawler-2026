#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261114-09
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261114-08
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-flow-release-20261113.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
export PATH=/opt/news-flow/node/bin:$PATH
for unchanged in package.json src/newsFlow/state.mjs src/newsFlow/transport.mjs src/newsFlow/identity.mjs src/newsFlow/threeFlowProcessor.mjs src/newsFlow/threeFlowReview.mjs src/newsFlow/es5.mjs src/newsFlow/createOnlySink.mjs src/newsFlow/writerRuntime.mjs; do cmp -s "$previous/$unchanged" "$release/$unchanged"; done
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/capacity-master-tests.tap 2>&1"; then
 tail -n 80 /var/lib/news-flow/capacity-master-tests.tap
 exit 1
fi
tail -n 9 /var/lib/news-flow/capacity-master-tests.tap
python3 - <<'PY'
from pathlib import Path
c=dict(l.split('=',1) for l in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in l)
assert float(c['AI_DAILY_BUDGET_USD'].strip('"'))==2
assert int(c['AI_DAILY_MAX_CALLS'].strip('"'))==200
print('AI_SHARED_BUDGET_AND_CALL_LIMIT_PRESERVED')
PY
backup=/var/lib/news-flow/diagnostics/capacity-before-20261114-09
test ! -e "$backup"
install -d -o root -g root -m 700 "$backup"
for unit in news-flow.slice news-flow-seed.service news-flow-parse.service news-flow-import.service; do
 cp -p "/etc/systemd/system/$unit" "$backup/$unit"
done
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
systemctl stop news-flow-seed.service news-flow-parse.service
rollback(){
 systemctl stop news-flow-seed.service news-flow-parse.service || true
 for unit in news-flow.slice news-flow-seed.service news-flow-parse.service news-flow-import.service; do install -o root -g root -m 644 "$backup/$unit" "/etc/systemd/system/$unit"; done
 systemctl daemon-reload
 systemctl set-property --runtime news-flow.slice CPUQuota=400% MemoryMax=4G
 ln -sfn "$previous" /opt/news-flow/current
 systemctl start news-flow-seed.service news-flow-parse.service
}
trap rollback ERR
for unit in news-flow.slice news-flow-seed.service news-flow-parse.service news-flow-import.service; do install -o root -g root -m 644 "$upload_dir/.$unit" "/etc/systemd/system/$unit"; done
systemd-analyze verify /etc/systemd/system/news-flow-seed.service /etc/systemd/system/news-flow-parse.service /etc/systemd/system/news-flow-import.service
systemctl daemon-reload
systemctl set-property --runtime news-flow.slice CPUQuota=800% MemoryMax=8G
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-seed.service news-flow-parse.service
for name in seed parse import; do systemctl is-active --quiet "news-flow-$name.service"; done
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
systemctl show news.slice news-flow.slice -p Id -p CPUQuotaPerSecUSec -p MemoryMax -p MemoryCurrent
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p SubState -p NRestarts -p MemoryMax -p CPUQuotaPerSecUSec
trap - ERR
rm -f -- "$upload_dir/.news-flow-release-20261113.tar.gz"
echo NEWS_64_32_8CPU_8GB_AND_BOUNDED_MASTER_DEPLOYED
