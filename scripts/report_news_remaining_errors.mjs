import fs from 'node:fs/promises';import path from 'node:path';import {gunzipSync} from 'node:zlib';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {verifyNewsFields,sharedDescriptionWarnings} from '../src/web/newsFieldVerification.mjs';
const base=path.resolve('outputs/news-flow-preparation-2026-11-12');
const root=path.join(base,'remaining-errors-recheck'),out=path.join(root,'final');await fs.mkdir(path.join(out,'sites'),{recursive:true});
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const baseline=await read(path.join(base,'deep-verification/final/sites.json'));
const inventory=await read(path.join(base,'inventory.json'));
const aSummary=await read(path.join(root,'axios/summary.json')),bSummary=await read(path.join(root,'curl/summary.json'));
if(!aSummary.complete||!bSummary.complete||aSummary.sites!==aSummary.total||bSummary.sites!==bSummary.total)throw Error('Both independent verification rounds must finish');
const selected=new Set(aSummary.results.map(s=>s.domain));
const pool=new NewsRepairPool(2,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const rows=[],recovered=[],curlRecoveries=[],allIssues=[],repairs=[];let networkChecks=0,articleRetests=0;
function kind(c){return c.attempted===false?'deferred':c.transportError?'transport':c.parseError?.startsWith('non_news_document:')?'non_article':c.parseError?'parser':c.quality?.length?'quality':c.parsed?'parsed':c.role==='article'?'unconfirmed':'listing';}
async function evaluate(c,config,site,repair){
 let value={...c};
 if(repair?.applied&&!c.transportError&&c.htmlPath&&c.role==='article'){
  const html=gunzipSync(await fs.readFile(c.htmlPath)).toString(),parsed=parseConfiguredArticle(html,c.url,config);
  const inspection=await pool.run({sample:{domain:site.domain,url:c.url,htmlPath:c.htmlPath,kind:'article'},config});
   value={...c,parseError:parsed.error||null,parsed:parsed.error?null:parsed,quality:inspection.quality||[],approvedRepairUsed:!parsed.error&&(parsed.extracted?.variant||0)>((config.variants?.length||0)-(repair.approvedVariants||0))};
  if(value.parsed){value.fieldReview=verifyNewsFields(html,parsed);value.quality.push(...value.fieldReview.issues);}
 }
 if(value.parsed){
  if(value.parsed.extracted.publisherRestricted&&!value.quality.some(q=>q.code==='publisher_restricted'))value.quality.push({code:'publisher_restricted'});
  if(site.timezoneReviewRequired&&value.parsed.extracted.dateTimezone!=='explicit_offset'&&!value.quality.some(q=>q.code==='configured_timezone_requires_confirmation'))value.quality.push({code:'configured_timezone_requires_confirmation'});
  try{const u=new URL(value.parsed.extracted.canonicalUrl||c.url,c.url),hosts=new Set([site.domain,...site.allowedHosts||[],site.sourceAlias].filter(Boolean).map(h=>h.replace(/^www\./,'')));if(!hosts.has(u.hostname.replace(/^www\./,''))&&!value.quality.some(q=>q.code==='publisher_identity_requires_review'))value.quality.push({code:'publisher_identity_requires_review',canonical:u.href});}catch{}
 }
 const s=value.parsed?._source;
 return {url:c.url,role:c.role,kind:kind(value),transportError:value.transportError||null,parseError:value.parseError||null,
  issues:[...new Map((value.quality||[]).map(q=>[q.code,q])).values()],title:s?.title,description:s?.description,publishedDate:s?.publishedDate,
  contentChars:s?.content?.length,contentKind:value.fieldReview?.contentKind||(value.parsed?.extracted.mediaOnly?'media':'text'),
  contentHash:value.parsed?.extracted.contentSha256,htmlPath:c.htmlPath,method:c.method,
  approvedRepairUsed:value.approvedRepairUsed||false,reason:c.reason||null,
  nativeEvidence:c.nativeEvidence,fieldReview:value.fieldReview};
}
try{for(const old of baseline){
 if(!selected.has(old.domain)){rows.push({...old,recheckedThisRound:false});continue;}
 const site=inventory.sites.find(s=>s.domain===old.domain),config=await read(site.configFile);
 const original=await read(path.join(base,'deep-verification/final/sites',old.domain+'.json'));
 const a=await read(path.join(root,'axios',old.domain,'result.json')),b=await read(path.join(root,'curl',old.domain,'result.json'));
 const repair=await read(path.join(root,'repairs',old.domain,'result.json')).catch(()=>null);
 if(repair?.applied)repairs.push({domain:old.domain,approvedVariants:repair.approvedVariants,regressionSamples:repair.regression.length,evidence:path.relative(out,path.join(root,'repairs',old.domain,'result.json'))});
 const current=new Map(a.checks.map(c=>[c.url,{...c,round:'axios'}]));
 for(const c of b.checks){const first=current.get(c.url);if(!first||first.transportError)current.set(c.url,{...c,round:'curl',axiosBefore:first});}
 networkChecks+=a.checks.length+b.checks.length;
 if(repair?.applied){for(const p of repair.proposals.filter(p=>p.approved))for(const h of p.holdouts.filter(h=>h.accepted)){
  if(!current.has(h.url))current.set(h.url,{url:h.url,role:'article',reason:'new_independent_holdout',htmlPath:h.htmlPath,transportError:null,quality:[],method:'HTTP/axios independent repair holdout',round:'repair_holdout'});
 }}
 const merged=new Map(original.checks.map(c=>[c.url,{...c,issues:[...(c.issues||[])],fromPreviousSnapshot:true}]));
 const comparisons=[];
 for(const [url,c]of current){
  const evaluated=await evaluate(c,config,site,repair);evaluated.round=c.round;
  if(c.role==='article'){articleRetests++;merged.set(url,evaluated);}
  comparisons.push({url,role:c.role,reason:c.reason,round:c.round,before:original.checks.find(x=>x.url===url)||c.before,after:evaluated});
 }
 // Evaluate article-specific description across the full site evidence, not just the subset retried by curl.
 const warnings=sharedDescriptionWarnings([...merged.values()]);
 for(const c of merged.values()){
  const w=warnings.find(w=>w.description===c.description);if(w&&!c.issues.some(q=>q.code===w.code)){c.issues.push(w);if(c.kind==='parsed')c.kind='quality';}
 }
 const good=[...merged.values()].filter(c=>c.kind==='parsed'),siteRecovered=[];
 for(const cmp of comparisons){
  const after=cmp.role==='article'?merged.get(cmp.url):cmp.after;cmp.after=after;
  if(cmp.before?.kind&&cmp.before.kind!=='parsed'&&after.kind==='parsed'&&cmp.reason!=='positive_control'){
   const previousError=cmp.before.transportError||cmp.before.parseError||'';
   const cause=after.approvedRepairUsed?'validated_selector_repair':cmp.before.kind==='deferred'?'previously_deferred_now_verified':/publisher_restricted_or_unconfirmed_public_content/.test(previousError)?'public_content_revalidated':previousError==='empty_page'?'empty_response_recovered':cmp.before.kind==='transport'?'transport_recovered':cmp.before.kind==='parser'?'same_parser_fresh_response_passed':'quality_recheck_passed';
   const recovery={domain:old.domain,url:cmp.url,beforeKind:cmp.before.kind,beforeError:cmp.before.transportError||cmp.before.parseError||cmp.before.issues?.map(q=>q.code).join(','),recovery:cause,round:cmp.round,contentKind:after.contentKind,title:after.title,htmlPath:after.htmlPath};
   recovered.push(recovery);siteRecovered.push(recovery);
  }
  if(cmp.round==='curl'&&after.kind==='parsed')curlRecoveries.push({domain:old.domain,url:cmp.url,htmlPath:after.htmlPath});
 }
 const capability=good.length?'can_parse_confirmed_samples':[...merged.values()].some(c=>c.title)?'extracts_fields_quality_review':[...merged.values()].some(c=>c.kind==='parser')?'parser_unconfirmed':[...merged.values()].some(c=>c.kind==='non_article')?'only_non_article_candidates':'access_or_discovery_unconfirmed';
 const counts=[...merged.values()].reduce((o,c)=>(o[c.kind]=(o[c.kind]||0)+1,o),{});
 const result={domain:old.domain,recheckedThisRound:true,previousCapability:old.parserCapability,parserCapability:capability,
  baselineArticleRecords:original.checks.length,articleRecords:merged.size,checksRetested:a.checks.length+b.checks.length,counts,
  recoveredUrls:siteRecovered.length,repairApplied:repair?.applied||false,sharedDescriptionWarnings:warnings,
  exceptions:[a.exception,b.exception].filter(Boolean),comparisons,checks:[...merged.values()],
  scope:'All remaining erroneous article URLs and failed/deferred category URLs plus positive controls. New independent repair holdouts included separately. Untouched positive records retain their prior snapshot provenance.'};
 await fs.writeFile(path.join(out,'sites',old.domain+'.json'),JSON.stringify(result,null,2));
 rows.push({...result,comparisons:undefined,checks:undefined});
 for(const c of merged.values())if(c.kind!=='parsed')allIssues.push({domain:old.domain,...c});
}}finally{await pool.close();}
const rechecked=rows.filter(r=>r.recheckedThisRound),recoveredSites=[...new Set(recovered.map(r=>r.domain))];
const byCause=recovered.reduce((o,r)=>(o[r.recovery]=(o[r.recovery]||0)+1,o),{});
const summary={finishedAt:new Date().toISOString(),baselineSites:544,recheckedSites:rechecked.length,complete:rechecked.length===aSummary.total,
 siteErrors:rechecked.filter(r=>r.exceptions.length),checksRetried:networkChecks,articleRecordsRetested:articleRetests,
 recoveredArticleUrls:recovered.length,recoveredSites:recoveredSites.length,recoveryKinds:byCause,
 transportRecoverySites:[...new Set(recovered.filter(r=>r.recovery==='transport_recovered').map(r=>r.domain))],
 previouslyNoPassingSampleNowVerified:rechecked.filter(r=>r.previousCapability!=='can_parse_confirmed_samples'&&r.parserCapability==='can_parse_confirmed_samples').map(r=>r.domain),
 currentCapabilitiesForRecheckedSites:rechecked.reduce((o,r)=>(o[r.parserCapability]=(o[r.parserCapability]||0)+1,o),{}),
 currentCapabilitiesAll544:rows.reduce((o,r)=>(o[r.parserCapability]=(o[r.parserCapability]||0)+1,o),{}),
 curlRecoveredArticleUrls:curlRecoveries.length,appliedRepairs:repairs,modelCalls:0,browserUsed:false,productionWrites:false};
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));await fs.writeFile(path.join(out,'sites.json'),JSON.stringify(rows,null,2));
await fs.writeFile(path.join(out,'recovered-urls.json'),JSON.stringify(recovered,null,2));await fs.writeFile(path.join(out,'remaining-issues.json'),JSON.stringify(allIssues,null,2));
const perRecoveredSite=recoveredSites.map(domain=>({domain,recovered:recovered.filter(r=>r.domain===domain).length,kinds:[...new Set(recovered.filter(r=>r.domain===domain).map(r=>r.recovery))]}));
await fs.writeFile(path.join(out,'recovered-sites.json'),JSON.stringify(perRecoveredSite,null,2));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await fs.writeFile(path.join(out,'report.html'),`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Rà lại site News còn lỗi</title><style>body{font:14px system-ui;margin:24px;color:#172b42}table{width:100%;border-collapse:collapse}th,td{padding:9px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#edf3f9}input{padding:10px;width:500px}</style><h1>Rà lại ${rechecked.length} site News còn lỗi</h1><p>Thử đúng URL lỗi bằng Axios đóng kết nối, sau đó curl cho lỗi mạng còn lại. Sửa selector chỉ khi có hai URL mới độc lập và regression đạt. HTTP 200 không tự đồng nghĩa parse đạt.</p><pre>${esc(JSON.stringify(summary,null,2))}</pre><p><a href="recovered-sites.json">Site có URL phục hồi</a> · <a href="recovered-urls.json">Trước/sau từng URL phục hồi</a> · <a href="remaining-issues.json">URL còn cần xử lý</a></p><input id="q" placeholder="Tìm site hoặc trạng thái"><table><thead><tr><th>Site</th><th>Trước</th><th>Sau</th><th>URL phục hồi</th><th>Số bản ghi bài theo trạng thái</th><th>Sửa selector</th></tr></thead><tbody>${rechecked.map(r=>`<tr><td><a href="sites/${esc(r.domain)}.json">${esc(r.domain)}</a></td><td>${esc(r.previousCapability)}</td><td>${esc(r.parserCapability)}</td><td>${r.recoveredUrls}</td><td>${esc(JSON.stringify(r.counts))}</td><td>${r.repairApplied?'Có, đã kiểm chứng':'Không'}</td></tr>`).join('')}</tbody></table><script>document.querySelector('#q').oninput=e=>{for(const r of document.querySelectorAll('tbody tr'))r.hidden=!r.textContent.toLowerCase().includes(e.target.value.toLowerCase());};</script></html>`);
console.log(JSON.stringify(summary,null,2));
