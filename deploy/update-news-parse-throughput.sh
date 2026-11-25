#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=/opt/news-flow/releases/20261114-21
release=/opt/news-flow/releases/20261115-01
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test "$(cat "$release/.parse-throughput-verified")" = verified
python3 - <<'PYREMOTE'
from pathlib import Path
m=dict((k,int(v.split()[0])) for k,v in (l.split(':',1) for l in Path('/proc/meminfo').read_text().splitlines()))
assert m['MemAvailable']>=20*1024*1024, 'INSUFFICIENT_HOST_MEMORY'
PYREMOTE
seed_pid=$(systemctl show news-flow-seed.service -p MainPID --value)
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
backup=/var/lib/news-flow/diagnostics/parse-before-20261115-01
test ! -e "$backup"
install -d -m 700 "$backup"
cp -p /etc/systemd/system/news-flow-parse.service "$backup/news-flow-parse.service"
cp -p /etc/systemd/system/news-flow.slice "$backup/news-flow.slice"
rollback(){
 trap - ERR
 systemctl stop news-flow-parse.service || true
 install -o root -g root -m 644 "$backup/news-flow-parse.service" /etc/systemd/system/news-flow-parse.service
 install -o root -g root -m 644 "$backup/news-flow.slice" /etc/systemd/system/news-flow.slice
 ln -sfn "$previous" /opt/news-flow/current
 systemctl daemon-reload
 systemctl set-property news-flow.slice MemoryMax=16G
 systemctl start news-flow-parse.service
}
trap rollback ERR
systemctl stop news-flow-parse.service
install -o root -g root -m 644 "$upload_dir/.news-parse-throughput.service" /etc/systemd/system/news-flow-parse.service
install -o root -g root -m 644 "$upload_dir/.news-parse-throughput.slice" /etc/systemd/system/news-flow.slice
systemd-analyze verify /etc/systemd/system/news-flow-parse.service /etc/systemd/system/news-flow.slice
ln -sfn "$release" /opt/news-flow/current
systemctl daemon-reload
systemctl set-property news-flow.slice MemoryMax=28G
systemctl start news-flow-parse.service
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
test "$(systemctl show news-flow-seed.service -p MainPID --value)" = "$seed_pid"
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
test "$(systemctl show news-flow.slice -p CPUQuotaPerSecUSec --value)" = 16s
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p NRestarts -p MemoryMax -p CPUQuotaPerSecUSec
systemctl show news-flow.slice -p CPUQuotaPerSecUSec -p MemoryMax
trap - ERR
echo PARSE_CPU_24_AND_MEMORY_28G_DEPLOYED_MASTER_AND_OTHER_PIDS_PRESERVED
