import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {resolveBaomoiOriginalLink} from '../src/web/baomoiOriginalLink.mjs';
import {createNewsProcessLock} from '../src/newsFlow/processLock.mjs';
import {initializeOriginalBranch,recordOriginalLink,refreshOriginalSources,reconcileOriginalArticles,admitOriginalArticles,originalHost} from '../src/newsFlow/baomoiOriginalBranch.mjs';
import {articleKey} from '../src/newsFlow/identity.mjs';
import {reconcileOriginalArticlesWhenAvailable} from '../src/newsFlow/originalReconciliationRead.mjs';
import {qualifyOriginalSource} from '../src/newsFlow/originalSourceQualification.mjs';

const once=process.argv.includes('--once'),seedAt=process.argv.indexOf('--seed-report');
const lock=createNewsProcessLock('/var/lib/news-flow/locks/baomoi-original.lock','baomoi_original');
const env={...dotenv.parse(await fs.readFile('/etc/news-flow/news.env')),...process.env};
// No AI client or credentials are loaded. Existing reviews keep the shared ledger.
const state=await ThreeFlowState.open(env.NEWS_STATE||'/var/lib/news-flow/news-flow-runtime/write.sqlite');
const scratch=await ThreeFlowState.open(':memory:');scratch.cacheResponses=false;
const registry=await loadNewsRegistry(),network=new NewsNetworkPool({workers:2});
const es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:15000});
const parsers=new NewsRepairPool(1,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const pool=await NewsProxyPool.load(env.NEWS_PROXY_FILE||'/etc/news-flow/proxies.json',{rotation:'request'});
const driver=new NewsHttpDriver({state:scratch,pool,network,allowedDomains:registry.allowedDomains,siteCooldown:false});
initializeOriginalBranch(state.db);state.configureSites(registry.sources.values());
let stopped=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>stopped=true);
const report=r=>console.log(JSON.stringify(r));
const notify=()=>{if(process.env.NOTIFY_SOCKET)execFileSync('/usr/bin/systemd-notify',['--ready','WATCHDOG=1'],{stdio:'ignore',timeout:5000});};
notify();const watchdog=setInterval(notify,15000);
try{
 if(seedAt>=0){const data=JSON.parse(await fs.readFile(process.argv[seedAt+1],'utf8'));state.tx(()=>{for(const row of data.rows||[])if(recordOriginalLink(state,row))state.db.prepare('INSERT OR IGNORE INTO baomoi_original_scans VALUES(?,?,?,?)').run(articleKey(row.baomoiUrl),'captured','verified_extraction_audit',Date.now());});}
 do{
  if(!lock.owns())throw Error('NEWS_PROCESS_LOCK_LOST');
  refreshOriginalSources(state,registry,driver);
  if(!await reconcileOriginalArticlesWhenAvailable(state,registry,es,{onDeferred:report})){if(!once&&!stopped)await wait(10000);continue;}
  const admitted=admitOriginalArticles(state,registry,500,{requireEsCheck:true});
  const candidates=state.db.prepare("SELECT s.host FROM baomoi_original_sources s WHERE s.status='pending' ORDER BY s.at LIMIT 1").all();
  for(const {host} of candidates){
   if(registry.byHost(host)){state.db.prepare("UPDATE baomoi_original_sources SET status='existing' WHERE host=?").run(host);continue;}
   if(originalHost('https://'+host)!==host){state.db.prepare("UPDATE baomoi_original_sources SET status='excluded' WHERE host=?").run(host);continue;}
   driver.allowed.add(host);
   const urls=state.db.prepare('SELECT url FROM baomoi_original_articles WHERE host=? ORDER BY at DESC LIMIT 6').all(host).map(r=>r.url);
   const cycle='original-source-'+host+'-'+Date.now();scratch.cycle(cycle);
   const transport=createNewsResearchTransport({baseTransport:driver.forCycle(cycle,{siteName:host,registrableDomain:host,allowedHosts:[host,'www.'+host]},{taskRole:'review',reviewFailed:true}),persistEvidence:false});
   let result;try{result=await qualifyOriginalSource({host,urls,parsers,registry,get:url=>transport.get(url,null,'qualification')});}catch(e){if(e.code==='ERR_SQLITE_ERROR')throw e;result={approved:false,report:{error:/^[a-zA-Z0-9_]+$/.test(e.code||'')?e.code:'SOURCE_QUALIFICATION_FAILED',paidAiCalls:0}};}finally{await transport.close();}
   // A producer can discover more references during HTTP checks. New evidence
   // keeps a failed candidate eligible for a fresh, frozen-parser qualification.
   state.tx(()=>{const current=state.db.prepare('SELECT count(*) n FROM baomoi_original_articles WHERE host=?').get(host).n;state.db.prepare('UPDATE baomoi_original_sources SET status=?,config=?,report=?,at=? WHERE host=?').run(result.approved?'active':current>urls.length&&urls.length<6?'pending':'held',result.config?JSON.stringify(result.config):null,JSON.stringify(result.report||{reason:result.reason,paidAiCalls:0}),Date.now(),host);});
   report({event:'original_source_qualification',host,approved:result.approved,qualification:result.report?.qualification,reason:result.reason,paidAiCalls:0});
  }
  refreshOriginalSources(state,registry,driver);if(!await reconcileOriginalArticlesWhenAvailable(state,registry,es,{onDeferred:report})){if(!once&&!stopped)await wait(10000);continue;}admitOriginalArticles(state,registry,500,{requireEsCheck:true});
  const jobs=state.db.prepare("SELECT a.parse_key,a.url FROM article_links a LEFT JOIN baomoi_original_scans s ON s.parse_key=a.parse_key WHERE a.site='baomoi.com' AND s.parse_key IS NULL AND a.parse_status NOT IN ('pending','queued','running') ORDER BY a.first_at DESC LIMIT 3").all();
  for(const job of jobs){
   if(stopped)break;
   const source=registry.sources.get('baomoi.com');if(!source)break;
   const cycle='original-scan-'+Date.now();scratch.cycle(cycle);
   const transport=driver.forCycle(cycle,source.config,{reviewFailed:true,taskRole:'review'});
   let result;try{result=await resolveBaomoiOriginalLink(job.url,url=>transport.get(url,null,'baomoi-original'));}catch(e){result={ok:false,reason:e.code||'ORIGINAL_LINK_UNAVAILABLE'};}
   state.tx(()=>{recordOriginalLink(state,result);state.db.prepare('INSERT OR IGNORE INTO baomoi_original_scans VALUES(?,?,?,?)').run(job.parse_key,result.ok?'captured':'held',result.reason||null,Date.now());});
  }
  report({event:'original_branch_tick',admitted,paidAiCalls:0,articles:state.db.prepare('SELECT status,count(*) n FROM baomoi_original_articles GROUP BY status').all(),sources:state.db.prepare('SELECT status,count(*) n FROM baomoi_original_sources GROUP BY status').all()});
  // Bound the isolated research cache; the durable provenance stays in state.
  scratch.db.exec('DELETE FROM requests;DELETE FROM http_cache;DELETE FROM blobs;DELETE FROM cycles;DELETE FROM url_failures;DELETE FROM events');
  if(!once&&!stopped)await wait(10000);
 }while(!once&&!stopped);
}finally{clearInterval(watchdog);await network.close();await parsers.close();es.close();scratch.close();state.close();}
