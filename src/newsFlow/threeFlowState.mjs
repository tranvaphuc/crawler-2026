import {randomUUID,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import {NewsState} from './state.mjs';
import {articleKey,requestKey,urlAliases} from './identity.mjs';
import {setImmediate as yieldImmediate} from 'node:timers/promises';
import {newsArticleRejection} from '../web/newsArticleAdmission.mjs';
import {NewsSqliteWriteBatch} from './sqliteWriteBatch.mjs';
import {initializePublicationFeedStore,rememberPublicationFeed,recalledPublicationFeed} from './publicationFeedStore.mjs';
import {initializePublicationFeedArticleStore,prepareFullPublicationFeed,storeFullPublicationFeed,recalledPublicationArticle} from './publicationFeedArticleStore.mjs';
import {categoryUrl} from './categoryCoverage.mjs';
import {admitSeedRound} from './seedRound.mjs';
const seedNextRoundReasons=new Set(['request_deadline_exceeded','public_api_request_deadline_exceeded','service_interrupted_no_retry']);

export class ThreeFlowState extends NewsState {
 rememberCategoryHints(source,categories,parent,now=Date.now()){
  const known=new Set((source.seeds||[]).map(articleKey)),rows=new Map();for(const c of categories||[]){const url=categoryUrl(c.url,parent,source);if(!url)continue;const key=articleKey(url);if(!known.has(key))rows.set(key,url);}
  if(!rows.size)return 0;
  return this.tx(()=>{let added=0;const seed=this.db.prepare('SELECT 1 FROM seed_sources WHERE url_key=?'),article=this.db.prepare('SELECT parse_status FROM article_links WHERE parse_key=?'),prior=this.db.prepare('SELECT 1 FROM news_category_hints WHERE site=? AND key=?'),insert=this.db.prepare("INSERT INTO news_category_hints(site,key,url,parent,first_at,last_at) VALUES(?,?,?,?,?,?) ON CONFLICT(site,key) DO UPDATE SET last_at=excluded.last_at WHERE news_category_hints.last_at+3600000<=excluded.last_at");for(const [key,url] of rows){if(seed.get(requestKey(url))||article.get(key)?.parse_status==='done')continue;const exists=prior.get(source.domain,key);insert.run(source.domain,key,url,parent,now,now);if(!exists)added++;}return added;},'remember_category_hints');
 }
 rememberFullPublicationFeed(context){const rows=prepareFullPublicationFeed(context);return this.writeAsync(()=>storeFullPublicationFeed(this.db,rows));}
 recalledPublicationArticle(feed,url){return recalledPublicationArticle(this.db,feed,url);}
 rememberPublicationFeed(context){return this.writeAsync(()=>rememberPublicationFeed(this.db,context));}
 recalledPublicationFeed(feed,url){return recalledPublicationFeed(this.db,feed,url);}
 sampleWriteStats={saved:0,bytes:0,goodSkipped:0,seedSkipped:0};
 enableWriteBatching({touchIntervalMs=0,goodSampleIntervalMs=0,skipSeedReviewSamples=false,...options}={}){this.discoveryTouchIntervalMs=touchIntervalMs;this.goodSampleIntervalMs=goodSampleIntervalMs;this.skipSeedReviewSamples=skipSeedReviewSamples;return this.writeBatch??=new NewsSqliteWriteBatch(this,options);}
 writeAsync(fn){return this.writeBatch?this.writeBatch.run(fn):Promise.resolve().then(fn);}
 reserveRequest(cycle,url){return this.writeAsync(()=>this.reserve(cycle,url));}
 completeHttpResponse(cycle,url,page){return this.writeAsync(()=>{if(page.error)this.failUrl({url,site:page.site,role:page.role},page.error);const {site,role,...metadata}=page;this.responseText(cycle,url,metadata.html||null,{...metadata,html:undefined});});}
 claimAvailable(role,limit){return this.writeAsync(()=>{const tasks=[],started=performance.now();for(let i=0;i<Math.min(limit,32);i++){const task=this.claim(role);if(!task)break;tasks.push(task);if(tasks.length>=16&&performance.now()-started>=8)break;}return tasks;});}
 releaseUnstartedClaims(tasks){return this.writeAsync(()=>this.tx(()=>{let released=0;const task=this.db.prepare("UPDATE tasks SET state='pending',lease_until=NULL WHERE id=? AND state='running'"),link=this.db.prepare("UPDATE article_links SET parse_status='queued' WHERE task_id=? AND parse_status='running'");for(const row of tasks){const result=task.run(row.id);if(result.changes){released++;if(row.role==='article')link.run(row.id);}}return released;}));}
 finishWrite(task,status,reason,options={}){const sample=Object.hasOwn(options,'sample')?options.sample:this.reviewSample(task);return this.writeAsync(()=>this.finish(task,status,reason,{sample}));}
 completeVerifiedWrite(task,doc,config,aliases,metric){const sample=this.reviewSample(task,{kind:'good'});return this.writeAsync(()=>this.completeVerified(task,doc,config,aliases,metric,{sample}));}
 completeHeldWrite(task,reason,details){const sample=this.reviewSample(task);return this.writeAsync(()=>this.completeHeld(task,reason,details,{sample}));}
 completeSeedWrite(task,reason,details){const sample=this.reviewSample(task);return this.writeAsync(()=>this.completeSeed(task,reason,details,{sample}));}
 configureSites(sources){const values=[...sources],approved=new Map();for(const r of this.db.prepare('SELECT site,url FROM news_category_sections').all()){const list=approved.get(r.site)||[];list.push(r.url);approved.set(r.site,list);}for(const s of values){const keys=new Set((s.seeds||[]).map(articleKey)),extra=(approved.get(s.domain)||[]).filter(url=>!keys.has(articleKey(url)));if(extra.length)s.seeds=[...s.seeds||[],...extra];}super.configureSites(values);this.articleSources=new Map(values.map(s=>[s.domain,s]));this.publisherTaskLimits=new Map(values.filter(s=>Number.isInteger(s.config.http?.maxConcurrentArticles)&&s.config.http.maxConcurrentArticles>0&&s.config.http.maxConcurrentArticles<=16).map(s=>[s.domain,s.config.http.maxConcurrentArticles]));}
 articleRejection(url,site){return newsArticleRejection(url,this.articleSources?.get(site)||{domain:site});}
 static async open(file){await fs.mkdir(path.dirname(path.resolve(file)),{recursive:true});const {DatabaseSync}=await import('node:sqlite');return new ThreeFlowState(new DatabaseSync(file));}
 tx(fn,operation){if(this.txDepth)return fn();const started=performance.now();try{return super.tx(()=>{this.txDepth=1;try{return fn();}finally{this.txDepth=0;}});}catch(e){if(e.code==='ERR_SQLITE_ERROR'&&operation){e.newsDbOperation??=operation;e.newsDbElapsedMs??=Math.round(performance.now()-started);}throw e;}}
 constructor(db){super(db);initializePublicationFeedStore(db);initializePublicationFeedArticleStore(db);db.exec(`
 CREATE TABLE IF NOT EXISTS seed_sources(url_key TEXT PRIMARY KEY,url TEXT NOT NULL,site TEXT NOT NULL,status TEXT,reason TEXT,last_at INTEGER,links_found INTEGER DEFAULT 0,new_links INTEGER DEFAULT 0,reviewed_at INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS article_links(parse_key TEXT PRIMARY KEY,url TEXT NOT NULL,site TEXT NOT NULL,parse_status TEXT NOT NULL DEFAULT 'pending',findtime INTEGER NOT NULL,first_at INTEGER NOT NULL,error TEXT,task_id INTEGER,config_version TEXT,reviewed_at INTEGER DEFAULT 0);
 CREATE INDEX IF NOT EXISTS article_links_ready ON article_links(parse_status,findtime DESC);
 CREATE INDEX IF NOT EXISTS article_links_site ON article_links(site,parse_status);
 CREATE INDEX IF NOT EXISTS task_pending_role_site_fifo ON tasks(role,site,created,id) WHERE state='pending';
 CREATE TABLE IF NOT EXISTS import_receipts(id TEXT PRIMARY KEY,es_id TEXT NOT NULL,es_index TEXT NOT NULL,es_type TEXT NOT NULL,status TEXT NOT NULL,url TEXT NOT NULL,imported_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS review_samples(site TEXT NOT NULL,url TEXT NOT NULL,kind TEXT NOT NULL,html BLOB NOT NULL,reason TEXT,at INTEGER NOT NULL,PRIMARY KEY(site,url));
 CREATE TABLE IF NOT EXISTS parser_overlays(site TEXT PRIMARY KEY,config TEXT NOT NULL,revision TEXT NOT NULL,verified_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS ai_reviews(id TEXT PRIMARY KEY,role TEXT NOT NULL,site TEXT NOT NULL,status TEXT NOT NULL,reason TEXT,at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS ai_usage(day TEXT PRIMARY KEY,calls INTEGER NOT NULL DEFAULT 0,usd REAL NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS news_category_hints(site TEXT NOT NULL,key TEXT NOT NULL,url TEXT NOT NULL,parent TEXT NOT NULL,first_at INTEGER NOT NULL,last_at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',reason TEXT,checked_at INTEGER,PRIMARY KEY(site,key));
 CREATE INDEX IF NOT EXISTS category_hints_state ON news_category_hints(state,site);
 CREATE TABLE IF NOT EXISTS news_category_backfill(parse_key TEXT PRIMARY KEY,site TEXT NOT NULL,url TEXT NOT NULL,found_on TEXT NOT NULL,discovered_at INTEGER NOT NULL,es_id TEXT,es_index TEXT);
 CREATE TABLE IF NOT EXISTS news_category_sections(site TEXT NOT NULL,key TEXT NOT NULL,url TEXT NOT NULL,verified_at INTEGER NOT NULL,evidence TEXT,found_on TEXT,PRIMARY KEY(site,key));
 CREATE INDEX IF NOT EXISTS news_requests_fetching ON requests(cycle,url_key) WHERE state='fetching';
 CREATE INDEX IF NOT EXISTS news_tasks_terminal_age ON tasks(created,id) WHERE state IN ('done','held','skipped');
 CREATE INDEX IF NOT EXISTS news_cycles_started ON cycles(started);
 CREATE INDEX IF NOT EXISTS news_events_age ON events(at,id);
 CREATE INDEX IF NOT EXISTS news_review_samples_age ON review_samples(at);
 `);this.capture=new Map();this.linkStats=new Map();this.cacheResponses=false;this.preparedReviewSamples=new Map();this.pendingTaskEvents=new Map();}
 lock(now=Date.now(),scope='main',{processLock}={}){
  if(!processLock)return super.lock(now,scope);
  if(processLock.scope!==scope||!processLock.owns())throw Error('NEWS_PROCESS_LOCK_REQUIRED');
  // The kernel lock proves that the previous process has exited, even if its
  // SQLite lease could not be released before a crash or SIGKILL.
  return this.tx(()=>{const owner=randomUUID();this.db.prepare('INSERT OR REPLACE INTO runner(id,owner,expires) VALUES(?,?,?)').run(scope,owner,now+90000);return owner;});
 }
 migrateThreeFlows(registry){return this.tx(()=>{
  if(this.db.prepare("SELECT 1 FROM flow_meta WHERE key='three_flows_v1'").get()){
   // A rollback can let the legacy runner finish jobs after the first migration.
   this.db.exec("UPDATE article_links AS a SET parse_status=CASE WHEN t.state='held' THEN 'fail' ELSE 'done' END,error=t.reason,findtime=max(a.findtime,t.seen_at,t.created) FROM tasks AS t WHERE a.task_id=t.id AND a.url=t.url AND a.parse_status IN ('queued','running') AND t.role='article' AND t.state IN ('done','held')");
   return {migrated:false,reconciled:true};
  }
  const insert=this.db.prepare('INSERT OR IGNORE INTO article_links(parse_key,url,site,parse_status,findtime,first_at,error,task_id) VALUES(?,?,?,?,?,?,?,?)');
  for(const t of this.db.prepare("SELECT a.*,t.url,t.state,t.reason,t.seen_at,t.created,t.id live_id FROM parse_admissions a LEFT JOIN tasks t ON t.id=a.task_id AND t.url_key=a.request_key AND t.role='article'").iterate()){
   const status=['pending','running'].includes(t.state)?'queued':t.state==='held'?'fail':'done';
   insert.run(t.parse_key,t.url||t.parse_key,t.site,status,Math.max(t.first_at,t.seen_at||t.created||0),t.first_at,t.reason||null,t.live_id??null);
  }
  const cat=this.db.prepare("INSERT INTO article_links(parse_key,url,site,parse_status,findtime,first_at,error) VALUES(?,?,?,?,?,?,?) ON CONFLICT(parse_key) DO UPDATE SET parse_status=CASE WHEN article_links.parse_status='queued' THEN article_links.parse_status ELSE excluded.parse_status END,error=excluded.error");
  for(const t of this.db.prepare('SELECT * FROM article_catalog').iterate())try{cat.run(articleKey(t.url_key),t.url_key,t.site,t.status==='held'?'fail':'done',t.processed_at,t.processed_at,t.reason);}catch(e){if(e.code==='ERR_SQLITE_ERROR')throw e;}
  // Include checkpoints older than the admission-ledger migration without changing exact request URLs.
  for(const t of this.db.prepare("SELECT * FROM tasks WHERE role='article' AND state IN ('pending','running') ORDER BY id").iterate()){
   const key=articleKey(t.url);insert.run(key,t.url,t.site,'queued',t.seen_at||t.created,t.created,null,t.id);
  }
  const source=this.db.prepare('INSERT OR IGNORE INTO seed_sources(url_key,url,site,status,reason) VALUES(?,?,?,?,?)');
  for(const s of registry.sources.values())for(const url of s.seeds){const key=requestKey(url),failed=this.db.prepare('SELECT reason FROM url_failures WHERE url_key=?').get(key);source.run(key,url,s.domain,failed?'fail':null,failed?.reason||null);}
  this.db.prepare("INSERT INTO flow_meta VALUES('three_flows_v1',?)").run(new Date().toISOString());
  return {migrated:true,articles:this.db.prepare('SELECT count(*) n FROM article_links').get().n,seeds:this.db.prepare('SELECT count(*) n FROM seed_sources').get().n};
 });}
 syncSeeds(registry){
  const existing=new Set(this.db.prepare('SELECT url_key FROM seed_sources').all().map(r=>r.url_key)),missing=new Map();
  for(const source of registry.sources.values())for(const url of source.seeds){const key=requestKey(url);if(!existing.has(key)&&!missing.has(key))missing.set(key,[key,url,source.domain]);}
  const rows=[...missing.values()],insert=this.db.prepare('INSERT OR IGNORE INTO seed_sources(url_key,url,site) VALUES(?,?,?)');let added=0;
  for(let i=0;i<rows.length;i+=100)this.tx(()=>{for(const row of rows.slice(i,i+100))added+=insert.run(...row).changes;},'sync_seeds');return {added,candidates:rows.length};
 }
 reopenSeedTimeouts(){return this.tx(()=>this.db.prepare("UPDATE seed_sources SET status='timeout' WHERE status='fail' AND reason IN (?,?,?)").run(...seedNextRoundReasons).changes);}
 failedUrl(key,{role,cycle}={}){
  if(role!=='seed')return super.failedUrl(key);
  const failure=this.db.prepare('SELECT reason FROM url_failures WHERE url_key=?').get(key);
  if(!failure)return false;
  // Only an active seed round may pass an earlier failure. The per-cycle request
  // record still prevents a second wire request; article failures stay blocked.
  return !this.db.prepare("SELECT 1 FROM tasks WHERE cycle=? AND role='seed' AND state='running' LIMIT 1").get(cycle||'');
 }
 discover(url,site,now=Date.now()){
  if(this.articleRejection(url,site))return false;
  const key=articleKey(url),r=this.db.prepare("INSERT INTO article_links(parse_key,url,site,findtime,first_at) VALUES(?,?,?,?,?) ON CONFLICT(parse_key) DO UPDATE SET findtime=max(findtime,excluded.findtime) WHERE article_links.parse_status='pending' OR article_links.findtime+?<=excluded.findtime").run(key,url,site,now,now,this.discoveryTouchIntervalMs||0);return this.db.prepare('SELECT parse_status,first_at FROM article_links WHERE parse_key=?').get(key).first_at===now&&r.changes===1;
 }
 enqueueOne(cycle,url,site,role,foundOn,priority,options={}){
  if(role!=='article')return super.enqueueOne(cycle,url,site,role,foundOn,priority,options);
  if(this.articleRejection(url,site))return null;
  const fresh=!this.db.prepare('SELECT 1 FROM article_links WHERE parse_key=?').get(articleKey(url));this.discover(url,site,options.seenAt||Date.now());
  const stats=this.linkStats.get(cycle+'|'+foundOn)||{found:0,added:0};stats.found++;stats.added+=Number(fresh);this.linkStats.set(cycle+'|'+foundOn,stats);return null;
 }
 enqueueBatch(cycle,urls,site,role='article',foundOn=null,priority=50,options={}){
  if(role!=='article')return super.enqueueBatch(cycle,urls,site,role,foundOn,priority,options);
  if(!urls.length)return [];
  const seenAt=options.seenAt||Date.now(),unique=new Map();for(const item of urls){const url=typeof item==='string'?item:item.url;if(this.articleRejection(url,site))continue;const key=articleKey(url);if(!unique.has(key))unique.set(key,url);}
  if(!unique.size)return [];
  const payload=JSON.stringify([...unique]);
  return this.tx(()=>{
   const existing=this.db.prepare("SELECT count(*) n FROM json_each(?) j CROSS JOIN article_links a ON a.parse_key=json_extract(j.value,'$[0]')").get(payload).n;
   this.db.prepare(`INSERT INTO article_links(parse_key,url,site,findtime,first_at)
    SELECT json_extract(j.value,'$[0]'),json_extract(j.value,'$[1]'),?,?,? FROM json_each(?) j WHERE true
    ON CONFLICT(parse_key) DO UPDATE SET findtime=max(article_links.findtime,excluded.findtime)
    WHERE article_links.parse_status='pending' OR article_links.findtime+?<=excluded.findtime`).run(site,seenAt,seenAt,payload,this.discoveryTouchIntervalMs||0);
   const key=cycle+'|'+foundOn,stats=this.linkStats.get(key)||{found:0,added:0};stats.found+=urls.length;stats.added+=unique.size-existing;this.linkStats.set(key,stats);return Array(urls.length).fill(null);
  });
 }
 claim(role='article',sites=null,{ids=null}={}){
  if(ids&&!ids.length)return null;
  return this.tx(()=>{
   // Rotate through pending sites, retaining FIFO within each site. A running
   // job never blocks another claim, even when only one pending site remains.
   let {scope,params}=this.readyWhere(sites);let task;
   const blocked=[];if(role==='article')for(const [site,limit] of this.publisherTaskLimits||[]){if(this.db.prepare("SELECT count(*) n FROM tasks WHERE site=? AND role='article' AND state='running'").get(site).n>=limit)blocked.push(site);}
   if(blocked.length){scope+=' AND t.site NOT IN ('+blocked.map(()=>'?').join(',')+')';params=[...params,...blocked];}
   if(ids){const batch=' AND t.id IN ('+ids.map(()=>'?').join(',')+')',order='CASE t.id '+ids.map((_,i)=>'WHEN ? THEN '+i).join(' ')+' END';task=this.db.prepare("SELECT t.* FROM tasks t WHERE t.state='pending' AND t.role=?"+scope+batch+' ORDER BY '+order+' LIMIT 1').get(role,...params,...ids,...ids);}
   else{
    const key='three_flow_site_cursor_'+role;
    const select="SELECT t.* FROM tasks t WHERE t.state='pending' AND t.role=?"+scope;
    // Independent cursors keep archive claims from resetting live rotation.
    const threshold=role==='article'?100:200,turn=(this.liveClaimTurns??={})[role]||0;
    const pick=live=>{
     const laneKey=key+(live?'_live':''),cursor=this.db.prepare('SELECT value FROM flow_meta WHERE key=?').get(laneKey)?.value||'',lane=' AND t.priority'+(live?'>=':'<')+threshold;
     const found=this.db.prepare(select+lane+' AND t.site>? ORDER BY t.site,t.created,t.id LIMIT 1').get(role,...params,cursor)||this.db.prepare(select+lane+' ORDER BY t.site,t.created,t.id LIMIT 1').get(role,...params);
     if(found)this.db.prepare('INSERT INTO flow_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(laneKey,found.site);return found;
    };
    const preferLive=turn%5!==4;task=pick(preferLive)||pick(!preferLive);if(task)this.liveClaimTurns[role]=turn+1;
   }
   if(!task)return null;
   this.db.prepare("UPDATE tasks SET state='running',lease_until=? WHERE id=?").run(Date.now()+300000,task.id);
   if(role==='article')this.db.prepare("UPDATE article_links SET parse_status='running' WHERE parse_key=? AND parse_status='queued'").run(articleKey(task.url));return task;
  });
 }
 master(role,now=Date.now()){const steps=this.masterSteps(role,now);let step;do{step=steps.next();}while(!step.done);return step.value;}
 async masterFull(role,now=Date.now(),{onProgress=()=>{}}={}){const steps=this.masterSteps(role,now);let step;while(!(step=steps.next()).done){onProgress(step.value);await yieldImmediate();}return step.value;}
 *masterSteps(role,now=Date.now()){
  if(!['seed','article'].includes(role))throw Error('NEWS_INVALID_MASTER_ROLE');
  if(role==='seed')return admitSeedRound(this,now);
  const started=performance.now(),marker='three_flow_master_admission_'+role,stored=this.db.prepare('SELECT value FROM flow_meta WHERE key=?').get(marker),resume=stored?JSON.parse(stored.value):null;
  if(resume&&(!resume.cycle?.startsWith('q-'+role+'-')||!Number.isFinite(resume.started)))throw Error('NEWS_MASTER_ADMISSION_INVALID');
  const active=this.db.prepare("SELECT cycle FROM tasks WHERE role=? AND state IN ('pending','running') ORDER BY created,id LIMIT 1"),current=active.get(role);
  if(current&&current.cycle!==resume?.cycle)return {added:0,reason:'queue_not_empty'};
  const admission=resume||{cycle:'q-'+role+'-'+randomUUID(),started:now},cycle=admission.cycle;
  let rows,total;
  if(role==='seed'){
   rows=this.db.prepare("SELECT s.url_key key,s.url FROM seed_sources s WHERE coalesce(s.status,'') NOT IN ('fail','die') AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.cycle=? AND t.url_key=s.url_key) ORDER BY s.url_key").all(cycle);total=rows.length;
  }else{
   // Materialize the ordered snapshot in SQLite's temp file, never in V8's heap.
   // Seed sightings may update findtime while admission yields between chunks.
   this.db.exec('PRAGMA temp_store=FILE; DROP TABLE IF EXISTS temp.news_admission_snapshot; CREATE TEMP TABLE news_admission_snapshot(ordinal INTEGER PRIMARY KEY,key TEXT NOT NULL,url TEXT NOT NULL)');
   this.db.prepare("INSERT INTO temp.news_admission_snapshot(key,url) SELECT parse_key,url FROM article_links WHERE parse_status='pending' AND first_at<=? ORDER BY findtime DESC").run(admission.started);
   total=this.db.prepare('SELECT count(*) n FROM temp.news_admission_snapshot').get().n;
  }
  try{
  if(!total){if(resume)this.tx(()=>this.db.prepare('DELETE FROM flow_meta WHERE key=?').run(marker));return {added:0,reason:'no_pending_links'};}
  const result={added:0,cycle,batchLimit:null,admission:'all_eligible_when_empty',prepareMs:performance.now()-started,writeMs:0,maxWriteMs:0,maxAcquireMs:0,writeBatches:0,resumed:!!resume};
  for(let offset=0;offset<total;offset+=1000){
   const chunk=role==='seed'?rows.slice(offset,offset+1000):this.db.prepare('SELECT key,url FROM temp.news_admission_snapshot WHERE ordinal>? ORDER BY ordinal LIMIT 1000').all(offset);
   const preparing=performance.now(),keys=chunk.map(r=>[r.key,requestKey(r.url)]),payload=JSON.stringify(keys),byRequest=new Map(keys.map(([key,urlKey])=>[urlKey,key])),index=offset/1000;
   result.prepareMs+=performance.now()-preparing;yield {phase:'prepare',prepared:Math.min(offset+1000,total),total};
   const before=performance.now();let acquired;
   try{const batch=this.tx(()=>{
   acquired=performance.now();
   if(index===0){const check=active.get(role);if(check&&check.cycle!==resume?.cycle)return {blocked:true};this.db.prepare('INSERT OR IGNORE INTO cycles(id,started) VALUES(?,?)').run(cycle,admission.started);this.db.prepare('INSERT OR REPLACE INTO flow_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(admission));}
   const queued=role==='seed'?this.db.prepare(`INSERT INTO tasks(cycle,url,url_key,site,role,priority,created,seen_at)
    SELECT ?,s.url,json_extract(j.value,'$[1]'),s.site,'seed',100,?,? FROM json_each(?) j
    CROSS JOIN seed_sources s ON s.url_key=json_extract(j.value,'$[0]') WHERE coalesce(s.status,'') NOT IN ('fail','die')
    ORDER BY CAST(j.key AS INTEGER)
    RETURNING id,url_key`).all(cycle,admission.started,admission.started,payload):this.db.prepare(`INSERT INTO tasks(cycle,url,url_key,site,role,priority,created,seen_at)
    SELECT ?,a.url,json_extract(j.value,'$[1]'),a.site,'article',50,?,coalesce(nullif(a.findtime,0),?) FROM json_each(?) j
    CROSS JOIN article_links a ON a.parse_key=json_extract(j.value,'$[0]') WHERE a.parse_status='pending' ORDER BY CAST(j.key AS INTEGER)
    RETURNING id,url_key`).all(cycle,admission.started,admission.started,payload);
   if(role==='article'&&queued.length)this.db.prepare(`UPDATE article_links AS a SET parse_status='queued',task_id=json_extract(j.value,'$[1]')
    FROM json_each(?) j WHERE a.parse_key=json_extract(j.value,'$[0]')`).run(JSON.stringify(queued.map(t=>[byRequest.get(t.url_key),t.id])));
   if(offset+1000>=total)this.db.prepare('DELETE FROM flow_meta WHERE key=?').run(marker);
   return {added:queued.length};
   });if(batch.blocked)return {added:0,reason:'queue_not_empty'};
   const writeMs=performance.now()-acquired;result.added+=batch.added;result.writeMs+=writeMs;result.maxWriteMs=Math.max(result.maxWriteMs,writeMs);result.maxAcquireMs=Math.max(result.maxAcquireMs,acquired-before);result.writeBatches++;yield {phase:'write',added:result.added,total,writeMs};
   }catch(e){if(e.code==='ERR_SQLITE_ERROR'){e.newsDbOperation='master_'+role;e.newsDbElapsedMs=Math.round(performance.now()-started);}throw e;}
  }
  for(const key of ['prepareMs','writeMs','maxWriteMs','maxAcquireMs'])result[key]=Math.round(result[key]);result.durationMs=Math.round(performance.now()-started);return result;
  }finally{if(role==='article')this.db.exec('DROP TABLE IF EXISTS temp.news_admission_snapshot');}
 }
 recoverRole(role){return this.tx(()=>{
  let failed=0;for(const t of this.db.prepare("SELECT * FROM tasks WHERE role=? AND state='running'").all(role)){const link=role==='article'&&this.db.prepare('SELECT parse_status FROM article_links WHERE parse_key=?').get(articleKey(t.url));if(link?.parse_status==='done')this.db.prepare("UPDATE tasks SET state='done',reason='verified_outbox',lease_until=NULL WHERE id=?").run(t.id);else{this.finish(t,'held','service_interrupted_no_retry');failed++;}}
  this.db.prepare("UPDATE requests SET state='failed',metadata=? WHERE state='fetching' AND EXISTS(SELECT 1 FROM tasks t WHERE t.cycle=requests.cycle AND t.url_key=requests.url_key AND t.role=?)").run(JSON.stringify({error:'service_interrupted_no_retry'}),role);return failed;
 },'recover_'+role);}
 saveCache(){} // Heavy HTML is held only for the current job and bounded review examples.
 response(cycle,url,data,metadata){if(data&&this.db.prepare("SELECT 1 FROM tasks WHERE cycle=? AND url_key=? AND state='running'").get(cycle,requestKey(url)))this.capture.set(cycle+'|'+requestKey(url),data);this.db.prepare('UPDATE requests SET state=?,response=NULL,metadata=? WHERE cycle=? AND url_key=?').run(metadata.error?'failed':'done',JSON.stringify(metadata),cycle,requestKey(url));}
 responseText(cycle,url,html,metadata){return this.response(cycle,url,html,metadata);}
 retain(){return null;}
 samplePayload(data){if(!data)return null;try{const html=typeof data==='string'?data:gunzipSync(data).toString();return html.length<=2000000?gzipSync(html):null;}catch{return null;}}
 prepareReviewSample(task,sample){
  const key=task.cycle+'|'+task.url_key,html=this.capture.get(key);
  if(typeof html!=='string'||html.length>2000000||!sample?.compressed||!(sample.compressed instanceof Uint8Array)||sample.htmlHash!==createHash('sha256').update(html).digest('hex'))return false;
  this.preparedReviewSamples.set(key,Buffer.from(sample.compressed));return true;
 }
 goodSampleDue(site){if(!this.goodSampleIntervalMs)return true;const row=(this.goodSampleStatus??=this.db.prepare("SELECT count(*) n,max(at) last_at FROM review_samples WHERE site=? AND kind='good'")).get(site);return row.n<3||row.last_at<=Date.now()-this.goodSampleIntervalMs;}
 reviewSample(task,{kind}={}){if(task.role==='seed'&&this.skipSeedReviewSamples){this.sampleWriteStats.seedSkipped++;return null;}if(kind==='good'&&!this.goodSampleDue(task.site)){this.sampleWriteStats.goodSkipped++;return null;}return this.preparedReviewSamples.get(task.cycle+'|'+task.url_key)||this.samplePayload(this.capture.get(task.cycle+'|'+task.url_key));}
 recordTaskEvent(task,kind,{cycle=null,url=null,site=null,...details}){
  const key=task.cycle+'|'+task.url_key,records=this.pendingTaskEvents.get(key)||[];records.push([Date.now(),cycle,url,site,kind,JSON.stringify(details)]);this.pendingTaskEvents.set(key,records);
 }
 flushTaskEvents(task){
  const key=task.cycle+'|'+task.url_key,records=this.pendingTaskEvents.get(key);if(!records)return;
  const insert=this.taskEventInsert??=this.db.prepare('INSERT INTO events(at,cycle,url,site,kind,details) VALUES(?,?,?,?,?,?)');for(const record of records)insert.run(...record);this.pendingTaskEvents.delete(key);
 }
 completeVerified(task,doc,config,aliases,metric,{sample=this.reviewSample(task)}={}){return this.tx(()=>{this.offer(doc,config,aliases);this.finish(task,'done','verified_outbox',{sample});this.event('verified',metric);},'finish_verified');}
 completeHeld(task,reason,details,{sample=this.reviewSample(task)}={}){return this.tx(()=>{this.flushTaskEvents(task);this.event('quarantine',details);this.finish(task,'held',reason,{sample});},'finish_held');}
 completeSeed(task,reason,details,{sample=this.reviewSample(task)}={}){return this.tx(()=>{
  this.event('seed',details);this.finish(task,'done',reason,{sample});
  if(['public_publication_feed_listing','publisher_public_news_api','public_government_api','public_web30_state','static_public_api_fields'].includes(details.normalization)&&details.links>0){
   const verified=[task.url],config=this.articleSources?.get(task.site)?.config;
   try{const final=new URL(details.finalUrl),hosts=config?.allowedHosts||[new URL(task.url).hostname];if(/^https?:$/.test(final.protocol)&&!final.username&&!final.password&&hosts.some(h=>h.replace(/^www\./,'')===final.hostname.replace(/^www\./,'')))verified.push(final.href);}catch{}
   for(const key of new Set(verified.flatMap(urlAliases).map(requestKey)))this.db.prepare("DELETE FROM url_failures WHERE url_key=? AND reason IN ('empty_page','URL_AWAITING_SEPARATE_REVIEW')").run(key);
  }
 },'finish_seed');}
 storePreparedSample(site,url,data,kind,reason){if(!data)return;if(kind==='good'&&!this.goodSampleDue(site)){this.sampleWriteStats.goodSkipped++;return;}this.db.prepare('INSERT INTO review_samples VALUES(?,?,?,?,?,?) ON CONFLICT(site,url) DO UPDATE SET kind=excluded.kind,html=excluded.html,reason=excluded.reason,at=excluded.at').run(site,url,kind,data,reason,Date.now());this.db.prepare('DELETE FROM review_samples WHERE site=? AND kind=? AND url NOT IN (SELECT url FROM review_samples WHERE site=? AND kind=? ORDER BY at DESC LIMIT 3)').run(site,kind,site,kind);this.sampleWriteStats.saved++;this.sampleWriteStats.bytes+=data.length;}
 storeSample(site,url,data,kind,reason){return this.storePreparedSample(site,url,this.samplePayload(data),kind,reason);}
 offer(doc,config,aliases){return this.tx(()=>{super.offer(doc,config,aliases);for(const url of aliases){this.db.prepare("UPDATE article_links SET parse_status='done',error=NULL,config_version=? WHERE parse_key=?").run(this.configVersions.get(config.siteName)||'',articleKey(url));this.db.prepare('UPDATE news_category_backfill SET es_id=?,es_index=? WHERE parse_key=?').run(doc._id,doc._index,articleKey(url));}});}
 finish(task,status='done',reason=null,{sample=this.reviewSample(task)}={}){return this.tx(()=>{
  this.flushTaskEvents(task);
  if(status==='pending'){status='held';reason=reason||'deferred_job_not_retried';}
  super.finish(task,status,reason);
  // These public SPA publishers return an empty shell before their verified
  // content API is read. A successful logical job supersedes that shell error.
  if(status==='done'&&['mof.gov.vn','vietnamtourism.gov.vn'].includes(task.site)&&(reason==='verified_outbox'||task.role==='seed'&&reason==='links_found'))for(const url of urlAliases(task.url))this.db.prepare("DELETE FROM url_failures WHERE url_key=? AND reason='empty_page'").run(requestKey(url));
  if(status==='done'&&task.site==='baomoi.com'&&reason==='verified_outbox')for(const raw of [task.url,task.url.replace(/-c(\d+)\.epi$/,'-r$1.epi')])for(const alias of urlAliases(raw))this.db.prepare("DELETE FROM url_failures WHERE url_key=? AND reason='empty_page'").run(requestKey(alias));
  const key=task.cycle+'|'+task.url_key,stats=this.linkStats.get(task.cycle+'|'+task.url)||{found:0,added:0};
  if(task.role==='seed')this.db.prepare('UPDATE seed_sources SET status=?,reason=?,last_at=?,links_found=?,new_links=? WHERE url_key=?').run(status==='held'?(seedNextRoundReasons.has(reason)?'timeout':'fail'):'ok',reason,Date.now(),stats.found,stats.added,task.url_key);
  else this.db.prepare("UPDATE article_links SET parse_status=?,error=?,config_version=? WHERE parse_key=?").run((reason?.startsWith('non_article:')||status==='done'&&['outside_new_article_window','outside_new_article_window_fast'].includes(reason))?'skipped':status==='done'&&reason==='verified_outbox'?'done':'fail',reason==='verified_outbox'?null:reason,this.configVersions.get(task.site)||'',articleKey(task.url));
  if(!reason?.startsWith('non_article:'))this.storePreparedSample(task.site,task.url,sample,status==='held'?'fail':'good',reason);
  this.capture.delete(key);this.preparedReviewSamples.delete(key);this.linkStats.delete(task.cycle+'|'+task.url);
  // Redirect/public API responses belong to this completed job too.
  if(!this.db.prepare("SELECT 1 FROM tasks WHERE cycle=? AND state='running' AND id<>? LIMIT 1").get(task.cycle,task.id))for(const k of this.capture.keys())if(k.startsWith(task.cycle+'|')){this.capture.delete(k);this.preparedReviewSamples.delete(k);}
 });}
 terminalReceipt(id,status){return this.tx(()=>{const r=this.db.prepare('SELECT doc,config FROM outbox WHERE id=?').get(id);if(!r)return;const d=JSON.parse(r.doc),target=this.known(d._source.url,JSON.parse(r.config))||d;this.db.prepare('INSERT OR IGNORE INTO import_receipts VALUES(?,?,?,?,?,?,?)').run(id,target._id,target._index,target._type,status,d._source.url,Date.now());this.db.prepare('DELETE FROM outbox WHERE id=?').run(id);});}
 claimWrites(limit=100){return this.tx(()=>{const rows=this.pendingWrites(limit);if(rows.length)this.db.prepare("UPDATE outbox SET state='sending',attempts=attempts+1 WHERE id IN ("+rows.map(()=>'?').join(',')+") AND state='pending'").run(...rows.map(r=>r.id));return rows.map(r=>({...r,state:'sending'}));},'claim_writes');}
 holdInterruptedWrites(){return this.db.prepare("UPDATE outbox SET state='held',reason='ES5_SERVICE_INTERRUPTED_UNCONFIRMED_NO_RETRY' WHERE state='sending'").run().changes;}
 confirmDirectWrite(id,doc,status){return this.tx(()=>{if(!['created','existing'].includes(status))throw Error('ES5_DIRECT_CONFIRMATION_INVALID');if(!this.db.prepare("SELECT 1 FROM outbox WHERE id=? AND state='sending'").get(id))return false;this.db.prepare('INSERT OR IGNORE INTO import_receipts VALUES(?,?,?,?,?,?,?)').run(id,doc._id,doc._index,doc._type,status,doc._source.url,Date.now());this.db.prepare('DELETE FROM outbox WHERE id=?').run(id);return true;});}
 writeState(id,status,reason=null){if(['created','existing'].includes(status))return this.terminalReceipt(id,status);return super.writeState(id,status,reason);}
 retryWrite(id,reason,delay=30000){super.retryWrite(id,reason,delay);throw Object.assign(Error('NEWS_ES_WRITE_REQUIRES_RESTART'),{code:'NEWS_ES_WRITE_REQUIRES_RESTART'});}
 cleanup(now=Date.now()){const steps=this.cleanupSteps(now);let step;do{step=steps.next();}while(!step.done);return step.value.linksRemoved;}
 async cleanupFull(now=Date.now(),{onProgress=()=>{},shouldStop=()=>false}={}){
  const steps=this.cleanupSteps(now);let step,write=false;while(true){step=write&&this.writeBatch?await this.writeAsync(()=>steps.next()):steps.next();if(step.done)break;onProgress(step.value);if(shouldStop()){steps.return();return {...step.value,cancelled:true};}write=step.value.phase==='selected';await yieldImmediate();}return step.value;
 }
 *cleanupSteps(now=Date.now()){
  const started=performance.now(),limit=100,stats={linksRemoved:0,deleted:{},writeBatches:0,maxWriteMs:0,maxAcquireMs:0,cancelled:false};
  const day=now-86400000;
  const jobs=[
   ['links',"SELECT parse_key AS key FROM article_links INDEXED BY article_links_ready WHERE parse_status='done' AND findtime<? LIMIT ?",[now-30*86400000],payload=>{
    const removed=this.db.prepare("DELETE FROM article_links INDEXED BY sqlite_autoindex_article_links_1 WHERE parse_status='done' AND findtime<? AND parse_key IN (SELECT value FROM json_each(?)) RETURNING parse_key").all(now-30*86400000,payload);
    if(removed.length)this.db.prepare('DELETE FROM parse_admissions WHERE parse_key IN (SELECT value FROM json_each(?))').run(JSON.stringify(removed.map(r=>r.parse_key)));return removed.length;
   }],
   ['samples','SELECT rowid AS key FROM review_samples INDEXED BY news_review_samples_age WHERE at<? LIMIT ?',[now-2*86400000],payload=>this.db.prepare('DELETE FROM review_samples NOT INDEXED WHERE at<? AND rowid IN (SELECT value FROM json_each(?))').run(now-2*86400000,payload).changes],
   ['tasks',"SELECT id AS key FROM tasks INDEXED BY news_tasks_terminal_age WHERE created<? AND state IN ('done','held','skipped') LIMIT ?",[day],payload=>this.db.prepare("DELETE FROM tasks NOT INDEXED WHERE created<? AND state IN ('done','held','skipped') AND id IN (SELECT value FROM json_each(?))").run(day,payload).changes],
   ['requests',"SELECT r.rowid AS key FROM cycles c INDEXED BY news_cycles_started CROSS JOIN requests r INDEXED BY sqlite_autoindex_requests_1 WHERE c.started<? AND r.cycle=c.id AND r.state!='fetching' LIMIT ?",[day],payload=>this.db.prepare("DELETE FROM requests NOT INDEXED WHERE state!='fetching' AND cycle IN (SELECT id FROM cycles WHERE started<?) AND rowid IN (SELECT value FROM json_each(?))").run(day,payload).changes],
   ['cycles','SELECT c.id AS key FROM cycles c INDEXED BY news_cycles_started WHERE c.started<? AND NOT EXISTS(SELECT 1 FROM tasks WHERE tasks.cycle=c.id) LIMIT ?',[day],payload=>this.db.prepare('DELETE FROM cycles INDEXED BY sqlite_autoindex_cycles_1 WHERE started<? AND NOT EXISTS(SELECT 1 FROM tasks WHERE tasks.cycle=cycles.id) AND id IN (SELECT value FROM json_each(?))').run(day,payload).changes],
   ['events','SELECT id AS key FROM events INDEXED BY news_events_age WHERE at<? LIMIT ?',[now-7*86400000],payload=>this.db.prepare('DELETE FROM events NOT INDEXED WHERE at<? AND id IN (SELECT value FROM json_each(?))').run(now-7*86400000,payload).changes]
  ];
  for(const [name,sql,args,remove] of jobs){
   const select=this.db.prepare(sql);stats.deleted[name]=0;
   while(true){
    // Reads and serialization never reserve SQLite's single write lock.
    const rows=select.all(...args,limit);if(!rows.length)break;const payload=JSON.stringify(rows.map(r=>r.key));
    yield {...stats,phase:'selected',table:name};let acquired;const before=performance.now();
    const deleted=this.tx(()=>{acquired=performance.now();return remove(payload);},'cleanup_'+name);
    stats.deleted[name]+=deleted;if(name==='links')stats.linksRemoved+=deleted;stats.writeBatches++;stats.maxWriteMs=Math.max(stats.maxWriteMs,performance.now()-acquired);stats.maxAcquireMs=Math.max(stats.maxAcquireMs,acquired-before);
    yield {...stats,phase:'write',table:name};
   }
  }
  return {...stats,maxWriteMs:Math.round(stats.maxWriteMs),maxAcquireMs:Math.round(stats.maxAcquireMs),durationMs:Math.round(performance.now()-started)};
 }
 loadOverlays(registry){for(const r of this.db.prepare('SELECT * FROM parser_overlays').all()){const s=registry.sources.get(r.site);if(s)s.config={...JSON.parse(r.config),...(s.config.publicationTimePolicy?{publicationTimePolicy:s.config.publicationTimePolicy,timezone:s.config.timezone,timezoneProvenance:s.config.timezoneProvenance}:{}),...(s.config.midnightProvenance?{midnightProvenance:s.config.midnightProvenance}:{}),...(s.config.publicationEvidencePolicy?.authority==='explicit_user_confirmation'?{publicationEvidencePolicy:s.config.publicationEvidencePolicy}:{}),...(s.config.publicationDatePolicy?{publicationDatePolicy:s.config.publicationDatePolicy}:{}),publicationValidationPolicy:'strict_native_publication_v1',publicationTimePolicy:s.config.publicationTimePolicy||'original_clock_required',publicationDatePolicy:'original_only',originalPublicationUncertainUrls:s.publicationHistoryQuarantine||[],...(s.publicationQuarantine?{originalPublicationBlockedReason:s.publicationQuarantine}:{})};}this.configureSites(registry.sources.values());}
 applyOverlay(site,config,reviewId,verifiedFailures=[],{snapshotAt=Date.now()}={}){return this.tx(()=>{
  if(!Array.isArray(verifiedFailures)||!Number.isFinite(snapshotAt))throw Error('NEWS_OVERLAY_VERIFICATION_REQUIRED');
  const now=Date.now(),revision=createHash('sha256').update(JSON.stringify(config)).digest('hex');
  this.db.prepare('INSERT OR REPLACE INTO parser_overlays VALUES(?,?,?,?)').run(site,JSON.stringify(config),revision,now);
  let requeued=0;const seen=new Set();
  for(const sample of verifiedFailures){const key=articleKey(sample.url);if(seen.has(key)||typeof sample.reason!=='string')continue;seen.add(key);
   const row=this.db.prepare('SELECT url,parse_status,error,reviewed_at FROM article_links WHERE site=? AND parse_key=?').get(site,key);
   if(!row||row.parse_status!=='fail'||row.error!==sample.reason||(row.reviewed_at||0)>=snapshotAt)continue;
   const aliases=[...new Set([...urlAliases(row.url),...urlAliases(sample.url)].map(requestKey))];
   if(aliases.some(alias=>(this.db.prepare('SELECT last_at FROM url_failures WHERE url_key=?').get(alias)?.last_at||0)>snapshotAt))continue;
   const result=this.db.prepare("UPDATE article_links SET parse_status='pending',error=NULL,reviewed_at=? WHERE site=? AND parse_key=? AND parse_status='fail' AND error=? AND coalesce(config_version,'')!=?").run(now,site,key,sample.reason,revision);requeued+=result.changes;
   if(result.changes)for(const alias of aliases)this.db.prepare("DELETE FROM url_failures WHERE url_key=? AND site=? AND role='article' AND last_at<=?").run(alias,site,snapshotAt);
  }
  this.db.prepare("UPDATE ai_reviews SET status='verified',reason=?,at=? WHERE id=?").run('verified_parser:'+revision,now,reviewId);
  return {revision,requeued};
 });}
}
