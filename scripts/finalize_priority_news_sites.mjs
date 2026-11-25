import fs from 'node:fs/promises';import path from 'node:path';import {gunzipSync} from 'node:zlib';import {DatabaseSync} from 'node:sqlite';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';import {currentAuditGate} from './news_current_audit_gate.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
const root=path.resolve('outputs/news-priority-sites-2026-11-16'),read=async p=>JSON.parse(await fs.readFile(p,'utf8')),registry=await loadNewsRegistry();
const sites=[...await read(path.join(root,'candidates.json')),...await read(path.join(root,'extra-native-sites.json')).catch(()=>[])],selected=new Map();
for(const stage of ['audit','repair','round2/audit','round2/repair','round3/audit','round3/repair','manual/repair','alias/audit','round4/audit','round4/repair','msn/audit','camau/repair']){
 for(const site of sites){const dir=path.join(root,stage,site.domain),r=await read(path.join(dir,'result.json')).catch(()=>null);if(!r?.approved)continue;const file=r.accepted?.configFile||path.join(dir,'approved-config.json');const config=await read(file);config.publicationValidationPolicy="strict_native_publication_v1";config.publicationDatePolicy="native_updated_when_original_missing";config.publicationTimePolicy="native_date_midnight_if_missing";config.timezone="Asia/Ho_Chi_Minh";selected.set(site.domain,{domain:site.domain,file,config,record:r,stage});}
}
const pool=new NewsRepairPool(8,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url)),network=new NewsNetworkPool({workers:3});
const driver=new NewsHttpDriver({network,state:{cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},pool:await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'}),allowedDomains:[...registry.allowedDomains,...sites.map(s=>s.domain),'public.vietnamtourism.gov.vn'],siteCooldown:false});
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});db.exec('PRAGMA busy_timeout=30000');const accepted=[],rejected=[];
async function check(config,domain,url,html,context={}){const rg={sources:new Map([...registry.sources,[domain,{config,quality:registry.sources.get(domain)?.quality||{}}]]),byHost:h=>(config.allowedHosts||[]).some(a=>a.replace(/^www\./,'')===h.replace(/^www\./,''))?{config}:registry.byHost(h)};return currentAuditGate(await pool.run({sample:{domain,url,html,kind:'article'},config,context,learn:false}),config,rg,domain);}
try{
 for(const row of selected.values()){
  const {config,domain,record}=row,transport=createNewsResearchTransport({baseTransport:driver.forCycle('priority-final-'+domain,config,{reviewFailed:true,taskRole:'review'}),persistEvidence:false});let context={},beforeContext={};
  try{
   const feed=config.publishedDate?.strategy==='public_feed'?config.publishedDate.feedUrl:null;if(feed){const p=await transport.get(feed,null,'feed');if(!p.error&&p.html)context=parsePublicPublicationFeed(p.html,feed);}
   const old=registry.sources.get(domain)?.config,overlay=db.prepare('SELECT config FROM parser_overlays WHERE site=?').get(domain),baseline=overlay?JSON.parse(overlay.config):old;
   if(baseline?.publishedDate?.feedUrl===feed)beforeContext=context;
   const regression=[];let controls=0,unreplayableControls=0;
   if(baseline)for(const sample of db.prepare("SELECT * FROM review_samples WHERE site=? AND kind='good' ORDER BY at DESC LIMIT 3").all(domain)){
    const html=gunzipSync(sample.html).toString(),a=await check(baseline,domain,sample.url,html,beforeContext);if(a.error||a.quality?.length){unreplayableControls++;continue;}
    const b=await check(config,domain,sample.url,html,context);controls++;if(b.error||b.quality?.length||a.parsed._id!==b.parsed?._id||a.parsed._source.title!==b.parsed?._source.title||a.parsed._source.publishedDate!==b.parsed?._source.publishedDate||a.parsed.extracted.contentSha256!==b.parsed?.extracted?.contentSha256)regression.push({url:sample.url,error:b.error,quality:b.quality});
   }
   const proof=record.accepted?.holdouts||record.articles?.filter(a=>a.state==='parsed'&&a.independent)||[];let rechecked=0;
   if(config.parserType==='publisher_dispatch'&&(record.state!=='verified_dispatch_with_native_publishers'||record.dispatchValidation?.processor!=='ThreeFlowProcessor'||record.dispatchValidation?.passed<3))throw Error('UNVERIFIED_PUBLISHER_DISPATCH');
   for(const a of config.parserType==='publisher_dispatch'?[]:proof.slice(0,3)){if(!a.htmlPath)continue;const html=gunzipSync(await fs.readFile(a.htmlPath)).toString(),v=await check(config,domain,a.url,html,context);if(v.error||v.quality?.length)regression.push({url:a.url,error:v.error,quality:v.quality});else rechecked++;}
   if(regression.length){rejected.push({domain,stage:row.stage,regression});continue;}
   // The original qualification contains at least three distinct articles and
   // two frozen independent HTTP holdouts; do not turn a partial audit into a pass.
   let audit=record;
   if(record.unchangedAudit)audit=await read(path.join(root,row.stage.replace(/repair$/,'audit'),domain,'result.json'));
   const qualification=audit.accepted?.qualified||audit.qualification;
   if(!qualification?.approved||qualification.distinctContents<3||qualification.holdouts?.length<2){rejected.push({domain,reason:'qualification_proof_missing'});continue;}
   const sourceAudit=await read(path.join(root,row.stage.replace(/repair$/,'audit'),domain,'result.json')).catch(()=>audit);
   const ready=path.join(root,'ready-configs',domain+'.json');await fs.mkdir(path.dirname(ready),{recursive:true});await fs.writeFile(ready,JSON.stringify(config,null,2));
   accepted.push({domain,configFile:ready,stage:row.stage,existing:!!old,controls,unreplayableControls,rechecked,workingSeeds:record.workingSeeds||sourceAudit.workingSeeds||[],sampleUrls:config.validation?.sampleUrls||qualification.holdouts,independentHoldouts:qualification.holdouts,verifiedRequestUrls:config.parserType==='publisher_dispatch'?(record.articles||[]).filter(a=>a.state==='parsed').map(a=>a.originalUrl):[],publicationTimePolicy:config.publicationTimePolicy||'strict_native_clock'});
  }finally{await transport.close();}
 }
}finally{db.close();await pool.close();await network.close();}
await fs.writeFile(path.join(root,'activation-candidates.json'),JSON.stringify({preparedAt:new Date().toISOString(),accepted,rejected,paidAiCalls:0},null,2));console.log(JSON.stringify({accepted:accepted.length,rejected:rejected.length,rejections:rejected}));
