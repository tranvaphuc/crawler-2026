import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {ForumState} from '../src/forumFlow/state.mjs';
import {ForumEs5Sink,forumIdentity,validateForumDocument} from '../src/forumFlow/es5.mjs';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';
import {claimForumWriterLease,renewForumWriterLease} from '../src/forumFlow/writerLease.mjs';
import {forumTime} from '../src/forumFlow/time.mjs';
import {parsePage} from '../src/forumFlow/adapters.mjs';
import {forumBatchIdentityQuery} from '../src/forumFlow/bulkEs5.mjs';
import {observedOriginalParentTarget} from './forum_original_parent_canonical_20261119.mjs';

const directory=process.env.FORUM_REPAIR_DIRECTORY||'/var/lib/forum-flow/writer-repair-20261119',planBytes=await fs.readFile(directory+'/original-plan.json'),plan=JSON.parse(planBytes);
if(!plan.finishedAt)throw Error('PLAN_NOT_FINISHED');
const state=await ForumState.open('/var/lib/forum-flow/runtime/state.sqlite'),sites=JSON.parse(await fs.readFile('config/forum-flow/sites.json')),map=new Map(sites.map(s=>[s.domain,s]));
const env=dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env')),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',connectionClass:ForumBoundedEsConnection,log:[],maxRetries:0,requestTimeout:120000});
const owner=randomUUID(),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),planHash=createHash('sha256').update(planBytes).digest('hex');
let locked=false,timer,expiry=0;
const guard=()=>{const r=state.db.prepare('SELECT * FROM forum_writer_lease WHERE id=1').get();if(!locked||r?.owner!==owner||r.expires<=Date.now())throw Error('WRITER_LEASE_LOST');};
const result={at:new Date().toISOString(),planHash,parents:[],held:[],requeuedReplies:0,historicalParentWrites:0};
const save=async()=>fs.writeFile(directory+'/original-apply.json',JSON.stringify(result,null,2));
try{
 if(execFileSync('systemctl',['show','forum-flow-writer','-p','ActiveState','--value']).toString().trim()!=='inactive')throw Error('WRITER_MUST_BE_STOPPED');
 locked=claimForumWriterLease(state,owner);if(!locked)throw Error('WRITER_LEASE_BUSY');expiry=state.db.prepare('SELECT expires FROM forum_writer_lease WHERE id=1').get().expires;
 timer=setInterval(()=>{try{expiry=renewForumWriterLease(state,owner,expiry).expires;}catch{locked=false;}},20000);
 const sink=new ForumEs5Sink({es,state,sites,write:true,beforeWrite:guard,proof:JSON.parse(await fs.readFile('/etc/forum-flow/identity-proof.json'))});await sink.initialize();
 state.db.exec('CREATE TABLE IF NOT EXISTS forum_parent_reconciliations(site TEXT,thread_id TEXT,es_index TEXT,es_id TEXT,forum_published TEXT,es_published TEXT,precision TEXT,evidence_file TEXT,plan_hash TEXT,PRIMARY KEY(site,thread_id))');
 await save();
 for(const p of plan.selected){
  try{
   guard();const site=map.get(p.site),row=state.db.prepare("SELECT * FROM forum_documents WHERE site=? AND role='forumTopic' AND native_id=?").get(p.site,p.nativeId),doc=JSON.parse(row.doc),proof=JSON.parse(row.proof);
   if(row.export_state!=='held'||row.thread_id!==p.threadId||doc._id!==p.expectedSourceId||doc._source.publishedDate!==p.forumPublished||forumTime(proof.time.raw,{kind:proof.time.kind,source:proof.time.source}).publishedDate!==p.forumPublished)throw Error('LOCAL_PARENT_CHANGED');
   const bytes=await fs.readFile(p.evidenceFile),html=p.evidenceFile.endsWith('.gz')?gunzipSync(bytes).toString():bytes.toString();
   if(!p.evidenceFile.endsWith('/'+createHash('sha256').update(html).digest('hex')+'.html.gz'))throw Error('EVIDENCE_HASH_MISMATCH');
   const page=parsePage(html,proof.evidence.finalUrl||doc._source.url,site),first=page.posts.find(i=>i.role==='forumTopic');
   if(!page.complete||String(page.nativeThreadId)!==p.threadId||String(first?.nativePostId)!==p.nativeId||first.publishedDate!==p.forumPublished)throw Error('ORIGINAL_PROOF_CHANGED');
   let hit,created=false;
   if(p.action==='bind'){
    hit=await es.get({index:p.esIndex,type:'forumTopic',id:p.esId});
    if(hit._version!==p.esVersion||hash(hit._source)!==p.esSourceHash)throw Error('ES_PARENT_CHANGED');
   }else if(p.action==='create_original'){
    if(p.targetUrl&&p.targetUrl!==doc._source.url){
     const target=observedOriginalParentTarget({doc,site,html,observedUrl:proof.evidence.finalUrl||doc._source.url});
     if(target.url!==p.targetUrl||target.id!==p.esId)throw Error('CANONICAL_EVIDENCE_CHANGED');
     doc._source.url=p.targetUrl;doc._id=p.esId;
    }
    validateForumDocument(doc,proof,await sink.mapping(doc));
    for(const old of p.conflictingHistoricalRoots){const h=await es.get({index:old.index,type:'forumTopic',id:old.id});if(h._version!==old.version||hash(h._source)!==old.sourceHash)throw Error('HISTORICAL_PARENT_CHANGED');}
    // Search again for a newly discovered correct original at its proven clock.
    const start=Math.floor(Date.parse(p.forumPublished)/60000)*60000;
    const search=await es.search({index:'master*',type:'forumTopic',filterPath:'timed_out,_shards.failed,hits.total,hits.hits',body:{size:100,timeout:'90s',query:{bool:{filter:[forumBatchIdentityQuery([{row,doc}],map),{range:{publishedDate:{gte:new Date(start).toISOString(),lt:new Date(start+60000).toISOString()}}}]}},_source:['url','siteName','publishedDate']}});
    if(search.timed_out||search._shards?.failed||!search.hits?.hits||search.hits.total>search.hits.hits.length)throw Error('ORIGINAL_RECHECK_INCOMPLETE');
    if(search.hits.hits.some(h=>forumIdentity(h._source.url,'forumTopic',site)===forumIdentity(doc._source.url,'forumTopic',site)))throw Error('ORIGINAL_APPEARED_DURING_AUDIT');
    guard();const receipt=await es.create({index:doc._index,type:doc._type,id:doc._id,body:doc._source,refresh:true,requestTimeout:120000});
    if(receipt.result!=='created')throw Error('ORIGINAL_CREATE_UNCONFIRMED');
    hit=await es.get({index:doc._index,type:doc._type,id:doc._id});
    if(hit._version!==receipt._version||hash(hit._source)!==hash(doc._source))throw Error('ORIGINAL_CREATE_READBACK_MISMATCH');created=true;
    for(const old of p.conflictingHistoricalRoots){const h=await es.get({index:old.index,type:'forumTopic',id:old.id});if(h._version!==old.version||hash(h._source)!==old.sourceHash)throw Error('HISTORICAL_PARENT_CHANGED');}
   }else throw Error('UNKNOWN_PLAN_ACTION');
   if(forumIdentity(hit._source.url,'forumTopic',site)!==forumIdentity(doc._source.url,'forumTopic',site)||hit._source.publishedDate!==p.esPublished)throw Error('PARENT_IDENTITY_CHANGED');
   guard();let requeued=0;
   state.tx(()=>{
    state.db.prepare("INSERT OR REPLACE INTO forum_es_bindings VALUES(?,'forumTopic',?,?,?,?)").run(p.site,p.threadId,hit._index,hit._id,hit._source.publishedDate);
    state.db.prepare("UPDATE forum_documents SET export_state=?,export_reason='FORUM_ORIGINAL_PARENT_AUDITED' WHERE site=? AND role='forumTopic' AND native_id=? AND export_state='held'").run(created?'created':'existing',p.site,p.nativeId);
    state.db.prepare('INSERT OR REPLACE INTO forum_parent_reconciliations VALUES(?,?,?,?,?,?,?,?,?)').run(p.site,p.threadId,hit._index,hit._id,p.forumPublished,hit._source.publishedDate,p.precision,p.evidenceFile,planHash);
    requeued=Number(state.db.prepare("UPDATE forum_documents SET export_state='pending',export_reason=NULL WHERE site=? AND role='forumComment' AND thread_id=? AND export_state='held' AND export_reason='FORUM_PARENT_NOT_RECONCILED'").run(p.site,p.threadId).changes);
   });
   result.parents.push({...p,created,requeued});result.requeuedReplies+=requeued;
  }catch(e){result.held.push({site:p.site,threadId:p.threadId,reason:/^[A-Z_]+$/.test(e.message)?e.message:e.code||'PARENT_APPLICATION_UNAVAILABLE'});}
  await save();console.log(JSON.stringify({parents:result.parents.length,requeued:result.requeuedReplies,held:result.held.length}));
 }
 result.finishedAt=new Date().toISOString();await save();
}catch(e){console.log(JSON.stringify({error:/^[A-Z_]+$/.test(e.message)?e.message:e.code||'PARENT_APPLICATION_FAILED'}));process.exitCode=1;}
finally{clearInterval(timer);try{state.db.prepare('DELETE FROM forum_writer_lease WHERE owner=?').run(owner);}finally{state.close();es.close();}}
