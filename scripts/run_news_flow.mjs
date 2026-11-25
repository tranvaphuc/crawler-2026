import fs from 'node:fs/promises';import path from 'node:path';import dotenv from 'dotenv';import ES from 'elasticsearch';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';import {NewsState} from '../src/newsFlow/state.mjs';import {NewsProxyPool,NewsHttpDriver} from '../src/newsFlow/transport.mjs';import {NewsProcessor} from '../src/newsFlow/processor.mjs';import {NewsEs5Sink} from '../src/newsFlow/es5.mjs';import {NewsRuntime,resolveNewsConcurrency} from '../src/newsFlow/runtime.mjs';import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {NewsBatchReader} from '../src/newsFlow/batchReader.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsSeedDiscoveryPool} from '../src/newsFlow/seedDiscoveryPool.mjs';
const args=process.argv.slice(2),flags=new Set(['--write','--once','--no-expand','--external-writer','--help']),values=new Set(['--sites','--state','--proxy-file','--proof','--concurrency','--seed-concurrency','--article-concurrency','--parser-workers','--interval-seconds','--duration-seconds','--max-requests','--max-age-hours','--url']);const opts={};
for(let i=0;i<args.length;i++){const k=args[i];if(flags.has(k))opts[k]=true;else if(values.has(k)&&args[i+1]&&!args[i+1].startsWith('--'))opts[k]=args[++i];else throw Error('INVALID_NEWS_FLOW_ARGUMENT');}
if(opts['--help']){console.log('node scripts/run_news_flow.mjs [--once] [--sites kenh14.vn,vnexpress.net] [--url articleUrl] [--seed-concurrency 48] [--article-concurrency 16] [--max-requests 10] [--duration-seconds 120] [--no-expand] [--write] [--external-writer]\nDefault: dry-run, 16 seed + 16 article; per-lane overrides reserve independent task budgets. HTTP deadline stays 2 seconds. Requires Node >=22.13, NEWS_PROXY_FILE and ES5_HOST (.env). See docs/news-flow.md.');process.exit(0);}
const number=(key,fallback,min=1,max=1000000)=>{const n=opts[key]===undefined?fallback:Number(opts[key]);if(!Number.isFinite(n)||n<min||n>max)throw Error('INVALID_NEWS_FLOW_NUMBER');return n;};
const concurrency=number('--concurrency',32,1,128),seedConcurrency=opts['--seed-concurrency']===undefined?undefined:number('--seed-concurrency',16,1,128),articleConcurrency=opts['--article-concurrency']===undefined?undefined:number('--article-concurrency',16,1,128),limits=resolveNewsConcurrency({concurrency,seedConcurrency,articleConcurrency});
const registry=await loadNewsRegistry(),sites=opts['--sites']?opts['--sites'].split(','):Array.from(registry.sources.keys());for(const s of sites)if(!registry.sources.has(s))throw Error('UNKNOWN_NEWS_FLOW_SITE');
const externalWriter=!!opts['--external-writer'];if(externalWriter&&!opts['--write'])throw Error('EXTERNAL_WRITER_REQUIRES_WRITE');
const env={...dotenv.parse(await fs.readFile('.env')),...process.env};if(!externalWriter&&!env.ES5_HOST)throw Error('ES5_HOST_MISSING');
const runtimeDir=path.resolve('outputs/news-flow-runtime'),write=!!opts['--write'];await fs.mkdir(runtimeDir,{recursive:true});
const state=await NewsState.open(opts['--state']||path.join(runtimeDir,write?'write.sqlite':'dry-run.sqlite'));
let es,parsers,runtime,batchReader,network,seedDiscovery;
try{
 const proof=JSON.parse(await fs.readFile(opts['--proof']||'outputs/news-flow-build-2026-11-12/identity-proof.json','utf8'));
 const pool=await NewsProxyPool.load(opts['--proxy-file']||env.NEWS_PROXY_FILE||path.join(runtimeDir,'proxies.credentials.json'));
 const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8'));
 network=new NewsNetworkPool({workers:Math.ceil(limits.total/16),maxPerWorker:16});
 seedDiscovery=new NewsSeedDiscoveryPool({workers:3,maxPerWorker:8});
 const maxRequests=number('--max-requests',0,0),driver=new NewsHttpDriver({state,pool,profiles,network,pageValidator:seedDiscovery,allowedDomains:registry.allowedDomains,maxWireRequests:maxRequests});
 if(!externalWriter)es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:30000});
 parsers=new NewsRepairPool(number('--parser-workers',2,1,8),new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
 const sink=externalWriter?{write:true}:new NewsEs5Sink({requirePublicationProof:true,es,state,proof,write,onResult:r=>{state.event('es5_result',r);console.log(JSON.stringify(r));}});
 const processor=new NewsProcessor({state,driver,registry,parsers,seedDiscovery,maxAgeHours:number('--max-age-hours',24,1,87600),expand:!opts['--no-expand']});
 batchReader=new NewsBatchReader(state.db.prepare('PRAGMA database_list').get().file);
 runtime=new NewsRuntime({state,registry,processor,sink,driver,sites,batchReader,manageWriter:!externalWriter,once:!!opts['--once'],concurrency,seedConcurrency,articleConcurrency,maxRequests,durationMs:number('--duration-seconds',0,0)*1000,intervalMs:number('--interval-seconds',300,60)*1000,onReport:r=>console.log(JSON.stringify(r))});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>runtime.stop());
 if(opts['--url']){if(!opts['--once'])throw Error('SINGLE_URL_REQUIRES_ONCE');const source=registry.byHost(new URL(opts['--url']).hostname);if(!source||!sites.includes(source.domain))throw Error('ARTICLE_NOT_IN_SELECTED_SITES');const cycle='single-'+Date.now();state.cycle(cycle);state.enqueue(cycle,opts['--url'],source.domain,'article',null,50,{force:true});}
 const report=await runtime.run({initial:!opts['--url']});await fs.writeFile(path.join(runtimeDir,write?'last-write-report.json':'last-dry-run-report.json'),JSON.stringify(report,null,2));
}catch(e){console.error(JSON.stringify({error:e.code||(/^[A-Z0-9_]+$/.test(e.message)?e.message:'NEWS_FLOW_FAILED')}));process.exitCode=1;}finally{runtime?.stop();await network?.close();await seedDiscovery?.close();await batchReader?.close();await parsers?.close();es?.close();state.close();}
