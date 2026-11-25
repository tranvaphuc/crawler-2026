import fs from 'node:fs/promises';import path from 'node:path';
import {isExcludedSource} from '../web/sourceExclusions.mjs';
import {requestKey,requestUrl} from './identity.mjs';
import {userConfirmedPublicationTimezone} from '../web/newsUserConfirmedTimezone.mjs';
import {userConfirmedMidnight} from '../web/newsUserConfirmedMidnight.mjs';
export async function loadNewsRegistry({directory='config/web-sources/news',qualityFile='config/web-sources/news-flow-quality.json'}={}){
 const sources=new Map();let quality={};try{quality=JSON.parse(await fs.readFile(qualityFile,'utf8')).sites;}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const file of (await fs.readdir(directory)).sort()){
  if(!file.endsWith('.json')||file==='antt.vn.json')continue;
  const config=JSON.parse(await fs.readFile(path.join(directory,file),'utf8')),domain=file.replace(/\.validated(?=\.json$)/,'').replace(/\.json$/,'');
  const sourceAddresses=[domain,config.siteName,config.siteId,config.registrableDomain,config.homepage,
    config.discovery?.homepage,...config.allowedHosts||[],...config.httpDependencyHosts||[],
    ...(config.discovery?.categories||[]).map(category=>typeof category==='string'?category:category.url)];
  if(sourceAddresses.some(isExcludedSource))continue;
  if(sources.has(domain))throw Error('DUPLICATE_NEWS_SOURCE');
  config.publicationValidationPolicy='strict_native_publication_v1';config.publicationTimePolicy=userConfirmedMidnight(config)||userConfirmedPublicationTimezone(config,'https://'+domain+'/')||domain==='suckhoecong.vn'&&config.publicationTimePolicy==='user_confirmed_suckhoecong_utc_plus_7'&&config.timezone==='Asia/Ho_Chi_Minh'&&config.timezoneProvenance?.authority==='explicit_user_confirmation'&&config.timezoneProvenance?.scope===domain?config.publicationTimePolicy:'original_clock_required';config.publicationDatePolicy='original_only';
  const homepage=config.discovery?.homepage||config.homepage||'https://'+domain+'/';
  const seedUrls=new Map();for(const v of [homepage,...config.discovery?.categories||[]]){const url=requestUrl(typeof v==='string'?v:v.url),key=requestKey(url);if(!seedUrls.has(key))seedUrls.set(key,url);}const seeds=[...seedUrls.values()];
  sources.set(domain,{domain,config,seeds,publicationQuarantine:config.originalPublicationBlockedReason||null,publicationHistoryQuarantine:config.originalPublicationUncertainUrls||[],quality:quality?.[domain]||{},directory:path.resolve(directory)});
 }
 const byHost=host=>{if(isExcludedSource(host))return undefined;host=host.toLowerCase().replace(/^www\./,'');return sources.get(host)||[...sources.values()].find(s=>(s.config.allowedHosts||[]).some(h=>h.replace(/^www\./,'')===host));};
 const scopes=[];
 for(const source of sources.values())for(const scope of source.config.publisherUrlScopes||[]){
  const host=String(scope.host||'').toLowerCase().replace(/^www\./,''),prefix=scope.pathPrefix;
  if(!host||!(source.config.allowedHosts||[]).some(h=>h.replace(/^www\./,'')===host)||typeof prefix!=='string'||!prefix.startsWith('/')||!prefix.endsWith('/')||prefix==='/'||/[?#\\]/.test(prefix))throw Error('INVALID_NEWS_PUBLISHER_URL_SCOPE');
  if(scopes.some(s=>s.host===host&&s.prefix===prefix))throw Error('DUPLICATE_NEWS_PUBLISHER_URL_SCOPE');
  scopes.push({host,prefix,source});
 }
 scopes.sort((a,b)=>b.prefix.length-a.prefix.length);
 const byUrl=url=>{try{const u=new URL(url);if(!/^https?:$/.test(u.protocol))return undefined;const host=u.hostname.toLowerCase().replace(/^www\./,'');return scopes.find(s=>s.host===host&&u.pathname.startsWith(s.prefix))?.source||byHost(host);}catch{return undefined;}};
 const allowedDomains=[...new Set([...sources.values()].flatMap(s=>[s.domain,s.config.registrableDomain,...s.config.allowedHosts||[],...s.config.httpDependencyHosts||[]]).filter(Boolean))];
 const register=config=>{
  const domain=String(config.siteName||'').toLowerCase().replace(/^www\./,'');
  if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)||domain.endsWith('.')||config.publisherUrlScopes?.length||config.sourceAlias||config.parserType==='publisher_dispatch')throw Error('INVALID_DYNAMIC_NEWS_SOURCE');
  const addresses=[domain,config.siteId,config.registrableDomain,config.homepage,config.discovery?.homepage,...config.allowedHosts||[],...config.httpDependencyHosts||[],...(config.discovery?.categories||[]).map(v=>typeof v==='string'?v:v.url)];
  if(addresses.some(isExcludedSource))throw Error('EXCLUDED_DYNAMIC_NEWS_SOURCE');
  const existing=byHost(domain);if(existing)return existing;
  for(const host of config.allowedHosts||[])if(byHost(host))throw Error('DYNAMIC_NEWS_HOST_ALREADY_OWNED');
  config={...config,publicationValidationPolicy:'strict_native_publication_v1',publicationTimePolicy:userConfirmedPublicationTimezone(config,'https://'+domain+'/')?config.publicationTimePolicy:'original_clock_required',publicationDatePolicy:'original_only',requiresTimezoneReviewBeforeWrite:true};
  const seeds=[...new Map([config.discovery?.homepage||config.homepage,...config.discovery?.categories||[]].filter(Boolean).map(v=>{const u=requestUrl(typeof v==='string'?v:v.url);return [requestKey(u),u];})).values()];
  const source={domain,config,seeds,quality:{},publicationQuarantine:config.originalPublicationBlockedReason||null,publicationHistoryQuarantine:[],directory:null};
  sources.set(domain,source);for(const h of [domain,config.registrableDomain,...config.allowedHosts||[],...config.httpDependencyHosts||[]].filter(Boolean))if(!allowedDomains.includes(h))allowedDomains.push(h);
  return source;
 };
 return {sources,byHost,byUrl,allowedDomains,register};
}
