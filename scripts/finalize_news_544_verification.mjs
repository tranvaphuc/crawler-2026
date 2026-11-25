import fs from 'node:fs/promises';
import path from 'node:path';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {isNewsCategoryUrl} from '../src/web/newsCategoryPolicy.mjs';
import {classifyNewsLink} from '../src/web/newsLinkPolicy.mjs';
const root=path.resolve('outputs/news-flow-preparation-2026-11-12');
const inv=JSON.parse(await fs.readFile(path.join(root,'inventory.json'),'utf8'));
const liveSummary=JSON.parse(await fs.readFile(path.join(root,'complete-live/summary.json'),'utf8'));
const offlineSummary=JSON.parse(await fs.readFile(path.join(root,'complete-offline/summary.json'),'utf8'));
if(liveSummary.rows.length!==544||offlineSummary.rows.length!==544)throw Error('Both 544-source verification runs must finish');
const out=path.join(root,'verification-final');await fs.mkdir(path.join(out,'sites'),{recursive:true});
const pool=new NewsRepairPool(4,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const rows=[],allSeeds=[];let next=0;
async function run(site){
 const live=JSON.parse(await fs.readFile(path.join(root,'complete-live',site.domain,'result.json'),'utf8').catch(()=> '{}'));
 const offline=JSON.parse(await fs.readFile(path.join(root,'complete-offline',site.domain+'.json'),'utf8').catch(()=> '{}'));
 const old=JSON.parse(await fs.readFile(site.resultFile,'utf8'));
 const config=JSON.parse(await fs.readFile(site.configFile,'utf8'));
 const checks=[];
 for(const a of live.articles||[]){
  const check={url:a.url,error:a.error||null,httpStatus:a.statusCode,htmlPath:a.htmlPath,issues:[],additionalArticleLinks:a.additionalArticleLinks||0};
  if(a.parsed&&a.htmlPath){
   const inspected=await pool.run({sample:{domain:site.domain,url:a.url,htmlPath:a.htmlPath,kind:'article'},config,learn:false});
   // Feed/dispatcher checks already ran with fresh context in the live pass. Do not replace them with a context-less reparse.
   check.issues=[...(inspected.quality||[])];
   if(inspected.error&&!site.requiresPublicationContext&&config.parserType!=='publisher_dispatch')check.error=inspected.error;
   const s=a.parsed._source,e=a.parsed.extracted;
   check.fields={title:s.title,description:s.description,contentChars:s.content.length,publishedDate:s.publishedDate};
   check.evidence={title:e.titleEvidenceSource,body:e.bodySelector,date:e.dateEvidenceSource,canonical:e.canonicalUrl,description:'HTML meta description/og:description in fetched article response'};
   check.hash=e.contentSha256;
   try{
    const current=new URL(a.url),canonical=new URL(e.canonicalUrl||a.url,a.url);
    const hosts=new Set([site.domain,...(config.allowedHosts||[]),config.sourceAlias].filter(Boolean).map(h=>h.replace(/^www\./,'')));
    if(!hosts.has(canonical.hostname.replace(/^www\./,'')))check.issues.push({code:'canonical_publisher_requires_review'});
    const response=new URL(a.finalUrl||a.url);
    if(current.pathname!=='/'&&response.pathname==='/'&&config.parserType!=='publisher_dispatch')check.issues.push({code:'article_redirect_to_homepage'});
   }catch{check.issues.push({code:'article_identity_url_invalid'});}
   if(!s.description?.trim())check.issues.push({code:'missing_description'});
   if(s.content==='Images/Video'||e.mediaOnly)check.issues.push({code:'media_only_requires_separate_scope'});
   if(e.publisherRestricted)check.issues.push({code:'publisher_restricted'});
   if(site.timezoneReviewRequired)check.issues.push({code:'configured_timezone_requires_confirmation'});
   check.pass=!check.error&&!check.issues.length&&Boolean(a.fourFieldsPresent);
  }else check.pass=false;
  checks.push(check);
 }
 const good=checks.filter(a=>a.pass),hashes=new Set(good.map(a=>a.hash));
 const categoryRows=[];
 for(const url of site.seedCandidates){
  const evidence=url===site.homepage?old.homepage:(old.categories||[]).find(c=>c.url===url);
  const isHome=url===site.homepage,policy=isHome||isNewsCategoryUrl(url,{domain:site.domain});
  const entry={domain:site.domain,url,kind:isHome?'homepage':'category',policyEligible:policy,
   policyReason:classifyNewsLink(url,site.domain).reason||null,
   historicalState:evidence?.state||null,historicalError:evidence?.error||null,
   currentControl:(isHome?live.home:live.categories?.find(c=>c.url===url))||null};
  if(entry.currentControl)entry.currentControl={statusCode:entry.currentControl.statusCode,error:entry.currentControl.error,articleLinks:entry.currentControl.articleLinks,checkedAt:entry.currentControl.checkedAt};
  categoryRows.push(entry);allSeeds.push(entry);
 }
 const errors=checks.flatMap(a=>[a.error,...a.issues.map(q=>q.code)].filter(Boolean));
 const hasAccessFailure=live.status==='access_unconfirmed'||live.articles?.some(a=>a.error&&(/http_|deadline|ECONN|ENOTFOUND|ETIMEDOUT|access_blocked|rate_limited/.test(a.error)));
 const status=hashes.size>=3&&checks.length>=3&&checks.every(c=>c.pass)&&live.home?.articleLinks>0&&live.categories?.some(c=>c.articleLinks>0)?'verified_current_samples':
  good.length?'partial_current_samples':hasAccessFailure?'access_unconfirmed':live.exception?'verification_exception':!checks.length?'discovery_unconfirmed':'parser_or_quality_unconfirmed';
 const row={domain:site.domain,status,liveFinishedAt:live.finishedAt,liveSamples:checks.length,verifiedSamples:good.length,
  historicalRecords:offline.checks?.length||0,historicalStates:offline.counts||{},
  historicalErrors:[...new Set((offline.checks||[]).flatMap(c=>[c.error,...(c.quality||[]).map(q=>q.code)].filter(Boolean)))],
  currentErrors:[...new Set(errors)],homepageError:live.home?.error||null,
  wireRequests:(live.network||[]).length,
  categoryCandidates:site.categoryCandidates.length,liveCategoryControls:live.categoryControlsChecked||0,
  discoveredUrls:live.discoveredUrls||0,checks,categoryRows,exception:live.exception||null,
  releaseReady:false,allLayoutsVerified:false,allConfiguredCategoriesVerified:false};
 await fs.writeFile(path.join(out,'sites',site.domain+'.json'),JSON.stringify(row,null,2));
 return {...row,checks:undefined,categoryRows:undefined};
}
async function lane(){while(next<inv.sites.length){const site=inv.sites[next++];try{rows.push(await run(site));}catch(e){rows.push({domain:site.domain,status:'verification_exception',exception:e.message,releaseReady:false});}}}
try{await Promise.all(Array.from({length:6},lane));}finally{await pool.close();}
rows.sort((a,b)=>a.domain.localeCompare(b.domain));
const summary={checkedAt:new Date().toISOString(),sites:rows.length,uniqueSites:new Set(rows.map(r=>r.domain)).size,
 statuses:rows.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{}),
 offlineRecords:rows.reduce((n,r)=>n+(r.historicalRecords||0),0),
 offlineStates:rows.reduce((o,r)=>{for(const [k,v]of Object.entries(r.historicalStates||{}))o[k]=(o[k]||0)+v;return o;},{}),
 liveArticleSamples:rows.reduce((n,r)=>n+(r.liveSamples||0),0),verifiedLiveSamples:rows.reduce((n,r)=>n+(r.verifiedSamples||0),0),
 policyFlaggedSeeds:allSeeds.filter(s=>!s.policyEligible).length,wireRequests:rows.reduce((n,r)=>n+(r.wireRequests||0),0),
 modelPolicy:'No additional API calls in the full verification. Existing 3-call Luna pilot retained as proposals only.',
 browserUsed:false,queueCreated:false,productionWrites:false,fullCategoryCoverage:false,allLayoutsVerified:false,
 scope:'544 sites accounted for; all latest saved article records replayed, current homepage + up to 2 categories + up to 3 articles checked per site. Verified status applies to current samples only. Historical and current unresolved cases remain visible.'};
