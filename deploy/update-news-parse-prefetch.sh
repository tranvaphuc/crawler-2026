#!/usr/bin/env bash
set -euo pipefail
previous=/opt/news-flow/releases/20261115-03
release=/opt/news-flow/releases/20261115-04
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test "$(cat "$release/.parse-prefetch-verified")" = verified
seed_pid=$(systemctl show news-flow-seed.service -p MainPID --value)
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
rollback(){ trap - ERR; systemctl stop news-flow-parse.service || true; ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow-parse.service; }
trap rollback ERR
systemctl stop news-flow-parse.service
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-parse.service
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
test "$(systemctl show news-flow-seed.service -p MainPID --value)" = "$seed_pid"
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p NRestarts
trap - ERR
echo BOUNDED_CPU_PREFETCH_DEPLOYED_OTHER_PIDS_PRESERVED
