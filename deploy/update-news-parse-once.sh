#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
release=/opt/news-flow/releases/20261113-17
previous=$(readlink -f /opt/news-flow/current)
test "$previous" = /opt/news-flow/releases/20261113-16
test ! -e "$release"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$upload_dir/.news-flow-release-20261113.tar.gz" --directory "$release" --no-same-owner
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s /etc/news-flow/news.env "$release/.env"
ln -s /var/lib/news-flow "$release/outputs"
export PATH=/opt/news-flow/node/bin:$PATH
cmp -s "$previous/package.json" "$release/package.json"
ln -s "$previous/node_modules" "$release/node_modules"
install -o root -g root -m 644 "$previous/package-lock.json" "$release/package-lock.json"
runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; npm test > /var/lib/news-flow/deploy-tests.tap 2>&1"
tail -n 9 /var/lib/news-flow/deploy-tests.tap
rollback(){
 systemctl stop news-flow.service news-flow-writer.service || true
 python3 - <<'PY'
import sqlite3
c=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite');c.execute("DELETE FROM flow_meta WHERE key='parse_queue_admissions_v1'");c.commit();c.close()
PY
 ln -sfn "$previous" /opt/news-flow/current
 systemctl start news-flow-writer.service news-flow.service
}
trap rollback ERR
systemctl stop news-flow.service
systemctl stop news-flow-writer.service
test "$(systemctl show news-flow.service -p MainPID --value)" = 0
test "$(systemctl show news-flow-writer.service -p MainPID --value)" = 0
python3 - <<'PY'
import sqlite3,os,shutil
target='/var/lib/news-flow/backups/write-before-parse-once-20261113.sqlite'
if os.path.exists(target):raise RuntimeError('BACKUP_ALREADY_EXISTS')
free=shutil.disk_usage('/var/lib/news-flow').free;size=os.path.getsize('/var/lib/news-flow/news-flow-runtime/write.sqlite')
if free<size+2147483648:raise RuntimeError('INSUFFICIENT_BACKUP_ROOM')
source=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite');dest=sqlite3.connect(target)
source.backup(dest);dest.close();source.close();os.chmod(target,0o600)
PY
runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; /opt/news-flow/node/bin/node --input-type=module" <<'JS'
import {NewsState} from './src/newsFlow/state.mjs';import {loadNewsRegistry} from './src/newsFlow/registry.mjs';
const state=await NewsState.open('/var/lib/news-flow/news-flow-runtime/write.sqlite');
try{state.configureSites((await loadNewsRegistry()).sources.values());const start=Date.now(),migration=state.prepareDispatch();state.event('parse_queue_ledger_migration',{...migration.parseAdmissions,elapsedMs:Date.now()-start,policy:'lifetime_parse_once'});console.log(JSON.stringify({migration,elapsedMs:Date.now()-start,pendingArticles:state.pendingRole('article'),localOnly:true}));}finally{state.close();}
JS
ln -sfn "$release" /opt/news-flow/current
systemctl start news-flow-writer.service news-flow.service
systemctl is-active --quiet news-flow.service
systemctl is-active --quiet news-flow-writer.service
systemctl show news-flow.service news-flow-writer.service -p Id -p ActiveState -p SubState -p MainPID -p NRestarts
echo LOCAL_PARSE_ONCE_LEDGER_DEPLOYED
