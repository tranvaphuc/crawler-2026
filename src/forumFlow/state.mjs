import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {legacyForumTopicId,legacyForumCommentId,weeklyIndex} from '../web/newsParser.mjs';
import {selectReadyForumUrls,hasUnscheduledForumUrl} from './readyQueue.mjs';
export class ForumState{
 static async open(file){await fs.mkdir(path.dirname(path.resolve(file)),{recursive:true});const {DatabaseSync}=await import('node:sqlite');return new ForumState(new DatabaseSync(file));}
 constructor(db){this.db=db;db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS forum_urls(site TEXT NOT NULL,native_id TEXT NOT NULL,url TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0,seen INTEGER NOT NULL,reason TEXT,next_at INTEGER NOT NULL DEFAULT 0,resume_url TEXT,completed_at INTEGER,last_page_num INTEGER,target_last_page INTEGER,scan_floor_page INTEGER,PRIMARY KEY(site,native_id));
 CREATE TABLE IF NOT EXISTS forum_documents(site TEXT NOT NULL,role TEXT NOT NULL,native_id TEXT NOT NULL,thread_id TEXT NOT NULL,doc TEXT NOT NULL,proof TEXT NOT NULL,export_state TEXT NOT NULL DEFAULT 'pending',export_reason TEXT,PRIMARY KEY(site,role,native_id));
 CREATE TABLE IF NOT EXISTS forum_pages(site TEXT NOT NULL,url TEXT NOT NULL,checked INTEGER NOT NULL,status TEXT NOT NULL,reason TEXT,proof TEXT,PRIMARY KEY(site,url));
 CREATE TABLE IF NOT EXISTS forum_seeds(site TEXT NOT NULL,url TEXT NOT NULL,next_at INTEGER NOT NULL DEFAULT 0,status TEXT,reason TEXT,PRIMARY KEY(site,url));
 CREATE TABLE IF NOT EXISTS forum_lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS forum_events(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,site TEXT,url TEXT,kind TEXT,details TEXT);
 CREATE TABLE IF NOT EXISTS forum_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS forum_ready ON forum_urls(processed,next_at,seen);
 CREATE INDEX IF NOT EXISTS forum_ready_by_site ON forum_urls(site,processed,next_at,seen);
 `);const cols=new Set(db.prepare('PRAGMA table_info(forum_urls)').all().map(x=>x.name));for(const name of ['last_page_num','target_last_page','scan_floor_page'])if(!cols.has(name))db.exec('ALTER TABLE forum_urls ADD COLUMN '+name+' INTEGER');}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 lock(){return this.tx(()=>{const old=this.db.prepare('SELECT * FROM forum_lease WHERE id=1').get();if(old&&old.expires>Date.now())throw Error('FORUM_FLOW_ALREADY_RUNNING');const owner=randomUUID();this.db.prepare('INSERT OR REPLACE INTO forum_lease VALUES(1,?,?)').run(owner,Date.now()+120000);return owner;});}
 heartbeat(owner){if(!this.db.prepare('UPDATE forum_lease SET expires=? WHERE owner=? AND expires>?').run(Date.now()+120000,owner,Date.now()).changes)throw Error('FORUM_FLOW_LEASE_LOST');}
 unlock(owner){this.db.prepare('DELETE FROM forum_lease WHERE owner=?').run(owner);}
 event(site,url,kind,details){this.db.prepare('INSERT INTO forum_events(at,site,url,kind,details) VALUES(?,?,?,?,?)').run(Date.now(),site,url,kind,JSON.stringify(details));}
 setSince(ms){const value=String(ms),old=this.db.prepare("SELECT value FROM forum_meta WHERE key='since'").get();if(old&&old.value!==value)throw Error('FORUM_WINDOW_CHANGED_REQUIRES_NEW_STATE');this.db.prepare("INSERT OR IGNORE INTO forum_meta VALUES('since',?)").run(value);}
 enqueue(site,url,id){if(!id)throw Error('native_thread_id_required');this.db.prepare(`INSERT INTO forum_urls(site,native_id,url,seen) VALUES(?,?,?,?) ON CONFLICT(site,native_id) DO UPDATE SET url=excluded.url,seen=excluded.seen,processed=CASE WHEN forum_urls.processed=1 AND forum_urls.next_at<=excluded.seen THEN 0 ELSE forum_urls.processed END`).run(site,String(id),url,Date.now());}
 seedResult(site,url,status,reason,interval=60000){this.db.prepare('INSERT INTO forum_seeds VALUES(?,?,?,?,?) ON CONFLICT(site,url) DO UPDATE SET next_at=excluded.next_at,status=excluded.status,reason=excluded.reason').run(site,url,Date.now()+interval,status,reason||null);}
 seedDue(site,url){return (this.db.prepare('SELECT next_at FROM forum_seeds WHERE site=? AND url=?').get(site,url)?.next_at||0)<=Date.now();}
 ready(site,limit){return selectReadyForumUrls(this.db,site,limit,this.readyCursors??=new Map());}
 hasUnscheduled(site){return hasUnscheduledForumUrl(this.db,site);}
 status(row,processed,reason,resume=null,delay=60000){this.db.prepare('UPDATE forum_urls SET processed=?,reason=?,resume_url=?,next_at=?,completed_at=CASE WHEN ?=1 THEN ? ELSE completed_at END WHERE site=? AND native_id=?').run(processed,reason||null,resume,Date.now()+delay,processed,Date.now(),row.site,row.native_id);}
 startScan(row,lastPage){const target=row.target_last_page||lastPage,floor=row.scan_floor_page||Math.max(2,(row.last_page_num||1)-1);this.db.prepare('UPDATE forum_urls SET target_last_page=?,scan_floor_page=? WHERE site=? AND native_id=?').run(target,floor,row.site,row.native_id);return {target,floor};}
 completeScan(row,target,delay){this.tx(()=>{this.status(row,1,null,null,delay);this.db.prepare('UPDATE forum_urls SET last_page_num=?,target_last_page=NULL,scan_floor_page=NULL WHERE site=? AND native_id=?').run(target,row.site,row.native_id);});}
 parent(site,threadId){const row=this.db.prepare("SELECT doc,proof FROM forum_documents WHERE site=? AND role='forumTopic' AND thread_id=?").get(site,String(threadId));return row?{doc:JSON.parse(row.doc),proof:JSON.parse(row.proof)}:null;}
 savePage(site,result,metadata,{since,contextParent=true}={}){
  return this.tx(()=>{
   const first=result.posts.find(p=>p.role==='forumTopic');let parent=this.parent(site.domain,result.nativeThreadId);
   if(first){const doc=this.document(site,result,first,null);if(parent&&parent.doc._source.publishedDate!==doc._source.publishedDate)throw Error('ORIGINAL_TOPIC_TIME_CHANGED');this.saveDocument(site,result,first,doc,metadata);parent={doc};}
   if(!parent)throw Error('ORIGINAL_PARENT_REQUIRED');
   let saved=first?1:0;for(const p of result.posts.filter(p=>p.role==='forumComment')){if(since&&Date.parse(p.publishedDate)<since)continue;this.saveDocument(site,result,p,this.document(site,result,p,parent.doc),metadata);saved++;}
   this.db.prepare('INSERT OR REPLACE INTO forum_pages VALUES(?,?,?,?,?,?)').run(site.domain,metadata.finalUrl,Date.now(),result.complete?'verified':'partial',result.rejected.length?'rejected_posts':null,JSON.stringify(metadata));return saved;
  });
 }
 document(site,result,p,parent){
  const isTopic=p.role==='forumTopic',url=isTopic?result.threadUrl:p.url;const id=isTopic?legacyForumTopicId(url):legacyForumCommentId(url);
  const _source={siteId:site.domain,siteName:site.domain,title:result.title,url,author:p.author,authorId:p.authorId||p.author,content:p.content,publishedDate:p.publishedDate,insertedDate:new Date().toISOString(),ds:{source:'forum-flow-http'}};
  const picture=(p.attachments||[]).find(a=>/^(img|image)$/.test(a.type||''))?.url;if(picture)_source.picture=picture;
  if(!isTopic){_source.parentId=parent._id;_source.parentDate=parent._source.publishedDate;}
  return {_index:weeklyIndex(p.publishedDate),_type:p.role,_id:id,_source};
 }
 saveDocument(site,result,p,doc,metadata){
  const old=this.db.prepare('SELECT doc FROM forum_documents WHERE site=? AND role=? AND native_id=?').get(site.domain,p.role,p.nativePostId);
  if(old){const prev=JSON.parse(old.doc);if(prev._source.publishedDate!==doc._source.publishedDate)throw Error('ORIGINAL_POST_TIME_CHANGED');if(p.role==='forumComment'&&prev._source.parentId!==doc._source.parentId)throw Error('NATIVE_POST_PARENT_CHANGED');doc._source.insertedDate=prev._source.insertedDate;doc._id=prev._id;doc._index=prev._index;}
  const proof={nativePostId:p.nativePostId,nativeThreadId:result.nativeThreadId,nativeParentPostId:p.nativeParentPostId||null,time:p.timeEvidence,attachments:p.attachments||[],coverage:result.coverage,evidence:metadata};
  this.db.prepare(`INSERT INTO forum_documents(site,role,native_id,thread_id,doc,proof) VALUES(?,?,?,?,?,?) ON CONFLICT(site,role,native_id) DO UPDATE SET doc=excluded.doc,proof=excluded.proof,export_state=CASE WHEN forum_documents.export_state='context_only' THEN 'pending' ELSE forum_documents.export_state END`).run(site.domain,p.role,p.nativePostId,result.nativeThreadId,JSON.stringify(doc),JSON.stringify(proof));
 }
 summary(){return {documents:this.db.prepare('SELECT site,role,COUNT(*) count FROM forum_documents GROUP BY site,role').all(),urls:this.db.prepare('SELECT site,processed,reason,COUNT(*) count FROM forum_urls GROUP BY site,processed,reason').all(),seeds:this.db.prepare('SELECT site,status,reason,COUNT(*) count FROM forum_seeds GROUP BY site,status,reason').all()};}
 close(){this.db.close();}
}
