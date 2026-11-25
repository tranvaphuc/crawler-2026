import {serializeCrawlItem} from './crawlerV8Es5.js';

// A later native crawl may supply fields missing from a previously failed
// import. Only the producer's complete, validated payload can replace it.
export async function refreshFailedProducerImport({row,existing,queue,jobs,backups}){
 if(existing?.state!=='failed')return false;
 try{serializeCrawlItem(row.data.item,row.data.source,{parent:row.data.parent});}catch{return false;}
 const ticket=await queue.getJob(row._id);if(!ticket||await ticket.getState()!=='failed')return false;
 await backups.updateOne({_id:'producer-refresh:'+row._id+':'+String(existing.failedAt||'initial')},{$setOnInsert:{jobId:row._id,original:existing,createdAt:new Date()}},{upsert:true});
 await ticket.updateData({...row.data,mongoJobId:row._id,entityKey:row.entityKey});
 await ticket.retry('failed');
 await jobs.updateOne({_id:row._id,state:'failed'},{$set:{data:row.data,state:'queued',lastImportError:existing.error,producerRefreshedAt:new Date()},$unset:{error:'',failedAt:''}});
 return true;
}
