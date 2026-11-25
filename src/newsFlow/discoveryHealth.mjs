import {newsArticleRejection} from '../web/newsArticleAdmission.mjs';
// Read-only coverage signals. HTTP success alone does not prove discovery works.
export function summarizeDiscoveryHealth(sources, seeds, articles, now=Date.now(),categoryCoverage=[],liveWaiting=[]) {
 const bySite=new Map(), counts={};
 for(const row of seeds){const list=bySite.get(row.site)||[];list.push(row);bySite.set(row.site,list);}
 const discovered=new Map(articles.map(r=>[r.site,r]));
 const coverageBySite=new Map(categoryCoverage.map(r=>[r.site,r]));
 const sites=[];
 for(const source of sources){
  const articleOwner=source.config?.sourceAlias&&source.config.siteName!==source.domain?source.config.siteName:source.domain,seedOwners=[...new Set([source.domain,articleOwner])];
  const rows=seedOwners.flatMap(site=>bySite.get(site)||[]),alerts=[];
  const active=rows.filter(r=>!['fail','die'].includes(r.status));
  const checked=active.filter(r=>r.status==='ok'&&r.last_at!=null), links=checked.reduce((n,r)=>n+Number(r.links||0),0);
  if(!rows.length)alerts.push('no_runtime_seeds');
  else if(!active.length)alerts.push('all_seeds_blocked');
  else if(active.every(r=>r.status==='timeout'))alerts.push('all_active_seeds_timeout');
  if(checked.length&&!links)alerts.push('successful_http_zero_article_links');
  const latest=Math.max(0,...rows.map(r=>Number(r.last_at)||0));
  if(latest&&now-latest>3600000)alerts.push('seed_not_checked_for_one_hour');
  const article=discovered.get(articleOwner);
  if(!Number(article?.n||0))alerts.push('no_discovered_articles');
  if(Number(article?.failed||0)>0&&!Number(article?.parsed||0))alerts.push('no_successful_parse_after_article_failures');
  if(source.config?.originalPublicationBlockedReason)alerts.push('publication_quarantine');
  const waiting=liveWaiting.find(r=>r.site===articleOwner);
  if(waiting?.n)alerts.push('live_articles_waiting_over_five_minutes');
  const coverage=seedOwners.map(site=>coverageBySite.get(site)).filter(Boolean).reduce((out,row)=>({pendingHints:out.pendingHints+Number(row.pendingHints||0),unconfirmedSections:out.unconfirmedSections+Number(row.unconfirmedSections||0),failedBackfill:out.failedBackfill+Number(row.failedBackfill||0)}),{pendingHints:0,unconfirmedSections:0,failedBackfill:0});
  if(coverage.pendingHints)alerts.push('new_sections_awaiting_verification');
  if(coverage.unconfirmedSections)alerts.push('unconfirmed_new_sections');
  if(coverage.failedBackfill)alerts.push('category_backfill_parse_failures');
  for(const a of alerts)counts[a]=(counts[a]||0)+1;
  if(alerts.length)sites.push({site:source.domain,articleOwner,seedOwners,alerts,seeds:rows.reduce((n,r)=>n+Number(r.n),0),lastCheckedAt:latest||null,...(waiting?.n?{liveWaiting:waiting}:{}),...(coverage.pendingHints||coverage.unconfirmedSections||coverage.failedBackfill?{categoryCoverage:coverage}:{})});
 }
 return {checkedAt:new Date(now).toISOString(),totalSites:sources.length,alertSites:sites.length,counts,sites};
}

export function collectDiscoveryHealth(db,sources,now=Date.now()) {
 const sourceList=[...sources],bySite=new Map(sourceList.map(s=>[s.domain,s]));
 const seeds=db.prepare('SELECT site,status,count(*) n,max(last_at) last_at,sum(links_found) links FROM seed_sources GROUP BY site,status').all();
 const articles=db.prepare("SELECT site,count(*) n,sum(parse_status='done') parsed,sum(parse_status='fail') failed FROM article_links GROUP BY site").all();
 const coverage=new Map(),add=(site,values)=>coverage.set(site,{...coverage.get(site),site,...values});
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_category_hints'").get())for(const r of db.prepare("SELECT site,sum(state='pending' AND first_at<?) pendingHints,sum(state='unconfirmed') unconfirmedSections FROM news_category_hints WHERE state!='verified' GROUP BY site").all(now-3600000))add(r.site,{pendingHints:r.pendingHints,unconfirmedSections:r.unconfirmedSections});
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_category_backfill'").get())for(const r of db.prepare("SELECT c.site,count(*) failedBackfill FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.parse_status='fail' GROUP BY c.site").all())add(r.site,{failedBackfill:r.failedBackfill});
 const waiting=new Map(),hasCohort=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_category_backfill'").get();
 const scope=hasCohort?' AND NOT EXISTS(SELECT 1 FROM news_category_backfill b WHERE b.parse_key=a.parse_key)':'';
 for(const row of db.prepare("SELECT a.site,a.url,a.first_at FROM article_links a WHERE a.parse_status IN ('pending','queued','running') AND a.first_at<?"+scope).iterate(now-300000)){
  const source=bySite.get(row.site);if(!source||source.config?.originalPublicationBlockedReason||newsArticleRejection(row.url,source))continue;
  const item=waiting.get(row.site)||{site:row.site,n:0,oldestFirstAt:row.first_at};item.n++;item.oldestFirstAt=Math.min(item.oldestFirstAt,row.first_at);waiting.set(row.site,item);
 }
 return summarizeDiscoveryHealth(sourceList,seeds,articles,now,[...coverage.values()],[...waiting.values()]);
}
