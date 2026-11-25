import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {verifyNewsFields,sharedDescriptionWarnings} from '../src/web/newsFieldVerification.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {primaryNewsListingLinks} from '../src/web/newsListingEvidence.mjs';
const base=path.resolve('outputs/news-flow-preparation-2026-11-12');
const root=path.join(base,'deep-verification'),out=path.join(root,'final');await fs.mkdir(path.join(out,'sites'),{recursive:true});
const inv=JSON.parse(await fs.readFile(path.join(base,'inventory.json'),'utf8'));
const rows=[],failures=[];let complete=0;
const pool=new NewsRepairPool(2,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const manifest=JSON.parse(await fs.readFile(path.join(root,'verified-changes.json'),'utf8'));
const verifiedUtilities=manifest.changes.filter(c=>c.type==='verified_utility_removed_from_category');
function reviewSharedDescriptions(report){
 if(report.sharedDescriptionAudit)return report;
 const warnings=sharedDescriptionWarnings(report.checks||[]),byDescription=new Map(warnings.map(w=>[w.description,w]));
 for(const c of report.checks||[]){const issue=byDescription.get(String(c.description||'').replace(/\s+/g,' ').trim());if(!issue)continue;if(!c.issues.some(q=>q.code===issue.code))c.issues.push(issue);if(c.kind==='parsed')c.kind='quality';}
 report.sharedDescriptionAudit=true;report.sharedDescriptionWarnings=warnings;
 report.textParsed=report.checks.filter(c=>c.kind==='parsed'&&c.contentKind==='text').length;
 report.mediaParsed=report.checks.filter(c=>c.kind==='parsed'&&c.contentKind==='media').length;
 report.qualityFailures=report.checks.filter(c=>c.kind==='quality').length;
 if(!report.textParsed&&!report.mediaParsed&&report.checks.some(c=>c.title))report.parserCapability='extracts_fields_quality_review';
 return report;
}
function reviewSeedPolicy(report,raw,supplement){
 for(const key of Object.keys(report.categoryStates))if(key.startsWith('policy_recheck:'))delete report.categoryStates[key];
 const checks=supplement?.checks||[],original=raw.categories.filter(c=>c.state==='policy_review').length;
 if(original){report.categoryStates.policy_review=original-checks.length;if(!report.categoryStates.policy_review)delete report.categoryStates.policy_review;}
 for(const c of checks){const key='policy_recheck:'+c.classification;report.categoryStates[key]=(report.categoryStates[key]||0)+1;}
 report.policySeedRechecks=checks;
 report.verifiedUtilitySeedUrls||=[];
 for(const change of verifiedUtilities.filter(c=>c.domain===report.domain)){
  if(report.verifiedUtilitySeedUrls.includes(change.url))continue;
  const original=raw.categories.find(c=>c.url===change.url);if(!original)continue;
  const key=original.state;if(report.categoryStates[key]>0){report.categoryStates[key]--;if(!report.categoryStates[key])delete report.categoryStates[key];}
  report.categoryStates.confirmed_utility_removed=(report.categoryStates.confirmed_utility_removed||0)+1;
  report.verifiedUtilitySeedUrls.push(change.url);
 }
}
for(const site of inv.sites){
 let r;try{r=JSON.parse(await fs.readFile(path.join(root,site.domain,'result.json'),'utf8'));}catch{continue;}
 if(!r.complete)continue;complete++;
 const recheck=await fs.readFile(path.join(root,site.domain,'transport-recheck.json'),'utf8').then(JSON.parse).catch(()=>null);
 const seedRecheck=await fs.readFile(path.join(root,site.domain,'seed-policy-recheck.json'),'utf8').then(JSON.parse).catch(()=>null);
 const recheckFingerprint=recheck?.complete?JSON.stringify(recheck.checks.map(c=>[c.url,c.transportError,c.statusCode,c.checkedAt])):null;
 const cached=await fs.readFile(path.join(out,'sites',site.domain+'.json'),'utf8').then(JSON.parse).catch(()=>null);
 const recoveredWithoutParse=recheck?.checks.some(c=>c.role==='article'&&!c.transportError&&c.statusCode===200&&!c.parsed);
 if(cached?.verificationVersion===6&&cached.finishedAt===r.finishedAt&&cached.recheckFingerprint===recheckFingerprint&&!recoveredWithoutParse){
  reviewSharedDescriptions(cached);reviewSeedPolicy(cached,r,seedRecheck);await fs.writeFile(path.join(out,'sites',site.domain+'.json'),JSON.stringify(cached,null,2));
  rows.push({...cached,checks:undefined});
  for(const c of cached.checks||[])if(c.kind!=='parsed')failures.push({domain:site.domain,...c});
  continue;
 }
 const checks=[];
 for(let a of r.articles){
  const recovered=recheck?.checks.find(c=>c.url===a.url&&!c.transportError&&c.statusCode===200&&c.htmlPath);
  if(recovered?.parsed){
   const config=JSON.parse(await fs.readFile(site.configFile,'utf8'));
   const inspected=await pool.run({sample:{domain:site.domain,url:a.url,htmlPath:recovered.htmlPath,kind:'article'},config});
   a={...a,originalTransportError:a.transportError,transportError:null,parseError:recovered.parseError,
    fields:recovered.parsed._source,extracted:recovered.parsed.extracted,htmlPath:recovered.htmlPath,quality:inspected.quality||[]};
  }else if(recovered){a={...a,originalTransportError:a.transportError,transportError:null,parseError:recovered.parseError||'dependent_parser_recheck_pending',htmlPath:recovered.htmlPath};}
  let verification=null;
  if(a.fields&&a.htmlPath){try{const html=gunzipSync(await fs.readFile(a.htmlPath)).toString();verification=verifyNewsFields(html,{_source:a.fields,extracted:a.extracted});}catch(e){verification={issues:[{code:'independent_verification_exception',error:e.message}]};}}
  const issues=[...(a.quality||[]),...(verification?.issues||[])];
  if(a.fields){
   try{const canonical=new URL(a.extracted?.canonicalUrl||a.url,a.url),hosts=new Set([site.domain,...site.allowedHosts||[],site.sourceAlias].filter(Boolean).map(h=>h.replace(/^www\./,'')));if(!hosts.has(canonical.hostname.replace(/^www\./,'')))issues.push({code:'publisher_identity_requires_review',canonical:canonical.href});}catch{issues.push({code:'invalid_canonical_identity'});}
   if(site.timezoneReviewRequired&&a.extracted?.dateTimezone!=='explicit_offset')issues.push({code:'configured_timezone_requires_confirmation'});
  }
  const media=verification?.contentKind==='media';
  const nonMediaIssues=issues.filter(q=>q.code!=='media_only_requires_separate_scope');
  const kind=a.attempted===false?'deferred':a.transportError?'transport':a.parseError==='dependent_parser_recheck_pending'?'dependency_review':a.parseError?.startsWith('non_news_document:')?'non_article':a.parseError?'parser':nonMediaIssues.length?'quality':a.fields?'parsed':'unconfirmed';
  const row={url:a.url,foundOn:a.foundOn,reason:a.reason,transportError:a.transportError||null,parseError:a.parseError||null,
   issues:[...new Map(issues.map(q=>[q.code,q])).values()],kind,contentKind:media?'media':'text',
   title:a.fields?.title,description:a.fields?.description,publishedDate:a.fields?.publishedDate,contentChars:a.fields?.content.length,
   htmlPath:a.htmlPath,independentVerification:verification};
  if(a.originalTransportError)row.transportRecovery={originalError:a.originalTransportError,recheckMethod:recovered.method};
  checks.push(row);
 }
 const textParsed=checks.filter(c=>c.kind==='parsed'&&c.contentKind==='text').length,mediaParsed=checks.filter(c=>c.kind==='parsed'&&c.contentKind==='media').length;
 const parserFailures=checks.filter(c=>c.kind==='parser').length,qualityFailures=checks.filter(c=>c.kind==='quality').length,transportFailures=checks.filter(c=>c.kind==='transport').length,deferred=checks.filter(c=>c.kind==='deferred').length,nonArticles=checks.filter(c=>c.kind==='non_article').length;
 const categoryStates={};
 for(const c of r.categories){
  const fixed=recheck?.checks.find(x=>x.url===c.url&&!x.transportError&&x.statusCode===200&&x.htmlPath);
  let state=c.state;
  if(fixed){const html=gunzipSync(await fs.readFile(fixed.htmlPath)).toString();const primary=primaryNewsListingLinks(html,c.url,{domain:site.domain,url:site.homepage,knownCategoryUrls:site.categoryCandidates});state=primary.articles.length?'primary_links_found_after_transport_recheck':'no_primary_links_after_transport_recheck';}
  categoryStates[state]=(categoryStates[state]||0)+1;
 }
 const parserCapability=textParsed||mediaParsed?'can_parse_confirmed_samples':checks.some(c=>c.title)?'extracts_fields_quality_review':parserFailures?'parser_unconfirmed':nonArticles?'only_non_article_candidates':'access_or_discovery_unconfirmed';
 const row={domain:site.domain,verificationVersion:6,recheckFingerprint,parserCapability,textParsed,mediaParsed,articleChecks:checks.length,dependencyReviews:checks.filter(c=>c.kind==='dependency_review').length,
  parserFailures,qualityFailures,transportFailures,deferred,nonArticles,categoryStates,categoryChecks:r.categories.length,configuredSeeds:site.seedCandidates.length,
  allConfiguredSeedsAccountedFor:r.categories.length===site.seedCandidates.length,
  haltReason:r.haltReason,exception:r.exception||null,finishedAt:r.finishedAt,
  limitations:'Sample-backed capability; not every discovered article or every layout proven. Failed URLs remain separately classified.',checks};
 reviewSharedDescriptions(row);
 reviewSeedPolicy(row,r,seedRecheck);
 for(const c of row.checks)if(c.kind!=='parsed')failures.push({domain:site.domain,...c});
 await fs.writeFile(path.join(out,'sites',site.domain+'.json'),JSON.stringify(row,null,2));rows.push({...row,checks:undefined});
}
await pool.close();
const summary={generatedAt:new Date().toISOString(),sites:complete,target:544,complete:complete===544,
 parserCapabilities:rows.reduce((o,r)=>(o[r.parserCapability]=(o[r.parserCapability]||0)+1,o),{}),
 articleChecks:rows.reduce((n,r)=>n+r.articleChecks,0),textParsed:rows.reduce((n,r)=>n+r.textParsed,0),mediaParsed:rows.reduce((n,r)=>n+r.mediaParsed,0),
 parserFailures:rows.reduce((n,r)=>n+r.parserFailures,0),qualityFailures:rows.reduce((n,r)=>n+r.qualityFailures,0),transportFailures:rows.reduce((n,r)=>n+r.transportFailures,0),
 deferredArticles:rows.reduce((n,r)=>n+r.deferred,0),
 nonArticleResponses:rows.reduce((n,r)=>n+r.nonArticles,0),
 dependentParserReviews:rows.reduce((n,r)=>n+(r.dependencyReviews||0),0),
 categoryStates:rows.reduce((o,r)=>{for(const [k,v]of Object.entries(r.categoryStates))o[k]=(o[k]||0)+v;return o;},{}),
 configuredSeedsAccountedFor:rows.filter(r=>r.allConfiguredSeedsAccountedFor).length,
 seedPolicyRechecks:rows.reduce((n,r)=>n+(r.policySeedRechecks?.length||0),0),
 categoryChecks:rows.reduce((n,r)=>n+r.categoryChecks,0),exceptions:rows.filter(r=>r.exception),
 modelCalls:0,browserUsed:false,productionWrites:false,allDiscoveredArticlesChecked:false};
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
await fs.writeFile(path.join(out,'sites.json'),JSON.stringify(rows,null,2));
await fs.writeFile(path.join(out,'url-failures.json'),JSON.stringify(failures,null,2));
const clean=v=>String(v??'').replace(/[\t\r\n]+/g,' '),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await fs.writeFile(path.join(out,'sites.tsv'),[['domain','parser_capability','text_parsed','media_parsed','articles','parser_errors','quality_reviews','transport_errors','seed_checks','seeds_expected','halt'],...rows.map(r=>[r.domain,r.parserCapability,r.textParsed,r.mediaParsed,r.articleChecks,r.parserFailures,r.qualityFailures,r.transportFailures,r.categoryChecks,r.configuredSeeds,r.haltReason])].map(r=>r.map(clean).join('\t')).join('\n')+'\n');
await fs.writeFile(path.join(out,'report.html'),`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Kiểm tra sâu News 544 site</title><style>body{font:14px system-ui;margin:24px;color:#172b42}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:9px;vertical-align:top}th{background:#eef3f9}input{padding:10px;width:500px}</style><h1>Kiểm tra sâu News — ${complete}/544 site</h1><p>Đối chiếu mọi seed cấu hình, bài chính theo category, layout media, URL lỗi live và link từ bài. Không phân trang/browser. Khả năng parse được xác nhận theo mẫu; lỗi kết nối không biến thành kết luận parser hỏng.</p><pre>${esc(JSON.stringify(summary,null,2))}</pre><input id="q" placeholder="Tìm site hoặc trạng thái"><p><a href="url-failures.json">Lỗi từng URL</a> · <a href="sites.tsv">Bảng TSV</a></p><table><thead><tr><th>Site</th><th>Khả năng parser</th><th>Bài chữ / media đạt</th><th>Parser / quality / tải lỗi</th><th>Seed theo dõi</th><th>Dừng chờ</th></tr></thead><tbody>${rows.map(r=>`<tr><td><a href="sites/${esc(r.domain)}.json">${esc(r.domain)}</a></td><td>${esc(r.parserCapability)}</td><td>${r.textParsed} / ${r.mediaParsed}</td><td>${r.parserFailures} / ${r.qualityFailures} / ${r.transportFailures}</td><td>${r.categoryChecks}/${r.configuredSeeds}</td><td>${esc(r.haltReason)}</td></tr>`).join('')}</tbody></table><script>document.querySelector('#q').oninput=e=>{for(const r of document.querySelectorAll('tbody tr'))r.hidden=!r.textContent.toLowerCase().includes(e.target.value.toLowerCase());};</script></html>`);
console.log(JSON.stringify(summary,null,2));
