import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {VerifiedSnapshotState} from '../src/newsFlow/verifiedSnapshot.mjs';
import {ThreeFlowProcessor} from '../src/newsFlow/threeFlowProcessor.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {articleKey} from '../src/newsFlow/identity.mjs';

const root=process.argv[2];
if(!root)throw Error('Recovery workspace required');
const all=process.argv.includes('--all');
const siteFilter=process.argv.find(arg=>arg.startsWith('--site='))?.slice(7);
if(siteFilter&&!/^[a-z0-9.-]+$/.test(siteFilter))throw Error('Invalid recovery filter');
const reasons=new Set(['request_deadline_exceeded','public_api_request_deadline_exceeded']);
const completedDocuments=new Map();
class TimeoutRecoveryState extends VerifiedSnapshotState {
 completeHeld() {}
 completeVerified(task,doc,...args){
  const result=super.completeVerified(task,doc,...args);
  if(!result?.skipped)completedDocuments.set(task.id,{index:doc._index,id:doc._id,url:doc._source.url,publishedDate:doc._source.publishedDate});
  return result;
 }
 finish(task,status,reason,options){
  if(status==='done'&&reason==='verified_outbox')return super.finish(task,status,reason,options);
 }
}
const registry=await loadNewsRegistry();
const storage=new TimeoutRecoveryState(new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite'));
const memory=await ThreeFlowState.open(':memory:');
storage.db.exec('PRAGMA busy_timeout=15000');
storage.loadOverlays(registry);
const links=storage.db.prepare("SELECT task_id,error,site,url FROM article_links WHERE parse_key=? AND parse_status='fail'");
const held=storage.db.prepare("SELECT * FROM tasks WHERE id=? AND role='article' AND state='held'");
const admitted=(await fs.readFile(root+'/admitted.jsonl','utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const resultsFile=root+(siteFilter?'/remaining-'+siteFilter+'.jsonl':all?'/remaining-direct.jsonl':'/timeout-direct.jsonl');
const previous=await fs.readFile(resultsFile,'utf8').catch(error=>error.code==='ENOENT'?'':Promise.reject(error));
const seen=new Set(previous.trim().split('\n').filter(Boolean).map(line=>articleKey(JSON.parse(line).url)));
const grouped=new Map();
for(const {site,url} of admitted){
 if(siteFilter&&site!==siteFilter)continue;
 const key=articleKey(url);
 if(seen.has(key))continue;
 seen.add(key);
 const link=links.get(key);
 if(!link||link.site!==site||!registry.sources.has(site))continue;
 if(all?['access_blocked','rate_limited','publisher_restricted_content_unverified'].includes(link.error):!reasons.has(link.error))continue;
 const task=held.get(link.task_id);
 if(!task)continue;
 const group=grouped.get(site)||[];
 group.push({...task,reason:'manual_refresh',snapshotError:link.error});
 grouped.set(site,group);
}
const jobs=[];
while(grouped.size)for(const [site,group] of grouped){
 jobs.push(group.shift());
 if(!group.length)grouped.delete(site);
}
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8'));
const network=new NewsNetworkPool({workers:2});
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const parsers=new NewsRepairPool(2,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const http=new NewsHttpDriver({state:memory,network,pool,profiles,allowedDomains:registry.allowedDomains,siteCooldown:false,retryArticleTimeout:true});
const driver={forCycle:(_cycle,...args)=>http.forCycle(randomUUID(),...args)};
const processor=new ThreeFlowProcessor({state:storage,driver,registry,parsers,maxAgeHours:Infinity,expand:true,admitRelated:false});
const file=await fs.open(resultsFile,'a',0o600);
let cursor=0,checked=0,complete=0;
try{
 await Promise.all(Array.from({length:8},async()=>{
  while(cursor<jobs.length){
   const task=jobs[cursor++];
   let reason;
   if(storage.applicable(task)){
    try{await processor.process(task);}catch(error){reason=error.code||error.name;}
   }
   const final=links.get(articleKey(task.url));
   const recovered=!final&&storage.db.prepare("SELECT 1 FROM article_links WHERE parse_key=? AND parse_status='done'").get(articleKey(task.url));
   if(recovered)complete++;
   checked++;
   const document=completedDocuments.get(task.id);
   completedDocuments.delete(task.id);
   await file.appendFile(JSON.stringify({url:task.url,site:task.site,recovered:!!recovered,reason:reason||final?.error||null,document})+'\n');
  }
 }));
 console.log(JSON.stringify({checked,complete,stillHeld:checked-complete,paidAiCalls:0}));
}finally{await file.close();await parsers.close();await network.close();memory.close();storage.close();}
