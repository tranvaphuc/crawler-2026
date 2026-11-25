set -eu
sudo -n bash -s <<'ROOT'
set -Eeuo pipefail
umask 077
root=/var/lib/crawler-v8/daily-failed-cleanup
helper=/var/lib/crawler-v8/failed-cleanup-20261125-exclude-uid/redis-cleanup.mjs
mkdir -p "$root"
exec 9>"$root/lock"
if ! flock -n 9; then printf '%s\n' '{"status":"already_running"}'; exit 0; fi
day=$(TZ=Asia/Ho_Chi_Minh date +%F)
run="$root/$day"
if test -s "$run/result.json"; then cat "$run/result.json"; exit 0; fi
if test -e "$run/started"; then printf '%s\n' '{"status":"previous_attempt_needs_verification"}'; exit 1; fi
if [ "$(timeout 4 redis-cli --raw ping)" != PONG ]; then printf '%s\n' '{"status":"queue_unavailable"}'; exit 1; fi
if [ "$(redis-cli --raw config get appendonly | tail -1)" != yes ]; then
 printf '%s\n' '{"status":"persistence_not_verified"}'; exit 1
fi
case "$(redis-cli --raw config get appendfsync | tail -1)" in
 always|everysec) ;;
 *) printf '%s\n' '{"status":"persistence_not_verified"}'; exit 1 ;;
esac
test -r "$helper"
grep -Fq "const targets=FLOW_QUEUES.filter(spec=>!protectedUid.includes(spec));" "$helper"
grep -Fq "q.scripts.cleanJobsInSet('failed',cutoff,1000)" "$helper"
mkdir -p "$run"
date -u +%FT%TZ > "$run/started"
if ! timeout 270 /opt/crawler-node/bin/node --env-file=/etc/crawler-v8/runtime.env "$helper" > "$run/cleanup.log" 2>&1; then
 printf '%s\n' '{"status":"cleanup_not_verified"}'; exit 1
fi
sleep 3
persistence=$(redis-cli --raw info persistence | tr -d '\r')
if ! grep -Fxq 'aof_last_write_status:ok' <<< "$persistence" || ! grep -Fxq 'aof_pending_bio_fsync:0' <<< "$persistence"; then
 printf '%s\n' '{"status":"persistence_not_verified"}'; exit 1
fi
/opt/crawler-node/bin/node --input-type=module - "$run" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const run=process.argv[2];
const lines=fs.readFileSync(path.join(run,'cleanup.log'),'utf8').trim().split('\n').map(JSON.parse);
const result=lines.findLast(row=>row.stage==='redis_result');
if(!result?.complete||Object.hasOwn(result.remainingCutoff,'find-uid')||Object.values(result.remainingCutoff).some(Boolean))throw Error('Failed scope not verified');
const report={status:'complete',at:result.at,cutoff:result.cutoff,removed:result.removed,byQueue:lines.filter(row=>row.stage==='queue_complete').map(row=>({queue:row.queue,removed:row.total})),uidBefore:result.uidBefore,uidAfter:result.uidAfter,memoryBeforeBytes:lines.find(row=>row.stage==='before')?.memory?.redisUsedBytes,memoryAfterBytes:result.memory?.redisUsedBytes};
fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(report)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(report));
JS
ROOT
