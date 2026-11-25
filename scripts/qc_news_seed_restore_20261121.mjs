import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
const base='/opt/news-flow/current';const {requestKey}=await import('file://'+base+'/src/newsFlow/identity.mjs');
const report=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-20261121/seed-probe.json'));
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite');db.exec('PRAGMA busy_timeout=20000');
const restored=[],skipped=[],before=[];
for(const row of report.rows){
 if(!row.verified||row.status!=='fail'||row.statusCode!==200||!row.htmlSha256||Date.now()-row.checkedAt>1800000){skipped.push(row.url);continue;}
 const html=gunzipSync(fs.readFileSync(row.evidenceFile));if(createHash('sha256').update(html).digest('hex')!==row.htmlSha256)throw Error('QC_EVIDENCE_CHANGED');
 const prior=db.prepare('SELECT * FROM seed_sources WHERE url_key=?').get(requestKey(row.url));if(prior)before.push(prior);
}
fs.writeFileSync('/var/lib/news-flow/qc-20261121/seed-recovery-before.json',JSON.stringify(before,null,2),{mode:0o600});
try{
 db.exec('BEGIN IMMEDIATE');
 for(const row of report.rows){
  if(!before.some(r=>r.url_key===requestKey(row.url)))continue;
  const result=db.prepare("UPDATE seed_sources SET status='ok',reason='QC_VERIFIED_SEED_RECOVERY_20261121',last_at=?,links_found=?,reviewed_at=? WHERE url_key=? AND site=? AND status='fail' AND reason IS ? AND last_at IS ?").run(row.checkedAt,row.articleLinks,Date.now(),requestKey(row.url),row.site,row.reason,row.last_at);
  if(!result.changes){skipped.push(row.url);continue;}
  db.prepare('DELETE FROM url_failures WHERE url_key=?').run(requestKey(row.url));restored.push({site:row.site,url:row.url,articleLinks:row.articleLinks});
 }
 db.exec('COMMIT');
 const out={at:new Date().toISOString(),restored,skipped};fs.writeFileSync('/var/lib/news-flow/qc-20261121/seed-recovery.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
