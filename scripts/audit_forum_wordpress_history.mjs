import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';
import {ForumEs5Sink,forumIdentity} from '../src/forumFlow/es5.mjs';
import {ForumRuntime} from '../src/forumFlow/runtime.mjs';
import {ForumState} from '../src/forumFlow/state.mjs';
import {nativeThreadId,parsePage,safeUrl,topicUrl} from '../src/forumFlow/adapters.mjs';
import {forumTime} from '../src/forumFlow/time.mjs';
import {weeklyIndex} from '../src/web/newsParser.mjs';

const domain='phunuvietkhoinghiep.vn', directory='/var/lib/forum-flow/writer-repair-20261119/wp-history-audit';
const site=JSON.parse(await fs.readFile('config/forum-flow/sites.json')).find(item=>item.domain===domain);
const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite',{readOnly:true});
const scratch=await ForumState.open(':memory:'), runtime=new ForumRuntime({state:scratch,sites:[site],evidenceDirectory:directory+'/fresh'});
const env=dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env'));
const es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',connectionClass:ForumBoundedEsConnection,log:[],maxRetries:0,requestTimeout:60000});
const sink=new ForumEs5Sink({es,state:scratch,sites:[site],proof:JSON.parse(await fs.readFile('/etc/forum-flow/identity-proof.json'))});
const date=value=>Number(new Date(value||NaN));
const sha=text=>createHash('sha256').update(text).digest('hex');
const identity=(url,role='forumTopic')=>forumIdentity(url,role,site);
const suffix=url=>{try{return /-\d+\/?$/.test(new URL(url).pathname);}catch{return false;}};
const failure=err=>/^[A-Za-z0-9_]+$/.test(err.message)?err.message:err.statusCode||err.code||err.name;
const withSource=['url','siteId','siteName','publishedDate','insertedDate','title','ds.source','parentId','parentDate'];
const scan={startedAt:new Date().toISOString(),domain,topics:[],comments:[],esOnly:[],urlsWithoutTopic:[],pageGaps:[]};
const save=async()=>{await fs.writeFile(directory+'/audit.tmp',JSON.stringify(scan,null,2));await fs.rename(directory+'/audit.tmp',directory+'/audit.json');};

db.exec('BEGIN');
const since=Number(db.prepare("SELECT value FROM forum_meta WHERE key='since'").get().value);
const rows=db.prepare('SELECT * FROM forum_documents WHERE site=? ORDER BY role,native_id').all(domain);
const bindings=db.prepare('SELECT * FROM forum_es_bindings WHERE site=?').all(domain);
const urls=db.prepare('SELECT url,processed,reason,seen,completed_at FROM forum_urls WHERE site=?').all(domain);
const pages=db.prepare('SELECT url,proof,status FROM forum_pages WHERE site=?').all(domain);
db.exec('COMMIT');db.close();
scan.population={rows:rows.length,bindings:bindings.length,urls:urls.length,pages:pages.length,since:new Date(since).toISOString()};
const bindingMap=new Map(bindings.map(b=>[b.role+'|'+b.native_id,b]));
const referenceGroups=Map.groupBy(bindings,b=>b.es_index+'|'+b.role+'|'+b.es_id);
scan.sharedBindings=[...referenceGroups.values()].filter(group=>group.length>1).map(group=>group.map(b=>({id:b.native_id,index:b.es_index,esId:b.es_id,role:b.role})));

