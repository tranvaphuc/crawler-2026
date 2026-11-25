#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=$(readlink -f /opt/news-flow/current)
release=/opt/news-flow/releases/20261114-10
test "$previous" = /opt/news-flow/releases/20261114-09
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-flow-release-20261113.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
for unchanged in package.json scripts/run_news_three_flow.mjs src/newsFlow/threeFlowCapacity.mjs src/newsFlow/state.mjs src/newsFlow/transport.mjs src/newsFlow/identity.mjs src/newsFlow/threeFlowProcessor.mjs src/newsFlow/threeFlowReview.mjs src/newsFlow/es5.mjs src/newsFlow/createOnlySink.mjs src/newsFlow/writerRuntime.mjs; do cmp -s "$previous/$unchanged" "$release/$unchanged"; done
export PATH=/opt/news-flow/node/bin:$PATH
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/seed-full-round-tests.tap 2>&1"; then
 tail -n 80 /var/lib/news-flow/seed-full-round-tests.tap
 exit 1
fi
tail -n 9 /var/lib/news-flow/seed-full-round-tests.tap
python3 - <<'PY'
from pathlib import Path
c=dict(l.split('=',1) for l in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in l)
assert float(c['AI_DAILY_BUDGET_USD'].strip('"'))==2
assert int(c['AI_DAILY_MAX_CALLS'].strip('"'))==200
print('AI_SHARED_BUDGET_AND_CALL_LIMIT_PRESERVED')
PY
parse_pid=$(systemctl show news-flow-parse.service -p MainPID --value)
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
systemctl stop news-flow-seed.service
rollback(){
 systemctl stop news-flow-seed.service || true
 ln -sfn "$previous" /opt/news-flow/current
 systemctl start news-flow-seed.service
}
trap rollback ERR
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-seed.service
for name in seed parse import; do systemctl is-active --quiet "news-flow-$name.service"; done
test "$(systemctl show news-flow-parse.service -p MainPID --value)" = "$parse_pid"
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p SubState -p NRestarts
systemctl show news-flow.slice -p CPUQuotaPerSecUSec -p MemoryMax
trap - ERR
rm -f -- "$upload_dir/.news-flow-release-20261113.tar.gz"
echo SEED_FULL_ELIGIBLE_ROUND_DEPLOYED_PARSE_AND_IMPORT_PIDS_PRESERVED
