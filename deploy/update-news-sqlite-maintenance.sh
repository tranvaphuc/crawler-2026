#!/usr/bin/env bash
set -euo pipefail
umask 077
previous=/opt/news-flow/releases/20261114-20
release=/opt/news-flow/releases/20261114-21
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test "$(cat "$release/.maintenance-verified")" = verified
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
rollback(){
 trap - ERR
 systemctl stop news-flow-seed.service news-flow-parse.service news-flow-import.service || true
 ln -sfn "$previous" /opt/news-flow/current
 # Added indexes are backward compatible. Never restore the live DB or replay URL jobs.
 systemctl start news-flow-import.service
 systemctl start news-flow-seed.service news-flow-parse.service
}
trap rollback ERR
echo STOPPING_THREE_SERVICES_FOR_ONE_TIME_INDEX_BUILD
systemctl stop news-flow-seed.service news-flow-parse.service
systemctl stop news-flow-import.service
for role in seed parse import; do test "$(systemctl show news-flow-$role.service -p MainPID --value)" = 0; done
echo BUILDING_RETENTION_AND_FETCHING_INDEXES
export PATH=/opt/news-flow/node/bin:$PATH
(
 cd "$release"
 runuser -u news-flow -- env PATH="$PATH" /opt/news-flow/node/bin/node --max-old-space-size=512 --input-type=module <<'NODE_MIGRATION'
import {ThreeFlowState} from './src/newsFlow/threeFlowState.mjs';
const started=Date.now();
const s=await ThreeFlowState.open('/var/lib/news-flow/news-flow-runtime/write.sqlite');
console.log(JSON.stringify({schemaReady:true,durationMs:Date.now()-started,indexes:s.db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name LIKE 'news_%'").all()}));
s.close();
NODE_MIGRATION
)
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-import.service
systemctl start news-flow-seed.service news-flow-parse.service
for role in seed parse import; do systemctl is-active --quiet "news-flow-$role.service"; done
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p NRestarts
systemctl show news-flow.slice -p CPUQuotaPerSecUSec -p MemoryMax
trap - ERR
echo SQLITE_MAINTENANCE_FIX_DEPLOYED_WITHOUT_WAIT_OR_URL_RETRY
