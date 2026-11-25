import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import * as cheerio from 'cheerio';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {isNewsCategoryUrl} from '../src/web/newsCategoryPolicy.mjs';
import {classifyNewsLink} from '../src/web/newsLinkPolicy.mjs';

const root=path.resolve('outputs/news-flow-preparation-2026-11-12');
const inventory=JSON.parse(await fs.readFile(path.join(root,'inventory.json'),'utf8'));
const local=p=>{if(!p)return null;const s=p.replaceAll('\\','/'),i=s.indexOf('/outputs/');return i>=0?s.slice(i+1):s;};
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const sites=[], seeds=[], tasks=[];
await fs.mkdir(path.join(root,'audit-sites'),{recursive:true});
for(const site of inventory.sites){
 const r=JSON.parse(await fs.readFile(site.resultFile,'utf8'));
 const config=JSON.parse(await fs.readFile(site.configFile,'utf8'));
 const checks=[];
 for(const url of site.seedCandidates){
  const old=(r.categories||[]).find(c=>c.url===url);
  const link=classifyNewsLink(url,site.domain);
  const policy=url===site.homepage||isNewsCategoryUrl(url,{domain:site.domain});
  seeds.push({domain:site.domain,url,kind:url===site.homepage?'homepage':'category',
   decision:policy?'candidate_needs_content_review':'policy_flags_review',
   reason:link.reason||null,oldError:old?.error||null,oldState:old?.state||null});
 }
 // Cover up to three successful controls and one example per historical diagnosis.
 const chosen=new Map();
 const usable=(r.articles||[]).filter(a=>a.htmlPath&&!a.httpError);
 for(const a of usable.filter(a=>a.parsed&&!a.error).slice(0,3))chosen.set(a.url,a);
 const signatures=new Set();
 for(const a of usable.filter(a=>a.error||a.diagnosis)){
  const sig=[a.family,a.diagnosis,a.error].join('|');
  if(!signatures.has(sig)&&chosen.size<10){signatures.add(sig);chosen.set(a.url,a);}
 }
 for(const a of usable){if(chosen.size>=3)break;chosen.set(a.url,a);}
 for(const a of chosen.values()){
  const row={url:a.url,htmlPath:local(a.htmlPath),family:a.family||null,historicalError:a.error||null};
  try{
   const bytes=await fs.readFile(row.htmlPath);
   const html=row.htmlPath.endsWith('.gz')?gunzipSync(bytes).toString('utf8'):bytes.toString('utf8');
   const $=cheerio.load(html);
   if(config.parserType==='publisher_dispatch')row.error='publisher_dispatch_requires_separate_replay';
   else{
    const parsed=parseConfiguredArticle(html,a.url,config,{});
    row.error=parsed.error||null;
    if(!row.error){
     row.fields={title:parsed._source.title,description:parsed._source.description,
      publishedDate:parsed._source.publishedDate,contentLength:parsed._source.content.length};
     row.mediaOnly=parsed.extracted?.mediaOnly||parsed._source.content==='Images/Video';
     row.restricted=Boolean(parsed.extracted?.publisherRestricted);
     row.descriptionStatus=clean(parsed._source.description)?'present_requires_semantic_review':'missing';
     row.fourFieldsPresent=!!(row.fields.title&&row.fields.description&&row.fields.publishedDate&&row.fields.contentLength&&!row.mediaOnly&&!row.restricted);
     row.dateEvidenceSource=parsed.extracted?.dateEvidenceSource;
    }
   }
   row.h1=clean($('h1').first().text()).slice(0,250);
   row.pageTitle=clean($('title').text()).slice(0,250);
   row.metaDescription=clean($('meta[name="description"]').attr('content')).slice(0,1200);
   row.ogDescription=clean($('meta[property="og:description"]').attr('content')).slice(0,1200);
   row.articleLinkCount=$('a[href]').length;
   if(row.error&&!/non_news_document|access_blocked|restricted|not_found/.test(row.error))tasks.push({domain:site.domain,...row});
  }catch(e){row.error='replay_exception:'+e.message;}
  checks.push(row);
 }
 const result={domain:site.domain,historicalStatus:site.historicalStatus,totalSavedArticleRecords:r.articles?.length||0,
  replayed:checks.length,parsePassed:checks.filter(c=>!c.error).length,
  fourFieldsPresent:checks.filter(c=>c.fourFieldsPresent).length,
  checks,scope:'Bounded offline sample replay; field presence is not semantic verification; no publication context loaded; no live requests',releaseReady:false};
 await fs.writeFile(path.join(root,'audit-sites',site.domain+'.json'),JSON.stringify(result,null,2));
 sites.push({...result,checks:undefined});
 if(sites.length%25===0)console.log(JSON.stringify({sites:sites.length,samples:sites.reduce((n,s)=>n+s.replayed,0)}));
}
const summary={createdAt:new Date().toISOString(),sites:sites.length,samples:sites.reduce((n,s)=>n+s.replayed,0),
 parsePassed:sites.reduce((n,s)=>n+s.parsePassed,0),fourFieldsPresent:sites.reduce((n,s)=>n+s.fourFieldsPresent,0),
 seedCandidates:seeds.length,seedPolicyFlags:seeds.filter(s=>s.decision==='policy_flags_review').length,
 sitesWithoutSavedReplay:sites.filter(s=>!s.replayed).map(s=>s.domain),repairSamples:tasks.length,
 semanticVerificationComplete:false,liveRequests:0,apiCalls:0,releaseReadySites:0};
await fs.writeFile(path.join(root,'prebuild-audit.json'),JSON.stringify({summary,sites},null,2));
await fs.writeFile(path.join(root,'seed-review.json'),JSON.stringify(seeds,null,2));
await fs.writeFile(path.join(root,'repair-samples.json'),JSON.stringify(tasks,null,2));
console.log(JSON.stringify(summary,null,2));
