import {userConfirmedOriginalDayProof,publicationOutsideWindow} from '../web/newsUserConfirmedDayPrecision.mjs';
import {hasNativePublicationTimezone} from '../web/newsTimezoneEvidence.mjs';
import {createNewsResearchTransport} from '../web/newsResearchTransport.mjs';
import {publicationHistoryUnconfirmed} from '../web/newsOriginalPublicationContract.mjs';
import {discoverNewsLinks} from '../web/configurableNewsParser.mjs';
import {parsePublicPublicationFeed} from '../web/newsDateContext.mjs';
import {publicationFeedDiscovery} from '../web/newsPublicationListing.mjs';
import {originalSkydoorUrl,verifiedLandingPublisherUrl,verifiedCanonicalPublisherUrl} from '../web/newsPublisherDispatch.mjs';
import {verifyNewsFields} from '../web/newsFieldVerification.mjs';
import {classifyNewsDocument} from '../web/newsDocumentKind.mjs';
import {articleKey,requestKey,requestUrl,nativeKey,toEs5News} from './identity.mjs';
import {newsArticleRejection} from '../web/newsArticleAdmission.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
const fail=code=>Object.assign(new Error(code),{code});
export class NewsProcessor{
 constructor({state,driver,registry,parsers,seedDiscovery=null,maxAgeHours=24,expand=true,admitRelated=process.env.NEWS_ARTICLE_DISCOVERY_PAUSED!=='1',onArticle=()=>{},onBaomoiOriginal=null}){Object.assign(this,{state,driver,registry,parsers,seedDiscovery,maxAgeHours,expand,admitRelated,onArticle,onBaomoiOriginal});this.seedKeyCache=new WeakMap();state.configureSites(registry.sources.values());}
 transport(task,source){return createNewsResearchTransport({baomoiConfig:source.config.siteName==='baomoi.com'?source.config:null,nativePublicationAdapter:task.role==='seed'?null:source.config.nativePublicationAdapter,publicationFeedUrl:source.config.publishedDate?.strategy==='public_feed'?source.config.publishedDate.feedUrl:null,fullPublicationFeed:source.config.nativePublicationAdapter==='owned_wordpress_full_rss',recalledPublicationArticle:(feed,url)=>this.state.recalledPublicationArticle?.(feed,url),rememberFullPublicationFeed:context=>this.state.rememberFullPublicationFeed?.(context),baseTransport:this.driver.forCycle(task.cycle,source.config,{reviewFailed:task.reason==='manual_refresh',taskRole:task.role,...(this.expand?{pagePreparation:{domain:source.domain,seeds:source.seeds,config:source.config,article:task.role==='article',discoverArticles:task.role!=='article'||this.admitRelated,retainReviewSample:!(this.state.skipSeedReviewSamples&&task.role==='seed'),maxAgeHours:this.maxAgeHours,freshness:true,legacy:{legacyArticlePattern:source.config.discovery?.legacyArticlePattern}}}:{})}),persistEvidence:false,taskRole:task.role});}
 prepared(page,owner,article){const p=page.prepared;return p&&p.html===page.html&&p.url===(page.finalUrl||page.requestedUrl)&&p.domain===owner.domain&&p.article===article?p.result:null;}
 links(task,html,url,source,priority,discovered=null){
  if(!this.expand||task.role==='article'&&!this.admitRelated)return 0;
  let cached=this.seedKeyCache.get(source);if(!cached||cached.seeds!==source.seeds){const articles=new Set((source.config.validation?.sampleUrls||[]).map(articleKey));cached={seeds:source.seeds,keys:new Set(source.seeds.map(articleKey).filter(k=>!articles.has(k)))};this.seedKeyCache.set(source,cached);}const known=cached.keys,found=discovered||discoverNewsLinks(html,url,{domain:source.domain,allowedHosts:source.config.allowedHosts,knownArticleUrls:source.config.validation?.sampleUrls,knownCategoryUrls:source.seeds,legacy:{legacyArticlePattern:source.config.discovery?.legacyArticlePattern}});
  const urls=found.articles.filter(link=>!known.has(articleKey(link.url))).map(link=>({url:requestUrl(link.url),publishedHint:link.publishedHint}));const write=()=>{const key=task.cycle+'|'+task.url,before=this.state.linkStats?.get(key)?.added||0;if(task.role==='seed'&&found.categories?.length)this.state.rememberCategoryHints?.(source,found.categories,url);this.state.enqueueBatch(task.cycle,urls,source.domain,'article',task.url,priority);return (this.state.linkStats?.get(key)?.added||0)-before;};const record=added=>{const totals=this.state.discoveryByRole??={};const stats=totals[task.role]??={pages:0,newLinks:0};stats.pages++;stats.newLinks+=added;return urls.length;};if(this.state.writeBatch)return this.state.writeAsync(write).then(record);return record(write());
 }
 async context(config,transport,url){const feed=[config.publishedDate,...(config.variants||[]).map(v=>v.publishedDate)].find(d=>d?.strategy==='public_feed')?.feedUrl;if(!feed)return {};const f=await transport.get(feed,null,'publication-feed',{reviewFailed:true,taskRole:'publication_feed'});if(f.error||!f.html)return {...this.state.recalledPublicationFeed?.(feed,url),publicationFeedUnavailable:true};const context=parsePublicPublicationFeed(f.html,f.finalUrl||feed);if(this.state.rememberPublicationFeed&&requestKey(context.feedUrl)===requestKey(feed)){await this.state.rememberPublicationFeed(context);return this.state.recalledPublicationFeed(feed,url);}return context;}
 finishTask(task,status,reason,options={}){return this.state.writeBatch?this.state.finishWrite(task,status,reason,options):this.state.finish(task,status,reason,options);}
 hold(task,reason,details={}){if(reason.includes('NEWS_HTTP_REQUEST_BUDGET')||reason==='NEWS_ORIGIN_COOLDOWN')return this.finishTask(task,'pending',reason==='NEWS_ORIGIN_COOLDOWN'?'waiting_for_site_cooldown':'request_budget');const evidence=this.state.retain(task.cycle,task.url);const record={cycle:task.cycle,url:task.url,site:task.site,reason,evidence,...details};if(this.state.writeBatch)return this.state.completeHeldWrite(task,reason,record);if(this.state.completeHeld)return this.state.completeHeld(task,reason,record);this.state.event('quarantine',record);this.state.finish(task,'held',reason);}
 taskEvent(task,kind,details){if(this.state.recordTaskEvent)this.state.recordTaskEvent(task,kind,details);else this.state.event(kind,details);}
 async process(task){
  const source=this.registry.sources.get(task.site);if(!source)return this.hold(task,'SOURCE_CONFIG_MISSING');
  if(task.role==='article'&&publicationHistoryUnconfirmed(task.url,source.config))return this.hold(task,'NEWS_ORIGINAL_PUBLICATION_HISTORY_UNCONFIRMED');
  if(task.role==='article'){const rejection=newsArticleRejection(task.url,source);if(rejection)return this.finishTask(task,'done','non_article:'+rejection,{sample:null});}
  let transport=this.transport(task,source),page=await transport.get(task.url,null,'page');
  if(task.role==='article'&&source.domain==='baomoi.com'&&this.onBaomoiOriginal)await this.onBaomoiOriginal(task,page,transport);
  if(page.error||!page.html)return this.hold(task,page.error||'EMPTY_NEWS_HTML');
  if(task.role==='article'&&source.config.sourceAlias&&source.config.canonicalPublisherHost){
   const target=verifiedCanonicalPublisherUrl(page.html,task.url,source.config.canonicalPublisherHost),publisher=target&&this.registry.byHost(new URL(target).hostname);
   if(!publisher||publisher.config.siteName!==source.config.siteName)return this.hold(task,'DECLARED_CANONICAL_PUBLISHER_UNCONFIRMED');
   transport=this.transport(task,publisher);page=await transport.get(target,null,'canonical-publisher');
   if(page.error||!page.html)return this.hold(task,page.error||'DECLARED_CANONICAL_PUBLISHER_UNAVAILABLE');
  }
  if(task.role==='seed'&&source.config.seedPublisherTarget){
   const target=verifiedLandingPublisherUrl(page.html,task.url,source.config.seedPublisherTarget),publisher=target&&this.registry.byHost(new URL(target).hostname);
   if(!publisher||!source.config.sourceAlias||publisher.config.siteName!==source.config.siteName)return this.hold(task,'DECLARED_SEED_PUBLISHER_UNCONFIRMED');
   transport=this.transport(task,publisher);page=await transport.get(target,null,'declared-publisher-seed');
   if(page.error||!page.html)return this.hold(task,page.error||'DECLARED_SEED_PUBLISHER_UNAVAILABLE');
  }
  let owner=source,url=task.url;const aliases=[task.url,page.finalUrl||task.url];
  const finalOwner=this.registry.byUrl?this.registry.byUrl(page.finalUrl||url):this.registry.byHost(new URL(page.finalUrl||url).hostname);
  if(finalOwner&&finalOwner.domain!==source.domain){
   const dispatchedOriginal=source.config.parserType==='publisher_dispatch'&&originalSkydoorUrl(page.html,task.url,page.finalUrl)===page.finalUrl;
   const approved=dispatchedOriginal||source.config.sourceAlias&&(source.config.siteName===finalOwner.config.siteName||source.config.registrableDomain===finalOwner.config.registrableDomain);
   if(!approved)return this.hold(task,'UNAPPROVED_CROSS_PUBLISHER_REDIRECT');owner=finalOwner;url=page.finalUrl;transport=this.transport(task,owner);
  }else if(!finalOwner)return this.hold(task,'FINAL_PUBLISHER_NOT_CONFIGURED');
  if(task.role==='article'&&page.finalUrl&&page.finalUrl!==url){
   const originalNative=nativeKey(url,owner.config),redirectNative=nativeKey(page.finalUrl,owner.config);
   if(originalNative&&originalNative===redirectNative)url=requestUrl(page.finalUrl);
  }
  if(task.role==='article'){const rejection=newsArticleRejection(page.finalUrl||url,owner);if(rejection)return this.finishTask(task,'done','non_article:'+rejection,{sample:null});}
  if(task.role==='seed'){
   if(page.publicationContext&&this.state.rememberPublicationFeed)await this.state.rememberPublicationFeed(page.publicationContext);
   if(page.publicationFeedXml&&this.state.rememberFullPublicationFeed)await this.state.rememberFullPublicationFeed({xml:page.publicationFeedXml,feedUrl:page.publicationContext.feedUrl});
   const found=publicationFeedDiscovery(page)||this.prepared(page,owner,false)||(this.expand&&this.seedDiscovery?await this.seedDiscovery.run({html:page.html,url:page.finalUrl||url,domain:owner.domain,seeds:owner.seeds,config:owner.config,freshness:true,legacy:{legacyArticlePattern:owner.config.discovery?.legacyArticlePattern}}):null);
   if(found?.error)throw fail(found.error);const links=await this.links(task,page.html,page.finalUrl||url,owner,80,found);const record={cycle:task.cycle,url:task.url,site:task.site,links,normalization:page.normalization,finalUrl:page.finalUrl||url,seedWorkerMs:found?.elapsedMs},reason=links?'links_found':'no_article_links';if(this.state.writeBatch)await this.state.completeSeedWrite(task,reason,record);else if(this.state.completeSeed)this.state.completeSeed(task,reason,record);else{this.state.event('seed',record);this.finishTask(task,'done',reason);}return;
  }
  if(owner.config.parserType==='publisher_dispatch'){
   await this.links(task,page.html,page.finalUrl||url,owner,50);
   const original=originalSkydoorUrl(page.html,url,page.finalUrl),publisher=original&&this.registry.byHost(new URL(original).hostname);
   if(!publisher)return this.hold(task,'ORIGINAL_PUBLISHER_NOT_CONFIGURED');
   const rejection=newsArticleRejection(original,publisher);if(rejection)return this.finishTask(task,'done','non_article:'+rejection,{sample:null});
   owner=publisher;url=original;aliases.push(original);transport=this.transport(task,owner);page=await transport.get(original,null,'publisher');
   if(page.error||!page.html)return this.hold(task,page.error||'ORIGINAL_PUBLISHER_UNAVAILABLE');
   const finalRejection=newsArticleRejection(page.finalUrl||original,owner);if(finalRejection)return this.finishTask(task,'done','non_article:'+finalRejection,{sample:null});
   const hostOwner=this.registry.byHost(new URL(page.finalUrl||original).hostname);if(hostOwner?.domain!==owner.domain)return this.hold(task,'UNAPPROVED_ORIGINAL_PUBLISHER_REDIRECT');
   aliases.push(page.finalUrl||original);
  }
  // Persist discoveries before a feed lookup, parser failure, field verification or ES write can delay them.
  let earlyExpanded=false,publication=null;const articleStarted=Date.now();
  if(this.expand){
   const input={html:page.html,url:page.finalUrl||url,domain:owner.domain,seeds:owner.seeds,config:owner.config,maxAgeHours:this.maxAgeHours,freshness:true,legacy:{legacyArticlePattern:owner.config.discovery?.legacyArticlePattern},article:true,discoverArticles:this.admitRelated};
   const found=this.prepared(page,owner,true)||(this.seedDiscovery?await this.seedDiscovery.run(input):{kind:classifyNewsDocument(input.html,input.url,input.domain)});
   if(found.error)throw fail(found.error);
   if(found.kind?.skip&&!found.policyConflict){await this.finishTask(task,'done','non_article:'+found.kind.kind,{sample:null});return;}
   publication=found.publication;
   if(!found.kind?.skip){if(this.admitRelated){const links=await this.links(task,page.html,input.url,owner,50,found.articles?found:null);this.taskEvent(task,'article_links',{cycle:task.cycle,url:task.url,site:owner.domain,links,beforeParsing:true});}earlyExpanded=true;}
  }
  if(publication?.outsideWindow&&earlyExpanded){this.state.event('article_fast_expired',{cycle:task.cycle,url:task.url,site:owner.domain,...publication,afterHttpMs:Date.now()-articleStarted});await this.finishTask(task,'done','outside_new_article_window_fast');return;}
  const discoveryAfterHttpMs=Date.now()-articleStarted,contextStarted=Date.now(),context=await this.context(owner.config,transport,url),contextMs=Date.now()-contextStarted,parseStarted=Date.now();
  const audit=await this.parsers.run({sample:{domain:owner.domain,url,html:page.html,kind:'article'},config:owner.config,context,learn:false});
  this.taskEvent(task,'article_parse',{cycle:task.cycle,url:task.url,site:owner.domain,preparationMs:page.htmlPreparationMs||0,discoveryAfterHttpMs,contextMs,parserRoundTripMs:Date.now()-parseStarted,parserQueueMs:audit.parserQueueMs,parserWorkerRoundTripMs:audit.parserWorkerRoundTripMs,parserWorkerExecutionMs:audit.workerExecutionMs});
  if(audit.kind?.skip&&!audit.policyConflict){await this.finishTask(task,'done','non_article:'+audit.kind.kind);return;}
  // Expand actual article candidates even when selectors need repair; never expand a detected category as a new seed.
  if(!earlyExpanded)await this.links(task,page.html,page.finalUrl||url,owner,50);
  if(audit.error||!audit.parsed)return this.hold(task,context.publicationFeedUnavailable&&audit.error?.includes('missing_published_date')?'NEWS_PUBLICATION_FEED_UNAVAILABLE':audit.error||'NEWS_PARSER_EMPTY');
  const parsed=audit.parsed,fields=audit.fields||verifyNewsFields(page.html,parsed),issues=[...(audit.quality||[]),...fields.issues];
  if(audit.policyConflict)issues.push({code:'NEWS_DOCUMENT_POLICY_CONFLICT'});
  if(owner.config.requiresTimezoneReviewBeforeWrite&&!userConfirmedOriginalDayProof(parsed.extracted.publicationProof)&&!hasNativePublicationTimezone(parsed,owner.config))issues.push({code:'NEWS_TIMEZONE_UNCONFIRMED'});
  if(owner.quality.sharedDescriptions?.includes(clean(parsed._source.description)))issues.push({code:'NEWS_GENERIC_DESCRIPTION'});
  if(owner.quality.sharedContentHashes?.includes(parsed.extracted.contentSha256))issues.push({code:'NEWS_REPEATED_PUBLISHER_CONTENT'});
  const canonical=new URL(parsed.extracted.canonicalUrl,url);if(this.registry.byHost(canonical.hostname)?.config.registrableDomain!==owner.config.registrableDomain)issues.push({code:'NEWS_CANONICAL_PUBLISHER_CONFLICT'});
  if(issues.length)return this.hold(task,'NEWS_FIELD_VERIFICATION_FAILED',{issues});
  if(audit.sectionHints?.length&&this.state.rememberCategoryHints)await (this.state.writeAsync?this.state.writeAsync(()=>this.state.rememberCategoryHints(owner,audit.sectionHints,url)):this.state.rememberCategoryHints(owner,audit.sectionHints,url));
  const doc=toEs5News(parsed,owner.config);
  if(parsed.extracted.verifiedCanonicalAlias&&this.registry.byHost(new URL(parsed.extracted.verifiedCanonicalAlias).hostname)?.domain===owner.domain)aliases.push(parsed.extracted.verifiedCanonicalAlias);
  if(publicationOutsideWindow(doc._source.publishedDate,this.maxAgeHours)){await this.finishTask(task,'done','outside_new_article_window');return;}
  // Keep identity URL exact; aliases are used only to reconcile existing documents.
  aliases.push(doc._source.url);if(articleKey(canonical.href)===articleKey(url))aliases.push(canonical.href);
  const metric={cycle:task.cycle,site:owner.domain,url:doc._source.url,id:doc._id,index:doc._index,publishedDate:doc._source.publishedDate,publicationEvidence:parsed.extracted.dateEvidence,publicationPrecision:parsed.extracted.datePrecision,publicationDateKind:parsed.extracted.publicationDateKind||'original',publicationDatePolicy:parsed.extracted.publicationDatePolicy||null,publicationClockDefaulted:parsed.extracted.publicationProof?.defaultedClock===true,timezone:parsed.extracted.dateTimezone,...(parsed.extracted.cnnLitePublicAccessProof?{publicAccessProof:parsed.extracted.cnnLitePublicAccessProof}:{}),...(doc._source.publishedDatePrecision==='day'?{}:{lagSeconds:Math.round((Date.now()-Date.parse(doc._source.publishedDate))/1000)})};
  const writeConfig={...owner.config,publicationProof:parsed.extracted.publicationProof,...(parsed.extracted.cnnLitePublicAccessProof?{publicAccessProof:parsed.extracted.cnnLitePublicAccessProof}:{}),...(parsed.extracted.descriptionOmissionProof?{descriptionOmissionProof:parsed.extracted.descriptionOmissionProof}:{})};
  if(this.state.writeBatch)await this.state.completeVerifiedWrite(task,doc,writeConfig,[...new Set(aliases)],metric);else if(this.state.completeVerified)this.state.completeVerified(task,doc,writeConfig,[...new Set(aliases)],metric);else{this.state.offer(doc,writeConfig,[...new Set(aliases)]);this.finishTask(task,'done','verified_outbox');this.state.event('verified',metric);}this.onArticle({doc,parsed,audit,fields,metric});
 }
}
