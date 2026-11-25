#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261114-08
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261114-07
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-flow-release-20261113.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
export PATH=/opt/news-flow/node/bin:$PATH
for unchanged in package.json src/newsFlow/state.mjs src/newsFlow/threeFlowState.mjs src/newsFlow/transport.mjs src/newsFlow/identity.mjs src/newsFlow/threeFlowProcessor.mjs src/newsFlow/es5.mjs src/newsFlow/createOnlySink.mjs src/newsFlow/writerRuntime.mjs scripts/run_news_three_flow.mjs; do cmp -s "$previous/$unchanged" "$release/$unchanged"; done
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
if ! runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/ai-evidence-isolation-tests.tap 2>&1"; then
 tail -n 80 /var/lib/news-flow/ai-evidence-isolation-tests.tap
 exit 1
fi
tail -n 9 /var/lib/news-flow/ai-evidence-isolation-tests.tap
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/diagnostics/inspect-ai-payload-readonly.mjs "$release"
python3 - <<'PY'
from pathlib import Path
config=dict(line.split('=',1) for line in Path('/etc/news-flow/ai.env').read_text().splitlines() if '=' in line)
assert float(config['AI_DAILY_BUDGET_USD'].strip('"'))==2
print('EXISTING_SHARED_AI_DAILY_BUDGET_USD=2_PRESERVED')
PY
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
systemctl stop news-flow-seed.service news-flow-parse.service
rollback(){ ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow-seed.service news-flow-parse.service; }
trap rollback ERR
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-seed.service news-flow-parse.service
for name in seed parse import; do systemctl is-active --quiet "news-flow-$name.service"; done
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p SubState -p NRestarts
trap - ERR
rm -f -- "$upload_dir/.news-flow-release-20261113.tar.gz"
echo NEWS_AI_EVIDENCE_BOUND_AND_ERROR_ISOLATION_DEPLOYED
