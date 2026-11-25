import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
const base='/opt/news-flow/current',root='/var/lib/news-flow/qc-20261122';
const {requestKey}=await import('file://'+base+'/src/newsFlow/identity.mjs');
const {applyFailedReviewBatch}=await import('file://'+base+'/src/newsFlow/manualFailedRecovery.mjs');
const audit=JSON.parse(fs.readFileSync(root+'/news-audit.json')),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite');db.exec('PRAGMA busy_timeout=20000');
const seeds=[],articles=[];
for(const site of audit.sites){
 for(const seed of site.seeds){
  if(seed.error||seed.statusCode!==200||seed.links<1||!seed.evidence||Date.now()-seed.checkedAt>3600000)continue;
  const html=gunzipSync(fs.readFileSync(seed.evidence.file));if(createHash('sha256').update(html).digest('hex')!==seed.evidence.sha)throw Error('QC_SEED_EVIDENCE_CHANGED');
  const own=new Set(site.config.allowedHosts.map(h=>h.replace(/^www\./,''))),records=audit.httpRecords.filter(r=>r.cycle===seed.cycle&&r.statusCode===200&&(!r.error||r.error==='empty_page'&&r.role==='seed'&&own.has(new URL(r.url).hostname.replace(/^www\./,''))));
  const keys=[...new Set([seed.url,...records.map(r=>r.url)].map(requestKey))];
  seeds.push({site:site.site,sourceSite:site.config.siteName,seed,keys,before:db.prepare('SELECT * FROM seed_sources WHERE url_key=?').get(requestKey(seed.url)),failures:keys.flatMap(key=>db.prepare('SELECT * FROM url_failures WHERE url_key=?').all(key))});
 }
 for(const article of site.articles.filter(a=>a.doc&&!a.writeError)){
  const row=db.prepare('SELECT * FROM article_links WHERE url=?').get(article.url);if(row?.parse_status==='fail')articles.push({site:site.site,url:row.url,parse_key:row.parse_key,old_reason:row.error,outcome:'verified',verifiedRequestUrls:[article.finalUrl||article.url]});
 }
}
fs.writeFileSync(root+'/verified-recovery-backup.json',JSON.stringify({at:new Date().toISOString(),seeds,articles:articles.map(a=>({proposal:a,before:db.prepare('SELECT * FROM article_links WHERE parse_key=?').get(a.parse_key)})),aiUsage:db.prepare('SELECT * FROM ai_usage ORDER BY day').all()},null,2),{mode:0o600});
const out={at:new Date().toISOString(),restoredSeeds:[],clearedFailures:[],skippedSeeds:[]};
try{
 db.exec('BEGIN IMMEDIATE');
 for(const row of seeds){
  const {seed}=row,key=requestKey(seed.url),current=db.prepare('SELECT * FROM seed_sources WHERE url_key=?').get(key);
  if(current?.last_at>seed.checkedAt){out.skippedSeeds.push({url:seed.url,reason:'newer_observation_preserved'});continue;}
  for(const k of row.keys){const result=db.prepare('DELETE FROM url_failures WHERE url_key=? AND site IN (?,?) AND last_at<=?').run(k,row.site,row.sourceSite,seed.checkedAt);if(result.changes)out.clearedFailures.push({site:row.site,url:k});}
  const changed=db.prepare("UPDATE seed_sources SET status='ok',reason='QC_HTTP_VERIFIED_20261122',last_at=?,links_found=?,reviewed_at=? WHERE url_key=? AND status='fail' AND coalesce(last_at,0)<=?").run(seed.checkedAt,seed.links,Date.now(),key,seed.checkedAt);
  if(changed.changes)out.restoredSeeds.push({site:row.site,url:seed.url,links:seed.links});
 }
 db.exec('COMMIT');
 out.articles=applyFailedReviewBatch(db,articles,{snapshotAt:Date.parse(audit.finishedAt),reviewedAt:Date.now()});
 fs.writeFileSync(root+'/verified-recovery.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}finally{db.close();}
