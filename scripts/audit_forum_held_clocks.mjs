import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';
import {ForumBulkEs5Sink} from '../src/forumFlow/bulkEs5.mjs';
import {ForumRuntime} from '../src/forumFlow/runtime.mjs';
import {ForumState} from '../src/forumFlow/state.mjs';
import {forumIdentity} from '../src/forumFlow/es5.mjs';
import {parsePage} from '../src/forumFlow/adapters.mjs';
import {forumTime} from '../src/forumFlow/time.mjs';
import {weeklyIndex} from '../src/web/newsParser.mjs';

const dir = process.env.FORUM_HELD_AUDIT_DIR || '/var/lib/forum-flow/writer-repair-20261119/held-clock-audit';
const sites = JSON.parse(await fs.readFile('config/forum-flow/sites.json'));
const siteMap = new Map(sites.map(site => [site.domain, site]));
const db = new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite', {readOnly:true});
const scratch = await ForumState.open(':memory:');
const runtime = new ForumRuntime({state:scratch, sites, evidenceDirectory:dir+'/html'});
const env = dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env'));
const es = new ES.Client({host:env.ES5_HOST, apiVersion:'5.6', connectionClass:ForumBoundedEsConnection, log:[], maxRetries:0, requestTimeout:120000});
const sink = new ForumBulkEs5Sink({es,state:scratch,sites,proof:JSON.parse(await fs.readFile('/etc/forum-flow/identity-proof.json'))});
const hash = body => createHash('sha256').update(body).digest('hex');
const tidy = text => String(text ?? '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const matchText = (a,b) => {
 const first = tidy(a), second = tidy(b);
 if (!first || !second) return 'missing';
 if (first === second) return 'equal';
 const shorter = first.length < second.length ? first : second;
 return shorter.length >= 20 && (first.startsWith(second) || second.startsWith(first)) ? 'prefix' : 'different';
};
const safeError = error => /^[A-Za-z0-9_]+$/.test(error.message) ? error.message : error.statusCode || error.code || 'AUDIT_ERROR';
const save = async report => {
 await fs.writeFile(dir+'/audit.tmp',JSON.stringify(report,null,2));
 await fs.rename(dir+'/audit.tmp',dir+'/audit.json');
};
function pageClock(html,url,item) {
 const {row,doc} = item, site = siteMap.get(row.site), page = parsePage(html,url,site);
 if (!page.complete || (site.adapter!=='wordpress' && String(page.nativeThreadId)!==row.thread_id)) throw Error('PAGE_THREAD_UNCONFIRMED');
 if(row.role==='forumTopic' && forumIdentity(page.threadUrl,row.role,site)!==forumIdentity(doc._source.url,row.role,site)) throw Error('PAGE_URL_UNCONFIRMED');
 const post = page.posts.find(p=>p.role===row.role && String(p.nativePostId)===row.native_id);
 if (!post) throw Error('NATIVE_POST_NOT_FOUND');
 const $=cheerio.load(html);
 const times=[];
 if (row.role==='forumTopic') {
  for(const el of $('meta[property="article:published_time"],meta[property="article:modified_time"],article time[datetime],meta[itemprop="datePublished"]').toArray().slice(0,12)) times.push({role:$(el).attr('property')||$(el).attr('itemprop')||$(el).attr('class')||'time',value:$(el).attr('content')||$(el).attr('datetime')});
  for(const el of $('script[type="application/ld+json"]').toArray()) {
   try {const obj=JSON.parse($(el).text());for (const entry of obj['@graph']||[obj]) if(entry.datePublished) times.push({role:entry['@type'],value:entry.datePublished,modified:entry.dateModified});} catch {}
  }
 }
 return {published:post.publishedDate,raw:post.timeEvidence.raw,precision:post.timeEvidence.precision,clockSource:post.timeEvidence.source,crossChecks:post.timeEvidence.crossChecks,author:matchText(post.author,doc._source.author),content:matchText(post.content,doc._source.content),times};
}

