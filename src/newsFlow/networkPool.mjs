import {Worker} from 'node:worker_threads';
import {workerExecArgv} from './workerExecArgv.mjs';
const failure=code=>Object.assign(Error(code),{code});
export class NewsNetworkPool{
 constructor({workers=2,maxPerWorker=16,maxQueue=128,workerUrl=new URL('./networkWorker.mjs',import.meta.url),fatalOnFailure=false,maxOldGenerationSizeMb=256}={}){
  this.fatalOnFailure=fatalOnFailure;this.maxOldGenerationSizeMb=maxOldGenerationSizeMb;
  this.workerUrl=workerUrl;this.maxPerWorker=maxPerWorker;this.maxQueue=maxQueue;this.states=[];this.queue=[];this.nextId=0;this.closed=false;this.failure=null;this.failures=0;
  if(!Number.isInteger(workers)||workers<1||workers>16||!Number.isInteger(maxPerWorker)||maxPerWorker<1)throw failure('NEWS_INVALID_NETWORK_POOL');
  for(let i=0;i<workers;i++)this.spawn();
 }
 spawn(){if(this.closed||this.failure)return;const worker=new Worker(this.workerUrl,{execArgv:workerExecArgv(),resourceLimits:{maxOldGenerationSizeMb:this.maxOldGenerationSizeMb}}),s={worker,jobs:new Map(),dead:false};this.states.push(s);
  worker.on('message',r=>{const job=s.jobs.get(r.id);if(!job||s.dead)return;clearTimeout(job.timer);s.jobs.delete(r.id);const {id,...result}=r;job.resolve({...result,networkQueueMs:Math.max(0,(result.startedAt||Date.now())-job.enqueuedAt),mainThreadDelayMs:Math.max(0,Date.now()-(result.completedAt||Date.now()))});this.pump();});
  const failed=()=>{if(s.dead||this.closed)return;s.dead=true;this.states=this.states.filter(x=>x!==s);this.failures++;for(const job of s.jobs.values()){clearTimeout(job.timer);job.reject(failure('NEWS_NETWORK_WORKER_FAILED'));}s.jobs.clear();worker.terminate();if(this.fatalOnFailure||this.failures>=3){this.failure=failure('NEWS_NETWORK_POOL_FAILED');for(const j of this.queue.splice(0))j.reject(this.failure);}else this.spawn();this.pump();};
  s.fail=failed;worker.on('error',failed);worker.on('exit',failed);this.pump();
 }
 request(input){if(this.closed||this.failure)return Promise.reject(this.failure||failure('NEWS_NETWORK_POOL_CLOSED'));if(this.queue.length>=this.maxQueue)return Promise.reject(failure('NEWS_NETWORK_QUEUE_FULL'));return new Promise((resolve,reject)=>{this.queue.push({id:++this.nextId,input,resolve,reject,enqueuedAt:Date.now()});this.pump();});}
 pump(){if(this.closed||this.failure)return;while(this.queue.length){const s=this.states.filter(x=>!x.dead&&x.jobs.size<this.maxPerWorker).sort((a,b)=>a.jobs.size-b.jobs.size)[0];if(!s)return;const j=this.queue.shift();s.jobs.set(j.id,j);j.timer=setTimeout(()=>s.fail(),Math.min(j.input.timeoutMs||5000,5000)+10000);s.worker.postMessage({id:j.id,input:j.input});}}
 stats(){return {mode:'axios_workers',workers:this.states.length,inFlight:this.states.reduce((n,s)=>n+s.jobs.size,0),queued:this.queue.length,failures:this.failures};}
 async close(){this.closed=true;const e=failure('NEWS_NETWORK_POOL_CLOSED');for(const j of this.queue.splice(0))j.reject(e);for(const s of this.states)for(const j of s.jobs.values()){clearTimeout(j.timer);j.reject(e);}await Promise.all(this.states.map(s=>s.worker.terminate()));this.states=[];}
}
