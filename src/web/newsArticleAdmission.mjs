import {classifyNewsLink} from './newsLinkPolicy.mjs';
const seedKeys=new WeakMap();
const key=raw=>{const u=new URL(raw);u.hash='';u.hostname=u.hostname.replace(/^www\./,'');u.pathname=u.pathname.replace(/\/$/,'')||'/';u.searchParams.sort();return u.host+u.pathname+'?'+u.searchParams;};

// URL-only rejection runs before any HTTP request, parser or AI review.
export function newsArticleRejection(url,site={}){
 if(typeof site==='string')site={domain:site};
 const domain=site.domain||site.config?.siteName||site.siteName;
 const decision=classifyNewsLink(url,domain);
 if(decision.kind!=='unknown')return decision.reason;
 const config=site.config||site;
 if(config.discovery?.requiredArticlePattern){try{if(!new RegExp(config.discovery.requiredArticlePattern,'i').test(url))return 'outside_configured_news_scope';}catch{return 'invalid_article_scope_pattern';}}
 const seeds=site.seeds||[config.homepage,config.discovery?.homepage,...config.discovery?.categories||[]];
 try{let cached=seedKeys.get(config);if(!cached||cached.seeds!==site.seeds){const articles=new Set((config.validation?.sampleUrls||[]).map(key));cached={seeds:site.seeds,keys:new Set(seeds.flatMap(s=>{try{const k=s&&key(typeof s==='string'?s:s.url);return k&&!articles.has(k)?[k]:[];}catch{return [];}}))};seedKeys.set(config,cached);}if(cached.keys.has(key(url)))return 'configured_seed_or_category';}catch{return 'invalid_url';}
 return null;
}
