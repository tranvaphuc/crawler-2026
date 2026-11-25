import fs from 'node:fs/promises';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {execFileSync} from 'node:child_process';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';import {currentAuditGate} from './news_current_audit_gate.mjs';import {applyFailedReviewBatch} from '../src/newsFlow/manualFailedRecovery.mjs';
const root=path.resolve('outputs/news-failed-recovery-2026-11-16'),read=async n=>JSON.parse(await fs.readFile(path.join(root,n))),save=async(n,v)=>fs.writeFile(path.join(root,n),JSON.stringify(v,null,2));
const review=new DatabaseSync(path.join(root,'review.sqlite'));review.exec('PRAGMA busy_timeout=30000');
const inventory=await read('inventory.json'),snapshotAt=Date.parse(inventory.at),changes=await read('final-description/changes.json'),registry=await loadNewsRegistry(),pool=new NewsRepairPool(12,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const accepted=[],rejected=[];let rechecked=0;
function parseRecord(audit){return audit.parsed?{_id:audit.parsed._id,_source:{title:audit.parsed._source.title,publishedDate:audit.parsed._source.publishedDate},extracted:{contentSha256:audit.parsed.extracted.contentSha256}}:null;}
const update=review.prepare('UPDATE verdicts SET outcome=?,reason=?,parsed=? WHERE parse_key=?');
async function audit(row,source){const r=currentAuditGate(await pool.run({sample:{domain:source.domain,url:row.url,htmlPath:row.html_path,kind:'article'},config:source.config,learn:false}),source.config,registry,source.domain);return {outcome:!r.error&&!r.quality?.length?'verified':'failed',reason:r.error||(r.quality||[]).map(x=>x.code).join(','),parsed:parseRecord(r)};}
try{
 for(const change of changes){
  const source=registry.sources.get(change.domain),rows=review.prepare('SELECT * FROM verdicts WHERE site=? AND html_path IS NOT NULL').all(change.domain),results=[];let regression=false;
  for(const row of rows){const after=await audit(row,source),before=row.parsed?JSON.parse(row.parsed):null;if(row.outcome==='verified'&&(after.outcome!=='verified'||after.parsed?._id!==before?._id||after.parsed?._source.title!==before?._source.title||after.parsed?._source.publishedDate!==before?._source.publishedDate||after.parsed?.extracted.contentSha256!==before?.extracted.contentSha256))regression=true;results.push({row,after});}
  if(regression){const backup=path.join(root,'final-description/before-configs',change.domain+'.json');await fs.copyFile(backup,change.file);source.config=JSON.parse(await fs.readFile(backup));rejected.push({domain:change.domain,reason:'full_recovery_control_regression'});}
  else{for(const {row,after} of results)update.run(after.outcome,after.reason,JSON.stringify(after.parsed),row.parse_key);accepted.push(change);}
  rechecked+=rows.length;console.log(JSON.stringify({phase:'recheck_changed_parser',site:change.domain,accepted:!regression,urls:rows.length}));
 }
 // RSS is optional only when the original HTML itself passes every publication gate.
 const feedRows=review.prepare("SELECT * FROM verdicts WHERE reason='NEWS_PUBLICATION_FEED_UNAVAILABLE' AND html_path IS NOT NULL").all();
 for(const row of feedRows){const source=registry.sources.get(row.site);if(!source)continue;const after=await audit(row,source);if(after.outcome==='verified')update.run('verified',null,JSON.stringify(after.parsed),row.parse_key);}
}finally{await pool.close();}
await save('accepted-parser-fixes-description.json',accepted);await save('rejected-parser-fixes-description.json',rejected);
const testFiles=(await fs.readdir('test')).filter(n=>/^news-.*\.test\.mjs$/.test(n)).map(n=>'test/'+n);testFiles.push('test/public-article-bodies.test.mjs');
try{const output=execFileSync(process.execPath,['--test',...testFiles],{encoding:'utf8',timeout:180000,maxBuffer:16000000});await fs.writeFile(path.join(root,'final-tests-description.tap'),output);}catch(error){if(error.stdout)await fs.writeFile(path.join(root,'failed-tests-description.tap'),error.stdout);throw error;}
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite');db.exec('PRAGMA busy_timeout=30000');
const aiBefore=db.prepare('SELECT * FROM ai_usage ORDER BY day').all(),marker='manual_failed_recovery_20261116_description';
if(db.prepare('SELECT 1 FROM flow_meta WHERE key=?').get(marker)){console.log(JSON.stringify({alreadyApplied:true}));db.close();review.close();process.exit(0);}
if(accepted.length)execFileSync('systemctl',['stop','news-flow-seed.service','news-flow-parse.service'],{stdio:'pipe'});
const results={requeued:0,excluded:0,unchanged:0};
try{
 const rows=review.prepare("SELECT * FROM verdicts WHERE outcome IN ('verified','excluded')").all();
 for(let i=0;i<rows.length;i+=1000){const counts=applyFailedReviewBatch(db,rows.slice(i,i+1000),{snapshotAt,reviewedAt:Date.now()});for(const k of Object.keys(results))results[k]+=counts[k];}
 const aiAfter=db.prepare('SELECT * FROM ai_usage ORDER BY day').all();if(aiBefore.some(b=>!aiAfter.some(a=>a.day===b.day&&a.calls>=b.calls&&a.usd+1e-9>=b.usd)))throw Error('AI_USAGE_NOT_PRESERVED');
 const result={appliedAt:new Date().toISOString(),snapshotAt:inventory.at,reviewed:review.prepare('SELECT count(*) n FROM verdicts').get().n,...results,parserFixes:accepted.map(x=>x.domain),rejectedParserFixes:rejected,remainingFailed:review.prepare("SELECT count(*) n FROM verdicts WHERE outcome='failed'").get().n,recheckedAfterFix:rechecked,aiUsagePreserved:true,paidAiCalls:0,queueReset:false,esDirectWrites:false};
 db.prepare('INSERT INTO flow_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(result));await save('activation-description.json',result);console.log(JSON.stringify(result));
}finally{db.close();review.close();if(accepted.length)execFileSync('systemctl',['start','news-flow-seed.service','news-flow-parse.service'],{stdio:'pipe'});}
