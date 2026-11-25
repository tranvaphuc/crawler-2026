import * as cheerio from 'cheerio';
const discovery='https://www.bing.com/news/search?q=site%3Amsn.com%2Fvi-vn%2Fnews&format=rss&count=50';
export function msnArticleIdentity(raw){try{const u=new URL(raw),m=u.pathname.match(/^\/(vi-vn)\/news\/.+\/ar-([A-Za-z0-9]+)\/?$/);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&['msn.com','www.msn.com'].includes(u.hostname)&&m?{locale:m[1],id:m[2]}:null;}catch{return null;}}
export function normalizeMsnPublicArticle(raw,url){
 const id=msnArticleIdentity(url);if(!id||raw?.id!==id.id||raw.locale!==id.locale||raw.type!=='article'||raw.renderingRestriction!==0||raw.subscriptionProductType!==0)return {error:'msn_public_article_identity_or_access_unconfirmed'};
 let source,canonical;try{source=new URL(raw.sourceHref);canonical=new URL(raw.seo?.canonicalUrl);}catch{return {error:'msn_original_publisher_unconfirmed'};}
 if(!/^https?:$/.test(source.protocol)||source.username||source.password||source.href!==canonical.href||raw.seo?.canonicalAuthority!=='provider'||['msn.com','www.msn.com'].includes(source.hostname)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)$/.test(raw.publishedDateTime||'')||typeof raw.body!=='string'||cheerio.load(raw.body).text().trim().length<200)return {error:'msn_original_publisher_or_public_body_unconfirmed'};
 // MSN is a discovery source. The ordinary dispatcher fetches and verifies the
 // canonical publisher itself; no MSN copy is written as an original article.
 const $=cheerio.load('<html><head></head><body><h1></h1><a data-msn-original-publisher></a></body></html>');$('h1').text(raw.title||'');$('a').attr('href',source.href).text('Original publisher');$('head').append($('<meta>').attr({name:'crawler:msn-native-id',content:id.id}));return {html:$.html(),originalPublisherUrl:source.href,nativeId:id.id};
}
export function normalizeMsnDiscoveryFeed(xml){
 const $=cheerio.load(xml,{xmlMode:true}),out=cheerio.load('<html><head><title>Public discovery of MSN articles</title></head><body><main></main></body></html>'),seen=new Set();
 $('item').each((i,e)=>{try{let u=new URL($(e).children('link').text().trim());if(['www.bing.com','bing.com'].includes(u.hostname)&&u.pathname==='/news/apiclick.aspx')u=new URL(u.searchParams.get('url'));const id=msnArticleIdentity(u.href);if(!id||seen.has(id.id))return;u.search='';u.hash='';seen.add(id.id);out('main').append(out('<a>').attr('href',u.href).text($(e).children('title').text()));}catch{}});
 return seen.size?{html:out.html(),articleLinks:seen.size,normalization:'public_search_msn_discovery',discoveryEvidenceUrl:discovery}:{error:'msn_public_discovery_empty'};
}
export async function fetchMsnPublicPage(url,fetch){
 const u=new URL(url);if(!['msn.com','www.msn.com'].includes(u.hostname))return null;
 const id=msnArticleIdentity(url),home=/^\/vi-vn(?:\/news)?\/?$/.test(u.pathname);if(!id&&!home)return null;
 const api=id?'https://assets.msn.com/content/view/v2/Detail/'+id.locale+'/'+id.id:discovery;
 const p=await fetch(api,{reviewFailed:true,taskRole:'publisher_dependency'});if(p.error||!p.html)return {requestedUrl:url,finalUrl:url,error:p.error||'msn_public_api_empty'};
 let normalized;if(id){let raw;try{raw=JSON.parse(p.html);}catch{return {requestedUrl:url,finalUrl:url,error:'msn_public_api_invalid_json'};}normalized=normalizeMsnPublicArticle(raw,url);}else normalized=normalizeMsnDiscoveryFeed(p.html);
 return {requestedUrl:url,finalUrl:url,statusCode:200,...normalized,error:normalized.error||null,method:'HTTP/axios+public-discovery-and-original-publisher',sourceApiUrl:api};
}
