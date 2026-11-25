#!/usr/bin/env bash
set -euo pipefail
umask 077
test "$(readlink -f /opt/news-flow/current)" = /opt/news-flow/releases/20261113-17
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
override=/etc/systemd/system/news-flow.service.d/30-backlog-priority.conf
test ! -e "$override"
cd /opt/news-flow/current
export PATH=/opt/news-flow/node/bin:$PATH
node --input-type=module -e "import {resolveNewsConcurrency} from './src/newsFlow/runtime.mjs';const r=resolveNewsConcurrency({seedConcurrency:8,articleConcurrency:64});if(r.total!==72)process.exit(1);console.log(JSON.stringify(r));"
systemctl show news-flow.service -p ExecStart > /var/lib/news-flow/diagnostics/news-flow-before-backlog-priority.txt
rollback(){ rm -f -- "$override"; systemctl daemon-reload; systemctl restart news-flow.service; }
trap rollback ERR
install -d -o root -g root -m 755 /etc/systemd/system/news-flow.service.d
install -o root -g root -m 644 "$upload_dir/.news-flow-backlog.conf" "$override"
systemd-analyze verify /etc/systemd/system/news-flow.service
systemctl daemon-reload
systemctl restart news-flow.service
systemctl is-active --quiet news-flow.service
systemctl is-active --quiet news-flow-writer.service
systemctl show news-flow.service news-flow-writer.service -p Id -p MainPID -p ActiveState -p SubState -p NRestarts -p DropInPaths
echo TEMPORARY_BACKLOG_PROFILE_ENABLED