async function allSiteHits(){
 const hits=[];let cursor,total;
 try{
  let result=await es.search({index:'master*',type:'forumTopic,forumComment',ignoreUnavailable:true,scroll:'3m',body:{size:250,sort:['_doc'],query:{terms:{siteName:site.allowedHosts}},_source:withSource}});
  total=result.hits?.total;
  while(true){
   cursor=result._scroll_id||cursor;
   if(result.timed_out||result._shards?.failed||!Array.isArray(result.hits?.hits))throw Error('SITE_SCROLL_INCOMPLETE');
   if(!result.hits.hits.length)break;
   hits.push(...result.hits.hits);
   if(hits.length===total)break;
   if(!cursor||hits.length>total)throw Error('SITE_SCROLL_COUNT_MISMATCH');
   result=await es.scroll({scrollId:cursor,scroll:'3m'});
  }
  if(hits.length!==total)throw Error('SITE_SCROLL_COUNT_MISMATCH');
  return hits;
 }finally{if(cursor)await es.clearScroll({scrollId:cursor}).catch(()=>{});}
}
function htmlProof(html,url){
 const parsed=parsePage(html,url,site),post=parsed.posts.find(p=>p.role==='forumTopic');
 if(!parsed.complete||!post||!parsed.title||!identity(parsed.threadUrl))throw Error('ARTICLE_PROOF_INCOMPLETE');
 const $=cheerio.load(html), key=identity(parsed.threadUrl), corroboration=[];
 const canonical=$('link[rel="canonical"]').attr('href');
 if(canonical){const owned=safeUrl(canonical,url,site);if(!owned||identity(owned)!==key)throw Error('ARTICLE_CANONICAL_DISAGREES');}
 for(const element of $('script[type="application/ld+json"]').toArray()){
  let node;
  try{node=JSON.parse($(element).text());}catch{continue;}
  for(const entry of node?.['@graph']||(Array.isArray(node)?node:[node])){
   if(!entry?.datePublished||!['Article','NewsArticle','BlogPosting'].some(t=>[entry['@type']].flat().includes(t)))continue;
   const reference=entry.url||entry.mainEntityOfPage?.['@id']||entry['@id'];
   if(!reference||!safeUrl(reference,url,site)||identity(new URL(reference,url).href)!==key)continue;
   const structured=forumTime(entry.datePublished,{kind:'iso'});
   if(structured.publishedDate!==post.publishedDate)throw Error('ARTICLE_SCHEMA_CLOCK_DISAGREES');
   corroboration.push(entry.datePublished);
  }
 }
 return {url:parsed.threadUrl,wpId:String(post.nativePostId),published:post.publishedDate,raw:post.timeEvidence.raw,corroboration};
}
async function archivedProof(evidence, fallback){
 if(!evidence?.evidenceFile||!evidence.contentHash)throw Error('CAPTURE_RECEIPT_MISSING');
 const bytes=await fs.readFile(evidence.evidenceFile), html=evidence.evidenceFile.endsWith('.gz')?gunzipSync(bytes).toString():bytes.toString();
 if(sha(html)!==evidence.contentHash)throw Error('CAPTURE_HASH_MISMATCH');
 return {...htmlProof(html,evidence.finalUrl||fallback),hash:evidence.contentHash,file:evidence.evidenceFile};
}
const esSummary=hit=>({index:hit._index,id:hit._id,version:hit._version,url:hit._source.url,published:hit._source.publishedDate,inserted:hit._source.insertedDate,source:hit._source.ds?.source,siteName:hit._source.siteName});

