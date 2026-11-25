import {articleKey} from './identity.mjs';
// Durable queue admission history, independent of ES and of 24-hour task retention.
export function migrateParseQueueLedger(db){
 const flag='parse_queue_admissions_v1';if(db.prepare('SELECT 1 FROM flow_meta WHERE key=?').get(flag))return {migrated:false,retired:0,invalid:0};
 const history=db.prepare('INSERT INTO parse_admissions(parse_key,site,first_at,task_id,request_key) VALUES(?,?,?,NULL,NULL) ON CONFLICT(parse_key) DO UPDATE SET first_at=min(first_at,excluded.first_at),task_id=NULL,request_key=NULL');
 const active=db.prepare('INSERT INTO parse_admissions VALUES(?,?,?,?,?) ON CONFLICT(parse_key) DO UPDATE SET first_at=min(first_at,excluded.first_at),task_id=excluded.task_id,request_key=excluded.request_key');
 const seen=db.prepare('SELECT * FROM parse_admissions WHERE parse_key=?'),retire=db.prepare("UPDATE tasks SET state='skipped',reason='duplicate_parse_admission',lease_until=NULL WHERE id=?"),merge=db.prepare('UPDATE tasks SET priority=max(priority,?),seen_at=max(seen_at,?),published_hint=coalesce(published_hint,?) WHERE id=?');
 let retired=0,invalid=0;const key=raw=>{try{return articleKey(raw);}catch{invalid++;return null;}};
 for(const t of db.prepare('SELECT url_key,site,processed_at FROM article_catalog').all()){const k=key(t.url_key);if(k)history.run(k,t.site,t.processed_at);}
 for(const t of db.prepare("SELECT url,site,created FROM tasks WHERE role='article' AND (state IN ('done','held') OR state='skipped' AND coalesce(reason,'')!='duplicate_parse_admission')").all()){const k=key(t.url);if(k)history.run(k,t.site,t.created);}
 for(const t of db.prepare("SELECT * FROM tasks WHERE role='article' AND state IN ('pending','running') ORDER BY CASE state WHEN 'running' THEN 0 ELSE 1 END,id").all()){
  const k=key(t.url);if(!k){db.prepare("UPDATE tasks SET state='skipped',reason='invalid_parse_queue_url',lease_until=NULL WHERE id=?").run(t.id);retired++;continue;}
  const prior=seen.get(k);
  if(!prior||t.reason==='manual_refresh'&&prior.task_id===null){active.run(k,t.site,t.created,t.id,t.url_key);continue;}
  if(prior.task_id===t.id&&prior.request_key===t.url_key)continue;
  const owner=prior.task_id===null?null:db.prepare("SELECT id FROM tasks WHERE id=? AND url_key=? AND role='article' AND state IN ('pending','running')").get(prior.task_id,prior.request_key);
  if(owner)merge.run(t.priority,t.seen_at||t.created,t.published_hint,owner.id);
  retire.run(t.id);retired++;
 }
 db.prepare('INSERT INTO flow_meta VALUES(?,?)').run(flag,new Date().toISOString());
 return {migrated:true,retired,invalid,admitted:db.prepare('SELECT count(*) n FROM parse_admissions').get().n};
}
