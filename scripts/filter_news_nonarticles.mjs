import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {newsArticleRejection} from '../src/web/newsArticleAdmission.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
export async function auditArticleBacklog({db,file,reportFile,registry,apply=false}){
 const report={checkedAt:new Date().toISOString(),configuredSites:registry.sources.size,scanned:0,rejected:0,bySite:{},reasons:{},states:{},apply,tasksSkipped:0,linksSkipped:0,samplesRemoved:0};
 const handle=fs.openSync(file,'w',0o600);
 const reasonFor=row=>newsArticleRejection(row.url,registry.sources.get(row.site)||{domain:row.site})||(/^(?:non_article:|non_news_document:)/.test(row.error||'')?'previously_detected_nonarticle':null);
 try{
  db.exec('BEGIN');
  for(const r of db.prepare("SELECT parse_key,url,site,parse_status,error,task_id FROM article_links WHERE parse_status IN ('pending','queued','running','fail')").iterate()){
   report.scanned++;const reason=reasonFor(r);if(!reason)continue;
   report.rejected++;report.states[r.parse_status]=(report.states[r.parse_status]||0)+1;report.reasons[reason]=(report.reasons[reason]||0)+1;
   const site=report.bySite[r.site]??={count:0,reasons:{},samples:[]};site.count++;site.reasons[reason]=(site.reasons[reason]||0)+1;if(site.samples.length<5)site.samples.push({url:r.url,reason});
   fs.writeSync(handle,JSON.stringify({...r,reason})+'\n');
  }
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}finally{fs.closeSync(handle);}
 if(apply){
  const undo=fs.openSync(path.join(path.dirname(file),'undo.jsonl'),'w',0o600);
  const priorTask=db.prepare('SELECT id,state,reason,lease_until FROM tasks WHERE id=? AND url=?');
  const update=db.prepare("UPDATE article_links SET parse_status='skipped',error=? WHERE parse_key=? AND url=? AND parse_status IN ('pending','queued','running','fail')");
  const task=db.prepare("UPDATE tasks SET state='done',reason=?,lease_until=NULL WHERE id=? AND role='article' AND url=? AND state IN ('pending','running')");
  const remove=db.prepare('DELETE FROM review_samples WHERE site=? AND url=?');
  const batch=rows=>{db.exec('BEGIN IMMEDIATE');try{for(const r of rows){fs.writeSync(undo,JSON.stringify({link:r,task:r.task_id?priorTask.get(r.task_id,r.url):null})+'\n');const reason='non_article:'+r.reason;report.linksSkipped+=update.run(reason,r.parse_key,r.url).changes;if(r.task_id)report.tasksSkipped+=task.run(reason,r.task_id,r.url).changes;report.samplesRemoved+=remove.run(r.site,r.url).changes;}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
  let pending=[];for await(const line of readline.createInterface({input:fs.createReadStream(file)})){if(!line.trim())continue;pending.push(JSON.parse(line));if(pending.length>=250){batch(pending);pending=[];}}if(pending.length)batch(pending);fs.fsyncSync(undo);fs.closeSync(undo);
  // Historical samples can outlive their catalog/task row.
  for(const r of db.prepare('SELECT site,url,reason error FROM review_samples').all())if(reasonFor(r))report.samplesRemoved+=remove.run(r.site,r.url).changes;
 }
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
 const [mode,database,output]=process.argv.slice(2);if(!['audit','apply'].includes(mode)||!database||!output)throw Error('USAGE_audit_or_apply_database_output_directory');
 fs.mkdirSync(output,{recursive:true});const db=new DatabaseSync(database,{readOnly:mode!=='apply'});db.exec('PRAGMA busy_timeout=15000');
 try{const registry=await loadNewsRegistry();const r=await auditArticleBacklog({db,registry,file:path.join(output,'excluded-links.jsonl'),reportFile:path.join(output,'summary.json'),apply:mode==='apply'});console.log(JSON.stringify({checkedAt:r.checkedAt,configuredSites:r.configuredSites,scanned:r.scanned,rejected:r.rejected,states:r.states,reasons:r.reasons,sites:Object.keys(r.bySite).length,tasksSkipped:r.tasksSkipped,linksSkipped:r.linksSkipped,samplesRemoved:r.samplesRemoved}));}finally{db.close();}
}