try{
 await save();await sink.initialize();
 const hits=await allSiteHits(),refMap=new Map(hits.map(h=>[h._index+'|'+h._type+'|'+h._id,h]));
 const offsite=bindings.filter(b=>!refMap.has(b.es_index+'|'+b.role+'|'+b.es_id));
 for(let i=0;i<offsite.length;i+=100){
  const batch=offsite.slice(i,i+100), read=await es.mget({body:{docs:batch.map(b=>({_index:b.es_index,_type:b.role,_id:b.es_id,_source:withSource}))}});
  if(read.docs?.length!==batch.length||read.docs.some(doc=>doc.error))throw Error('BOUND_RECORD_READ_INCOMPLETE');
  for(const doc of read.docs)if(doc.found)refMap.set(doc._index+'|'+doc._type+'|'+doc._id,doc);
 }
 const siteHits=Map.groupBy(hits,h=>h._type+'|'+identity(h._source.url,h._type));
 const localKeys=new Set(rows.map(row=>{const doc=JSON.parse(row.doc);return row.role+'|'+identity(doc._source.url,row.role);}));
 scan.population.esSiteHits=hits.length;
 scan.population.esBindingsOutsideSearch=offsite.length;
 scan.esOnly=hits.filter(h=>!localKeys.has(h._type+'|'+identity(h._source.url,h._type))).map(h=>({...esSummary(h),role:h._type,suffix:suffix(h._source.url)}));
 const capturedTopicKeys=new Set();
 for(const row of rows){
  const doc=JSON.parse(row.doc),proof=JSON.parse(row.proof),key=identity(doc._source.url,row.role);
  const entry={id:row.native_id,thread:row.thread_id,role:row.role,url:doc._source.url,localIndex:doc._index,claimed:doc._source.publishedDate,state:row.export_state,reason:row.export_reason,suffix:suffix(doc._source.url),oldNumericIdentity:row.role==='forumTopic'?nativeThreadId(topicUrl(doc._source.url,site)):null,issues:[]};
  const binding=bindingMap.get(row.role+'|'+(row.role==='forumTopic'?row.thread_id:row.native_id));
  const bound=binding&&refMap.get(binding.es_index+'|'+binding.role+'|'+binding.es_id);
  const matching=(siteHits.get(row.role+'|'+key)||[]).filter(()=>key);
  entry.matches=matching.map(esSummary);
  if(binding)entry.binding=binding;
  if(bound)entry.bound=esSummary(bound);
  const exported=['created','existing'].includes(row.export_state);
  if(exported&&!bound)entry.issues.push('EXPORTED_BINDING_MISSING');
  if(bound&&(!key||identity(bound._source.url,row.role)!==key||!site.allowedHosts.includes(bound._source.siteName)))entry.issues.push('BOUND_TO_DIFFERENT_URL');
  if(exported&&matching.length===0)entry.issues.push('EXPORTED_URL_ABSENT');
  if(row.role==='forumTopic'&&date(entry.claimed)>=since&&matching.length===0)entry.issues.push('IN_WINDOW_URL_ABSENT');
  if(matching.length>1)entry.issues.push('DUPLICATE_URL');
  if(matching.some(hit=>date(hit._source.publishedDate)!==date(entry.claimed)))entry.issues.push('ES_CLOCK_DIFFERS');
  if(matching.some(hit=>hit._index!==weeklyIndex(entry.claimed)))entry.issues.push('ES_WRONG_WEEK');
  if(bound&&date(binding.published)!==date(bound._source.publishedDate))entry.issues.push('BINDING_CLOCK_DIFFERS');
  if(row.role==='forumTopic'){
   capturedTopicKeys.add(key);
   try{
    entry.capture=await archivedProof(proof.evidence,entry.url);
    if(identity(entry.capture.url)!==key||entry.capture.wpId!==row.native_id)entry.issues.push('CAPTURE_IDENTITY_DIFFERS');
    if(date(entry.capture.published)!==date(entry.claimed)||forumTime(proof.time.raw,{kind:proof.time.kind,source:proof.time.source}).publishedDate!==entry.capture.published)entry.issues.push('CAPTURE_CLOCK_DIFFERS');
   }catch(error){entry.captureError=failure(error);entry.issues.push('CAPTURE_UNVERIFIED');}
   scan.topics.push(entry);
  }else scan.comments.push(entry);
  if((scan.topics.length+scan.comments.length)%50===0)await save();
 }
 scan.urlsWithoutTopic=urls.filter(r=>!capturedTopicKeys.has(identity(r.url))).map(r=>({...r,suffix:suffix(r.url)}));
 for(const page of pages.filter(p=>!capturedTopicKeys.has(identity(p.url)))){
  try{const capture=await archivedProof(JSON.parse(page.proof),page.url);scan.pageGaps.push({url:page.url,capture,existsByNativeId:rows.some(r=>r.role==='forumTopic'&&r.native_id===capture.wpId),suffix:suffix(page.url)});}
  catch(error){scan.pageGaps.push({url:page.url,error:failure(error),suffix:suffix(page.url)});}
 }
 scan.inventoryFinishedAt=new Date().toISOString();await save();
 const work=[...scan.topics.filter(r=>r.issues.length),...scan.esOnly.filter(r=>r.role==='forumTopic'&&r.suffix),...scan.pageGaps.filter(r=>r.capture&&!r.existsByNativeId),...scan.urlsWithoutTopic.filter(r=>r.suffix&&(r.processed||r.reason))];
 const groups=Map.groupBy(work,r=>identity(r.url));
 const pending=[...groups.values()].filter(group=>identity(group[0].url));
 scan.freshTargetCount=pending.length;
 let next=0;
 await Promise.all(Array.from({length:3},async()=>{
  while(next<pending.length){
   const group=pending[next++],url=group[0].url;
   try{
    const page=await runtime.fetch(site,url),fresh={...htmlProof(page.html,page.finalUrl),file:page.evidenceFile,hash:page.contentHash};
    for(const entry of group)entry.fresh=fresh;
   }catch(error){for(const entry of group)entry.freshError=failure(error);}
  }
 }));
 scan.finishedAt=new Date().toISOString();await save();
 console.log(JSON.stringify({population:scan.population,issues:scan.topics.filter(r=>r.issues.length).length,esOnly:scan.esOnly.length,fresh:pending.length}));
}finally{await runtime.transport.close();scratch.close();es.close();}
