import fs from 'node:fs/promises';import {createWriteStream} from 'node:fs';import path from 'node:path';import os from 'node:os';import {performance} from 'node:perf_hooks';import {Worker} from 'node:worker_threads';import {createGzip,gzip} from 'node:zlib';import {promisify} from 'node:util';import {finished} from 'node:stream/promises';import {once} from 'node:events';import {createHash} from 'node:crypto';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';import {parseSkydoorWithPublisher} from '../src/web/newsPublisherDispatch.mjs';import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';import {isNewsCategoryUrl} from '../src/web/newsCategoryPolicy.mjs';
const arg=(k,d)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:d;
class JsonlSink{
 constructor(file,compressed=false){this.file=file;this.dest=createWriteStream(file);this.stream=compressed?createGzip({level:1}):this.dest;if(compressed)this.stream.pipe(this.dest);this.failure=null;this.dest.on('error',e=>this.failure=e);this.stream.on('error',e=>this.failure=e);this.tail=Promise.resolve();this.lines=0;}
 write(value){const line=JSON.stringify(value)+'\n';const p=this.tail.then(async()=>{if(this.failure)throw this.failure;if(!this.stream.write(line))await once(this.stream,'drain');this.lines++;});this.tail=p.catch(()=>{});return p;}
 async close(){await this.tail;if(this.failure)throw this.failure;this.stream.end();await finished(this.dest);}
}
class ParserWorkers{
 constructor(count,sources){this.sources=sources;this.states=[];this.tasks=[];this.next=0;this.closed=false;this.crashes=0;this.start=Promise.all(Array.from({length:count},()=>this.spawn()));}
 spawn(){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('../src/web/newsBenchmarkWorker.mjs',import.meta.url),{workerData:{sources:this.sources},resourceLimits:{maxOldGenerationSizeMb:768}}),s={worker,busy:null,ready:false};this.states.push(s);worker.on('message',m=>{if(m.ready){s.ready=true;resolve();this.pump();return;}if(s.busy&&m.id===s.busy.id){const t=s.busy;s.busy=null;m.error?t.reject(Error(m.error)):t.resolve(m.result);this.pump();}});worker.on('error',e=>{s.busy?.reject(e);s.busy=null;reject(e);});worker.on('exit',code=>{this.states=this.states.filter(x=>x!==s);if(!this.closed){s.busy?.reject(Error('parser_worker_exit:'+code));if(++this.crashes>3){this.closed=true;for(const t of this.tasks.splice(0))t.reject(Error('parser_workers_unavailable'));}else this.spawn().catch(e=>{for(const t of this.tasks.splice(0))t.reject(e);});}});});}
 run(task){if(this.closed)return Promise.reject(Error('parser_workers_closed'));return new Promise((resolve,reject)=>{this.tasks.push({id:++this.next,task,resolve,reject});this.pump();});}
 pump(){for(const s of this.states)if(s.ready&&!s.busy&&this.tasks.length){s.busy=this.tasks.shift();s.worker.postMessage({id:s.busy.id,task:s.busy.task});}}
 async close(){this.closed=true;await Promise.all(this.states.map(s=>s.worker.terminate()));}
}
// A finite, in-memory batch dispatcher only. No Redis/BullMQ, scheduler or ES client.
async function originPool(initial,handler,{concurrency,perOrigin,intervalMs,stopped}){
 const groups=new Map(),order=[];let active=0,pending=0,cursor=0,timer;
 await new Promise((resolve,reject)=>{
  const add=job=>{const key=new URL(job.url).hostname.replace(/^www\./,'');if(!groups.has(key)){groups.set(key,{items:[],index:0,active:0,next:0});order.push(key);}groups.get(key).items.push(job);pending++;};initial.forEach(add);
  const pump=()=>{clearTimeout(timer);if(stopped()){if(active===0)resolve();return;}let spins=0;while(active<concurrency&&spins<order.length){const key=order[cursor++%order.length],g=groups.get(key);if(!g){break;}if(g.index<g.items.length&&g.active<perOrigin&&g.next<=performance.now()){const job=g.items[g.index++];pending--;active++;g.active++;g.next=performance.now()+intervalMs;spins=0;Promise.resolve().then(()=>handler(job,add)).then(()=>{active--;g.active--;pump();},reject);}else spins++;}if(active===0&&pending===0){resolve();return;}if(active<concurrency){const waits=order.map(k=>groups.get(k)).filter(g=>g.index<g.items.length&&g.active<perOrigin).map(g=>Math.max(1,g.next-performance.now()));if(waits.length)timer=setTimeout(pump,Math.min(...waits));}};pump();
 });clearTimeout(timer);
}
import {createReadStream} from 'node:fs';
import readline from 'node:readline';
// The shared, tested finite-batch dispatcher and writer are prepended below.
const prior=path.resolve(process.argv[2]),out=path.join(prior,'resume'),started=performance.now();
await fs.mkdir(out,{recursive:true});
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const initialInputs=await read(path.join(prior,'inputs.json'));
const recovery=await read(path.join(prior,'recovery','recovery.json'));
const domains=await read(path.join(prior,'recovery','selected-domains.json'));
const jobs=await read(path.join(prior,'recovery','pending-articles.json'));
const configs=new Map(),sources=[];
for(const domain of domains){const config=await read(path.join(prior,'configs',domain+'.json'));configs.set(domain,config);sources.push({domain,config,discoverySite:{domain,url:config.homepage}});}
const oldDocumentKeys=new Set(await read(path.join(prior,'recovery','recovered-document-keys.json'))),docKeys=new Set(oldDocumentKeys);
const codeHashes=await read(path.join(prior,'code-hashes.json'));
async function changedCode(){const changed=[];for(const [file,hash]of Object.entries(codeHashes))if(createHash('sha256').update(await fs.readFile(file)).digest('hex')!==hash)changed.push(file);return changed;}
const changedBefore=await changedCode();if(changedBefore.length)throw Error('Frozen parser/transport changed: '+changedBefore.join(','));
const sinks={requests:new JsonlSink(path.join(out,'requests.jsonl')),articles:new JsonlSink(path.join(out,'article-results.jsonl')),feeds:new JsonlSink(path.join(out,'feed-results.jsonl')),documents:new JsonlSink(path.join(out,'documents.jsonl.gz'),true)};
const stats={physicalHttpRequests:0,logicalHttpResponses:0,responseBodyBytes:0,articleTasksDone:0,articleUrlsParsed:0,articleUrlsFailed:0,articleUrlsExcluded:0,articleParserAttempts:0,articleParserFailures:0,documentsWritten:0,duplicateDocumentKeys:0,notFetchedRateLimited:0,notFetchedUserStopped:0,feedFailures:0};
let abort=false,fatalError=null,phase='publication_context',pool,label=0;
process.on('SIGINT',()=>abort=true);process.on('SIGTERM',()=>abort=true);
const snapshot=()=>({at:new Date().toISOString(),phase,resumeElapsedMs:Math.round(performance.now()-started),overallWallElapsedMs:Date.now()-Date.parse(initialInputs.startedAt),pendingAtResume:jobs.length,remainingResumeUrls:jobs.length-stats.articleTasksDone,...stats,parserWorkerCrashes:pool?.crashes||0,rssMB:Math.round(process.memoryUsage().rss/1048576)});
const progress=async()=>{const p=snapshot();await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(p,null,2));console.log(JSON.stringify(p));};
const timer=setInterval(()=>progress().catch(e=>fatalError=e.message),30000);
const blockedOrigins=new Set();
for await(const line of readline.createInterface({input:createReadStream(path.join(prior,'requests.jsonl')),crlfDelay:Infinity})){try{const r=JSON.parse(line);if(r.error==='rate_limited')blockedOrigins.add(new URL(r.requestedUrl).hostname.replace(/^www\./,''));}catch{}}
const options={timeoutMs:15000,maxSockets:2,maxTotalSockets:128,maxFreeSockets:2,agentIdleTimeoutMs:5000,persistEvidence:false,validateHtml:false,onNetworkRequest:()=>stats.physicalHttpRequests++,onResponse:async meta=>{stats.logicalHttpResponses++;stats.responseBodyBytes+=meta.responseBytes||0;await sinks.requests.write({phase:'articles_resume',...meta});}};
const normal=createNewsResearchTransport(options),large=createNewsResearchTransport({...options,maxBytes:16000000,maxTotalSockets:8}),inflight=new Map();
const transport={async get(url,...args){const host=new URL(url).hostname.replace(/^www\./,'');if(host==='dantri.com.vn')return {requestedUrl:url,error:'not_fetched_user_stopped_timeout_origin',html:null,statusCode:null,attempted:false};if(blockedOrigins.has(host))return {requestedUrl:url,error:'not_fetched_origin_rate_limited',html:null,statusCode:429,attempted:false};if(inflight.has(url))return inflight.get(url);const pending=(async()=>{const page=await(host==='edition.cnn.com'?large:normal).get(url,out,'resume-'+(++label),{maxDocumentChars:host==='edition.cnn.com'?16000000:4000000});if(page.error==='rate_limited')blockedOrigins.add(host);return page;})();inflight.set(url,pending);try{return await pending;}finally{inflight.delete(url);}},async close(){await normal.close();await large.close();}};
const contexts={};
async function processArticle(entry){let page,results=[];try{page=await transport.get(entry.url);if(page.error)throw Error(page.error);if(new URL(page.finalUrl).pathname==='/'&&new URL(entry.url).pathname!=='/')throw Error('article_redirect_to_homepage');const ordinary=entry.domains.filter(d=>configs.get(d).parserType!=='publisher_dispatch');if(ordinary.length)results.push(...await pool.run({kind:'article',url:entry.url,html:page.html,domains:ordinary,contexts:Object.fromEntries(ordinary.filter(d=>contexts[d]).map(d=>[d,contexts[d]]))}));for(const domain of entry.domains.filter(d=>configs.get(d).parserType==='publisher_dispatch')){const result=await parseSkydoorWithPublisher({page,url:entry.url,transport,directory:out,label:'dispatch-'+(++label),configDirectory:path.join(prior,'configs')});const error=result.error||(result.parsed?.extracted.publisherRestricted?'publisher_restricted_content_unverified':null)||(!result.parsed?'publisher_dispatch_failed':null);results.push({domain,parsed:error?null:result.parsed,error});}}
 catch(e){results=entry.domains.map(domain=>({domain,parsed:null,error:e.message}));}
 let success=0,excluded=0;for(const r of results){stats.articleParserAttempts++;if(r.parsed){success++;const key=r.parsed._index+'/'+r.parsed._id;if(!docKeys.has(key)){docKeys.add(key);await sinks.documents.write({...r.parsed,benchmark:{requestedUrl:entry.url,discoveredBySources:entry.domains,resumedAfterInterruption:true}});stats.documentsWritten++;}else stats.duplicateDocumentKeys++;}else if(r.error?.startsWith('non_news_document:'))excluded++;else stats.articleParserFailures++;}
 if(page?.attempted===false){if(page.error==='not_fetched_user_stopped_timeout_origin')stats.notFetchedUserStopped++;else if(page.error==='not_fetched_origin_rate_limited')stats.notFetchedRateLimited++;}
 stats.articleTasksDone++;if(success)stats.articleUrlsParsed++;else if(excluded===entry.domains.length)stats.articleUrlsExcluded++;else stats.articleUrlsFailed++;
 await sinks.articles.write({url:entry.url,discoveredBySources:entry.domains,foundOnCount:entry.foundOnCount,foundOnExamples:entry.foundOnExamples,statusCode:page?.statusCode??null,attempted:page?.attempted!==false,repairMissingDocument:entry.repairMissingDocument,results:results.map(r=>({domain:r.domain,error:r.error||null,documentKey:r.parsed?r.parsed._index+'/'+r.parsed._id:null,bodyLength:r.parsed?.extracted.bodyLength,publishedDate:r.parsed?._source.publishedDate}))});
}
try{
 pool=new ParserWorkers(4,sources);await pool.start;
 const neededDomains=new Set(jobs.flatMap(j=>j.domains));
 for(const domain of neededDomains){const c=configs.get(domain);const feeds=[...new Set([c.publishedDate,...(c.variants||[]).map(v=>v.publishedDate)].filter(d=>d?.strategy==='public_feed').map(d=>d.feedUrl).filter(Boolean))];for(const url of feeds){let result;try{const page=await transport.get(url);if(page.error)throw Error(page.error);const context=parsePublicPublicationFeed(page.html,page.finalUrl||url);if(!context.items.length)throw Error('empty_publication_feed');(contexts[domain]||=[]).push(context);result={domain,url,status:'fetched',items:context.items.length};}catch(e){stats.feedFailures++;result={domain,url,status:'failed',error:e.message};}await sinks.feeds.write(result);}}
 phase='articles';await progress();
 // User-authorized unattempted Dan Tri URLs are accounted for without issuing a request.
 const deferred=jobs.filter(j=>new URL(j.url).hostname.replace(/^www\./,'')==='dantri.com.vn');
 for(const entry of deferred){if(abort)break;await processArticle(entry);}
 const active=jobs.filter(j=>new URL(j.url).hostname.replace(/^www\./,'')!=='dantri.com.vn');
 await originPool(active,processArticle,{concurrency:128,perOrigin:2,intervalMs:250,stopped:()=>abort||!!fatalError});
}catch(e){fatalError=e.stack||e.message;}
finally{
 clearInterval(timer);await transport.close();await pool?.close();await Promise.all(Object.values(sinks).map(s=>s.close()));
 const summary={...snapshot(),phase:'complete',finishedAt:new Date().toISOString(),completedAllResumeWork:stats.articleTasksDone===jobs.length&&!abort&&!fatalError,aborted:abort,fatalError,recovery,sourceCodeModifiedDuringRun:await changedCode(),transport:'HTTP/axios',browserUsed:false,queueCreated:false,es5Written:false,productionConfigurationsChanged:false};
 await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));if(!summary.completedAllResumeWork)process.exitCode=2;
}
