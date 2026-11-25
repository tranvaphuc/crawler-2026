import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';import {articleKey,requestKey,urlAliases} from '../src/newsFlow/identity.mjs';
const root=path.resolve('outputs/news-priority-sites-2026-11-16'),manifest=JSON.parse(await fs.readFile(path.join(root,'activation-candidates.json'),'utf8'));
const signature=createHash('sha256').update(JSON.stringify(manifest.accepted)).digest('hex').slice(0,12),marker='manual_priority_activation_20261116_'+signature;
const state=await ThreeFlowState.open('/var/lib/news-flow/news-flow-runtime/write.sqlite'),db=state.db;
if(db.prepare('SELECT 1 FROM flow_meta WHERE key=?').get(marker)){console.log(JSON.stringify({alreadyApplied:true,marker}));state.close();process.exit(0);}
const before=await loadNewsRegistry(),aiBefore=db.prepare('SELECT * FROM ai_usage ORDER BY day').all(),installed=[];let committed=false;
execFileSync('systemctl',['stop','news-flow-seed.service','news-flow-parse.service']);
try{
 const backup=path.join(root,'deployment',signature);await fs.mkdir(backup,{recursive:true});
 for(const row of manifest.accepted){
  const source=path.resolve(row.configFile);if(!source.startsWith(root+path.sep))throw Error('INVALID_PRIORITY_CONFIG_PATH');const bytes=await fs.readFile(source),config=JSON.parse(bytes),target=path.resolve('config/web-sources/news',row.domain+'.json');
  if(!/^[a-z0-9.-]+$/.test(row.domain)||!(config.allowedHosts||[]).some(h=>h.replace(/^www\./,'')===row.domain))throw Error('INVALID_PRIORITY_SOURCE_IDENTITY');
  row.siteMarker='priority_site_20261116_'+row.domain+'_'+createHash('sha256').update(bytes).digest('hex').slice(0,12);
  const old=await fs.readFile(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(old?.equals(bytes))continue;
  if(old)await fs.writeFile(path.join(backup,row.domain+'.json'),old);installed.push({domain:row.domain,target,old});await fs.writeFile(target+'.priority.tmp',bytes);await fs.rename(target+'.priority.tmp',target);
 }
 const registry=await loadNewsRegistry(),newSites=installed.filter(x=>!x.old).map(x=>x.domain);if(registry.sources.size!==before.sources.size+newSites.length)throw Error('REGISTRY_COUNT_MISMATCH');
 state.configureSites(registry.sources.values());const now=Date.now(),cycle='priority-seeds-'+signature;state.cycle(cycle);
 const counts={seedReopened:0,seedQueued:0,articlesRequeued:0,nonArticlesSkipped:0,activeArticlesPreserved:0,overlaysSuperseded:0};const overlays=[];
 state.tx(()=>{
  state.syncSeeds(registry);
  for(const row of manifest.accepted){
   if(db.prepare('SELECT 1 FROM flow_meta WHERE key=?').get(row.siteMarker))continue;
   const overlay=db.prepare('SELECT * FROM parser_overlays WHERE site=?').get(row.domain);if(overlay){overlays.push(overlay);db.prepare('DELETE FROM parser_overlays WHERE site=? AND revision=?').run(row.domain,overlay.revision);counts.overlaysSuperseded++;}
   for(const seed of row.workingSeeds){
    for(const alias of urlAliases(seed.url)){db.prepare('DELETE FROM url_failures WHERE url_key=?').run(requestKey(alias));counts.seedReopened+=db.prepare("UPDATE seed_sources SET status=NULL,reason='manual_priority_verified_seed',reviewed_at=? WHERE url_key=? AND status IN ('fail','die','timeout')").run(now,requestKey(alias)).changes;}
    const key=requestKey(seed.url);if(!db.prepare("SELECT 1 FROM tasks WHERE url_key=? AND role='seed' AND state IN ('pending','running')").get(key)){state.enqueue(cycle,seed.url,row.domain,'seed');counts.seedQueued++;}
   }
   for(const link of db.prepare("SELECT * FROM article_links WHERE site=? AND parse_status='fail'").all(row.domain)){
    if(db.prepare("SELECT 1 FROM tasks WHERE id=? AND state IN ('pending','running')").get(link.task_id)){counts.activeArticlesPreserved++;continue;}
    const reject=state.articleRejection(link.url,row.domain);
    if(reject){db.prepare("UPDATE article_links SET parse_status='skipped',error=?,reviewed_at=? WHERE parse_key=? AND parse_status='fail'").run('non_article:'+reject,now,link.parse_key);counts.nonArticlesSkipped++;continue;}
    for(const alias of urlAliases(link.url))db.prepare('DELETE FROM url_failures WHERE url_key=?').run(requestKey(alias));
    counts.articlesRequeued+=db.prepare("UPDATE article_links SET parse_status='pending',error=NULL,task_id=NULL,reviewed_at=? WHERE parse_key=? AND parse_status='fail'").run(now,link.parse_key).changes;
   }
   for(const url of row.verifiedRequestUrls||[]){if(!registry.byHost(new URL(url).hostname))throw Error('UNCONFIGURED_VERIFIED_PUBLISHER');for(const alias of urlAliases(url))db.prepare('DELETE FROM url_failures WHERE url_key=?').run(requestKey(alias));}
   for(const url of row.sampleUrls){if(!state.articleRejection(url,row.domain))state.discover(url,row.domain,now);}
   db.prepare('INSERT INTO flow_meta(key,value) VALUES(?,?)').run(row.siteMarker,JSON.stringify({at:now,domain:row.domain,manualVerifiedConfiguration:true}));
  }
  const aiAfter=db.prepare('SELECT * FROM ai_usage ORDER BY day').all();if(aiBefore.some(b=>!aiAfter.some(a=>a.day===b.day&&a.calls>=b.calls&&a.usd+1e-9>=b.usd)))throw Error('AI_USAGE_NOT_PRESERVED');
  const activation={at:new Date().toISOString(),marker,accepted:manifest.accepted.map(r=>r.domain),newSites,registeredBefore:before.sources.size,registeredAfter:registry.sources.size,...counts,aiUsagePreserved:true,paidAiCalls:0,queueReset:false,esDirectWrites:false,publicationTimePolicy:'native_date_midnight_if_missing'};db.prepare('INSERT INTO flow_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(activation));
 });committed=true;
 await fs.writeFile(path.join(backup,'superseded-overlays.json'),JSON.stringify(overlays,null,2));const activation=JSON.parse(db.prepare('SELECT value FROM flow_meta WHERE key=?').get(marker).value);await fs.writeFile(path.join(root,'activation-'+signature+'.json'),JSON.stringify(activation,null,2));await fs.writeFile(path.join(root,'activation-latest.json'),JSON.stringify(activation,null,2));console.log(JSON.stringify(activation));
}catch(error){if(!committed)for(const row of installed){if(row.old)await fs.writeFile(row.target,row.old);else await fs.unlink(row.target);}throw error;
}finally{state.close();execFileSync('systemctl',['start','news-flow-seed.service','news-flow-parse.service']);}
