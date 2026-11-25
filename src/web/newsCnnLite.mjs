import * as cheerio from 'cheerio';
import {createHash} from 'node:crypto';
const clean=s=>String(s||'').normalize('NFC').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim();
const sha=s=>createHash('sha256').update(clean(s)).digest('hex');
const articlePath=/^\/20\d\d\/\d\d\/\d\d\/[a-z0-9/_-]+(?:\.html)?\/?$/i;
const mainHosts=new Set(['www.cnn.com','cnn.com','edition.cnn.com']);
const gate='.paywall-message,[data-paywall],.regwall,[class*="regwall"],form[action*="login"],form[action*="subscribe"]';
function target(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&mainHosts.has(u.hostname)&&articlePath.test(u.pathname)?u:null;}catch{return null;}}
function schemas($){const out=[];for(const e of $('script[type="application/ld+json"]').toArray())try{const v=JSON.parse($(e).text());for(const a of Array.isArray(v)?v:v['@graph']||[v])if(a['@type']==='NewsArticle')out.push(a);}catch{}return out;}
function inspect($,requested,transport){
 const u=target(requested);let wire;try{wire=new URL(transport);}catch{return null;}
 if(!u||wire.origin!=='https://lite.cnn.com'||wire.pathname!==u.pathname||wire.search||wire.hash||wire.username||wire.password)return null;
 if($('.header--lite a.title').length!==1||clean($('.header--lite a.title').text())!=='CNN'||$('.layout-article-elevate__lite').length!==1||$('article.article--lite').length!==1||$('h2.headline').length!==1||$(gate).length)return null;
 const canonical=$('head link[rel="canonical"]');if(canonical.length!==1)return null;
 let canonicalUrl;try{canonicalUrl=new URL(canonical.attr('href'));}catch{return null;}
 if(canonicalUrl.origin!=='https://www.cnn.com'||canonicalUrl.pathname!==u.pathname||canonicalUrl.search||canonicalUrl.hash||canonicalUrl.username||canonicalUrl.password)return null;
 const records=schemas($);if(records.length!==1)return null;const a=records[0],owner=a.url||a.mainEntityOfPage?.['@id']||a.mainEntityOfPage?.url;
 if(owner!==canonicalUrl.href||clean(a.headline)!==clean($('h2.headline').text())||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(a.datePublished||'')||!Number.isFinite(Date.parse(a.datePublished)))return null;
 // This is the full-site restriction scope, absent from the publisher's Lite layout.
 // Never authorize a different selector, an active gate, or a truncated Lite body.
 const parts=Array.isArray(a.hasPart)?a.hasPart:[a.hasPart];
 if(a.isAccessibleForFree!==false||parts.length!==1||parts[0]?.isAccessibleForFree!==false||parts[0]?.cssSelector!=='.article__content'||$('.article__content').length)return null;
 const full=$('a[href]').filter((i,e)=>$(e).attr('href')===canonicalUrl.href&&clean($(e).text())==='See Full Web Article');if(full.length!==1)return null;
 const body=$('article.article--lite').clone();body.find('.source--lite,script,style,nav,footer,form').remove();
 body.find('p').filter((i,e)=>$(e).find('a').toArray().some(a=>$(a).attr('href')===canonicalUrl.href&&clean($(a).text())==='See Full Web Article')).remove();
 const paragraphs=body.find('p.paragraph--lite').toArray().map(e=>clean($(e).text())).filter(Boolean),blocks=body.find('p.paragraph--lite,h3.subheader--lite').toArray().map(e=>clean($(e).text())).filter(Boolean),original=clean(a.articleBody);
 if(original.length<300||paragraphs.length<2||/subscribe to continue|sign in to continue|subscription required|unlock this article/i.test(body.text()))return null;
 let cursor=0,matched=0;for(const p of blocks){const pos=original.indexOf(p,cursor);if(pos<0)return null;cursor=pos+p.length;matched+=p.length;}
 const coverage=clean(body.text())===original?1:matched/original.length;
 if(coverage<0.97||coverage>1.01||clean(a.description).length<20||clean(a.description).length>2000)return null;
 const textBody=body.clone();textBody.find('p,div,li,figcaption,h2,h3,tr').each((i,e)=>$(e).append('\n'));
 return {article:a,canonicalUrl:canonicalUrl.href,body,proof:{kind:'cnn_lite_public_full_text_v1',requestedUrl:u.href,transportUrl:wire.href,canonicalUrl:canonicalUrl.href,headline:clean(a.headline),publishedDate:new Date(a.datePublished).toISOString(),bodySha256:sha(textBody.text()),nativeSchemaBodySha256:sha(original),nativeIsAccessibleForFree:false,unmatchedRestrictedSelector:'.article__content',paragraphs:paragraphs.length,schemaCoverage:coverage}};
}
export function normalizeCnnLiteArticle(html,url,transportUrl){
 const $=cheerio.load(html),v=inspect($,url,transportUrl);if(!v)return {error:'CNN_LITE_PUBLIC_BODY_NOT_VERIFIED'};
 const a=$('article.article--lite');a.find('.source--lite').remove();const full=a.find('p').filter((i,e)=>$(e).find('a').toArray().some(a=>$(a).attr('href')===v.canonicalUrl&&clean($(a).text())==='See Full Web Article'));full.insertAfter(a);a.addClass('article-content');
 $('head').append($('<meta>').attr({name:'crawler:cnn-lite-transport-url',content:transportUrl}),$('<meta>').attr({name:'crawler:cnn-lite-requested-url',content:url}));
 // Copy only the description of the URL-bound native article, retaining the original JSON-LD.
 $('meta[name="description"]').remove();$('head').append($('<meta>').attr({name:'description',content:v.article.description}));
 if(v.article.thumbnailUrl)$('head').append($('<meta>').attr({property:'og:image',content:v.article.thumbnailUrl}));
 return {html:$.html(),publicAccessProof:v.proof,normalization:'publisher_cnn_lite_public_full_text'};
}
export function cnnLitePublicAccessProof($,url,config){
 if(config.siteName!=='edition.cnn.com'||config.nativePublicationAdapter!=='cnn_public_lite')return null;
 const marker=$('head meta[name="crawler:cnn-lite-requested-url"]'),wire=$('head meta[name="crawler:cnn-lite-transport-url"]');
 if(marker.length!==1||wire.length!==1||marker.attr('content')!==url)return null;
 return inspect($,url,wire.attr('content'))?.proof||null;
}
export function cnnLitePublicAccessProofMatches(doc,proof){
 const u=target(doc?.url);if(!u||proof?.kind!=='cnn_lite_public_full_text_v1'||proof.requestedUrl!==u.href||!Number.isFinite(Date.parse(doc.publishedDate)))return false;
 return proof.transportUrl==='https://lite.cnn.com'+u.pathname&&proof.canonicalUrl==='https://www.cnn.com'+u.pathname&&proof.nativeIsAccessibleForFree===false&&proof.unmatchedRestrictedSelector==='.article__content'&&proof.schemaCoverage>=0.97&&proof.paragraphs>=2&&sha(doc.content)===proof.bodySha256&&clean(doc.title)===proof.headline&&new Date(doc.publishedDate).toISOString()===proof.publishedDate;
}
export async function fetchCnnLiteArticle(url,fetchPage){
 const u=target(url);if(!u)return null;const transportUrl='https://lite.cnn.com'+u.pathname,page=await fetchPage(transportUrl,{taskRole:'article'}),fail=error=>({...page,requestedUrl:url,sourceTransportUrl:transportUrl,error});
 if(page.error||!page.html)return fail(page.error||'CNN_LITE_EMPTY');if((page.finalUrl||transportUrl)!==transportUrl)return fail('CNN_LITE_UNEXPECTED_REDIRECT');
 const normalized=normalizeCnnLiteArticle(page.html,url,transportUrl);if(normalized.error)return fail(normalized.error);
 return {...page,...normalized,requestedUrl:url,finalUrl:url,sourceTransportUrl:transportUrl,error:null};
}
export function normalizeCnnLiteListing(html,url){
 if(url!=='https://lite.cnn.com/'&&url!=='https://lite.cnn.com/index.html')return null;
 const $=cheerio.load(html);if($('.header--lite a.title').length!==1||$('article.article--lite').length)return null;
 let links=0;for(const a of $('a[href]').toArray())try{const u=new URL($(a).attr('href'),url);if(u.origin==='https://lite.cnn.com'&&articlePath.test(u.pathname)&&!u.search&&!u.hash){$(a).attr('href','https://www.cnn.com'+u.pathname);links++;}}catch{}
 return links?{html:$.html(),normalization:'publisher_cnn_lite_listing',links}:null;
}
