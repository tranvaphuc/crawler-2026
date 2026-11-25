#!/usr/bin/env bash
set -euo pipefail
previous=/opt/news-flow/releases/20261115-04
selected=/opt/news-flow/releases/20261115-03
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test "$(cat "$selected/.parse-event-batch-verified")" = verified
seed_pid=$(systemctl show news-flow-seed.service -p MainPID --value)
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
systemctl stop news-flow-parse.service
ln -sfn "$selected" /opt/news-flow/current
systemctl start news-flow-parse.service
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
test "$(systemctl show news-flow-seed.service -p MainPID --value)" = "$seed_pid"
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
echo SELECTED_EVENT_BATCH_RELEASE_03_OTHER_SERVICES_UNCHANGED
