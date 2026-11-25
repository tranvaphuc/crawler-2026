// Apply only the reviewed parent plan, with the normal writer stopped and fenced.
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash,randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const base='/opt/forum-flow/current',root='/var/lib/forum-flow/qc-20261122',require=createRequire(base+'/package.json'),dotenv=require('dotenv'),ES=require('elasticsearch');
const {ForumState}=await import('file://'+base+'/src/forumFlow/state.mjs');
const {ForumEs5Sink,forumIdentity,validateForumDocument}=await import('file://'+base+'/src/forumFlow/es5.mjs');
const {parsePage}=await import('file://'+base+'/src/forumFlow/adapters.mjs');
const {forumTime}=await import('file://'+base+'/src/forumFlow/time.mjs');
const {forumBatchIdentityQuery}=await import('file://'+base+'/src/forumFlow/bulkEs5.mjs');
const {claimForumWriterLease,renewForumWriterLease}=await import('file://'+base+'/src/forumFlow/writerLease.mjs');
const state=await ForumState.open('/var/lib/forum-flow/runtime/state.sqlite'),sites=JSON.parse(fs.readFileSync(base+'/config/forum-flow/sites.json')),map=new Map(sites.map(s=>[s.domain,s]));
const bytes=fs.readFileSync(root+'/forum-plan.json'),plan=JSON.parse(bytes),planHash=createHash('sha256').update(bytes).digest('hex');if(!plan.finishedAt)throw Error('QC_PLAN_INCOMPLETE');
const legacy=JSON.parse(fs.readFileSync('/var/lib/forum-flow/writer-repair-20261119/legacy-formats.json'));
const env=dotenv.parse(fs.readFileSync('/etc/forum-flow/forum.env')),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:120000});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),owner=randomUUID();let locked=false,expiry=0,timer;
const guard=()=>{const lease=state.db.prepare('SELECT * FROM forum_writer_lease WHERE id=1').get();if(!locked||lease?.owner!==owner||lease.expires<=Date.now())throw Error('QC_LEASE_LOST');};
const output={at:new Date().toISOString(),planHash,parents:[],held:[],requeued:0},save=()=>fs.writeFileSync(root+'/forum-apply.json',JSON.stringify(output,null,2));
try{
 if(execFileSync('systemctl',['is-active','forum-flow-writer'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()==='active')throw Error('QC_WRITER_MUST_BE_STOPPED');
}catch(e){if(e.message==='QC_WRITER_MUST_BE_STOPPED')throw e;if(e.status!==3)throw e;}
try{
 locked=claimForumWriterLease(state,owner);if(!locked)throw Error('QC_WRITER_LEASE_BUSY');expiry=state.db.prepare('SELECT expires FROM forum_writer_lease WHERE id=1').get().expires;
 timer=setInterval(()=>{try{expiry=renewForumWriterLease(state,owner,expiry).expires;}catch{locked=false;}},20000);
 const sink=new ForumEs5Sink({es,state,sites,write:true,beforeWrite:guard,proof:JSON.parse(fs.readFileSync('/etc/forum-flow/identity-proof.json'))});await sink.initialize();
 for(const entry of plan.rows){
  try{
   if(!['bind','create_original'].includes(entry.action))continue;guard();
   const row=state.db.prepare("SELECT * FROM forum_documents WHERE site=? AND role='forumTopic' AND native_id=?").get(entry.site,entry.nativeId),doc=JSON.parse(row.doc),proof=JSON.parse(row.proof),site=map.get(row.site);
   if(row.export_state!=='held'||row.thread_id!==entry.threadId||hash(doc)!==entry.expectedDocHash||hash(proof)!==entry.expectedProofHash)throw Error('QC_LOCAL_PARENT_CHANGED');
   if(forumTime(proof.time.raw,{kind:proof.time.kind}).publishedDate!==entry.originalDate)throw Error('QC_LOCAL_TIME_PROOF_CHANGED');
   const html=gunzipSync(fs.readFileSync(entry.evidenceFile)).toString();if(!entry.evidenceFile.endsWith('/'+createHash('sha256').update(html).digest('hex')+'.html.gz'))throw Error('QC_EVIDENCE_CHANGED');
   const page=parsePage(html,entry.freshUrl||proof.evidence.finalUrl||doc._source.url,site),first=page.posts.find(p=>p.role==='forumTopic');
   if(!page.complete||String(page.nativeThreadId)!==entry.threadId||first?.nativePostId!==row.native_id||first.publishedDate!==entry.originalDate)throw Error('QC_NATIVE_FIRST_POST_CHANGED');
   let hit;
   if(entry.action==='bind'){
    hit=await es.get({index:entry.target.index,type:'forumTopic',id:entry.target.id});
    if(hit._version!==entry.target.version||hash(hit._source)!==entry.target.sourceHash)throw Error('QC_ES_PARENT_CHANGED');
    const t=Date.parse(hit._source.publishedDate),original=Date.parse(entry.originalDate),field=legacy[row.site]?.config?.comment_processor?.created_time;
    const minuteLegacy=legacy[row.site]?.config?.site_name===row.site&&field?.format?.includes(':mm')&&!field.format.includes('ss')&&[undefined,'title','datetime'].includes(field.attribute);
    if(t!==original&&!((proof.time.precision==='minute'||minuteLegacy&&t%60000===0)&&Math.floor(t/60000)===Math.floor(original/60000)))throw Error('QC_PARENT_CLOCK_UNPROVEN');
   }else{
    if(!entry.freshVerified||entry.target.id!==doc._id||entry.target.index!==doc._index||entry.target.url!==doc._source.url)throw Error('QC_CREATE_ORIGINAL_TARGET_CHANGED');
    validateForumDocument(doc,proof,await sink.mapping(doc));
    const start=Math.floor(Date.parse(entry.originalDate)/60000)*60000;
    const found=await es.search({index:'master*',type:'forumTopic',body:{size:100,timeout:'90s',query:{bool:{filter:[forumBatchIdentityQuery([{row,doc}],map),{range:{publishedDate:{gte:new Date(start).toISOString(),lt:new Date(start+60000).toISOString()}}}]}}}});
    if(found.timed_out||found._shards?.failed||!found.hits?.hits||found.hits.total>found.hits.hits.length)throw Error('QC_ORIGINAL_RECHECK_INCOMPLETE');
    if(found.hits.hits.some(h=>forumIdentity(h._source.url,'forumTopic',site)===forumIdentity(doc._source.url,'forumTopic',site)))throw Error('QC_ORIGINAL_APPEARED');
    guard();let receipt;try{receipt=await es.create({index:doc._index,type:doc._type,id:doc._id,body:doc._source,refresh:true,requestTimeout:120000});}catch(e){if(e.statusCode!==409)throw e;}
    hit=await es.get({index:doc._index,type:doc._type,id:doc._id});if(hash(hit._source)!==hash(doc._source)||receipt&&hit._version!==receipt._version)throw Error('QC_ORIGINAL_READBACK_MISMATCH');
   }
   if(forumIdentity(hit._source.url,'forumTopic',site)!==forumIdentity(doc._source.url,'forumTopic',site))throw Error('QC_NATIVE_IDENTITY_CHANGED');
   guard();let requeued=0;
   state.tx(()=>{
    const current=state.db.prepare("SELECT doc,proof,export_state FROM forum_documents WHERE site=? AND role='forumTopic' AND native_id=?").get(row.site,row.native_id);if(current.export_state!=='held'||hash(JSON.parse(current.doc))!==entry.expectedDocHash||hash(JSON.parse(current.proof))!==entry.expectedProofHash)throw Error('QC_LOCAL_PARENT_CHANGED');
    sink.bind(row,hit);
    state.db.prepare("UPDATE forum_documents SET export_state=?,export_reason='FORUM_QC_PARENT_VERIFIED_20261122' WHERE site=? AND role='forumTopic' AND native_id=?").run(entry.action==='create_original'?'created':'existing',row.site,row.native_id);
    state.db.prepare('INSERT OR REPLACE INTO forum_parent_reconciliations VALUES(?,?,?,?,?,?,?,?,?)').run(row.site,row.thread_id,hit._index,hit._id,doc._source.publishedDate,hit._source.publishedDate,Date.parse(doc._source.publishedDate)===Date.parse(hit._source.publishedDate)?proof.time.precision:'minute',entry.evidenceFile,planHash);
    requeued=Number(state.db.prepare("UPDATE forum_documents SET export_state='pending',export_reason=NULL WHERE site=? AND role='forumComment' AND thread_id=? AND export_state='held' AND export_reason='FORUM_PARENT_NOT_RECONCILED'").run(row.site,row.thread_id).changes);
   });
   output.requeued+=requeued;output.parents.push({site:row.site,threadId:row.thread_id,action:entry.action,requeued,index:hit._index,id:hit._id,version:hit._version,sourceHash:hash(hit._source)});
  }catch(e){output.held.push({site:entry.site,threadId:entry.threadId,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:e.code||'QC_PARENT_APPLY_FAILED'});}
  save();console.log(JSON.stringify({parents:output.parents.length,requeued:output.requeued,held:output.held.length}));
 }
 output.finishedAt=new Date().toISOString();save();
}finally{clearInterval(timer);if(locked)state.db.prepare('DELETE FROM forum_writer_lease WHERE owner=?').run(owner);state.close();es.close();}
