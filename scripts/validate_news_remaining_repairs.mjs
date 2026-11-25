import fs from 'node:fs/promises';import path from 'node:path';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {newsVariantSignature} from '../src/web/newsConfigVariants.mjs';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {verifyNewsFields} from '../src/web/newsFieldVerification.mjs';
const base=path.resolve('outputs/news-flow-preparation-2026-11-12');
const root=path.join(base,'remaining-errors-recheck'),out=path.join(root,'repairs');await fs.mkdir(out,{recursive:true});
const inventory=JSON.parse(await fs.readFile(path.join(base,'inventory.json'),'utf8'));
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8'));
const pool=new NewsRepairPool(2,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const family=u=>/video|\/tv\/|shorts|dt360/i.test(u)?'video':/photo|gallery|album|tin-anh/i.test(u)?'photo':/longform|emagazine|megastory/i.test(u)?'longform':/audio|podcast/i.test(u)?'audio':'ordinary';
const rows=[];let cursor=0,done=0,loads=0;
const sites=[];for(const s of inventory.sites){const r=await read(path.join(root,'axios',s.domain,'result.json')).catch(()=>null);if(r?.complete&&r.checks.some(c=>c.localProposal))sites.push(s);}
const timer=setInterval(()=>console.log(JSON.stringify({phase:'independent_repair_holdouts',done,total:sites.length,loads})),30000);
function cleanVariant(v){const o={};for(const k of ['title','body','publishedDate','additionalMediaSelector','additionalMediaStrategy','mediaEmbedSelector','allowMediaLinkDensity'])if(v[k]!==undefined)o[k]=structuredClone(v[k]);if(o.title)delete o.title.value;return o;}
async function inspect(sample,config){return pool.run({sample:{...sample,kind:'article'},config});}
async function run(site){
 const dir=path.join(out,site.domain);await fs.mkdir(dir,{recursive:true});const resultFile=path.join(dir,'result.json');
 const prior=await read(resultFile).catch(()=>null);if(prior?.complete)return prior;
 const cfgBytes=await fs.readFile(site.configFile),config=JSON.parse(cfgBytes),live=await read(path.join(root,'axios',site.domain,'result.json'));
 const old=await read(path.join(base,'deep-verification',site.domain,'result.json'));
 const archived=await read(path.join(base,'complete-offline',site.domain+'.json'));
 const proposals=new Map();
 for(const c of live.checks.filter(c=>c.localProposal&&c.htmlPath)){
  const learned=cleanVariant(c.localProposal.config),v={};
  if(/missing_title/.test(c.parseError))v.title=learned.title;
  if(/missing_published_date/.test(c.parseError))v.publishedDate=learned.publishedDate;
  if(/missing_body|body_link_density/.test(c.parseError))v.body=learned.body;
  const signature=newsVariantSignature({...config,...v});if(signature===newsVariantSignature(config)||(config.variants||[]).some(x=>newsVariantSignature({...config,...x})===signature))continue;
  if(!proposals.has(signature)&&proposals.size<3)proposals.set(signature,{variant:v,training:{url:c.url,htmlPath:c.htmlPath},family:family(c.url),holdouts:[],approved:false});
 }
 const frozenAt=new Date().toISOString();await fs.writeFile(path.join(dir,'frozen-proposals.json'),JSON.stringify({frozenAt,configSha:createHash('sha256').update(cfgBytes).digest('hex'),proposals:[...proposals.values()]},null,2));
 const seen=new Set([...old.articles,...live.checks,...archived.checks].map(c=>c.url));
 const candidates=[...new Set(old.categories.flatMap(c=>c.primaryCandidates||[]))].filter(u=>!seen.has(u));
 const client=createNewsResearchTransport({...config.http,requestProfiles:{...profiles,[site.domain]:{...profiles[site.domain],connectionClose:true}},persistEvidence:false,timeoutMs:12000,requestDeadlineMs:15000,maxSockets:1});
 let last=0,halt=false,seq=0;
 try{for(const proposal of proposals.values()){
  if(config.publisherCrawlPolicy?.crawlDelaySeconds){proposal.reason='publisher_crawl_delay';continue;}
  const candidateConfig={...config,...proposal.variant,variants:[]};
  const training=await inspect({domain:site.domain,...proposal.training},candidateConfig);
  if(training.error||training.quality?.length||!training.parsed||training.parsed.extracted.publisherRestricted){proposal.reason='training_quality_unconfirmed';continue;}
  const trainingHash=training.parsed.extracted.contentSha256;const hashes=new Set();let attempts=0;
  for(const url of candidates.filter(u=>family(u)===proposal.family)){
   if(hashes.size>=2||attempts>=8||halt)break;if(seen.has(url))continue;seen.add(url);attempts++;
   const delay=3000-(Date.now()-last);if(delay>0)await new Promise(r=>setTimeout(r,delay));last=Date.now();loads++;
   const p=await client.get(url,dir,'holdout'),row={url,httpError:p.error||null,statusCode:p.statusCode};
   if(p.statusCode===403||p.statusCode===429)halt=true;
   if(!p.error&&p.html){
    row.htmlPath=path.join(dir,'holdout-'+(++seq)+'.html.gz');await fs.writeFile(row.htmlPath,gzipSync(p.html));
    const sample={domain:site.domain,url,htmlPath:row.htmlPath},before=await inspect(sample,config),after=await inspect(sample,candidateConfig);
    const actual=Object.entries(proposal.variant).filter(([k])=>['title','publishedDate','body'].includes(k)).every(([k,v])=>v.strategy!=='selector'||after.configuredSelectorEvidence?.[k]?.matched>0);
    const fields=after.parsed?verifyNewsFields(p.html,after.parsed):null;
    row.beforeError=before.error;row.afterError=after.error;row.quality=after.quality;row.fieldIssues=fields?.issues;row.changedSelectorsMatched=actual;
    row.contentHash=after.parsed?.extracted.contentSha256;
    row.accepted=!!(before.error&&!after.error&&after.parsed&&!after.quality?.length&&!fields.issues.length&&actual&&!after.parsed.extracted.publisherRestricted&&row.contentHash!==trainingHash&&!hashes.has(row.contentHash));
    if(row.accepted)hashes.add(row.contentHash);
   }
   proposal.holdouts.push(row);
  }
  proposal.approved=hashes.size>=2;proposal.reason=proposal.approved?'two_new_distinct_holdouts_passed':'insufficient_independent_holdout_proof';
 }}finally{await client.close();}
 let final=structuredClone(config);for(const p of proposals.values())if(p.approved){final.variants||=[];final.variants.push({...p.variant,validation:{state:'independent_http_holdouts_passed',frozenAt,trainingUrl:p.training.url,holdoutUrls:p.holdouts.filter(h=>h.accepted).map(h=>h.url)}});}
 const regression=[];if([...proposals.values()].some(p=>p.approved)){
  const samples=new Map([...old.articles,...live.checks].filter(c=>c.htmlPath).map(c=>[c.url,c]));
  for(const c of samples.values()){
   const sample={domain:site.domain,url:c.url,htmlPath:c.htmlPath};const before=await inspect(sample,config);if(before.error||!before.parsed)continue;
   const after=await inspect(sample,final);
   const stable=!after.error&&after.parsed&&['_id','_index'].every(k=>before.parsed[k]===after.parsed[k])&&['title','content','publishedDate','description'].every(k=>before.parsed._source[k]===after.parsed._source[k]);
   regression.push({url:c.url,stable:!!stable,error:after.error||null});
  }
 }
 const approved=[...proposals.values()].filter(p=>p.approved),applied=approved.length>0&&regression.every(r=>r.stable);
 if(applied){
  await fs.writeFile(path.join(dir,'config-before.json'),cfgBytes);final.enabled=false;
  final.remainingErrorsRepair={checkedAt:new Date().toISOString(),evidence:path.relative(process.cwd(),resultFile),approvedVariants:approved.length,scope:'Only independently proven layouts; prior unresolved URLs retained; no production data writes'};
  await fs.writeFile(site.configFile,JSON.stringify(final,null,2)+'\n');await fs.writeFile(path.join(dir,'config-after.json'),JSON.stringify(final,null,2));
 }
 const result={domain:site.domain,complete:true,applied,proposals:[...proposals.values()],regression,approvedVariants:approved.length,configFile:site.configFile,configBeforeSha:createHash('sha256').update(cfgBytes).digest('hex'),frozenAt};
 await fs.writeFile(resultFile,JSON.stringify(result,null,2));return result;
}
async function lane(){while(cursor<sites.length){const s=sites[cursor++];try{const r=await run(s);rows.push({domain:s.domain,applied:r.applied,approved:r.approvedVariants,regression:r.regression.length});}catch(e){rows.push({domain:s.domain,error:e.message});}done++;}}
try{await Promise.all(Array.from({length:4},lane));}finally{clearInterval(timer);await pool.close();}
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({done,loads,rows},null,2));console.log(JSON.stringify({done,loads,rows}));
