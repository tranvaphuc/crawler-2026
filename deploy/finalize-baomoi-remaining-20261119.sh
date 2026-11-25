set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=/opt/news-flow/releases/20261119-baomoi-remaining-07b
release=/opt/news-flow/releases/20261119-baomoi-remaining-08b
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test ! -e "$release"
cp -a "$previous" "$release"
install -m 644 "$upload_dir/.baomoi-completion-test.mjs" "$release/test/news-baomoi-completion.test.mjs"
python3 - "$release" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1])/'src/newsFlow/threeFlowState.mjs';s=p.read_text();anchor="  const key=task.cycle+'|'+task.url_key,stats=this.linkStats.get(task.cycle+'|'+task.url)||{found:0,added:0};";assert s.count(anchor)==1
line="  if(status==='done'&&task.site==='baomoi.com'&&reason==='verified_outbox')for(const raw of [task.url,task.url.replace(/-c(\\d+)\\.epi$/,'-r$1.epi')])for(const alias of urlAliases(raw))this.db.prepare(\"DELETE FROM url_failures WHERE url_key=? AND reason='empty_page'\").run(requestKey(alias));"
p.write_text(s.replace(anchor,line+'\n'+anchor))
PY
cd "$release"
/opt/news-flow/node/bin/node --test test/news-baomoi-completion.test.mjs test/news-three-flow.test.mjs > /var/lib/news-flow/baomoi-remaining-20261119/completion-server-tests.tap 2>&1 || { tail -n 60 /var/lib/news-flow/baomoi-remaining-20261119/completion-server-tests.tap; exit 1; }
tail -n 9 /var/lib/news-flow/baomoi-remaining-20261119/completion-server-tests.tap
systemctl stop news-flow-seed.service news-flow-parse.service
rollback(){ ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow-seed.service news-flow-parse.service; }
trap rollback ERR
ln -sfn "$release" /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node --input-type=module <<'JS'
import fs from 'node:fs/promises';import {DatabaseSync} from 'node:sqlite';import {urlAliases,requestKey} from './src/newsFlow/identity.mjs';
const root='/var/lib/news-flow/baomoi-remaining-20261119',report=JSON.parse(await fs.readFile(root+'/es-verification.json'));if(report.verified!==45||report.remaining.length)throw Error('ES_RECOVERY_NOT_CONFIRMED');const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite');db.exec('PRAGMA busy_timeout=30000');let cleared=0;const before=[];try{db.exec('BEGIN IMMEDIATE');for(const r of report.rows)for(const raw of [r.url,r.url.replace(/-c(\d+)\.epi$/,'-r$1.epi')])for(const alias of urlAliases(raw)){const key=requestKey(alias),row=db.prepare("SELECT * FROM url_failures WHERE url_key=? AND reason='empty_page'").get(key);if(row){before.push(row);cleared+=db.prepare("DELETE FROM url_failures WHERE url_key=? AND reason='empty_page'").run(key).changes;}}db.exec('COMMIT');await fs.writeFile(root+'/resolved-shell-failures.json',JSON.stringify({at:new Date().toISOString(),cleared,before,scope:'only_ES_verified_Baomoi_articles'},null,2));console.log(JSON.stringify({resolvedShellFailures:cleared}));}finally{db.close();}
JS
systemctl start news-flow-seed.service news-flow-parse.service
systemctl is-active news-flow-seed.service news-flow-parse.service news-flow-import.service
trap - ERR
readlink -f /opt/news-flow/current
