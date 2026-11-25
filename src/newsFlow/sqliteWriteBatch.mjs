import {performance} from 'node:perf_hooks';
import {isNewsSqliteContention} from './sqliteContention.mjs';

// Coalesce writes already ready in this event-loop turn. No network/async work
// runs under SQLite's writer lock, and callers resume only after COMMIT.
export class NewsSqliteWriteBatch{
 constructor(state,{maxOperations=64,maxWriteMs=8}={}){this.state=state;this.maxOperations=maxOperations;this.maxWriteMs=maxWriteMs;this.queue=[];this.scheduled=false;this.closed=false;this.contention=null;this.metrics={batches:0,operations:0,maxOperations:0,maxWriteMs:0,maxAcquireMs:0,sqliteBusyRetries:0};}
 run(fn){if(this.closed)return Promise.reject(Error('NEWS_WRITE_BATCH_CLOSED'));if(fn.constructor.name==='AsyncFunction')return Promise.reject(Error('NEWS_WRITE_BATCH_ASYNC_CALLBACK'));return new Promise((resolve,reject)=>{this.queue.push({fn,resolve,reject});this.schedule();});}
 schedule(){if(this.scheduled||!this.queue.length)return;this.scheduled=true;setImmediate(()=>this.flush());}
 flush(){
  this.scheduled=false;if(!this.queue.length)return;const results=[],before=performance.now();let acquired;
  try{this.contention?.guard();this.state.tx(()=>{
   acquired=performance.now();
   this.contention?.guard();
   while(this.queue.length&&results.length<this.maxOperations&&(results.length===0||performance.now()-acquired<this.maxWriteMs)){
    const job=this.queue.shift(),result={job};results.push(result);this.state.db.exec('SAVEPOINT news_write_item');
    try{const value=job.fn();if(value&&typeof value.then==='function')throw Error('NEWS_WRITE_BATCH_ASYNC_CALLBACK');this.state.db.exec('RELEASE news_write_item');result.value=value;}
    catch(error){this.state.db.exec('ROLLBACK TO news_write_item; RELEASE news_write_item');result.error=error;}
   }
  },'write_batch');
  this.blockedSince=undefined;this.metrics.batches++;this.metrics.operations+=results.length;this.metrics.maxOperations=Math.max(this.metrics.maxOperations,results.length);this.metrics.maxWriteMs=Math.max(this.metrics.maxWriteMs,performance.now()-acquired);this.metrics.maxAcquireMs=Math.max(this.metrics.maxAcquireMs,acquired-before);
  for(const r of results)r.error?r.job.reject(r.error):r.job.resolve(r.value);
  }catch(error){
   let retry=false;
   if(acquired===undefined&&!results.length&&isNewsSqliteContention(error)&&this.contention&&this.state.db.isTransaction!==true){
    this.blockedSince??=Date.now();
    try{this.contention.guard();retry=Date.now()-this.blockedSince<(this.contention.maxWaitMs??60000);}catch(fence){error=fence;}
   }
   if(retry){
    this.metrics.sqliteBusyRetries++;this.contention.onWait?.({sqliteCode:error.errcode,retries:this.metrics.sqliteBusyRetries,waitedMs:Date.now()-this.blockedSince});
    this.scheduled=true;setTimeout(()=>{this.scheduled=false;this.flush();},this.contention.delayMs??100);return;
   }
   this.blockedSince=undefined;for(const r of results)r.job.reject(error);for(const job of this.queue.splice(0))job.reject(error);
  }
  this.schedule();
 }
 async close(){this.closed=true;while(this.queue.length||this.scheduled){if(!this.scheduled)this.flush();await new Promise(resolve=>setTimeout(resolve,10));}}
 stats(){return {...this.metrics,queued:this.queue.length};}
}
