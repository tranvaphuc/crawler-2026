import * as cheerio from 'cheerio';
import {isExcludedSource} from './sourceExclusions.mjs';

function baomoiId(raw,base){try{const u=new URL(raw,base);if(!/^https?:$/.test(u.protocol)||u.hostname.replace(/^www\./,'')!=='baomoi.com'||u.username||u.password)return null;return u.pathname.match(/(?:^\/[cr]|-[cr]|\/c\/)(\d+)\.epi$/)?.[1]||null;}catch{return null;}}
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();

// Read only the current article object, never publisher homepages or related cards.
export function extractBaomoiOriginalLink(html,url){
 const id=baomoiId(url);if(!id||!html?.includes('__NEXT_DATA__'))return {ok:false,reason:'not_a_baomoi_article'};
 const $=cheerio.load(html),script=$('script#__NEXT_DATA__[type="application/json"]');if(script.length!==1)return {ok:false,reason:'native_state_missing_or_ambiguous'};
 let response;try{response=JSON.parse(script.text()).props.pageProps.resp;}catch{return {ok:false,reason:'invalid_native_state'};}
 const data=response?.data,c=data?.content;
 if(response?.err!==0||!['contentdetail','contentdetailredirect'].includes(data?.page)||String(c?.id)!==id||String(c?.contentId)!==id||baomoiId(c?.url,url)!==id||baomoiId(data.head?.meta?.canonicalUrl,url)!==id||!clean(c.title)||clean(data.head?.meta?.ogTitle)!==clean(c.title))return {ok:false,reason:'article_identity_not_confirmed'};
 const own=(data.head?.jsonLd||[]).filter(a=>a['@type']==='NewsArticle'&&baomoiId(a.mainEntityOfPage?.['@id']||a.url,url)===id&&clean(a.headline)===clean(c.title));if(own.length!==1)return {ok:false,reason:'article_schema_not_confirmed'};
 let original;try{original=new URL(c.originalUrl);}catch{return {ok:false,reason:'original_article_url_missing'};}
 if(!/^https?:$/.test(original.protocol)||original.username||original.password||original.port||!original.hostname.includes('.')||/^(?:\d+\.){3}\d+$/.test(original.hostname)||original.hostname.endsWith('.local')||original.hostname.replace(/^www\./,'')==='baomoi.com')return {ok:false,reason:'invalid_original_article_url'};
 if(isExcludedSource(original.href))return {ok:false,reason:'excluded_original_source'};
 return {ok:true,baomoiUrl:url,articleId:id,title:clean(c.title),originalUrl:original.href,publisher:clean(c.publisher?.name||own[0].author?.name),evidencePath:'__NEXT_DATA__.props.pageProps.resp.data.content.originalUrl',pageKind:data.page};
}

export async function resolveBaomoiOriginalLink(url,get){
 const page=await get(url),direct=page.html?extractBaomoiOriginalLink(page.html,url):{ok:false,reason:page.error||'missing_html'};
 if(direct.ok)return {...direct,evidenceUrl:page.finalUrl||url,viaRedirectPage:false};
 const id=baomoiId(url);if(!id)return direct;
 const path=new URL(url).pathname,redirectUrl=/-c\d+\.epi$/.test(path)?url.replace(/-c(\d+)\.epi(?=[?#]|$)/,'-r$1.epi'):null;
 if(!redirectUrl)return direct;
 const redirect=await get(redirectUrl),result=redirect.html?extractBaomoiOriginalLink(redirect.html,url):{ok:false,reason:redirect.error||'missing_redirect_html'};
 return result.ok?{...result,evidenceUrl:redirect.finalUrl||redirectUrl,viaRedirectPage:true}:{...direct,redirectReason:result.reason};
}
