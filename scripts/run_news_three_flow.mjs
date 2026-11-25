import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {execFileSync} from 'node:child_process';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {newsSqliteDiagnostics} from '../src/newsFlow/sqliteDiagnostics.mjs';
import {ThreeFlowRuntime} from '../src/newsFlow/threeFlowRuntime.mjs';
import {ThreeFlowReview} from '../src/newsFlow/threeFlowReview.mjs';
import {ThreeFlowProcessor} from '../src/newsFlow/threeFlowProcessor.mjs';
import {newsThreeFlowCapacity} from '../src/newsFlow/threeFlowCapacity.mjs';
import {createNewsProcessLock} from '../src/newsFlow/processLock.mjs';
import {NewsProxyPool,NewsHttpDriver} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsSeedDiscoveryPool} from '../src/newsFlow/seedDiscoveryPool.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {initializeOriginalBranch,captureOriginalLink,refreshOriginalSources} from '../src/newsFlow/baomoiOriginalBranch.mjs';
import {NewsCreateOnlySink} from '../src/newsFlow/createOnlySink.mjs';
import {NewsWriterRuntime} from '../src/newsFlow/writerRuntime.mjs';
const role=process.argv[2];if(!['seed','article','writer','migrate'].includes(role)||process.argv.length!==3)throw Error('NEWS_INVALID_FLOW_ROLE');
const processLock=role==='migrate'?null:createNewsProcessLock('/var/lib/news-flow/locks/'+role+'.lock',role==='writer'?'es5_writer':'flow_'+role);
const env={...dotenv.parse(await fs.readFile('/etc/news-flow/news.env')),...process.env};
if(role==='seed'||role==='article')Object.assign(env,dotenv.parse(await fs.readFile('/etc/news-flow/ai.env')));
const capacity=newsThreeFlowCapacity(env),{n1,n2}=capacity;
const report=r=>console.log(JSON.stringify(r));const state=await ThreeFlowState.open(env.NEWS_STATE||'/var/lib/news-flow/news-flow-runtime/write.sqlite');state.db.exec('PRAGMA cache_size=-8192');let runtime,network,html,parsers,es,watchdog;
try{
 const registry=await loadNewsRegistry();
 if(role==='migrate'){
  const migrated=state.migrateThreeFlows(registry);let purged=0;for(const r of state.db.prepare("SELECT id,state FROM outbox WHERE state IN ('created','existing')").all()){state.terminalReceipt(r.id,r.state);purged++;}report({migrated,purgedPayloads:purged});
 }else{
  if(!state.db.prepare("SELECT 1 FROM flow_meta WHERE key='three_flows_v1'").get())throw Error('NEWS_THREE_FLOW_MIGRATION_REQUIRED');
  if(role==='writer'){
   es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:30000});const proof=JSON.parse(await fs.readFile('/etc/news-flow/identity-proof.json'));
   const sink=new NewsCreateOnlySink({requirePublicationProof:true,es,state,proof,write:true,noRetry:true,onBatch:report,onResult:r=>{state.event('es5_result',r);report(r);}});runtime=new NewsWriterRuntime({state,sink,batchSize:100,pollMs:1000,noRetry:true,processLock,onReport:r=>report({...r,flow:3,workers:1,directCreate:true,processLock:true,payloadPurgedAfterConfirmation:true,receipts:state.db.prepare('SELECT status,count(*) n FROM import_receipts GROUP BY status').all()})});
  }else{
   state.enableWriteBatching({touchIntervalMs:60000,goodSampleIntervalMs:60000,skipSeedReviewSamples:true});
   state.syncSeeds(registry);state.loadOverlays(registry);const pool=await NewsProxyPool.load(env.NEWS_PROXY_FILE||'/etc/news-flow/proxies.json',{rotation:'request'}),profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json'));
   network=new NewsNetworkPool({workers:role==='seed'?capacity.seedNetworkWorkers:capacity.articleNetworkWorkers,maxPerWorker:16,fatalOnFailure:true,maxOldGenerationSizeMb:128});html=new NewsSeedDiscoveryPool({workers:role==='seed'?capacity.seedHtmlWorkers:capacity.articleHtmlWorkers,maxPerWorker:8,maxQueue:Math.max(128,role==='seed'?n1:n2),fatalOnFailure:true,maxOldGenerationSizeMb:256});
   parsers=role==='article'?new NewsRepairPool(capacity.parserWorkers,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url),{fatalOnFailure:true,maxOldGenerationSizeMb:384}):null;
   const driver=new NewsHttpDriver({state,pool,profiles,network,pageValidator:html,allowedDomains:registry.allowedDomains,siteCooldown:false,timeoutMs:role==='seed'?2000:5000,retryArticleTimeout:role==='article'});
   initializeOriginalBranch(state.db);refreshOriginalSources(state,registry,driver);
   const processor=new ThreeFlowProcessor({state,driver,registry,parsers,seedDiscovery:html,maxAgeHours:Infinity,expand:true,admitRelated:false,onBaomoiOriginal:(task,page,transport)=>captureOriginalLink(state,task,page,transport)});
   const review=role==='seed'||env.NEWS_AI_ENABLED==='false'?null:new ThreeFlowReview({state,registry,driver,parsers,apiKey:env.OPENAI_API_KEY||env.AI_GPT_KEY,pool,model:env.NEWS_AI_MODEL||'gpt-5.4-mini',maxCalls:Number(env.AI_DAILY_MAX_CALLS||200),budgetUSD:Number(env.AI_DAILY_BUDGET_USD||1),onReport:report});
   runtime=new ThreeFlowRuntime({role,workers:role==='seed'?n1:n2,state,registry,processor,driver,review,processLock,refreshSources:()=>state.writeAsync(()=>refreshOriginalSources(state,registry,driver)),onReport:r=>report({...r,N1:n1,N2:n2,httpConcurrency:role==='seed'?n1:n2,htmlCpuWorkers:role==='seed'?capacity.seedHtmlWorkers:capacity.articleHtmlWorkers,parserCpuWorkers:role==='article'?capacity.parserWorkers:0,processLock:true,aiEnabled:!!review,siteCooldown:driver.siteCooldown,urlFailureRetry:false,seedTimeoutNextRound:role==='seed',siteScheduling:'round_robin',proxyRotation:pool.rotation,seedDiscoveryPaused:false,relatedDiscoveryEnabled:false,articleDiscoveryEnabled:role==='seed'})});
  }
  const notify=()=>{if(process.env.NOTIFY_SOCKET)execFileSync('/usr/bin/systemd-notify',['--ready','WATCHDOG=1'],{stdio:'ignore',timeout:5000});};notify();watchdog=setInterval(notify,15000);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>runtime.stop());await runtime.run();
 }
}catch(e){report({error:e.code||(/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'NEWS_THREE_FLOW_FAILED'),role,...newsSqliteDiagnostics(e)});process.exitCode=1;
}finally{clearInterval(watchdog);runtime?.stop();await network?.close();await html?.close();await parsers?.close();es?.close();await state.writeBatch?.close();state.close();}
