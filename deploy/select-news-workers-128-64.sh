#!/usr/bin/env bash
set -euo pipefail
umask 077
previous=/opt/news-flow/releases/20261114-17
selected=/opt/news-flow/releases/20261114-16
saved=/var/lib/news-flow/diagnostics/workers-before-20261114-17
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test -f "$selected/src/newsFlow/threeFlowCapacity.mjs"
for role in seed parse; do grep -qx 'Environment=NEWS_N1=128' "$saved/news-flow-$role.service"; grep -qx 'Environment=NEWS_N2=64' "$saved/news-flow-$role.service"; done
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
test "$writer_pid" -gt 0
backup=/var/lib/news-flow/diagnostics/workers256-before-selection-20261114
test ! -e "$backup"
install -d -m 700 "$backup"
for role in seed parse; do cp -p "/etc/systemd/system/news-flow-$role.service" "$backup/news-flow-$role.service"; done
cp -p /etc/systemd/system/news-flow.slice "$backup/news-flow.slice"
rollback(){
 trap - ERR
 systemctl stop news-flow-seed.service news-flow-parse.service || true
 for role in seed parse; do install -o root -g root -m 644 "$backup/news-flow-$role.service" "/etc/systemd/system/news-flow-$role.service"; done
 install -o root -g root -m 644 "$backup/news-flow.slice" /etc/systemd/system/news-flow.slice
 ln -sfn "$previous" /opt/news-flow/current
 systemctl daemon-reload
 systemctl set-property news-flow.slice CPUQuota=2000% MemoryMax=24G
 systemctl start news-flow-seed.service news-flow-parse.service
}
trap rollback ERR
systemctl stop news-flow-seed.service news-flow-parse.service
for role in seed parse; do install -o root -g root -m 644 "$saved/news-flow-$role.service" "/etc/systemd/system/news-flow-$role.service"; done
install -o root -g root -m 644 "$saved/news-flow.slice" /etc/systemd/system/news-flow.slice
ln -sfn "$selected" /opt/news-flow/current
systemctl daemon-reload
systemctl set-property news-flow.slice CPUQuota=1600% MemoryMax=16G
systemctl start news-flow-seed.service news-flow-parse.service
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
test "$(systemctl show news-flow.slice -p CPUQuotaPerSecUSec --value)" = 16s
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p NRestarts
systemctl show news-flow.slice -p CPUQuotaPerSecUSec -p MemoryMax
trap - ERR
echo SELECTED_BENCHMARKED_128_64_CAPACITY_IMPORTER_PID_PRESERVED
