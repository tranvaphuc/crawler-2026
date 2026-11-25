import {setTimeout as wait,setImmediate as yieldImmediate} from 'node:timers/promises';
import {collectDiscoveryHealth} from './discoveryHealth.mjs';
import {admitLiveWork} from './liveAdmission.mjs';
import {isNewsSqliteContention,waitForNewsSqlite} from './sqliteContention.mjs';
export class ThreeFlowRuntime{
 constructor({role,workers,state,registry,processor,driver,review=null,onReport=()=>{},once=false,processLock=null,refreshSources=null}){if(!['seed','article'].includes(role)||!Number.isInteger(workers)||workers<1||workers>256)throw Error('NEWS_INVALID_THREE_FLOW_OPTIONS');Object.assign(this,{role,workers,state,registry,processor,driver,review,onReport,once,processLock,refreshSources});this.stopped=false;this.busy=new Map();this.completed=0;this.lastProgress=Date.now();}
 stop(){this.stopped=true;this.review?.stop?.();}
 sqliteWait(operation,details){this.sqliteBusyRetries=(this.sqliteBusyRetries||0)+1;this.onReport({event:'sqlite_busy_wait',operation,sqliteBusyRetries:this.sqliteBusyRetries,...details});}
 localWrite(operation,callback){if(this.role!=='article')return callback();return waitForNewsSqlite(callback,{guard:()=>{if(this.sqliteGuard)this.sqliteGuard();else if(this.processLock&&!this.processLock.owns())throw Error('NEWS_FLOW_LEASE_LOST');},onWait:details=>this.sqliteWait(operation,details)});}
 discoveryHealth(){if(this.role!=='seed')return undefined;const now=Date.now();if(!this.healthSnapshot||now-this.healthCheckedAt>=300000){this.healthSnapshot=collectDiscoveryHealth(this.state.db,this.registry.sources.values(),now);this.healthCheckedAt=now;}return this.healthSnapshot;}
 startReview(){if(!this.review||this.reviewTask)return this.reviewTask;this.reviewTask=Promise.resolve().then(()=>this.review.run(this.role)).catch(e=>{const code=String(e?.code||e?.message||'');if(e?.code==='ERR_SQLITE_ERROR'||/WORKER|POOL|LEASE/.test(code))this.fatal=e;else this.onReport({event:'ai_review_failed',role:this.role,error:/^[A-Za-z0-9_]+$/.test(code)?code:'NEWS_AI_REVIEW_FAILED'});}).finally(()=>this.reviewTask=null);return this.reviewTask;}
 report(){return {discoveryHealth:this.discoveryHealth(),mode:'three_flows',flow:this.role==='seed'?1:2,master:1,masterPollMs:10000,masterBatchSize:null,masterAdmission:this.role==='seed'?'complete_seed_rounds':'live_alongside_backfill',liveClaimShare:this.role==='seed'?null:0.8,liveSeedPollMs:this.role==='seed'?null:120000,seedRound:this.role==='seed'?JSON.parse(this.state.db.prepare("SELECT value FROM flow_meta WHERE key='news_seed_round'").get()?.value||'null'):undefined,workers:this.workers,working:this.busy.size,completed:this.completed,httpTimeoutMs:this.driver.timeoutMs,writeBatch:this.state.writeBatch?.stats(),discoveryByRole:this.state.discoveryByRole,sampleWrites:this.state.sampleWriteStats,queue:this.state.db.prepare('SELECT state,count(*) n FROM tasks WHERE role=? GROUP BY state').all(this.role),links:this.state.db.prepare(this.role==='seed'?'SELECT status,count(*) n FROM seed_sources GROUP BY status':'SELECT parse_status status,count(*) n FROM article_links GROUP BY parse_status').all(),aiReview:this.review?{running:!!this.reviewTask,model:this.review.model}:null};}
 async run(){const owner=await this.localWrite('parser_lock',()=>this.state.lock(Date.now(),'flow_'+this.role,{processLock:this.processLock}));let nextHeartbeat=0,nextMaster=0,nextReport=0,nextCleanup=0,nextReview=Date.now()+15000;
  this.sqliteGuard=()=>{if(this.processLock&&!this.processLock.owns()||!this.state.ownsLease(owner,'flow_'+this.role))throw Error('NEWS_FLOW_LEASE_LOST');};
  if(this.role==='article'&&this.state.writeBatch)this.state.writeBatch.contention={guard:this.sqliteGuard,onWait:details=>this.sqliteWait('write_batch',details)};
  const heartbeat=()=>{const now=Date.now();if(now<nextHeartbeat)return;try{if(this.processLock&&!this.processLock.owns()||!this.state.heartbeat(owner,'flow_'+this.role))throw Error('NEWS_FLOW_LEASE_LOST');nextHeartbeat=now+15000;}catch(error){if(this.role!=='article'||!isNewsSqliteContention(error))throw error;this.sqliteGuard();this.sqliteWait('parser_heartbeat',{sqliteCode:error.errcode});nextHeartbeat=Date.now()+250;}};
  try{await this.localWrite('recover_article',()=>this.state.recoverRole(this.role));this.state.loadOverlays(this.registry);while(!this.stopped){if(this.once&&this.completed>0&&!this.busy.size&&!this.state.pendingRole(this.role))break;const now=Date.now();
   heartbeat();
   if(this.driver.network?.failure||this.processor.seedDiscovery?.failure||this.processor.parsers?.failure)throw Error('NEWS_FLOW_WORKER_FAILED');
   if(this.fatal)throw this.fatal;
   if(now>=nextMaster){await this.localWrite('master_article',async()=>{await this.refreshSources?.();this.state.loadOverlays(this.registry);const live=this.once||this.role==='seed'?{added:0}:await admitLiveWork(this.state,this.role,now,{onProgress:heartbeat});if(live.added||live.promoted)this.onReport({event:'live_admitted',role:this.role,...live});const admitted=await this.state.masterFull(this.role,now,{onProgress:heartbeat});if(admitted.added)this.onReport({event:'queue_refilled',role:this.role,...admitted});});nextMaster=Date.now()+10000;}
   if(now>=nextCleanup&&!this.cleanupTask){if(this.role==='article')this.cleanupTask=this.localWrite('cleanup_article',()=>this.state.cleanupFull(now,{onProgress:heartbeat,shouldStop:()=>this.stopped})).then(result=>this.onReport({event:'sqlite_cleanup_completed',...result})).catch(e=>{this.fatal=e;}).finally(()=>this.cleanupTask=null);this.driver.pool.bindings.clear();nextCleanup=now+3600000;}
   if(now>=nextReview&&!this.reviewTask&&this.review){this.startReview();nextReview=now+60000;}
   const slots=Array.from({length:this.workers},(_,i)=>i).filter(i=>!this.busy.has(i));
   const claimed=this.state.writeBatch&&slots.length?await this.state.claimAvailable(this.role,slots.length):null;
   const claimCount=claimed?.length||0;
   if(this.stopped){if(claimed?.length)await this.state.releaseUnstartedClaims(claimed);break;}
   for(const slot of slots){
    const task=claimed?claimed.shift():this.state.claim(this.role);if(!task)break;
    const started=Date.now();const job=this.processor.process(task).catch(e=>{if(e.code==='ERR_SQLITE_ERROR'||/WORKER|POOL|LEASE/.test(e.code||e.message))throw e;this.processor.hold(task,e.code||(/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'NEWS_TASK_EXCEPTION'));}).catch(e=>{this.fatal=e;}).finally(()=>{this.busy.delete(slot);this.completed++;this.lastProgress=Date.now();});
    this.busy.set(slot,{job,started});
   }
   // Fatal infrastructure errors restart the service; URL failures finish only their own job.
   if([...this.busy.values()].some(j=>now-j.started>90000))throw Error('NEWS_JOB_WATCHDOG_EXPIRED');
   if(now>=nextReport){this.onReport(this.report());nextReport=now+30000;}
   if(this.once&&!this.cleanupTask&&!this.busy.size&&!this.state.pendingRole(this.role))break;
   if(claimed&&claimCount&&this.busy.size<this.workers)await yieldImmediate();else await wait(100);
  }
  await Promise.all([...this.busy.values()].map(j=>j.job));if(this.fatal)throw this.fatal;return this.report();
  }finally{this.stopped=true;if(this.cleanupTask)await this.cleanupTask;this.review?.stop?.();if(this.reviewTask)await Promise.race([this.reviewTask,wait(5000,undefined,{ref:false})]);await Promise.race([Promise.all([...this.busy.values()].map(j=>j.job)),wait(5000,undefined,{ref:false})]);if(!this.processLock||this.processLock.owns())await this.localWrite('parser_unlock',()=>this.state.unlock(owner));}
 }
}
