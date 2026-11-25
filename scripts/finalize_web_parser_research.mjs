import fs from 'node:fs/promises';
import path from 'node:path';
import {parseForumThread,forumTopicUrl} from '../src/web/forumParser.mjs';
import {weeklyIndex,legacyNewsId} from '../src/web/newsParser.mjs';
const root=path.resolve('outputs/news-forum-research-2026-11-09'),forumRoot=path.join(root,'forum-probes');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const save=(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2));
const sites=await read(path.join(root,'site-readiness.json'));
const rawForum=await read(path.join(forumRoot,'results.json'));
const reviewed=[];
function stableFeed(url){if(!url)return null;const u=new URL(url);u.hash='';u.pathname=u.pathname.replace(/\/find-new\/\d+\/posts\/?$/,'/find-new/posts').replace(/\/whats-new\/posts\/\d+\/?$/,'/whats-new/posts/');return u.href;}
for(const r of rawForum){
 let parsed=null,proof=null;const file=path.join(forumRoot,r.domain+'-thread.html');
 try{const e=await read(path.join(forumRoot,r.domain+'-thread.json'));parsed=parseForumThread(await fs.readFile(file,'utf8'),e.url,r.domain);proof=r.domain+'-thread.html';await save(path.join(forumRoot,r.domain+'-parsed.json'),parsed);}catch{}
 const validFeed=!!r.observedFeedUrl&&/\/(?:find-new|whats-new|latest|recent-posts|new-posts)(?:\/|$)|search\.php\?.*do=(?:getdaily|getnew)/.test(r.observedFeedUrl);
 const parseVerified=!!parsed?.completeRequiredFields;
 let status=r.status;
 if(validFeed&&parseVerified)status='feed_and_sample_parse_verified';else if(validFeed)status='feed_verified_parser_incomplete';else if(parseVerified)status='sample_parse_verified_feed_unverified';else if(r.status==='feed_and_sample_parse_verified'||r.status==='feed_links_verified')status='discovery_needs_custom_adapter';
 const row={...r,rawDiscoveryStatus:r.status,status,feedVerified:validFeed,articleParseVerified:parseVerified,findNewsEntryUrl:validFeed?stableFeed(r.observedFeedUrl):null,parsedSamplePosts:parsed?.parsedPosts.length||0,rejectedSamplePosts:parsed?.rejectedPosts||[],parsedSampleFile:parsed?r.domain+'-parsed.json':null,sampleEvidenceFile:proof,validationScope:'One observed listing/feed and at most one topic page; not a complete comments/history or pagination test',identityCompatibility:'Existing master IDs and hostname/permalink aliases require reconciliation before ES5 writes',enabled:false};
 reviewed.push(row);
 const site=sites.find(s=>s.domain===r.domain);if(site){site.forumResearch=row;site.stage=status;site.currentLiveStatus=validFeed||parseVerified?'browser_content_confirmed':site.currentLiveStatus;site.parseStatus=parseVerified?'Đã parse đủ trường bắt buộc trên trang topic mẫu; chưa kiểm tra toàn bộ phân trang/comment':'Chưa parse đủ bộ trường topic/comment hiện tại';site.configuration.findNewsUrl=row.findNewsEntryUrl||site.configuration.findNewsUrl;site.configuration.observedFeedResultUrl=r.observedFeedUrl||null;site.configuration.parserFamily=parsed?.engine||r.engine;site.configuration.articleParseVerified=parseVerified;site.configuration.feedVerified=validFeed;site.configuration.enabled=false;site.configuration.identityAliases=[...new Set([site.domain,...site.masterSiteNames,r.observedFeedUrl?new URL(r.observedFeedUrl).hostname.replace(/^www\./,''):null].filter(Boolean))];}
}
await save(path.join(forumRoot,'reviewed-results.json'),reviewed);
const pilot=await read(path.join(root,'pilot-antt/summary.json'));
const documents=await read(path.join(root,'pilot-antt/documents.json'));
const matches=await read(path.join(root,'pilot-master-url-matches.json'));
const groups=new Map();for(const h of matches.hits.hits){if(!groups.has(h._source.url))groups.set(h._source.url,[]);groups.get(h._source.url).push(h);}
const identityPlan=[],bulk=[];let creates=0,updates=0,held=0;
for(const d of documents){
 const old=groups.get(d._source.url)||[];const preferred=old.find(h=>h._id===d._id)||old[0];let action;
 if(old.length>1){held++;action='hold_duplicate_existing_url';}
 else if(preferred&&preferred._index!==weeklyIndex(d._source.publishedDate)){held++;action='hold_publication_week_conflict';}
 else if(preferred){updates++;action='update_existing_id';const {_id,_index,_type}=preferred;const patch={title:d._source.title,content:d._source.content,description:d._source.description,picture:d._source.picture,author:d._source.author,authorId:d._source.authorId,url:d._source.url,siteId:d._source.siteId,siteName:d._source.siteName};bulk.push(JSON.stringify({update:{_index,_type,_id}}),JSON.stringify({doc:patch}));}
 else{creates++;action='create_new';bulk.push(JSON.stringify({create:{_index:d._index,_type:d._type,_id:d._id}}),JSON.stringify(d._source));}
 identityPlan.push({url:d._source.url,computedLegacyId:d._id,action,existing:old.map(h=>({index:h._index,type:h._type,id:h._id,title:h._source.title})),nativeId:d.extracted.nativeId,chosenId:preferred?._id||d._id});
}
await save(path.join(root,'pilot-antt/master-identity-plan.json'),identityPlan);
await fs.writeFile(path.join(root,'pilot-antt/es5-bulk-reconciled-preview.ndjson'),bulk.length?bulk.join('\n')+'\n':'');
const masterCompat=await read(path.join(root,'master-compatibility-summary.json'));
const pilotSite=sites.find(s=>s.domain==='antt.vn');if(pilotSite){pilotSite.stage=pilot.completedAllDiscovered?'pilot_scan_verified':'pilot_has_unresolved_failures';pilotSite.parseStatus=`Đã parse ${pilot.parsed}/${pilot.discoveredUniqueArticles} link; ${pilot.unavailableArticles||0} bài chuyển về trang chủ; ${pilot.parserFailed} lỗi; ${Math.round(pilot.elapsedMs/1000)} giây`;pilotSite.configuration=JSON.parse(await fs.readFile('config/web-sources/news/antt.vn.json','utf8'));pilotSite.configuration.articleParseVerified=true;pilotSite.configuration.discoveredRoundResolved=pilot.resolvedAllDiscovered;pilotSite.configuration.productionSlaVerified=false;}
await save(path.join(root,'site-readiness.json'),sites);
await save(path.join(root,'site-configurations.json'),Object.fromEntries(sites.map(s=>[s.domain,{...s.configuration,domain:s.domain,channel:s.channel,stage:s.stage,enabled:false}])));
const line=r=>[r.domain,r.category,r.currentLiveStatus,r.stage,r.configuration.legacyConfigFile||'',r.masterSiteNames.join(' | '),r.configuration.homepage||'',r.configuration.findNewsUrl||'',r.parseStatus].map(x=>String(x).replace(/[\t\r\n]+/g,' ')).join('\t');
const head='Domain\tNhóm\tTrạng thái live\tTrạng thái parser\tConfig cũ\tsiteName master\tHomepage\tFeed URL\tGhi chú\n';
await fs.writeFile(path.join(root,'site-readiness.txt'),head+sites.map(line).join('\n')+'\n');
await fs.writeFile(path.join(root,'forum-readiness.txt'),head+sites.filter(s=>s.channel==='forum').map(line).join('\n')+'\n');
await fs.writeFile(path.join(root,'news-readiness.txt'),head+sites.filter(s=>s.channel==='news').map(line).join('\n')+'\n');
await save(path.join(root,'supplemental-news-candidates.json'),sites.filter(s=>s.supplemental&&s.channel==='news'));
await save(path.join(root,'supplemental-forum-candidates.json'),sites.filter(s=>s.supplemental&&s.channel==='forum'));
const summary={generatedAt:new Date().toISOString(),mode:'RESEARCH_AND_LOCAL_PILOT_ONLY',eastdataExecuted:false,es5Written:false,nodeVersion:process.version,siteConfigurations:sites.length,supplementalNewsCandidates:sites.filter(s=>s.supplemental&&s.channel==='news').length,supplementalForumCandidates:sites.filter(s=>s.supplemental&&s.channel==='forum').length,newsPilotSites:1,pilot,identityReconciliation:{masterUrlsMatched:groups.size,legacyIdsVerified:masterCompat.matchingLegacyIds,creates,updates,held,existingCountersAndInsertedDatePreserved:true},forum:{checked:reviewed.length,feedVerified:reviewed.filter(r=>r.feedVerified).length,sampleParseVerified:reviewed.filter(r=>r.articleParseVerified).length,feedAndSampleParseVerified:reviewed.filter(r=>r.feedVerified&&r.articleParseVerified).length,statuses:reviewed.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{})},remainingNewsArticleParsersNotVerified:sites.filter(s=>s.channel==='news'&&s.domain!=='antt.vn'&&s.category!=='Khác').length,allSite15MinuteSlaVerified:false};
await save(path.join(root,'research-summary.json'),summary);console.log(JSON.stringify(summary,null,2));
