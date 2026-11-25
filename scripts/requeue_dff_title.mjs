import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {parsePage} from '../src/forumFlow/adapters.mjs';
import {forumTime} from '../src/forumFlow/time.mjs';

const dir='/var/lib/forum-flow/writer-repair-20261119/held-clock-audit-v2';
const audit=JSON.parse(await fs.readFile(dir+'/audit.json'));
const entry=audit.records.find(r=>r.site==='dff.vn'&&r.role==='forumTopic'&&r.id==='1795060166181');
const site=JSON.parse(await fs.readFile('config/forum-flow/sites.json')).find(s=>s.domain===entry.site);
const [capture,fresh]=await Promise.all([entry.capture,entry.fresh].map(async evidence=>{
 const html=gunzipSync(await fs.readFile(evidence.file)).toString();
 if(createHash('sha256').update(html).digest('hex')!==evidence.hash)throw Error('DFF_HTML_HASH_MISMATCH');
 const page=parsePage(html,entry.url,site);
 if(!page.title||!page.complete||page.nativeThreadId!==entry.id||page.posts[0].publishedDate!==entry.local)throw Error('DFF_TITLE_OR_DATE_UNCONFIRMED');
 return page;
}));
if(capture.title!==fresh.title)throw Error('DFF_HEADING_CHANGED');
if(process.argv.includes('--check-only')){console.log(JSON.stringify({title:fresh.title,published:entry.local}));process.exit(0);}
const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite');
db.exec('PRAGMA busy_timeout=10000;BEGIN IMMEDIATE');
try{
 const row=db.prepare("SELECT * FROM forum_documents WHERE site=? AND role=? AND native_id=?").get(entry.site,entry.role,entry.id);
 const doc=JSON.parse(row.doc), proof=JSON.parse(row.proof);
 if(row.export_state!=='held'||row.export_reason!=='FORUM_ES5_WRITE_FAILED'||doc._source.title||doc._id!==entry.localId||doc._source.url!==entry.url||Date.parse(doc._source.publishedDate)!==Date.parse(entry.local)||forumTime(proof.time.raw,{kind:proof.time.kind,source:proof.time.source}).publishedDate!==entry.local)throw Error('DFF_RUNTIME_ROW_CHANGED');
 const backup=await fs.open(dir+'/dff-row-before-title.json','wx',0o600);
 await backup.writeFile(JSON.stringify(row));await backup.sync();await backup.close();
 doc._source.title=fresh.title;
 db.prepare("UPDATE forum_documents SET doc=?,export_state='pending',export_reason=NULL WHERE site=? AND role=? AND native_id=?").run(JSON.stringify(doc),entry.site,entry.role,entry.id);
 db.exec('COMMIT');
 console.log(JSON.stringify({site:entry.site,id:entry.id,title:fresh.title,published:entry.local,requeued:true}));
}catch(error){db.exec('ROLLBACK');throw error;}
finally{db.close();}
