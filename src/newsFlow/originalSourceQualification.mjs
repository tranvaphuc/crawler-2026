import {learnNewsConfig,discoverNewsLinks} from '../web/configurableNewsParser.mjs';
import {isDeclaredForumHtml,qualifyNewsSourceSamples} from './sourceQualification.mjs';
import {originalHost} from './baomoiOriginalBranch.mjs';
import {toEs5News,articleKey} from './identity.mjs';
import {hasNativePublicationTimezone} from '../web/newsTimezoneEvidence.mjs';

// Deterministic learning only. The frozen parser must pass two further pages
// using the same field, original-clock and publication-proof gates as imports.
export async function qualifyOriginalSource({host,urls,get,parsers,registry}){
 if(originalHost('https://'+host)!==host)throw Error('INVALID_ORIGINAL_SOURCE_HOST');
 if(registry.byHost(host))return {approved:false,reason:'already_configured'};
 const base={schemaVersion:1,siteName:host,siteId:host,registrableDomain:host,homepage:'https://'+host+'/',allowedHosts:[host,'www.'+host],identityEncoding:'latin1',timezone:'Asia/Ho_Chi_Minh',requiresTimezoneReviewBeforeWrite:true,publicationValidationPolicy:'strict_native_publication_v1',publicationTimePolicy:'original_clock_required',publicationDatePolicy:'original_only',enabled:true,discovery:{homepage:'https://'+host+'/',categories:[]}};
 const report={host,checkedAt:new Date().toISOString(),pages:[],articles:[],paidAiCalls:0};let config=null,listingLinks=0;
 const candidates=new Map();const add=url=>{if(originalHost(url)===host)candidates.set(articleKey(url),url);};urls.forEach(add);
 async function fetch(url){const p=await get(url,base);report.pages.push({url,finalUrl:p.finalUrl,statusCode:p.statusCode,error:p.error||null});if(originalHost(p.finalUrl||url)!==host)return {...p,error:'cross_publisher_redirect'};if(p.html&&isDeclaredForumHtml(p.html))return {...p,error:'declared_forum'};return p;}
 const home=await fetch(base.homepage);
 if(!home.error&&home.html){base.homepage=base.discovery.homepage=home.finalUrl||base.homepage;const found=discoverNewsLinks(home.html,base.homepage,{domain:host,allowedHosts:base.allowedHosts,legacy:{}});listingLinks=found.articles.length;found.articles.forEach(a=>add(a.url));}
 if(home.error==='declared_forum')return {approved:false,report,reason:'declared_forum'};
 for(const url of [...candidates.values()].slice(0,9)){
  const p=await fetch(url);if(p.error||!p.html){report.articles.push({url,state:'transport_unconfirmed',error:p.error||'empty_html'});if(p.error==='declared_forum')return {approved:false,report,reason:'declared_forum'};continue;}
  const independent=!!config;
  if(!config){const learned=learnNewsConfig(p.html,url,{domain:host,url:base.homepage,registrableDomain:host,timezone:base.timezone,legacy:{}},{});if(learned.config)config={...learned.config,...base};}
  if(!config){report.articles.push({url,state:'extraction_unconfirmed',error:'parser_configuration_missing'});continue;}
  const audit=await parsers.run({sample:{domain:host,url,html:p.html,kind:'article'},config,learn:false});
  const issues=[...audit.quality||[],...audit.fields?.issues||[]];let error=audit.error||null;
  if(audit.policyConflict)issues.push({code:'NEWS_DOCUMENT_POLICY_CONFLICT'});
  if(!error&&audit.parsed){
   if(!hasNativePublicationTimezone(audit.parsed,config))issues.push({code:'NEWS_TIMEZONE_UNCONFIRMED'});
   try{if(originalHost(new URL(audit.parsed.extracted.canonicalUrl,url).href)!==host)throw Error('NEWS_CANONICAL_PUBLISHER_CONFLICT');toEs5News(audit.parsed,config);}catch(e){error=e.code||e.message;}
  }else if(!error)error='missing_parsed_article';
  report.articles.push({url,independent,state:error||issues.length?'extraction_unconfirmed':'parsed',error,issues,title:audit.parsed?._source?.title,description:audit.parsed?._source?.description,contentHash:audit.parsed?.extracted?.contentSha256,publishedDate:audit.parsed?._source?.publishedDate});
  if(!independent&&(error||issues.length))config=null;
  if(qualifyNewsSourceSamples(report.articles,{listingLinks}).approved)break;
 }
 report.qualification=qualifyNewsSourceSamples(report.articles,{listingLinks});
 if(report.qualification.approved){config.stage='baomoi_original_independent_http_verified';config.parserCurrentAudit={checkedAt:report.checkedAt,trainingUrl:report.articles.find(a=>a.state==='parsed')?.url,independentHoldouts:report.qualification.holdouts,paidAiCalls:0};config.validation={sampleUrls:report.articles.filter(a=>a.state==='parsed').map(a=>a.url),fullSiteCycleVerified:false};}
 return {approved:report.qualification.approved,config:report.qualification.approved?config:null,report};
}
