import {QueueEvents} from 'bullmq';

export function queueMutationEvent(queue,event,eventId,data){
 if(!/^\d+-\d+$/.test(eventId||''))return null;
 const action=event==='paused'?'pause':event==='resumed'?'resume':event==='waiting'&&data.prev==='failed'?'retry_from_failed':event==='cleaned'?'clean':event==='removed'&&data.prev==='failed'?'remove_failed':null;
 if(!action)return null;
 return{_id:queue+':'+eventId,at:new Date(Number(eventId.split('-')[0])),observedAt:new Date(),source:'redis_queue_events',queue,event,eventId,action,
  jobId:/^[A-Za-z0-9_.:-]{1,160}$/.test(data.jobId||'')?data.jobId:null,previousState:data.prev==='failed'?'failed':null,
  count:/^\d+$/.test(String(data.count??''))?Number(data.count):null};
}

// Stores only mutation metadata, not the job data/return values on the stream.
// Checkpoints advance after durable writes. A failed store pins that queue's
// checkpoint so a restart can replay it instead of silently skipping evidence.
export async function startQueueMutationObserver({names,connection,collection,positions,log=()=>{},QueueEventsClass=QueueEvents,flushMs=15000}={}){
 const watchers=[],seen=new Map(),pending=new Set(),blocked=new Set();let flushing=null;
 const record=(queue,event,data,id)=>{
  if(!/^\d+-\d+$/.test(id||''))return;seen.set(queue,id);
  const row=queueMutationEvent(queue,event,id,data);if(!row)return;
  const work=collection.updateOne({_id:row._id},{$setOnInsert:row},{upsert:true}).then(result=>{if(result?.upsertedCount===0)return;const{event:queueEvent,...fields}=row;log('queue_mutation_observed',{...fields,queueEvent});}).catch(error=>{blocked.add(queue);log('queue_mutation_observer_store_failed',{queue,eventId:id,errorType:error.name,code:error.code||null});}).finally(()=>pending.delete(work));pending.add(work);
 };
 const flush=async()=>{
  if(flushing)return flushing;
  const snapshot=[...seen];
  flushing=(async()=>{await Promise.all([...pending]);const ops=snapshot.filter(([name])=>!blocked.has(name)).map(([name,eventId])=>({updateOne:{filter:{_id:name},update:{$set:{eventId,updatedAt:new Date()}},upsert:true}}));if(ops.length)await positions.bulkWrite(ops);})().catch(error=>log('queue_mutation_observer_checkpoint_failed',{errorType:error.name,code:error.code||null})).finally(()=>flushing=null);
  return flushing;
 };
 for(const name of names){
  const position=await positions.findOne({_id:name}),oldest=(await connection.xrange('bull:'+name+':events','-','+','COUNT',1))[0]?.[0],tip=(await connection.xrevrange('bull:'+name+':events','+','-','COUNT',1))[0]?.[0]||'0-0';
  if(position?.eventId&&position.eventId!=='0-0'&&oldest&&Number(position.eventId.split('-')[0])<Number(oldest.split('-')[0]))log('queue_mutation_observer_history_gap',{queue:name,checkpoint:position.eventId,oldest});
  seen.set(name,position?.eventId||tip);
  const events=new QueueEventsClass(name,{connection,autorun:false,lastEventId:position?.eventId||tip});watchers.push(events);
  for(const event of ['waiting','cleaned','removed','active','completed','failed','added','duplicated','stalled','delayed','retries-exhausted','paused','resumed'])events.on(event,(data,id)=>record(name,event,data,id));
  events.on('drained',id=>record(name,'drained',{},id));events.on('error',error=>log('queue_mutation_observer_error',{queue:name,errorType:error.name,code:error.code||null}));
  void events.run().catch(error=>log('queue_mutation_observer_error',{queue:name,errorType:error.name,code:error.code||null}));
 }
 const timer=setInterval(()=>void flush(),flushMs);timer.unref();
 log('queue_mutation_observer_started',{queues:names.length});
 return{flush,async close(){clearInterval(timer);await Promise.all(watchers.map(w=>w.close()));await flush();await Promise.all([...pending]);}};
}
