#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
test "$(readlink -f /opt/news-flow/current)" = /opt/news-flow/releases/20261113-10
export PATH=/opt/news-flow/node/bin:$PATH
cd /opt/news-flow/current
node --input-type=module -e "import {resolveNewsConcurrency} from './src/newsFlow/runtime.mjs';const r=resolveNewsConcurrency({seedConcurrency:80,articleConcurrency:16});if(r.total!==96)process.exit(1);console.log(JSON.stringify(r));"
install -o root -g root -m 600 /etc/systemd/system/news-flow.service /var/lib/news-flow/diagnostics/news-flow-before-seed80.service
touch /var/lib/news-flow/diagnostics/stop-final-seed-budget-observer
systemctl stop news-flow.service
rollback(){ install -o root -g root -m 644 /var/lib/news-flow/diagnostics/news-flow-before-seed80.service /etc/systemd/system/news-flow.service; systemctl daemon-reload; systemctl start news-flow.service; }
trap rollback ERR
install -o root -g root -m 644 "$upload_dir/.news-flow-seed80.service" /etc/systemd/system/news-flow.service
systemctl daemon-reload
systemctl start news-flow.service
systemctl show news-flow.service -p ActiveState -p SubState -p MainPID -p NRestarts -p ExecMainStatus
echo SEED80_ARTICLE16_APPLIED
