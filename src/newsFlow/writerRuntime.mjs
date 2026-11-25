import {setTimeout as wait} from 'node:timers/promises';
import {isNewsSqliteContention,newsSqliteTransaction,waitForNewsSqlite} from './sqliteContention.mjs';
const leaseError=()=>Object.assign(Error('NEWS_ES5_WRITER_LEASE_LOST'),{code:'NEWS_ES5_WRITER_LEASE_LOST'});
const sqliteBusy=isNewsSqliteContention;
// A single importer owns recovery of outbox.sending; it never recovers crawl tasks.
export class NewsWriterRuntime{
 constructor({state,sink,batchSize=30,pollMs=1000,once=false,durationMs=0,onReport=()=>{},noRetry=false,processLock=null}){
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>100||!Number.isInteger(pollMs)||pollMs<1||!Number.isFinite(durationMs)||durationMs<0)throw Error('NEWS_INVALID_WRITER_OPTIONS');
  Object.assign(this,{state,sink,batchSize,pollMs,once,durationMs,onReport,noRetry,processLock});this.stopped=false;this.batches=0;this.handled=0;this.sqliteBusyRetries=0;this.abort=new AbortController();
 }
 stop(){this.stopped=true;this.abort.abort();}
 report(started){return {mode:'es5_writer',pid:process.pid,write:this.sink.write,bulkAction:'create',batchSize:this.batchSize,noRetry:this.noRetry,batches:this.batches,handled:this.handled,sqliteBusyRetries:this.sqliteBusyRetries,elapsedSeconds:Math.round((Date.now()-started)/1000),outbox:this.state.db.prepare('SELECT state,count(*) AS count FROM outbox GROUP BY state').all()};}
 async run(){
  const kernelGuard=()=>{if(this.processLock&&!this.processLock.owns())throw leaseError();};
  const reportWait=details=>{this.sqliteBusyRetries++;this.onReport({mode:'es5_writer_wait',event:'sqlite_busy_wait',sqliteBusyRetries:this.sqliteBusyRetries,...details});};
  const owner=await waitForNewsSqlite(()=>this.state.lock(Date.now(),'es5_writer',{processLock:this.processLock}),{guard:kernelGuard,onWait:details=>reportWait({operation:'writer_lock',...details})}),started=Date.now();let heartbeat,error,nextReport=started,reconcile=false;const previousGuard=this.sink.beforeWrite,previousWait=this.sink.onSqliteWait;
  const guard=()=>{if(this.processLock&&!this.processLock.owns()||!this.state.ownsLease(owner,'es5_writer'))throw leaseError();previousGuard?.();};
  try{
   this.sink.beforeWrite=guard;
   this.sink.onSqliteWait=details=>{reportWait(details);previousWait?.(details);};
   heartbeat=setInterval(()=>{try{if(!this.state.heartbeat(owner,'es5_writer'))throw leaseError();}catch(e){if(sqliteBusy(e)){try{guard();reportWait({operation:'writer_heartbeat',sqliteCode:e.errcode});return;}catch(fence){e=fence;}}error=e;this.stop();}},20000);
   await newsSqliteTransaction(this.state,()=>{const recovered=this.noRetry?this.state.holdInterruptedWrites():this.state.recoverWrites();this.state.event('es5_writer_started',{pid:process.pid,recovered,bulkAction:'create',noRetry:this.noRetry});},{guard,operation:'writer_start',onWait:reportWait});
   await this.sink.initialize();
   while(!this.stopped&&(!this.durationMs||Date.now()-started<this.durationMs)){
    guard();let count;
    try{if(reconcile){this.state.recoverWrites();reconcile=false;}count=await this.sink.flush(this.batchSize);}
    catch(e){if(this.noRetry||!sqliteBusy(e))throw e;this.sqliteBusyRetries++;reconcile=true;this.onReport({mode:'es5_writer_wait',pid:process.pid,event:'sqlite_busy',sqliteCode:e.errcode,sqliteBusyRetries:this.sqliteBusyRetries});try{await wait(250,undefined,{signal:this.abort.signal});}catch(abort){if(abort.name!=='AbortError')throw abort;}continue;}
    this.batches++;this.handled+=count;
    if(Date.now()>=nextReport){this.onReport(this.report(started));nextReport=Date.now()+30000;}
    if(this.once)break;
    if(count<this.batchSize&&(!this.noRetry||count===0))try{await wait(this.pollMs,undefined,{signal:this.abort.signal});}catch(e){if(e.name!=='AbortError')throw e;}
   }
   if(error)throw error;
   const report={...this.report(started),stoppedAt:new Date().toISOString()};this.onReport(report);return report;
  }finally{clearInterval(heartbeat);this.sink.beforeWrite=previousGuard;this.sink.onSqliteWait=previousWait;if(!this.processLock||this.processLock.owns())await newsSqliteTransaction(this.state,()=>this.state.unlock(owner),{guard:kernelGuard,operation:'writer_unlock',onWait:reportWait});}
 }
}
