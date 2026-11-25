import {Worker} from 'node:worker_threads';
export class NewsBatchReader{
 constructor(file,{timeoutMs=10000,workerUrl=new URL('./batchWorker.mjs',import.meta.url)}={}){
  this.timeoutMs=timeoutMs;this.pending=new Map();this.nextId=0;this.closed=false;this.failure=null;
  this.worker=new Worker(workerUrl,{workerData:{file},execArgv:process.execArgv.filter(a=>!a.startsWith('--input-type=')),resourceLimits:{maxOldGenerationSizeMb:128}});
  this.worker.on('message',r=>{const p=this.pending.get(r.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(r.id);if(r.error)p.reject(Error(r.error));else p.resolve({ids:r.ids,elapsedMs:r.elapsedMs});});
  this.worker.on('error',()=>this.fail('NEWS_BATCH_READER_FAILED'));
  this.worker.on('exit',()=>{if(!this.closed)this.fail('NEWS_BATCH_READER_EXITED');});
 }
 fail(code){if(!this.failure)this.failure=Error(code);for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(this.failure);}this.pending.clear();}
 read(sites,limit=50){
  if(this.closed||this.failure)return Promise.reject(this.failure||Error('NEWS_BATCH_READER_CLOSED'));
  return new Promise((resolve,reject)=>{const id=++this.nextId,timer=setTimeout(()=>{this.fail('NEWS_BATCH_READER_TIMEOUT');this.worker.terminate();},this.timeoutMs);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,sites,limit});});
 }
 async close(){this.closed=true;this.fail('NEWS_BATCH_READER_CLOSED');await this.worker.terminate();}
}
