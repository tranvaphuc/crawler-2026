import {setTimeout as sleep} from 'node:timers/promises';
import {detectedSource} from './crawlerQueueFlow.js';

// Admission is independent of worker concurrency: every eligible source gets a
// durable ticket, while an existing queued/running/failed ticket prevents overlap.
export async function enqueueAllEligibleSources({rows,existingEntityKeys,enqueueBatch,markScheduledBatch,batchSize=250,shouldStop=()=>false}){
 let offered=0,batch=[];
 const pending=new Set();
 async function flush(){
  if(!batch.length)return;
  await enqueueBatch(batch);
  for(const {entityKey}of batch)existingEntityKeys.add(entityKey);
  await markScheduledBatch(batch);
  offered+=batch.length;batch=[];pending.clear();
 }
 for await(const source of rows){
  if(shouldStop())break;
  const entityKey='source:'+String(source._id);
  if(!detectedSource(source)||existingEntityKeys.has(entityKey)||pending.has(entityKey))continue;
  batch.push({source,entityKey});pending.add(entityKey);
  if(batch.length>=batchSize)await flush();
 }
 if(!shouldStop())await flush();
 return offered;
}
export function startContinuousQueueFeeders({queues,refill,shouldStop,onError=()=>{},wait=()=>sleep(100)}){
 return queues.filter(q=>q.kind==='source'||q.kind==='comments'||q.kind==='uid').map(async queue=>{
  while(!shouldStop()){try{await refill(queue);}catch(error){onError(queue,error);}if(!shouldStop())await wait(queue);}
 });
}

// A retained failed prefix must not hide never-scheduled posts beyond one page.
// Existing tickets still block their own entity; paging only discovers other work.
export function createCommentCandidateScanner({findPage,findBlocked=async()=>[],hasExisting,enqueue,markScheduled,eligible=detectedSource,shouldStop=()=>false,minimumPageSize=100}){
 const afterByQueue=new Map();
 return async function scan(queue,filter,capacity){
  if(capacity<=0||shouldStop())return {offered:0,scanned:0,wrapped:false};
  const rows=await findPage({queue,filter,after:afterByQueue.get(queue.name)??null,limit:Math.max(minimumPageSize,capacity*5)});
  if(!rows.length){afterByQueue.delete(queue.name);return {offered:0,scanned:0,wrapped:true};}
  const blocked=new Set(await findBlocked(rows.map(row=>'comments:'+String(row._id))));let offered=0,scanned=0;
  for(const row of rows){
   if(shouldStop()||offered>=capacity)break;
   const entityKey='comments:'+String(row._id);
   if(eligible(row.source)&&!blocked.has(entityKey)&&!await hasExisting(entityKey)){
    await enqueue(queue,row,entityKey);await markScheduled(row);offered++;
   }
   // Advance only after a skipped row or a durable offer. Never skip the tail
   // when capacity is exhausted, and retry an outbox error at the same position.
   afterByQueue.set(queue.name,row._id);scanned++;
  }
  return {offered,scanned,wrapped:false};
 };
}
