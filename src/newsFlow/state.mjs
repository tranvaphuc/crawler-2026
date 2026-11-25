import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {requestKey,articleKey,nativeKey} from './identity.mjs';
import {selectNewsArticleBatch} from './articleBatch.mjs';
import {migrateParseQueueLedger} from './parseQueueLedger.mjs';
export class NewsState{
 static async open(file){await fs.mkdir(path.dirname(path.resolve(file)),{recursive:true});const {DatabaseSync}=await import('node:sqlite');return new NewsState(new DatabaseSync(file));}
 constructor(db){this.db=db;this.configVersions=new Map();db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS cycles(id TEXT PRIMARY KEY,started INTEGER NOT NULL,finished INTEGER);
 CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,cycle TEXT NOT NULL,url TEXT NOT NULL,url_key TEXT NOT NULL,site TEXT NOT NULL,role TEXT NOT NULL,priority INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',lease_until INTEGER,reason TEXT,found_on TEXT,created INTEGER NOT NULL,UNIQUE(cycle,url_key));
 CREATE INDEX IF NOT EXISTS task_ready ON tasks(state,priority,id);
 CREATE INDEX IF NOT EXISTS task_url_pending ON tasks(url_key,state);
 CREATE INDEX IF NOT EXISTS task_site_state ON tasks(site,state);
 CREATE INDEX IF NOT EXISTS task_role_fifo ON tasks(state,role,created,id);
 CREATE INDEX IF NOT EXISTS task_seed_active ON tasks(site,state) WHERE role='seed' AND state IN ('pending','running');
 CREATE INDEX IF NOT EXISTS task_pending_article_site_time ON tasks(site,created,id) WHERE role='article' AND state='pending';
 CREATE TABLE IF NOT EXISTS seed_schedule(site TEXT PRIMARY KEY,next_at INTEGER NOT NULL,cycle TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS article_catalog(url_key TEXT PRIMARY KEY,site TEXT NOT NULL,status TEXT NOT NULL,reason TEXT,config_version TEXT NOT NULL,processed_at INTEGER NOT NULL,retry_at INTEGER);
 CREATE TABLE IF NOT EXISTS parse_admissions(parse_key TEXT PRIMARY KEY,site TEXT NOT NULL,first_at INTEGER NOT NULL,task_id INTEGER,request_key TEXT);
 CREATE TABLE IF NOT EXISTS url_failures(url_key TEXT PRIMARY KEY,site TEXT NOT NULL,role TEXT NOT NULL,reason TEXT,first_at INTEGER NOT NULL,last_at INTEGER NOT NULL,review_state TEXT NOT NULL DEFAULT 'pending');
 CREATE TABLE IF NOT EXISTS flow_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS requests(cycle TEXT NOT NULL,url_key TEXT NOT NULL,state TEXT NOT NULL,response BLOB,metadata TEXT,PRIMARY KEY(cycle,url_key));
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,cycle TEXT,url TEXT,site TEXT,kind TEXT,details TEXT);
 CREATE TABLE IF NOT EXISTS identities(key TEXT PRIMARY KEY,es_index TEXT NOT NULL,es_type TEXT NOT NULL,es_id TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,doc TEXT NOT NULL,config TEXT NOT NULL,aliases TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',reason TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS outbox_pending_ready ON outbox(next_at,created) WHERE state='pending';
 CREATE TABLE IF NOT EXISTS host_limits(host TEXT PRIMARY KEY,next_at INTEGER NOT NULL,reason TEXT);
 CREATE TABLE IF NOT EXISTS proxy_health(id TEXT PRIMARY KEY,state TEXT NOT NULL,failures INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS runner(id TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS http_cache(url_key TEXT PRIMARY KEY,response BLOB NOT NULL,metadata TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS blobs(hash TEXT PRIMARY KEY,body BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS evidence(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 `);
 const columns=new Set(db.prepare('PRAGMA table_info(tasks)').all().map(c=>c.name));
 if(!columns.has('seen_at'))db.exec('ALTER TABLE tasks ADD COLUMN seen_at INTEGER NOT NULL DEFAULT 0');
 if(!columns.has('published_hint'))db.exec('ALTER TABLE tasks ADD COLUMN published_hint INTEGER');
 db.exec("CREATE INDEX IF NOT EXISTS task_article_recent ON tasks(site,priority DESC,seen_at DESC,id DESC) WHERE role='article' AND state='pending';CREATE INDEX IF NOT EXISTS task_article_publication ON tasks(site,published_hint DESC,seen_at DESC,id DESC) WHERE role='article' AND state='pending'");
 }
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 lock(now=Date.now(),scope='main'){const owner=randomUUID();return this.tx(()=>{const r=this.db.prepare('SELECT * FROM runner WHERE id=?').get(scope);if(r&&r.expires>now)throw Error(scope==='es5_writer'?'NEWS_ES5_WRITER_ALREADY_RUNNING':'NEWS_FLOW_ALREADY_RUNNING');this.db.prepare('INSERT OR REPLACE INTO runner VALUES(?,?,?)').run(scope,owner,now+90000);return owner;});}
 heartbeat(owner,scope='main'){const now=Date.now();return this.db.prepare('UPDATE runner SET expires=? WHERE id=? AND owner=? AND expires>?').run(now+90000,scope,owner,now).changes===1;}
 ownsLease(owner,scope='main'){return !!this.db.prepare('SELECT 1 FROM runner WHERE id=? AND owner=? AND expires>?').get(scope,owner,Date.now());}
 unlock(owner){this.db.prepare('DELETE FROM runner WHERE owner=?').run(owner);}
 recover({outbox=true}={}){this.db.prepare("UPDATE tasks SET state='pending',lease_until=NULL WHERE state='running'").run();this.db.prepare("UPDATE requests SET state='failed',metadata=? WHERE state='fetching'").run(JSON.stringify({error:'interrupted_request_not_repeated_this_cycle'}));if(outbox)this.recoverWrites();}
 recoverWrites(){return this.db.prepare("UPDATE outbox SET state='pending' WHERE state='sending'").run().changes;}
 cycle(id){this.db.prepare('INSERT OR IGNORE INTO cycles(id,started) VALUES(?,?)').run(id,Date.now());}
 configureSites(sources){this.configVersions=new Map([...sources].map(s=>[s.domain,createHash('sha256').update(JSON.stringify({config:s.config,quality:s.quality})).digest('hex')]));}
 failedUrl(key){return !!(this.failedUrlStatement??=this.db.prepare('SELECT 1 FROM url_failures WHERE url_key=?')).get(key);}
 failUrl(task,reason,now=Date.now()){this.db.prepare("INSERT INTO url_failures(url_key,site,role,reason,first_at,last_at) VALUES(?,?,?,?,?,?) ON CONFLICT(url_key) DO UPDATE SET reason=excluded.reason,last_at=excluded.last_at,review_state='pending'").run(task.url_key||requestKey(task.url),task.site,task.role,reason,now,now);}
 catalogBlocks(key){return !!(this.catalogStatement??=this.db.prepare('SELECT 1 FROM article_catalog WHERE url_key=?')).get(key);}
 remember(task,status,reason,now=Date.now()){
  const key=task.url_key||requestKey(task.url);this.db.prepare('INSERT OR REPLACE INTO article_catalog VALUES(?,?,?,?,?,?,?)').run(key,task.site,status,reason,this.configVersions.get(task.site)||'',now,null);
 }
 prepareDispatch(){return this.tx(()=>{
  let migrated=0,skipped=0,retried=0;
  if(!this.db.prepare('SELECT value FROM flow_meta WHERE key=?').get('article_catalog_v1')){
   const latest=this.db.prepare("SELECT * FROM (SELECT t.*,ROW_NUMBER() OVER(PARTITION BY url_key ORDER BY id DESC) AS rn FROM tasks t WHERE role='article' AND state IN ('done','held')) WHERE rn=1").all();
   for(const t of latest){this.remember(t,t.state,t.reason);migrated++;}
   this.db.prepare('INSERT INTO flow_meta VALUES(?,?)').run('article_catalog_v1',new Date().toISOString());
  }
  if(!this.db.prepare('SELECT value FROM flow_meta WHERE key=?').get('url_failures_v1')){
   // Only the latest outcome is authoritative: a recovered URL must remain healthy.
   this.db.exec(`INSERT OR IGNORE INTO url_failures(url_key,site,role,reason,first_at,last_at)
    SELECT url_key,site,'article',reason,processed_at,processed_at FROM article_catalog WHERE status='held';
    INSERT INTO url_failures(url_key,site,role,reason,first_at,last_at)
    SELECT url_key,site,role,reason,created,created FROM (SELECT t.*,ROW_NUMBER() OVER(PARTITION BY url_key ORDER BY id DESC) rn FROM tasks t WHERE state IN ('done','held')) WHERE rn=1 AND state='held'
    ON CONFLICT(url_key) DO UPDATE SET reason=excluded.reason,last_at=excluded.last_at;
    DELETE FROM url_failures WHERE url_key IN (SELECT url_key FROM (SELECT url_key,state,ROW_NUMBER() OVER(PARTITION BY url_key ORDER BY id DESC) rn FROM tasks WHERE state IN ('done','held')) WHERE rn=1 AND state='done');`);
   this.db.prepare('INSERT INTO flow_meta VALUES(?,?)').run('url_failures_v1',new Date().toISOString());
  }
  const parseAdmissions=migrateParseQueueLedger(this.db);
  skipped+=parseAdmissions.retired;
  // Keep startup recovery in SQLite instead of holding a write transaction across
  // hundreds of thousands of JS round trips on the shared producer/writer DB.
  skipped+=this.db.prepare("UPDATE tasks AS t SET state='skipped',reason=CASE WHEN EXISTS(SELECT 1 FROM url_failures f WHERE f.url_key=t.url_key) THEN 'awaiting_separate_url_review' ELSE 'already_processed_url' END,lease_until=NULL WHERE state='pending' AND coalesce(reason,'')!='manual_refresh' AND (EXISTS(SELECT 1 FROM url_failures f WHERE f.url_key=t.url_key) OR role='article' AND EXISTS(SELECT 1 FROM article_catalog c WHERE c.url_key=t.url_key))").run().changes;
  this.db.prepare("UPDATE tasks SET priority=100 WHERE role='seed' AND state='pending'").run();
  return {migrated,skipped,retried,parseAdmissions};
 });}
 enqueueOne(cycle,url,site,role,foundOn,priority,{force=false,publishedHint=null,seenAt=Date.now()}={}){
  const key=requestKey(url);priority=role==='seed'?100:priority;
  publishedHint=Number.isFinite(publishedHint)&&publishedHint<=Date.now()+300000?publishedHint:null;
  const q=this.enqueueStatements??= {same:this.db.prepare('SELECT id,role FROM tasks WHERE cycle=? AND url_key=?'),pending:this.db.prepare("SELECT id,role,priority,seen_at,published_hint,state FROM tasks WHERE url_key=? AND state IN ('pending','running')"),admission:this.db.prepare("SELECT a.task_id,t.id,t.role,t.state,t.priority,t.seen_at,t.published_hint FROM parse_admissions a LEFT JOIN tasks t ON t.id=a.task_id AND t.url_key=a.request_key AND t.role='article' WHERE a.parse_key=?"),admit:this.db.prepare('INSERT INTO parse_admissions VALUES(?,?,?,?,?) ON CONFLICT(parse_key) DO NOTHING'),refresh:this.db.prepare('UPDATE parse_admissions SET task_id=?,request_key=? WHERE parse_key=?'),touch:this.db.prepare('UPDATE tasks SET priority=max(priority,?),seen_at=?,published_hint=coalesce(?,published_hint) WHERE id=?'),insert:this.db.prepare('INSERT INTO tasks(cycle,url,url_key,site,role,priority,found_on,created,reason,seen_at,published_hint) VALUES(?,?,?,?,?,?,?,?,?,?,?)')};
  const parseKey=role==='article'?articleKey(url):null;
  const touch=t=>{if(role==='article'&&t.state==='pending'&&(priority>t.priority||priority>=80&&seenAt-t.seen_at>=120000||publishedHint!==null&&publishedHint!==t.published_hint))q.touch.run(priority,seenAt,publishedHint,t.id);return t.id;};
  const admit=id=>{if(parseKey){q.admit.run(parseKey,site,seenAt,id,key);if(force)q.refresh.run(id,key,parseKey);}return id;};
  if(parseKey){const prior=q.admission.get(parseKey);if(prior){if(['pending','running'].includes(prior.state))return touch(prior);if(!force)return null;}}
  if(!force&&(this.failedUrl(key)||role==='article'&&this.catalogBlocks(key))){if(parseKey)q.admit.run(parseKey,site,seenAt,null,null);return null;}
  const pending=q.pending.get(key);if(pending){if(parseKey&&pending.role==='article')admit(pending.id);return touch(pending);}
  const same=q.same.get(cycle,key);if(same){if(parseKey&&same.role==='article')admit(same.id);return same.id;}
  return admit(q.insert.run(cycle,url,key,site,role,priority,foundOn,Date.now(),force?'manual_refresh':null,seenAt,publishedHint).lastInsertRowid);
 }
 enqueue(cycle,url,site,role='article',foundOn=null,priority=50,options={}){return this.tx(()=>this.enqueueOne(cycle,url,site,role,foundOn,priority,options));}
 enqueueBatch(cycle,urls,site,role='article',foundOn=null,priority=50,options={}){if(!urls.length)return [];const seenAt=Date.now();return this.tx(()=>urls.map(item=>this.enqueueOne(cycle,typeof item==='string'?item:item.url,site,role,foundOn,priority,{seenAt,...options,...(typeof item==='object'?{publishedHint:item.publishedHint}: {})})));}
 readyWhere(sites){return {scope:sites?' AND t.site IN ('+sites.map(()=>'?').join(',')+')':'',params:sites||[]};}
 claim(role='article',sites=null,{ids=null}={}){if(ids&&!ids.length)return null;return this.tx(()=>{const now=Date.now(),{scope,params}=this.readyWhere(sites),batch=ids?' AND t.id IN ('+ids.map(()=>'?').join(',')+')':'',order=ids?'CASE t.id '+ids.map((_,i)=>'WHEN ? THEN '+i).join(' ')+' END':'t.created,t.id';const r=this.db.prepare("SELECT t.* FROM tasks t"+(ids?' NOT INDEXED':'')+" WHERE t.state='pending' AND t.role=?"+scope+batch+" AND NOT EXISTS(SELECT 1 FROM host_limits h WHERE h.host=t.site AND h.next_at>?) AND NOT EXISTS(SELECT 1 FROM tasks a WHERE a.site=t.site AND a.state='running') ORDER BY "+order+" LIMIT 1").get(role,...params,...ids||[],now,...ids||[]);if(!r)return null;this.db.prepare("UPDATE tasks SET state='running',lease_until=? WHERE id=?").run(now+300000,r.id);return r;});}
 articleBatch(sites,limit=50){return selectNewsArticleBatch(this.db,sites,limit);}
 finish(task,state='done',reason=null){this.tx(()=>{this.db.prepare('UPDATE tasks SET state=?,reason=?,lease_until=NULL WHERE id=?').run(state,reason,task.id);if(state==='held')this.failUrl(task,reason);else if(state==='done'&&task.reason==='manual_refresh')this.db.prepare('DELETE FROM url_failures WHERE url_key=?').run(task.url_key||requestKey(task.url));if(task.role==='article'&&['done','held'].includes(state))this.remember(task,state,reason);});}
 pendingRole(role,sites=null){const {scope,params}=this.readyWhere(sites);return this.db.prepare("SELECT count(*) AS n FROM tasks t WHERE t.state='pending' AND t.role=?"+scope).get(role,...params).n;}
 seedRound(sources,{now=Date.now(),intervalMs=300000,once=false}={}){return this.tx(()=>{
  const active=new Set(this.db.prepare("SELECT DISTINCT site FROM tasks WHERE role='seed' AND state IN ('pending','running')").all().map(r=>r.site));
  const paused=new Set(this.db.prepare('SELECT host FROM host_limits WHERE next_at>?').all(now).map(r=>r.host));
  const scheduled=new Map(this.db.prepare('SELECT site,next_at FROM seed_schedule').all().map(r=>[r.site,r.next_at]));
  const blocked={cooldown:0,backlog:0,interval:0},eligible=[];
  for(const s of sources){if(!once&&paused.has(s.domain)){blocked.cooldown++;continue;}if(!once&&active.has(s.domain)){blocked.backlog++;continue;}if(!once&&(scheduled.get(s.domain)||0)>now){blocked.interval++;continue;}if(s.seeds.length)eligible.push(s);}
  if(!eligible.length)return {cycle:null,sites:[],seeds:0,blocked};
  const cycle='news-'+now;this.db.prepare('INSERT OR IGNORE INTO cycles(id,started) VALUES(?,?)').run(cycle,now);
  const insert=this.db.prepare("INSERT OR IGNORE INTO tasks(cycle,url,url_key,site,role,priority,created) SELECT ?,?,?,?,'seed',100,? WHERE NOT EXISTS(SELECT 1 FROM tasks WHERE url_key=? AND state IN ('pending','running')) AND NOT EXISTS(SELECT 1 FROM url_failures WHERE url_key=?)");
  let seeds=0;
  // Admit a complete per-site round atomically, with each homepage ahead of its categories.
  // Other publishers' cooldowns and backlog cannot prevent a drained publisher's next round.
  for(let i=0;eligible.some(s=>s.seeds.length>i);i++)for(const s of eligible)if(s.seeds[i]){const key=requestKey(s.seeds[i]);seeds+=insert.run(cycle,s.seeds[i],key,s.domain,now,key,key).changes;}
  const schedule=this.db.prepare('INSERT INTO seed_schedule VALUES(?,?,?) ON CONFLICT(site) DO UPDATE SET next_at=excluded.next_at,cycle=excluded.cycle');
  if(!once)for(const s of eligible)schedule.run(s.domain,now+intervalMs,cycle);
  return {cycle,sites:eligible.map(s=>s.domain),seeds,blocked};
 });}
 request(cycle,url){return this.db.prepare('SELECT * FROM requests WHERE cycle=? AND url_key=?').get(cycle,requestKey(url));}
 reserve(cycle,url){return this.db.prepare("INSERT OR IGNORE INTO requests(cycle,url_key,state) VALUES(?,?,'fetching')").run(cycle,requestKey(url)).changes===1;}
 blob(data){if(!data)return null;const hash=createHash('sha256').update(data).digest('hex');this.db.prepare('INSERT OR IGNORE INTO blobs VALUES(?,?)').run(hash,data);return hash;}
 body(ref){if(!ref)return null;if(typeof ref!=='string')return ref;return this.db.prepare('SELECT body FROM blobs WHERE hash=?').get(ref)?.body||null;}
 response(cycle,url,data,metadata){this.db.prepare('UPDATE requests SET state=?,response=?,metadata=? WHERE cycle=? AND url_key=?').run(metadata.error?'failed':'done',this.blob(data),JSON.stringify(metadata),cycle,requestKey(url));}
 cache(url){return this.db.prepare('SELECT * FROM http_cache WHERE url_key=?').get(requestKey(url));}
 saveCache(url,data,metadata){this.db.prepare('INSERT OR REPLACE INTO http_cache VALUES(?,?,?,?)').run(requestKey(url),this.blob(data),JSON.stringify(metadata),Date.now());}
 retain(cycle,url){const r=this.request(cycle,url);if(r?.response&&typeof r.response==='string')this.db.prepare('INSERT OR REPLACE INTO evidence VALUES(?,?)').run(r.response,Date.now()+2*86400000);return r?.response;}
 hostWait(host){return this.db.prepare('SELECT next_at FROM host_limits WHERE host=?').get(host)?.next_at||0;}
 hostPause(host,until,reason){this.db.prepare('INSERT INTO host_limits VALUES(?,?,?) ON CONFLICT(host) DO UPDATE SET next_at=MAX(next_at,excluded.next_at),reason=excluded.reason').run(host,until,reason);}
 event(kind,{cycle=null,url=null,site=null,...details}={}){this.db.prepare('INSERT INTO events(at,cycle,url,site,kind,details) VALUES(?,?,?,?,?,?)').run(Date.now(),cycle,url,site,kind,JSON.stringify(details));}
 known(url,config){const keys=[articleKey(url),nativeKey(url,config)].filter(Boolean);for(const key of keys){const r=this.db.prepare('SELECT * FROM identities WHERE key=?').get(key);if(r)return {_index:r.es_index,_type:r.es_type,_id:r.es_id};}return null;}
 bind(doc,urls,config){return this.tx(()=>{for(const url of urls)for(const key of [articleKey(url),nativeKey(url,config)].filter(Boolean)){const old=this.db.prepare('SELECT * FROM identities WHERE key=?').get(key);if(old&&(old.es_id!==doc._id||old.es_index!==doc._index))throw Error('NEWS_IDENTITY_LEDGER_CONFLICT');this.db.prepare('INSERT OR IGNORE INTO identities VALUES(?,?,?,?,?)').run(key,doc._index,doc._type,doc._id,Date.now());}});}
 offer(doc,config,aliases){this.db.prepare('INSERT OR IGNORE INTO outbox(id,doc,config,aliases,created) VALUES(?,?,?,?,?)').run(doc._id,JSON.stringify(doc),JSON.stringify({originalPublicationUncertainUrls:config.originalPublicationUncertainUrls,publicationValidationPolicy:config.publicationValidationPolicy,publicationProof:config.publicationProof,descriptionPolicy:config.descriptionPolicy,descriptionProvenance:config.descriptionProvenance,descriptionOmissionProof:config.descriptionOmissionProof,siteName:config.siteName,siteId:config.siteId,registrableDomain:config.registrableDomain,allowedHosts:config.allowedHosts,sourceAlias:config.sourceAlias,nativeIdPattern:config.nativeIdPattern,nativeIdQuery:config.nativeIdQuery,nativeIdQueryPattern:config.nativeIdQueryPattern}),JSON.stringify(aliases),Date.now());}
 pendingWrites(limit=30){return this.db.prepare("SELECT * FROM outbox WHERE state='pending' AND next_at<=? ORDER BY json_extract(doc,'$._source.publishedDate') DESC,created LIMIT ?").all(Date.now(),limit);}
 writeState(id,state,reason=null){this.db.prepare('UPDATE outbox SET state=?,reason=?,attempts=attempts+1 WHERE id=?').run(state,reason,id);}
 retryWrite(id,reason,delay=30000){this.db.prepare("UPDATE outbox SET state='pending',reason=?,attempts=attempts+1,next_at=? WHERE id=?").run(reason,Date.now()+delay,id);}
 counts(){return {tasks:this.db.prepare('SELECT state,count(*) AS count FROM tasks GROUP BY state').all(),outbox:this.db.prepare('SELECT state,count(*) AS count FROM outbox GROUP BY state').all(),requests:this.db.prepare('SELECT state,count(*) AS count FROM requests GROUP BY state').all()};}
 active(sites=null){return this.db.prepare("SELECT count(*) AS n FROM tasks WHERE state IN ('pending','running')"+(sites?' AND site IN ('+sites.map(()=>'?').join(',')+')':'')).get(...sites||[]).n;}
 prune(now=Date.now()){
  this.db.prepare('UPDATE cycles SET finished=? WHERE finished IS NULL AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.cycle=cycles.id AND t.state IN (?,?))').run(now,'pending','running');
  this.db.prepare('UPDATE requests SET response=NULL WHERE cycle IN (SELECT id FROM cycles WHERE finished<?)').run(now-3600000);
  this.db.prepare('DELETE FROM tasks WHERE cycle IN (SELECT id FROM cycles WHERE finished<?)').run(now-86400000);
  this.db.prepare('DELETE FROM requests WHERE cycle IN (SELECT id FROM cycles WHERE finished<?)').run(now-86400000);
  this.db.prepare('DELETE FROM cycles WHERE finished<?').run(now-86400000);
  this.db.prepare('DELETE FROM http_cache WHERE updated<?').run(now-86400000);
  this.db.prepare('DELETE FROM evidence WHERE expires<?').run(now);
  this.db.prepare('DELETE FROM events WHERE at<?').run(now-7*86400000);
  this.db.prepare("DELETE FROM outbox WHERE created<? AND state IN ('existing','created','dry_run')").run(now-7*86400000);
  this.db.exec('DELETE FROM blobs WHERE hash NOT IN (SELECT response FROM requests WHERE response IS NOT NULL) AND hash NOT IN (SELECT response FROM http_cache) AND hash NOT IN (SELECT hash FROM evidence)');
 }
 close(){this.db.close();}
}
