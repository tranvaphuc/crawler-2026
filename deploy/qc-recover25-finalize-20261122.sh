set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-recover25-20261122
for name in QC-REPORT.txt source-disposition.json cnn-access-decision.json; do
 install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recover25-$name" "$root/$name"
done
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import {execFileSync} from 'node:child_process';const root='/var/lib/news-flow/qc-recover25-20261122',sha=x=>createHash('sha256').update(x).digest('hex'),plan=JSON.parse(fs.readFileSync(root+'/code-candidate/manifest.json')),report=JSON.parse(fs.readFileSync(root+'/source-disposition.json')),apply=JSON.parse(fs.readFileSync(root+'/cnn-apply-result.json')),before=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-close25-20261122/batch.json')),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});try{assert.equal(report.cases.length,25);assert.equal(report.remaining,24);const out={at:new Date().toISOString(),runtimeFiles:plan.map(f=>({file:f.file,sha256:sha(fs.readFileSync(f.file)),matches:sha(fs.readFileSync(f.file))===f.afterSha})),helperSha:sha(fs.readFileSync('src/web/newsCnnLite.mjs')),cnnConfigSha:sha(fs.readFileSync(apply.file)),otherSourceConfigsUnchanged:before.sites.filter(s=>s.site!=='edition.cnn.com').map(s=>({site:s.site,unchanged:sha(fs.readFileSync(s.file))===s.fileSha})),aiLedgerUnchanged:JSON.stringify(before.aiUsage)===JSON.stringify(db.prepare('SELECT * FROM ai_usage ORDER BY day').all()),services:execFileSync('systemctl',['show','news-flow-seed','news-flow-parse','news-flow-import','-p','Id,MainPID,ActiveState,NRestarts'],{encoding:'utf8'}),reportSha:sha(fs.readFileSync(root+'/QC-REPORT.txt'))};assert(out.runtimeFiles.every(f=>f.matches));assert(out.otherSourceConfigsUnchanged.length===24&&out.otherSourceConfigsUnchanged.every(f=>f.unchanged));assert(out.aiLedgerUnchanged);assert.equal(out.cnnConfigSha,apply.sha256);assert.equal((out.services.match(/ActiveState=active/g)||[]).length,3);fs.writeFileSync(root+'/final-runtime.json',JSON.stringify(out,null,2));console.log(JSON.stringify({cases:25,restored:1,remaining:24,helperSha:out.helperSha,reportSha:out.reportSha,aiLedgerUnchanged:out.aiLedgerUnchanged,services:out.services}));}finally{db.close();}
NODE
install -o "$SUDO_USER" -m 0600 "$root/final-runtime.json" "$upload_dir/.qc-recover25-final-runtime.json"
tar -C "$root" -czf "$upload_dir/.qc-recover25-evidence.tar.gz" .
chown "$SUDO_USER" "$upload_dir/.qc-recover25-evidence.tar.gz"
chmod 0600 "$upload_dir/.qc-recover25-evidence.tar.gz"
