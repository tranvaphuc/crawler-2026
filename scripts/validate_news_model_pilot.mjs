import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import * as cheerio from 'cheerio';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
const root=path.resolve('outputs/news-flow-preparation-2026-11-12');
const inventory=JSON.parse(await fs.readFile(path.join(root,'inventory.json'),'utf8'));
const dir=path.join(root,'model-pilot'),results=[];
const local=p=>{const s=p.replaceAll('\\','/'),i=s.indexOf('/outputs/');return i>=0?s.slice(i+1):s;};
for(const file of (await fs.readdir(dir)).filter(f=>f.endsWith('.json')&&f!=='summary.json'&&f!=='validation.json')){
 const record=JSON.parse(await fs.readFile(path.join(dir,file),'utf8'));
 if(!record.proposal)continue;
 let proposal;try{proposal=JSON.parse(record.proposal);}catch{results.push({domain:record.domain,error:'invalid_json_proposal',applied:false});continue;}
 const selectors=proposal.candidateSelectors||{};
 const site=inventory.sites.find(s=>s.domain===record.domain);
 const config=JSON.parse(await fs.readFile(site.configFile,'utf8'));
 const evidence=JSON.parse(await fs.readFile(site.resultFile,'utf8'));
 const checks=[];
 for(const a of (evidence.articles||[]).filter(a=>a.htmlPath).slice(0,12)){
  try{
   const bytes=await fs.readFile(local(a.htmlPath)),html=a.htmlPath.endsWith('.gz')?gunzipSync(bytes).toString('utf8'):bytes.toString('utf8');
   const $=cheerio.load(html),matches=Object.fromEntries(Object.entries(selectors).map(([k,s])=>[k,s?$(s).length:0]));
   const candidate=structuredClone(config);candidate.variants=[];
   if(selectors.title)candidate.title={strategy:'selector',selector:selectors.title};
   if(selectors.content)candidate.body={strategy:'selector',selector:selectors.content};
   if(selectors.publishedTime)candidate.publishedDate={strategy:'selector',selector:selectors.publishedTime};
   const parsed=selectors.title&&selectors.content&&selectors.publishedTime?parseConfiguredArticle(html,a.url,candidate):{error:'incomplete_model_selectors'};
   checks.push({url:a.url,training:a.url===record.url,matches,error:parsed.error||null,
    hash:parsed.extracted?.contentSha256,bodyLength:parsed._source?.content?.length||0,
    description:selectors.description?$(selectors.description).first().attr('content')||$(selectors.description).first().text().trim():null});
  }catch{checks.push({url:a.url,error:'evidence_or_selector_error'});}
 }
 const holdouts=checks.filter(c=>!c.training&&!c.error&&Object.values(c.matches).every(n=>n>0));
 results.push({domain:record.domain,needsMoreEvidence:proposal.needsMoreEvidence,checks,
  independentlyParsedHoldouts:new Set(holdouts.map(c=>c.hash)).size,
  applied:false,decision:'proposal_only_requires_field_identity_and_body_completeness_review'});
}
await fs.writeFile(path.join(dir,'validation.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({domain:r.domain,checked:r.checks?.length,holdouts:r.independentlyParsedHoldouts,applied:r.applied})),null,2));
