#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=$(readlink -f /opt/news-flow/current)
release=/opt/news-flow/releases/20261114-15
test "$previous" = /opt/news-flow/releases/20261114-14
test ! -e "$release"
test -x /usr/bin/flock
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-flow-release-20261113.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
for unchanged in package.json src/newsFlow/state.mjs src/newsFlow/httpRequest.mjs src/newsFlow/networkWorker.mjs src/newsFlow/networkPool.mjs src/newsFlow/identity.mjs src/newsFlow/threeFlowProcessor.mjs src/newsFlow/threeFlowReview.mjs src/newsFlow/es5.mjs src/newsFlow/createOnlySink.mjs; do cmp -s "$previous/$unchanged" "$release/$unchanged"; done
export PATH=/opt/news-flow/node/bin:$PATH
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/sqlite-lease-throughput-tests.tap 2>&1"; then
 tail -n 90 /var/lib/news-flow/sqlite-lease-throughput-tests.tap
 exit 1
fi
tail -n 9 /var/lib/news-flow/sqlite-lease-throughput-tests.tap
echo BENCHMARKING_FULL_ADMISSION_WITH_INDEPENDENT_WRITER
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; node --max-old-space-size=512 scripts/benchmark_news_master.mjs 366705 > /var/lib/news-flow/sqlite-lease-master-benchmark.json"; then
 cat /var/lib/news-flow/sqlite-lease-master-benchmark.json
 exit 1
fi
cat /var/lib/news-flow/sqlite-lease-master-benchmark.json
python3 - <<'PY'
from pathlib import Path
c=dict(l.split('=',1) for l in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in l)
assert float(c['AI_DAILY_BUDGET_USD'].strip('"'))==2
assert int(c['AI_DAILY_MAX_CALLS'].strip('"'))==200
print('AI_SHARED_BUDGET_AND_CALL_LIMIT_PRESERVED')
PY
backup=/var/lib/news-flow/diagnostics/sqlite-lease-before-20261114-15
test ! -e "$backup"
install -d -o root -g root -m 700 "$backup"
for role in seed parse import; do cp -p "/etc/systemd/system/news-flow-$role.service" "$backup/news-flow-$role.service"; done
systemctl stop news-flow-seed.service news-flow-parse.service
systemctl stop news-flow-import.service
rollback(){
 systemctl stop news-flow-seed.service news-flow-parse.service news-flow-import.service || true
 for role in seed parse import; do test "$(systemctl show news-flow-$role.service -p MainPID --value)" = 0 || return 1; install -o root -g root -m 644 "$backup/news-flow-$role.service" "/etc/systemd/system/news-flow-$role.service"; done
 ln -sfn "$previous" /opt/news-flow/current
 systemctl daemon-reload
 # All three processes have been confirmed stopped; only their lease rows may be cleared.
 python3 - <<'PY'
import sqlite3
c=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite');c.execute("DELETE FROM runner WHERE id IN ('flow_seed','flow_article','es5_writer')");c.commit();c.close()
PY
 systemctl start news-flow-import.service news-flow-seed.service news-flow-parse.service
}
trap rollback ERR
install -d -o news-flow -g news-flow -m 750 /var/lib/news-flow/locks
for role in seed parse import; do install -o root -g root -m 644 "$upload_dir/.news-flow-$role.service" "/etc/systemd/system/news-flow-$role.service"; done
systemd-analyze verify /etc/systemd/system/news-flow-seed.service /etc/systemd/system/news-flow-parse.service /etc/systemd/system/news-flow-import.service
ln -sfn "$release" /opt/news-flow/current
systemctl daemon-reload
systemctl start news-flow-import.service
systemctl start news-flow-seed.service news-flow-parse.service
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p NRestarts -p CPUQuotaPerSecUSec -p MemoryMax
systemctl show news-flow.slice -p CPUQuotaPerSecUSec -p MemoryMax
trap - ERR
rm -f -- "$upload_dir/.news-flow-release-20261113.tar.gz"
echo SQLITE_SHORT_TRANSACTIONS_AND_KERNEL_PROCESS_LEASE_DEPLOYED