if(summary.sites!==544||summary.uniqueSites!==544)throw Error('Missing or duplicate source');
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
await fs.writeFile(path.join(out,'sites.json'),JSON.stringify(rows,null,2));
await fs.writeFile(path.join(out,'seed-review.json'),JSON.stringify(allSeeds,null,2));
const clean=v=>String(v??'').replace(/[\t\r\n]+/g,' ');
await fs.writeFile(path.join(out,'sites.tsv'),[
 ['domain','status','live_samples','verified_samples','historical_records','homepage_error','current_errors','historical_errors','exception'],
 ...rows.map(r=>[r.domain,r.status,r.liveSamples,r.verifiedSamples,r.historicalRecords,r.homepageError,r.currentErrors?.join(';'),r.historicalErrors?.join(';'),r.exception])
].map(r=>r.map(clean).join('\t')).join('\n')+'\n');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await fs.writeFile(path.join(out,'report.html'),`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Xác minh 544 site News</title><style>body{font:14px system-ui;margin:24px;color:#192b40}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#eaf0f8}input{padding:10px;width:400px}small{display:block}</style><h1>Xác minh 544 site News</h1><p>${esc(summary.checkedAt)}. HTTP, không browser. Trạng thái đạt chỉ áp dụng mẫu hiện tại, chưa chứng nhận toàn bộ category/layout.</p><pre>${esc(JSON.stringify(summary.statuses,null,2))}</pre><p>Mọi lỗi lịch sử vẫn giữ riêng. Trường hợp thiếu mô tả, body thiếu, ngày/tiêu đề mâu thuẫn hoặc múi giờ chưa xác nhận không được tính mẫu đạt.</p><input id="q" placeholder="Tìm domain, trạng thái hoặc lỗi"><table><thead><tr><th>Site</th><th>Trạng thái</th><th>Mẫu live đạt/tổng</th><th>Lỗi hiện tại</th><th>HTML lịch sử</th></tr></thead><tbody>${rows.map(r=>`<tr><td><a href="sites/${esc(r.domain)}.json">${esc(r.domain)}</a></td><td>${esc(r.status)}</td><td>${r.verifiedSamples||0}/${r.liveSamples||0}</td><td>${esc([r.homepageError,...r.currentErrors||[],r.exception].filter(Boolean).join('; '))}</td><td>${r.historicalRecords||0}<small>${esc((r.historicalErrors||[]).join('; '))}</small></td></tr>`).join('')}</tbody></table><script>document.querySelector('#q').oninput=e=>{for(const r of document.querySelectorAll('tbody tr'))r.hidden=!r.textContent.toLowerCase().includes(e.target.value.toLowerCase());};</script></html>`);
console.log(JSON.stringify(summary,null,2));
