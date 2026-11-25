// Check small ticket identities first. Existing Bull jobs already own their data,
// delay and lock; replaying their full Mongo checkpoints wastes the event loop.
export async function recoverQueuedTickets({rows,queues,redis,loadMissing,offer,shouldStop=()=>false}){
 const candidates=rows.filter(row=>queues.has(row.queue));
 if(!candidates.length)return {checked:0,missing:0,recovered:0};
 const pipeline=redis.pipeline();
 for(const row of candidates)pipeline.exists(queues.get(row.queue).toKey(row._id));
 const replies=await pipeline.exec();
 if(!replies||replies.length!==candidates.length)throw Error('OUTBOX_TICKET_CHECK_INCOMPLETE');
 const missing=[];
 for(let i=0;i<candidates.length;i++){
  if(replies[i][0])throw replies[i][0];
  if(replies[i][1]===0)missing.push(candidates[i]._id);
 }
 let recovered=0;
 if(missing.length){
  // Recheck Mongo eligibility at load time: a ticket may have started or been
  // deferred while the Redis existence check was in flight.
  const full=await loadMissing(missing);
  for(let i=0;i<full.length&&!shouldStop();i+=20){
   const batch=full.slice(i,i+20);
   await Promise.all(batch.map(offer));recovered+=batch.length;
  }
 }
 return {checked:candidates.length,missing:missing.length,recovered};
}
