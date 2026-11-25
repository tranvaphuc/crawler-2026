import fs from 'node:fs';
import fsp from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';

// Read-only analysis of local benchmark artifacts. No network, crawler or ES client.
const directory=path.resolve(process.argv[2]||'outputs/news-cycle-benchmark-522-2026-11-09-run1');
const json=async name=>JSON.parse(await fsp.readFile(path.join(directory,name),'utf8'));
const summary=await json('summary.json').catch(()=>null);
const progress=await json('progress.json');
const sites=new Map(),requestPhases=new Map();
const getSite=domain=>{if(!sites.has(domain))sites.set(domain,{domain,listingAttempts:0,listingFailures:0,articleAttempts:0,articleParsed:0,articleExcluded:0,articleFailures:0,errors:{},errorSamples:{}});return sites.get(domain);};
const manifest=await json('inputs.json');
for(const row of manifest.configurationSnapshots)getSite(row.domain);
async function rows(name,consume){let lines=0,malformed=0;for await(const line of readline.createInterface({input:fs.createReadStream(path.join(directory,name)),crlfDelay:Infinity})){if(!line)continue;let row;try{row=JSON.parse(line);}catch{malformed++;continue;}lines++;consume(row);}return {lines,malformed};}
const totals={listingErrors:{},articleErrors:{},statusCodes:{},articleUrls:0,articleUrlsParsed:0,articleUrlsFailed:0,articleUrlsExcluded:0,notFetchedRateLimited:0,notFetchedUserStopped:0,notFetched:0};
function error(site,key,url,stage){site.errors[key]=(site.errors[key]||0)+1;(site.errorSamples[key]||=[]);if(site.errorSamples[key].length<3)site.errorSamples[key].push({url,stage});}
const ledgers={};
const candidates=new Map();
ledgers.discovery=await rows('listing-discovery.jsonl',r=>{if(!candidates.has(r.domain))candidates.set(r.domain,new Set());for(const url of r.articles)candidates.get(r.domain).add(url);});
ledgers.listings=await rows('listing-results.jsonl',r=>{const s=getSite(r.domain);s.listingAttempts++;if(r.status==='failed'){s.listingFailures++;totals.listingErrors[r.error]=(totals.listingErrors[r.error]||0)+1;error(s,r.error,r.url,r.kind);}});
ledgers.articles=await rows('article-results.jsonl',r=>{totals.articleUrls++;if(r.attempted===false){totals.notFetched++;if(r.results.some(x=>x.error==='not_fetched_user_stopped_timeout_origin'))totals.notFetchedUserStopped++;else if(r.results.some(x=>x.error==='not_fetched_origin_rate_limited'))totals.notFetchedRateLimited++;}let parsed=false,excluded=0;for(const x of r.results){const s=getSite(x.domain);s.articleAttempts++;if(x.documentKey){s.articleParsed++;parsed=true;}else if(x.error?.startsWith('non_news_document:')){s.articleExcluded++;excluded++;}else{s.articleFailures++;totals.articleErrors[x.error]=(totals.articleErrors[x.error]||0)+1;error(s,x.error,r.url,'article');}}if(parsed)totals.articleUrlsParsed++;else if(excluded===r.results.length)totals.articleUrlsExcluded++;else totals.articleUrlsFailed++;});
ledgers.requests=await rows('requests.jsonl',r=>{const key=r.phase||'unknown';if(!requestPhases.has(key))requestPhases.set(key,{phase:key,responses:0,errors:0,totalElapsedMs:0,maxElapsedMs:0,bodyBytes:0,latencyBuckets:{under1s:0,under5s:0,under10s:0,atLeast10s:0}});const a=requestPhases.get(key);a.responses++;if(r.error)a.errors++;a.totalElapsedMs+=r.elapsedMs||0;a.maxElapsedMs=Math.max(a.maxElapsedMs,r.elapsedMs||0);a.bodyBytes+=r.responseBytes||0;const t=r.elapsedMs||0;a.latencyBuckets[t<1000?'under1s':t<5000?'under5s':t<10000?'under10s':'atLeast10s']++;const code=r.statusCode??'network_error';totals.statusCodes[code]=(totals.statusCodes[code]||0)+1;});
const activeSites=[...sites.values()].filter(s=>s.listingAttempts||s.articleAttempts);
for(const site of activeSites){site.articleCandidates=candidates.get(site.domain)?.size||0;site.articlePending=site.articleCandidates-site.articleAttempts;}
const report={generatedAt:new Date().toISOString(),complete:!!summary,elapsedMs:summary?.elapsedMs||progress.elapsedMs,progress,summary,ledgers,totals,requestPhases:[...requestPhases.values()].map(r=>({...r,meanElapsedMs:Math.round(r.totalElapsedMs/r.responses)})),topArticleFailureSites:[...activeSites].sort((a,b)=>b.articleFailures-a.articleFailures).slice(0,30),topListingFailureSites:[...activeSites].sort((a,b)=>b.listingFailures-a.listingFailures).slice(0,30)};
report.topPendingSites=[...activeSites].sort((a,b)=>b.articlePending-a.articlePending).slice(0,30).map(s=>({domain:s.domain,candidates:s.articleCandidates,done:s.articleAttempts,pending:s.articlePending}));
if(summary)report.reconciliation={articleLedgerMatches:totals.articleUrls===summary.articleTasksDone,articleParsedMatches:totals.articleUrlsParsed===summary.articleUrlsParsed,articleFailedMatches:totals.articleUrlsFailed===summary.articleUrlsFailed,articleExcludedMatches:totals.articleUrlsExcluded===summary.articleUrlsExcluded,listingLedgerMatches:ledgers.listings.lines===summary.listingsDone+summary.feedsDone,requestLedgerMatches:ledgers.requests.lines===summary.logicalHttpResponses,malformedLines:Object.values(ledgers).reduce((n,x)=>n+x.malformed,0)};
await fsp.writeFile(path.join(directory,'analysis.json'),JSON.stringify(report,null,2));
await fsp.writeFile(path.join(directory,'site-error-analysis.json'),JSON.stringify(activeSites.sort((a,b)=>b.articleFailures+b.listingFailures-a.articleFailures-a.listingFailures),null,2));
console.log(JSON.stringify({complete:report.complete,elapsedMinutes:(report.elapsedMs/60000).toFixed(2),totals,reconciliation:report.reconciliation,topArticleFailureSites:report.topArticleFailureSites.slice(0,10).map(s=>({domain:s.domain,failures:s.articleFailures,parsed:s.articleParsed}))},null,2));
