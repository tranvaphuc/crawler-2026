import * as cheerio from 'cheerio';
const host=u=>u.hostname.replace(/^www\./,'');
const text=s=>cheerio.load(String(s||'')).text().replace(/\s+/g,' ').trim();
function document({url,title,body,description,date,id,author,picture,api,publicationUrl}){
 const $=cheerio.load('<html><head></head><body><article><h1></h1><div class="article-sapo"></div><div class="article-content"></div></article></body></html>');
 $('h1').text(text(title));$('.article-sapo').text(text(description));$('.article-content').html(body);
 for(const [name,content] of Object.entries({'description':text(description),'author':text(author),'crawler:native-id':String(id),'crawler:date-source':'public_publisher_original_publication','crawler:source-api':api}))$('head').append($('<meta>').attr({name,content}));
 $('head').append($('<link>').attr({rel:'canonical',href:url}),$('<meta>').attr({property:'article:published_time',content:String(date)}));if(picture)$('head').append($('<meta>').attr({property:'og:image',content:picture}));if(publicationUrl)$('head').append($('<script type="application/ld+json">').text(JSON.stringify({'@type':'NewsArticle',url:publicationUrl,headline:text(title),datePublished:String(date)}).replace(/</g,'\\u003c')));return {html:$.html(),nativeId:String(id)};
}
export function normalizeMofApiArticle(raw,url,api){
 const u=new URL(url),p=raw?.success&&raw.data,slug=decodeURIComponent(u.pathname).split('/').filter(Boolean).at(-1);
 if(host(u)!=='mof.gov.vn'||!p||p.slug!==slug||p.status!==6||p.articleType!==1||!p.id)return {error:'mof_public_article_identity_or_status_unconfirmed'};
 let body;try{body=JSON.parse(p.articleContent).Content;}catch{}
 if(typeof body!=='string'||text(body).length<200||!text(p.title)||!/^\d{4}-\d\d-\d\d(?:T| )\d\d:\d\d/.test(p.publicationTime||''))return {error:'mof_public_article_fields_unconfirmed'};
 let publicationUrl;const canonical=p.canonicalUrl||p.link||p.url;if(canonical){try{const c=new URL(canonical);if(c.hostname.replace(/^www\./,'')!==host(u)||c.pathname!==u.pathname||c.search!==u.search||c.username||c.password||!/^https?:$/.test(c.protocol))return {error:'mof_public_article_canonical_mismatch'};publicationUrl=c.href;}catch{return {error:'mof_public_article_canonical_invalid'};}}else if(typeof p.categorySlug==='string'&&p.categorySlug){const parts=[p.rootCategorySlug,p.categorySlug,p.slug].filter((x,i,a)=>typeof x==='string'&&x&&a.indexOf(x)===i),expected='/'+parts.map(encodeURIComponent).join('/');if(decodeURI(expected)===decodeURI(u.pathname))publicationUrl=u.href;}
 return document({url,title:p.title,body,description:p.description,date:p.publicationTime,id:p.id,author:p.author,picture:p.imageLink?new URL(p.imageLink,u.origin).href:null,api,publicationUrl});
}
export function normalizeTourismApiArticle(p,url,api){
 const u=new URL(url),id=u.pathname.match(/^\/(?:post|items)\/(\d+)\/?$/)?.[1];
 if(host(u)!=='vietnamtourism.gov.vn'||!id||String(p?.id)!==id||String(p.type)!=='1'||!/^\d{10}$/.test(String(p.publishup||'')))return {error:'tourism_public_article_identity_or_publication_unconfirmed'};
 const body=String(p.summary||'')+String(p.content||'');if(!text(p.title)||text(body).length<200)return {error:'tourism_public_article_fields_missing'};
 return document({url,title:p.title,body,description:text(p.summary),date:String(p.publishup),id,author:p.source,api,publicationUrl:url});
}
export function normalizeGovernmentPublicListing(raw,url,site){
 const records=site==='mof.gov.vn'&&raw?.success?raw.data:site==='vietnamtourism.gov.vn'?raw:null;
 if(!Array.isArray(records))return {error:'government_public_listing_invalid'};
 const $=cheerio.load('<html><head><title>Public publisher article listing</title></head><body><main></main></body></html>');let n=0;
 for(const p of records){let link;
  if(site==='mof.gov.vn'){if(p.articleStatus!==6||p.articleType!==1||typeof p.slug!=='string'||!p.slug||!p.categorySlug)continue;link='https://mof.gov.vn/'+[p.rootCategorySlug,p.categorySlug,p.slug].filter((x,i,a)=>x&&a.indexOf(x)===i).map(encodeURIComponent).join('/');}
  else{if(!/^\d+$/.test(String(p.id))||String(p.type)!=='1')continue;link='https://vietnamtourism.gov.vn/post/'+p.id;}
  $('main').append($('<a>').attr('href',link).text(text(p.title)));n++;
 }
 return n?{html:$.html(),articleLinks:n}:{error:'government_public_listing_empty'};
}
export async function fetchGovernmentPublicPage(page,url,fetch){
 const u=new URL(url),site=host(u);if(!['mof.gov.vn','vietnamtourism.gov.vn'].includes(site)||page.statusCode!==200||page.error&&page.error!=='empty_page')return null;
 const listing=u.pathname==='/',tourismId=u.pathname.match(/^\/(?:post|items)\/(\d+)\/?$/)?.[1];
 if(site==='vietnamtourism.gov.vn'&&!listing&&!tourismId)return null;
 const api=site==='mof.gov.vn'?listing?'https://mof.gov.vn/api/article/reads?offset=0&limit=40':'https://mof.gov.vn/api/article/getbyslug?slug='+encodeURIComponent(decodeURIComponent(u.pathname).split('/').filter(Boolean).at(-1)):listing?'https://public.vietnamtourism.gov.vn/news':'https://public.vietnamtourism.gov.vn/post/'+tourismId;
 const options={reviewFailed:true,taskRole:'publisher_dependency',...(site==='mof.gov.vn'&&listing?{method:'POST',data:{},headers:{'Content-Type':'application/json'}}:{})};
 const response=await fetch(api,options);if(response.error||!response.html)return {...page,error:response.error||'government_public_api_empty'};
 let raw;try{raw=JSON.parse(response.html);}catch{return {...page,error:'government_public_api_invalid_json'};}
 const normalized=listing?normalizeGovernmentPublicListing(raw,url,site):site==='mof.gov.vn'?normalizeMofApiArticle(raw,url,api):normalizeTourismApiArticle(raw,url,api);
 return {...page,...normalized,error:normalized.error||null,normalization:'public_government_api',sourceApiUrl:api,method:'HTTP/axios+publisher-public-api'};
}
