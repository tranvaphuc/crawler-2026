import fs from 'node:fs/promises';import path from 'node:path';import dotenv from 'dotenv';import ES from 'elasticsearch';
import {NewsState} from '../src/newsFlow/state.mjs';import {NewsEs5Sink} from '../src/newsFlow/es5.mjs';import {NewsWriterRuntime} from '../src/newsFlow/writerRuntime.mjs';
const args=process.argv.slice(2),flags=new Set(['--once','--help']),values=new Set(['--state','--proof','--batch-size','--poll-ms','--duration-seconds']),opts={};
for(let i=0;i<args.length;i++){const key=args[i];if(flags.has(key))opts[key]=true;else if(values.has(key)&&args[i+1]&&!args[i+1].startsWith('--'))opts[key]=args[++i];else throw Error('INVALID_NEWS_WRITER_ARGUMENT');}
if(opts['--help']){console.log('node scripts/run_news_writer.mjs [--state path] [--proof path] [--batch-size 30] [--poll-ms 1000] [--once]\nDedicated ES5 create-only importer. Requires ES5_HOST and verified identity proof. Never fetches news URLs.');process.exit(0);}
const number=(key,fallback,min,max)=>{const n=opts[key]===undefined?fallback:Number(opts[key]);if(!Number.isInteger(n)||n<min||n>max)throw Error('INVALID_NEWS_WRITER_NUMBER');return n;};
const env={...dotenv.parse(await fs.readFile('.env')),...process.env};if(!env.ES5_HOST)throw Error('ES5_HOST_MISSING');
await fs.mkdir(path.resolve('outputs/news-flow-runtime'),{recursive:true});
const state=await NewsState.open(opts['--state']||path.resolve('outputs/news-flow-runtime/write.sqlite'));let es,runtime;
try{
 const proof=JSON.parse(await fs.readFile(opts['--proof']||'outputs/news-flow-build-2026-11-12/identity-proof.json','utf8'));
 es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:30000});
 const sink=new NewsEs5Sink({requirePublicationProof:true,state,es,proof,write:true,onResult:r=>{state.event('es5_result',r);console.log(JSON.stringify(r));}});
 runtime=new NewsWriterRuntime({state,sink,batchSize:number('--batch-size',30,1,100),pollMs:number('--poll-ms',1000,1,60000),durationMs:number('--duration-seconds',0,0,86400)*1000,once:!!opts['--once'],onReport:r=>console.log(JSON.stringify(r))});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>runtime.stop());
 const report=await runtime.run();await fs.writeFile('outputs/news-flow-runtime/last-writer-report.json',JSON.stringify(report,null,2));
}catch(e){console.error(JSON.stringify({error:e.code||(/^[A-Z0-9_]+$/.test(e.message)?e.message:'NEWS_WRITER_FAILED'),...(Number.isInteger(e.errcode)?{sqliteCode:e.errcode}:{})}));process.exitCode=1;}finally{runtime?.stop();es?.close();state.close();}