const items=db.prepare("SELECT * FROM forum_documents WHERE export_state='held' ORDER BY site,role,native_id").all().map(row=>({row,doc:JSON.parse(row.doc),proof:JSON.parse(row.proof)}));
const report={startedAt:new Date().toISOString(),scopeCount:items.length,records:[]};
try {
 await sink.initialize();
 const groups=Map.groupBy(items, item=>item.row.site+'|'+item.row.role);
 for (const sameRole of groups.values()) {
  for(let i=0;i<sameRole.length;i+=20){
   const batch=sameRole.slice(i,i+20);
   let matches;
   try {matches=await sink.lookupBatch(batch);} catch(error){matches=new Map(batch.map(({row})=>[row.site+'|'+row.native_id,{reason:safeError(error)}]));}
   for(const item of batch){
    const {row,doc,proof}=item, site=siteMap.get(row.site);
    const entry={site:row.site,role:row.role,id:row.native_id,thread:row.thread_id,reason:row.export_reason,url:doc._source.url,local:doc._source.publishedDate,localIndex:doc._index,localId:doc._id,proofRaw:proof.time.raw};
    const previous=proof.evidence;
    try {
     const bytes=await fs.readFile(previous.evidenceFile), html=previous.evidenceFile.endsWith('.gz')?gunzipSync(bytes).toString():bytes.toString();
     if(hash(html)!==previous.contentHash)throw Error('CAPTURE_HASH_MISMATCH');
     if(forumTime(proof.time.raw,{kind:proof.time.kind,source:proof.time.source}).publishedDate!==doc._source.publishedDate)throw Error('STORED_PROOF_MISMATCH');
     entry.capture={...pageClock(html,previous.finalUrl||entry.url,item),checkedAt:previous.checkedAt,file:previous.evidenceFile,hash:previous.contentHash};
    } catch(error){entry.captureError=safeError(error);}
    const found=matches.get(row.site+'|'+row.native_id);
    if(found.reason)entry.searchReason=found.reason;
    if(found.hit){
     const hit=await es.get({index:found.hit._index,type:row.role,id:found.hit._id}),source=hit._source;
     entry.es={index:hit._index,id:hit._id,version:hit._version,hash:hash(JSON.stringify(source)),url:source.url,published:source.publishedDate,inserted:source.insertedDate,author:matchText(source.author,doc._source.author),content:matchText(source.content,doc._source.content),title:matchText(source.title,doc._source.title),parentId:source.parentId,parentDate:source.parentDate,expectedWeek:weeklyIndex(source.publishedDate),dateDifferenceSeconds:(Date.parse(source.publishedDate)-Date.parse(entry.local))/1000};
    }
    if(row.role==='forumComment'){
     entry.parent=db.prepare("SELECT es_index,es_id,published FROM forum_es_bindings WHERE site=? AND role='forumTopic' AND native_id=?").get(row.site,row.thread_id);
    }
    report.records.push(entry);
   }
   await save(report);
  }
 }
 const byKey=new Map(items.map(item=>[item.row.site+'|'+item.row.role+'|'+item.row.native_id,item]));
 // A small pool shares the same transport as the collector.
 let next=0;
 await Promise.all(Array.from({length:3},async()=>{
  while(next<report.records.length) {
   const entry=report.records[next++], item=byKey.get(entry.site+'|'+entry.role+'|'+entry.id);
   try {
    const sourceUrl=entry.role==='forumComment'?item.proof.evidence.finalUrl||entry.url:entry.url;
    const got=await runtime.fetch(siteMap.get(entry.site),sourceUrl);
    entry.fresh={...pageClock(got.html,got.finalUrl,item),file:got.evidenceFile,hash:got.contentHash};
   } catch(error){entry.freshError=safeError(error);}
  }
 }));
 report.finishedAt=new Date().toISOString();await save(report);
 console.log(JSON.stringify({scope:report.scopeCount,captured:report.records.filter(r=>r.capture).length,fresh:report.records.filter(r=>r.fresh).length}));
} finally {await runtime.transport.close();scratch.close();db.close();es.close();}
