import {randomUUID} from 'node:crypto';import {setImmediate as yieldImmediate} from 'node:timers/promises';import {requestKey} from './identity.mjs';
// Explicit, one-time admission for the requested audit cohort. Normal master
// round semantics, worker limits and all terminal article states stay intact.
export async function admitCategoryBackfill(state,registry,{now=Date.now(),batchSize=1000,onProgress=()=>{}}={}){
 const db=state.db,cycle='manual-category-backfill-'+randomUUID(),result={cycle,admitted:0,unchanged:0,sourcePolicyExcluded:0};let cursor='';
 const select=db.prepare("SELECT a.* FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.parse_status='pending' AND c.discovered_at<=? AND a.parse_key>? ORDER BY a.parse_key LIMIT ?"),insert=db.prepare("INSERT INTO tasks(cycle,url,url_key,site,role,priority,state,reason,created,seen_at) VALUES(?,?,?,?,'article',50,'pending','manual_category_backfill',?,?)"),update=db.prepare("UPDATE article_links SET parse_status='queued',task_id=? WHERE parse_key=? AND parse_status='pending'");
 while(true){const rows=select.all(now,cursor,batchSize);if(!rows.length)break;cursor=rows.at(-1).parse_key;
  state.tx(()=>{let opened=false;for(const row of rows){
   const source=registry.sources.get(row.site);if(!source||source.config.originalPublicationBlockedReason||state.articleRejection(row.url,row.site)){result.sourcePolicyExcluded++;continue;}
   const current=db.prepare('SELECT parse_status,task_id FROM article_links WHERE parse_key=?').get(row.parse_key);if(current?.parse_status!=='pending'||current.task_id&&db.prepare("SELECT 1 FROM tasks WHERE id=? AND state IN ('pending','running')").get(current.task_id)){result.unchanged++;continue;}
   if(!opened){db.prepare('INSERT OR IGNORE INTO cycles(id,started) VALUES(?,?)').run(cycle,now);opened=true;}
   const id=insert.run(cycle,row.url,requestKey(row.url),row.site,now,row.findtime||now).lastInsertRowid;if(update.run(id,row.parse_key).changes!==1)throw Error('CATEGORY_BACKFILL_ADMISSION_CHANGED');result.admitted++;
  }},'manual_category_backfill_admission');onProgress({...result});await yieldImmediate();
 }
 return result;
}
