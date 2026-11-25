import {monitorEventLoopDelay} from 'node:perf_hooks';
const pause=ms=>new Promise(r=>setTimeout(r,ms));

export function resolveNewsConcurrency({concurrency=32,seedConcurrency,articleConcurrency}={}){
 const valid=n=>Number.isInteger(n)&&n>=1&&n<=128;
 if(!valid(concurrency)||(seedConcurrency!==undefined&&!valid(seedConcurrency))||(articleConcurrency!==undefined&&!valid(articleConcurrency)))throw Error('NEWS_INVALID_CONCURRENCY');
 const seed=seedConcurrency??Math.max(1,Math.floor(concurrency/2)),article=articleConcurrency??Math.max(1,Math.ceil(concurrency/2));
 const total=seedConcurrency===undefined&&articleConcurrency===undefined?concurrency:seed+article;
 if(total>128)throw Error('NEWS_CONCURRENCY_LIMIT_EXCEEDED');
 return {seed,article,total};
}

export class NewsRuntime{
 constructor({state,registry,processor,sink,driver,sites,batchReader=null,manageWriter=true,pauseSeeds=process.env.NEWS_SEED_PAUSED==='1',concurrency=32,seedConcurrency,articleConcurrency,intervalMs=300000,once=false,maxRequests=0,durationMs=0,onReport=()=>{}}){
  Object.assign(this,{state,registry,processor,sink,driver,sites,batchReader,manageWriter,pauseSeeds,concurrency,intervalMs,once,maxRequests,durationMs,onReport});
  this.stopped=false;this.wires=0;this.cycles=0;this.busy=new Set();this.lanes={seed:0,article:0};
  const limits=resolveNewsConcurrency({concurrency,seedConcurrency,articleConcurrency});this.concurrency=limits.total;this.limits={seed:pauseSeeds?0:limits.seed,article:limits.article};if(pauseSeeds)this.concurrency=limits.article;
  this.articleBatchIds=[];this.articleBatchRetryAt=0;this.turn=0;
  const previous=driver.onWire;driver.onWire=v=>{this.wires++;previous(v);};
 }
 stop(){this.stopped=true;}
 seed(now=Date.now()){
  if(this.pauseSeeds)return null;
  const sources=this.sites.map(d=>this.registry.sources.get(d));
  const admission=this.state.seedRound(sources,{now,intervalMs:this.intervalMs,once:this.once});this.lastSeedAdmission=admission;
  if(!admission.cycle)return null;this.cycles++;
  this.state.event('round_started',{cycle:admission.cycle,sources:admission.sites.length,sites:admission.sites,seeds:admission.seeds,blocked:admission.blocked,discoveryPolicy:'per_publisher_fifo_backpressure'});return admission.cycle;
 }
 claimArticle(){
  // Reconsider fresh discoveries even while an older 50-URL batch is still draining.
  if(this.batchReader&&!this.batchReadTask&&Date.now()-(this.lastBatchReadAt||0)>=2000)this.startBatchRead();
  if(Date.now()<this.articleBatchRetryAt)return null;
  let task=this.articleBatchIds.length?this.state.claim('article',this.sites,{ids:this.articleBatchIds}):null;
  if(task)return task;
  if(this.batchReader){
   if(!this.batchReadTask)this.startBatchRead();
   return null;
  }
  // Fixed batches, as in eastdata's 50-URL producer. Recent/owned publication hints precede the small background slice.
  // Cooldown/running publishers remain pending and do not block admission for other publishers.
  this.articleBatchIds=this.state.articleBatch(this.sites,50);
  if(!this.articleBatchIds.length)this.articleBatchRetryAt=Date.now()+1000;
  return this.articleBatchIds.length?this.state.claim('article',this.sites,{ids:this.articleBatchIds}):null;
 }
 startBatchRead(){this.batchReadTask=this.batchReader.read(this.sites,50).then(r=>{this.articleBatchIds=r.ids;this.lastBatchReadMs=r.elapsedMs;this.lastBatchReadAt=Date.now();if(!r.ids.length)this.articleBatchRetryAt=Date.now()+1000;}).catch(e=>{this.batchReadError=e;this.stop();}).finally(()=>{this.batchReadTask=null;});}
 admit(){
  let launched=false;
  for(const role of this.turn++%2?['article','seed']:['seed','article']){
   while(this.busy.size<this.concurrency&&this.lanes[role]<this.limits[role]&&(!this.maxRequests||this.wires+this.busy.size<this.maxRequests)){
    const task=role==='seed'?this.state.claim('seed',this.sites):this.claimArticle();if(!task)break;
    if(role==='article')this.state.event('article_started',{cycle:task.cycle,url:task.url,site:task.site,queueWaitMs:Date.now()-task.created,sinceSeenMs:task.seen_at?Date.now()-task.seen_at:null,publicationHint:task.published_hint,priority:task.priority,policy:'freshness_v1'});
    launched=true;this.lanes[role]++;
    const work=this.processor.process(task).catch(e=>this.processor.hold(task,e.code||(/^[A-Z0-9_]+$/.test(e.message)?e.message:'NEWS_TASK_EXCEPTION'))).finally(()=>{this.busy.delete(work);this.lanes[role]--;});
    this.busy.add(work);
   }
  }
  return launched;
 }
 async run({initial=true}={}){
  const owner=this.state.lock(),started=Date.now();let heartbeat,writerOwner,heartbeatError,writerTask=null,writerError=null,nextSeed=started+this.intervalMs,nextReport=started,nextPrune=started+60000,nextFlush=0;const previousGuard=this.sink.beforeWrite;
  this.loopDelay=monitorEventLoopDelay({resolution:20});this.loopDelay.enable();
  try{
   if(this.manageWriter){writerOwner=this.state.lock(Date.now(),'es5_writer');this.sink.beforeWrite=()=>{if(!this.state.ownsLease(writerOwner,'es5_writer'))throw Error('NEWS_ES5_WRITER_LEASE_LOST');previousGuard?.();};}
   this.state.recover({outbox:this.manageWriter});heartbeat=setInterval(()=>{try{if(!this.state.heartbeat(owner)||writerOwner&&!this.state.heartbeat(writerOwner,'es5_writer'))throw Error('NEWS_FLOW_LEASE_LOST');}catch(e){heartbeatError=e;this.stop();}},20000);
   const migration=this.state.prepareDispatch();this.state.event('eastdata_dispatch_migration',migration);
   if(this.manageWriter)await this.sink.initialize();
   if(initial)this.seed(started);
   while(!this.stopped){
    if(this.driver.network?.failure)throw this.driver.network.failure;
    if(this.processor.seedDiscovery?.failure)throw this.processor.seedDiscovery.failure;
    const now=Date.now();if(this.durationMs&&now-started>=this.durationMs)break;if(this.maxRequests&&this.wires>=this.maxRequests)break;
    if(!this.once&&now>=nextSeed){
     // Each publisher has its own durable cadence and backlog gate. Paused sources wait independently.
     this.seed(now);nextSeed=now+Math.min(5000,this.intervalMs);
    }
    if(now>=nextPrune){this.state.prune(now);nextPrune=now+60000;const activeCycles=new Set(this.state.db.prepare('SELECT id FROM cycles WHERE finished IS NULL').all().map(r=>r.id));for(const key of this.driver.pool.bindings.keys())if(!activeCycles.has(key.split('|')[0]))this.driver.pool.bindings.delete(key);}
    if(this.manageWriter&&!writerTask&&now>=nextFlush){writerTask=this.sink.flush().catch(e=>{writerError=e;this.stop();}).finally(()=>writerTask=null);nextFlush=now+5000;}
    if(now>=nextReport){this.onReport(this.report(started));nextReport=now+30000;}
    const launched=this.admit();
    if(this.once&&!this.busy.size&&!(this.pauseSeeds?this.state.pendingRole('article',this.sites):this.state.active(this.sites)))break;
    if(!launched)await pause(100);
   }
   await Promise.all(this.busy);if(this.batchReadTask)await this.batchReadTask;if(writerTask)await writerTask;if(writerError)throw writerError;if(heartbeatError)throw heartbeatError;if(this.batchReadError)throw this.batchReadError;if(this.manageWriter)await this.sink.flush();
   const report={...this.report(started),stoppedAt:new Date().toISOString(),reason:this.stopped?'signal':this.maxRequests&&this.wires>=this.maxRequests?'request_budget':this.durationMs&&Date.now()-started>=this.durationMs?'duration_budget':'round_drained'};this.onReport(report);return report;
  }finally{await Promise.allSettled(this.busy);if(this.batchReadTask)await this.batchReadTask;if(writerTask)await writerTask;clearInterval(heartbeat);this.loopDelay.disable();if(writerOwner){this.sink.beforeWrite=previousGuard;this.state.unlock(writerOwner);}this.state.unlock(owner);}
 }
 report(started){const d=this.loopDelay,eventLoopDelayMs=d?{p50:Number((d.percentile(50)/1e6).toFixed(2)),p95:Number((d.percentile(95)/1e6).toFixed(2)),max:Number((d.max/1e6).toFixed(2))}:null;d?.reset();return {mode:this.manageWriter?(this.sink.write?'write':'dry_run'):'producer',writerMode:this.manageWriter?'embedded':'external',sources:this.sites.length,rounds:this.cycles,dispatch:'per_publisher_channels_v2',seedPaused:this.pauseSeeds,relatedLinkAdmission:this.processor.admitRelated!==false,articleQueuePolicy:process.env.NEWS_ARTICLE_BACKLOG_FIRST==='1'?'oldest_first':'freshness_first',httpTimeoutMs:this.driver.timeoutMs,networkTransport:this.driver.network?.stats()||{mode:'axios_inline'},htmlProcessing:this.processor.seedDiscovery?.stats?.()||null,articleParsers:this.processor.parsers?.stats?.()||null,batchSelection:{mode:this.batchReader?'readonly_worker':'indexed_inline',lastMs:this.lastBatchReadMs??null,inFlight:!!this.batchReadTask},eventLoopDelayMs,discoveryAdmission:this.lastSeedAdmission,laneLimits:this.limits,inFlightByRole:{...this.lanes},wireRequests:this.wires,inFlight:this.busy.size,elapsedSeconds:Math.round((Date.now()-started)/1000),pendingTasks:this.state.active(this.sites),totalPendingTasks:this.state.active(),...this.state.counts()};}
}
