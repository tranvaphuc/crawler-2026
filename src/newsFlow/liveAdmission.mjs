import {randomUUID} from 'node:crypto';
import {setImmediate as yieldImmediate} from 'node:timers/promises';
import {requestKey} from './identity.mjs';

// Live discovery must not wait for a historical task cycle to drain. Admission
// and link transition are atomic; failed/done articles are never reopened.
export async function admitLiveWork(state,role,now=Date.now(),{onProgress=()=>{},batchSize=1000}={}){
 if(role==='seed')return {added:0,promoted:0,admission:'complete_seed_rounds',reason:'seed_round_only'};
 const db=state.db,cycle='live-'+role+'-'+randomUUID(),result={added:0,promoted:0,cycle,admission:'live_alongside_backfill'};
 let rows;
 if(role==='article')rows=db.prepare("SELECT a.parse_key key,a.url,a.site,a.findtime FROM article_links a WHERE a.parse_status='pending' AND NOT EXISTS(SELECT 1 FROM news_category_backfill b WHERE b.parse_key=a.parse_key) ORDER BY a.findtime DESC").all();
 else if(role==='seed')rows=db.prepare("SELECT s.url_key key,s.url,s.site FROM seed_sources s WHERE coalesce(s.status,'') NOT IN ('fail','die') AND coalesce(s.last_at,0)<=? AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.role='seed' AND t.url_key=s.url_key AND t.state='running')").all(now-120000).filter(r=>{try{const u=new URL(r.url),source=state.articleSources?.get(r.site),home=source?.config.discovery?.homepage||source?.config.homepage;return r.url===home||u.pathname==='/'&&!u.search||/\/(?:rss|feeds?)(?:[/.]|$)|\.rss$/i.test(u.pathname);}catch{return false;}});
 else throw Error('NEWS_INVALID_MASTER_ROLE');
 const insert=db.prepare("INSERT INTO tasks(cycle,url,url_key,site,role,priority,created,seen_at,reason) VALUES(?,?,?,?,?,?,?,?,?)"),link=db.prepare("UPDATE article_links SET parse_status='queued',task_id=? WHERE parse_key=? AND parse_status='pending'");
 for(let offset=0;offset<rows.length;offset+=batchSize){
  state.tx(()=>{let opened=false;for(const row of rows.slice(offset,offset+batchSize)){
   const source=state.articleSources?.get(row.site);if(!source||source.config.originalPublicationBlockedReason||/(^|\.)fireant\.vn$/i.test(row.site))continue;
   if(role==='article'&&(state.articleRejection(row.url,row.site)||db.prepare('SELECT parse_status FROM article_links WHERE parse_key=?').get(row.key)?.parse_status!=='pending'||db.prepare('SELECT 1 FROM news_category_backfill WHERE parse_key=?').get(row.key)))continue;
   if(role==='seed'){const seed=db.prepare('SELECT status,last_at FROM seed_sources WHERE url_key=?').get(row.key);if(!seed||['fail','die'].includes(seed.status)||seed.last_at>now-120000)continue;}
   const active=db.prepare("SELECT id,state,priority FROM tasks WHERE role=? AND url_key=? AND state IN ('pending','running') ORDER BY id LIMIT 1").get(role,requestKey(row.url));
   if(active){if(role==='seed'&&active.state==='pending'&&active.priority<200)result.promoted+=db.prepare('UPDATE tasks SET priority=200 WHERE id=?').run(active.id).changes;continue;}
   if(!opened){db.prepare('INSERT OR IGNORE INTO cycles(id,started) VALUES(?,?)').run(cycle,now);opened=true;}
   const id=insert.run(cycle,row.url,requestKey(row.url),row.site,role,role==='article'?100:200,now,row.findtime||now,'live_priority').lastInsertRowid;
   if(role==='article'&&link.run(id,row.key).changes!==1)throw Error('NEWS_LIVE_ADMISSION_CHANGED');result.added++;
  }},'live_admission_'+role);onProgress({...result});await yieldImmediate();
 }
 return result;
}
