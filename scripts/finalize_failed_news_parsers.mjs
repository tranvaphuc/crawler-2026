import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
import {currentAuditGate} from './news_current_audit_gate.mjs';
const root=path.resolve('outputs/news-failed-recovery-2026-11-16'),out=path.join(root,'final');
const read=async file=>JSON.parse(await fs.readFile(file));
const sites=await read(path.join(root,'sites.json')),registry=await loadNewsRegistry(),pool=new NewsRepairPool(8,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
await fs.mkdir(out,{recursive:true});
const rows=[],changes=[];let cursor=0;
const summarize=a=>({url:a.url,state:a.state,error:a.error||null,issues:a.quality||[],origin:a.origin||'fresh_http',statusCode:a.statusCode,diagnosis:a.diagnosis,htmlPath:a.htmlPath,title:a.parsed?._source?.title,publishedDate:a.parsed?._source?.publishedDate,bodyChars:a.parsed?.extracted?.bodyLength,contentHash:a.parsed?.extracted?.contentSha256});
async function run(site){
  const record=await read(path.join(root,'live/sites',site.domain,'result.json'));
  const baseline=await read(site.configurationFile),repair=await read(path.join(root,'repairs',site.domain,'result.json')).catch(()=>null);
  let candidate=repair?.approvedVariants?await read(path.join(root,'repairs',site.domain,'approved-config.json')):baseline;
  let context={};
  for(const feed of record.feeds||[])if(feed.htmlPath&&!feed.error){context=parsePublicPublicationFeed(gunzipSync(await fs.readFile(feed.htmlPath)).toString(),feed.url);break;}
  const samples=[...record.articles];
  for(const h of repair?.holdouts||[])if(h.htmlPath&&!h.httpError&&!samples.some(a=>a.url===h.url))samples.push({...h,origin:'independent_repair_holdout',state:'pending_recheck',attempted:true});
  const evaluated=[];const regressions=[];
  async function inspect(a,config){return currentAuditGate(await pool.run({sample:{domain:site.domain,url:a.url,htmlPath:a.htmlPath,kind:'article'},config,context,learn:false}),config,registry,site.domain);}
  for(const a of samples){
    if(!a.htmlPath||['excluded_url','not_checked','transport_unconfirmed'].includes(a.state)){evaluated.push(a);continue;}
    const after=await inspect(a,candidate);
    const before=candidate===baseline?after:await inspect(a,baseline);
    if(!before.error&&!before.quality?.length&&before.parsed&&(after.error||after.quality?.length||['_id'].some(k=>after.parsed?.[k]!==before.parsed[k])||['title','publishedDate'].some(k=>after.parsed?._source?.[k]!==before.parsed._source[k])||after.parsed?.extracted?.contentSha256!==before.parsed.extracted.contentSha256))regressions.push(a.url);
    evaluated.push({...a,...after,beforeError:before.error,beforeIssues:before.quality,state:after.error?.startsWith('non_news_document:')?'confirmed_non_article':after.error?'extraction_unconfirmed':after.quality?.length?'content_integrity_review':'parsed'});
  }
  const improved=evaluated.filter(a=>a.state==='parsed'&&(a.beforeError||a.beforeIssues?.length));
  let applied=false;
  if(candidate!==baseline&&!regressions.length&&improved.length&&repair.proposals.filter(p=>p.approved).every(p=>p.independentHoldouts?.length>=2)){
    const backup=path.join(out,'before-configs');await fs.mkdir(backup,{recursive:true});await fs.copyFile(site.configurationFile,path.join(backup,site.domain+'.json'));
    candidate.parserCurrentAudit={checkedAt:new Date().toISOString(),paidAiCalls:0,independentHoldouts:repair.proposals.filter(p=>p.approved).flatMap(p=>p.independentHoldouts),improvedUrls:improved.map(a=>a.url),regressions:0};
    await fs.writeFile(site.configurationFile,JSON.stringify(candidate,null,2)+'\n');applied=true;changes.push({domain:site.domain,file:site.configurationFile,approvedVariants:repair.approvedVariants,improvedUrls:improved.map(a=>a.url)});
  }else if(candidate!==baseline){
    for(let i=0;i<evaluated.length;i++){const a=evaluated[i];if(!a.htmlPath||['excluded_url','not_checked','transport_unconfirmed'].includes(a.state))continue;const audit=await inspect(a,baseline);evaluated[i]={...a,...audit,state:audit.error?.startsWith('non_news_document:')?'confirmed_non_article':audit.error?'extraction_unconfirmed':audit.quality?.length?'content_integrity_review':'parsed'};}
    candidate=baseline;
  }
  const passed=evaluated.filter(a=>a.state==='parsed'),failed=evaluated.filter(a=>['extraction_unconfirmed','content_integrity_review'].includes(a.state)),transport=evaluated.filter(a=>['not_checked','transport_unconfirmed'].includes(a.state));
  const reasons={};for(const a of failed){const errors=[a.error,...(a.quality||[]).map(i=>i.code)].filter(Boolean);for(const reason of errors)reasons[reason]=(reasons[reason]||0)+1;}
  for(const a of transport){const reason=a.error||a.reason||'not_checked';reasons[reason]=(reasons[reason]||0)+1;}
  for(const c of record.categories||[])if(c.httpError||c.error){const reason='category:'+String(c.httpError||c.error);reasons[reason]=(reasons[reason]||0)+1;}
  if(record.homepage?.error)reasons['homepage:'+record.homepage.error]=1;
  const categoryCoverage=(record.categories||[]).filter(c=>c.state==='links_discovered'&&!passed.some(a=>a.foundOn?.includes(c.url)||c.candidates?.includes(a.url))).length;
  const state=passed.length?(Object.keys(reasons).length||categoryCoverage?'partial':'sample_verified'):'not_verified';
  const row={domain:site.domain,previousStatus:site.previousStatus,state,passed:passed.length,failed:failed.length,transportUnconfirmed:transport.length,samples:evaluated.length,distinctPassedUrls:new Set(passed.map(a=>a.url)).size,categories:(record.categories||[]).length,categoriesAttempted:(record.categories||[]).filter(c=>c.attempted).length,categoriesWithoutPassedSample:categoryCoverage,reasons,fixApplied:applied,fixDescription:applied?'Parser variants verified on independent HTTP holdouts':site.domain==='arttimes.vn'?'Allowed declared native body dependency at1.click.vn':'',regressions,homepage:site.homepage,samplePass:passed.slice(0,3).map(summarize),sampleFail:[...failed,...transport].slice(0,5).map(summarize),checkedAt:new Date().toISOString(),fullSiteVerified:false};
  await fs.writeFile(path.join(out,site.domain+'.json'),JSON.stringify({...row,articles:evaluated.map(summarize),categoryResults:record.categories},null,2));
  rows.push(row);if(rows.length%25===0)console.log(JSON.stringify({done:rows.length,total:sites.length,changed:changes.length}));
}
async function lane(){while(cursor<sites.length)await run(sites[cursor++]);}
try{await Promise.all(Array.from({length:8},lane));}finally{await pool.close();}
rows.sort((a,b)=>a.domain.localeCompare(b.domain));
if(rows.length!==sites.length)throw Error('INCOMPLETE_SITE_COVERAGE');
await fs.writeFile(path.join(out,'site-summary.json'),JSON.stringify(rows,null,2));
await fs.writeFile(path.join(out,'changes.json'),JSON.stringify(changes,null,2));
console.log(JSON.stringify({complete:true,sites:rows.length,changes:changes.length,statuses:rows.reduce((n,r)=>(n[r.state]=(n[r.state]||0)+1,n),{}),paidAiCalls:0}));
