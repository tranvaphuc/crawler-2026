import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
const root=path.resolve('outputs/news-flow-preparation-2026-11-12');
const inv=JSON.parse(await fs.readFile(path.join(root,'inventory.json'),'utf8'));
const out=path.join(root,'complete-offline');await fs.mkdir(out,{recursive:true});
const local=p=>{if(!p)return null;const s=p.replaceAll('\\','/'),i=s.indexOf('/outputs/');return i>=0?s.slice(i+1):s;};
const pool=new NewsRepairPool(6,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
let next=0,done=0,checked=0;const rows=[];
const progress=()=>({sites:done,total:544,samples:checked,at:new Date().toISOString()});
const timer=setInterval(()=>console.log(JSON.stringify(progress())),30000);
async function run(site){
 const bytes=await fs.readFile(site.configFile),config=JSON.parse(bytes),sha=createHash('sha256').update(bytes).digest('hex');
 const target=path.join(out,site.domain+'.json');
 try{const old=JSON.parse(await fs.readFile(target,'utf8'));if(old.complete&&old.configSha===sha){checked+=old.checks.length;return old;}}catch{}
 const r=JSON.parse(await fs.readFile(site.resultFile,'utf8')),checks=[];
 for(const a of r.articles||[]){
  if(!a.htmlPath){checks.push({url:a.url,state:'no_saved_html',historicalError:a.error||null});continue;}
  const value=await pool.run({sample:{domain:site.domain,url:a.url,htmlPath:local(a.htmlPath),kind:'article'},config,learn:false});checked++;
  const p=value.parsed,description=p?String(p._source.description||'').trim():null;
  const quality=[...(value.quality||[])];
  if(p&&!description)quality.push({code:'missing_description'});
  if(p&&(p.extracted.mediaOnly||p._source.content==='Images/Video'))quality.push({code:'media_only_requires_separate_scope'});
  const state=value.error?'parse_or_evidence_unconfirmed':quality.length?'quality_review':'sample_fields_verified';
  checks.push({url:a.url,htmlPath:local(a.htmlPath),family:a.family||null,state,error:value.error||null,
   quality,diagnosis:value.diagnosis,fieldsPresent:value.fieldsPresent,
   title:p?._source.title,description:description?.slice(0,1200),publishedDate:p?._source.publishedDate,
   bodyLength:p?.extracted.bodyLength,hash:p?.extracted.contentSha256,variant:p?.extracted.variant,
   evidence:p?{title:value.evidence?.metadataTitle,date:p.extracted.dateEvidenceSource,body:p.extracted.bodySelector}:undefined,
   historicalStatus:a.state||null,requiresPublicationContext:site.requiresPublicationContext});
 }
 const counts=checks.reduce((o,c)=>(o[c.state]=(o[c.state]||0)+1,o),{});
 const result={domain:site.domain,configSha:sha,checkedAt:new Date().toISOString(),complete:true,
  scope:'All saved article records from the latest per-site evidence; no live request. Context-dependent dates and publisher dispatch remain explicit unresolved.',
  counts,checks,releaseReady:false};
 await fs.writeFile(target,JSON.stringify(result,null,2));return result;
}
async function lane(){while(next<inv.sites.length){const site=inv.sites[next++];try{const r=await run(site);rows.push({domain:r.domain,counts:r.counts,configSha:r.configSha,checks:r.checks.length});}catch(e){rows.push({domain:site.domain,error:e.message});}done++;}}
try{await Promise.all(Array.from({length:8},lane));}finally{clearInterval(timer);await pool.close();}
const summary={...progress(),allSitesAccountedFor:rows.length===544,rows,errors:rows.filter(r=>r.error),releaseReadySites:0};
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({...progress(),errors:summary.errors}));
