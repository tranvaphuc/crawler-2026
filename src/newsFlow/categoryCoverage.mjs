import * as cheerio from 'cheerio';
import {discoverNewsLinks,pageIssue} from '../web/configurableNewsParser.mjs';
import {classifyNewsLink} from '../web/newsLinkPolicy.mjs';
import {isExcludedSource} from '../web/sourceExclusions.mjs';
import {articleKey} from './identity.mjs';
import {primaryNewsListingLinks} from '../web/newsListingEvidence.mjs';
import {publicationHeadlinesMatch} from '../web/newsPublicationPageIdentity.mjs';

const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
export function publisherBreadcrumbCategories($,url,source){
 const out=new Map(),add=(raw,title)=>{const u=categoryUrl(raw,url,source);if(u&&articleKey(u)!==articleKey(url))out.set(articleKey(u),{url:u,title:clean(title),provenance:'publisher_breadcrumb'});};
 const walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o))return o.forEach(walk);if([o['@type']].flat().includes('BreadcrumbList'))for(const i of o.itemListElement||[])add(typeof i.item==='string'?i.item:i.item?.['@id'],i.name);if(o['@graph'])walk(o['@graph']);};
 $('script[type="application/ld+json"]').each((i,e)=>{try{walk(JSON.parse($(e).text()));}catch{}});
 $('.breadcrumb a[href],[class*="breadcrumb"] a[href]').each((i,e)=>add($(e).attr('href'),$(e).text()));return [...out.values()];
}
export function categoryUrl(raw,base,source){
 if(typeof raw!=='string'||!raw.trim())return null;
 try{
  const u=new URL(raw,base),host=u.hostname.replace(/^www\./,''),hosts=new Set([source.domain,...source.config?.allowedHosts||[]].map(h=>h.replace(/^www\./,'')));
  if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.port||isExcludedSource(u.href)||!hosts.has(host))return null;
  const p=decodeURIComponent(u.pathname).replace(/\/$/,'')||'/',decision=classifyNewsLink(u.href,source.domain);
  if(/[<>\u0000-\u001f\u007f]/.test(p)||[...u.searchParams.values()].some(v=>/[<>\u0000-\u001f\u007f]/.test(v)))return null;
  const segments=p.split('/').filter(Boolean);if(new Set(segments).size!==segments.length)return null;
  if(/^\/(?:vi|en|fr|de|zh|ja|ko|th|es|ru|id|ar|km|lo)(?:-[a-z]{2,4})?$/i.test(p)||/\/ChangeLanguage$/i.test(p))return null;
  if(/\/(?:about|privacy|terms|contact|calendar|currency-converter|compare|chart|lookup|screener|watchlist|portfolio|quote)(?:[_.\/-]|$)/i.test(p))return null;
  if(host==='finance.yahoo.com'&&/^\/markets\/(?:stocks|bonds|commodities|currencies|etfs|mutualfunds|options|private-companies|crypto\/(?:all|gainers|losers|most-active))(?:\/|$)/i.test(p))return null;
  if(host==='luatvietnam.vn'&&/-f\d+\.html$/i.test(p))return null;
  if(/\/(?:p\d+|page[-_]?\d+|trang[-_]?\d+)(?:\.html?)?$/i.test(p))return null;
  if(['thuonghieu.net.vn','cnet.com'].includes(host)&&/\/\d+$/.test(p))return null;
  if(host==='oto.com.vn'&&/^\/(?:bang-gia-xe|mua-ban-xe|salon-oto)(?:[-/]|$)/i.test(p))return null;
  if(host==='prnewswire.com'&&/\/(?:products|services)(?:\/|$)/i.test(p))return null;
  if(p==='/'||decision.kind==='excluded'||['tag_topic_or_author_archive','search_or_archive_query','archive_pagination','native_event_id','publisher_directory'].includes(decision.reason))return null;
  if(/(?:[-/](?:post|a)?\d{5,}|\/\d{4}\/\d{2}\/|post\d{4,})[^/]*\.(?:html?|tpo|vov|vnp|epi|chn)$/i.test(p))return null;
  if(/\/(?:tags?|authors?|tac-gia|chu-de|chuyen-de|su-kien|topics?|events?|search|tim-kiem|page|trang|lich-van-nien|vne-go|lien-he|gioi-thieu|quang-cao|dieu-khoan|chinh-sach|tuyen-dung|dang-nhap|dang-ky|contact|about|privacy|terms|login|register|sitemap|rss|feed|epaper|bao-in|du-lieu|data|lich-thi-dau|ket-qua|bang-xep-hang|ty-gia|tra-cuu)(?:[/.?-]|$)/i.test(p))return null;
  if(/\.(?:xml|rss|json|js|css|pdf|png|jpe?g|svg|gif|webp|mp[34]|zip)$/i.test(p)||/-p[2-9]\d*\.html?$/i.test(p))return null;
  for(const k of u.searchParams.keys())if(!/^utm_|^(fbclid|gclid)$/i.test(k)&&/^(page\w*|paged|pageno|offset|start|search|q|s|keyword|tag|author|date|from|to|replytocom|order|orderby|sort|sortby|view|filter)$/i.test(k))return null;
  if((source.config?.validation?.sampleUrls||[]).some(v=>articleKey(v)===articleKey(u.href)))return null;
  u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);
  return u.href;
 }catch{return null;}
}

export function inspectCategoryPage({html,url,source,seeds=[],qualificationOnly=false}){
 const $=cheerio.load(html),issue=pageIssue(html,$);if(issue)return {error:issue,articles:[],categories:[]};
 const canonical=$('link[rel="canonical"]').first().attr('href');if(canonical)try{if(articleKey(new URL(canonical,url).href)!==articleKey(url))return {articles:[],categories:[],listing:false,selfArticle:false,primaryArticleCount:0,primaryArticles:[],canonical,reason:'section_canonical_identity_mismatch'};}catch{}
 const site={domain:source.domain,allowedHosts:source.config?.allowedHosts,knownArticleUrls:source.config?.validation?.sampleUrls,knownCategoryUrls:seeds,legacy:{legacyArticlePattern:source.config?.discovery?.legacyArticlePattern}},found=qualificationOnly?{articles:[],categories:[]}:discoverNewsLinks(html,url,site,{dom:$,maxCategories:10000}),categories=new Map(),current=articleKey(url);
 const paginationKeys=new Set();$('.pagination a[href],.paging a[href],.pager a[href],[class*="pagination"] a[href],a.page-numbers[href],a[rel="next"],a[rel="prev"]').each((i,a)=>{try{const u=new URL($(a).attr('href'),url);if(/\/(?:\d+|p\d+|page[-_]?\d+|trang[-_]?\d+)(?:\.html?)?\/?$/i.test(u.pathname)||[...u.searchParams.keys()].some(k=>/^(?:page\w*|pageno|paged|offset)$/i.test(k)))paginationKeys.add(articleKey(u.href));}catch{}});
 const add=(raw,title,provenance)=>{const u=categoryUrl(raw,url,source);if(!u||articleKey(u)===current||paginationKeys.has(articleKey(u)))return;const key=articleKey(u),prior=categories.get(key);if(!prior)categories.set(key,{url:u,title:clean(title),provenance});};
 for(const c of found.categories)add(c.url,c.title,'publisher_navigation');const articleKeys=new Set(found.articles.map(a=>articleKey(a.url)));
 if(!qualificationOnly)$('nav a[href],header a[href],[class*="menu"] a[href],.navbar a[href],.navigation a[href],.breadcrumb a[href],[class*="breadcrumb"] a[href],[class*="subcate"] a[href],[class*="sub-cate"] a[href],[class*="subnav"] a[href],[class*="sub-nav"] a[href],.box-category-title a[href],.title-box-category a[href]').each((i,a)=>{const n=$(a),text=clean(n.text()||n.attr('title')||n.find('img').attr('alt'));if(text.length<2||text.length>90||n.parents('article,.item-news,.news-item,.related,.comments').length)return;const u=categoryUrl(n.attr('href'),url,source);if(!u||articleKeys.has(articleKey(u)))return;add(u,text,'publisher_navigation');});
 const ownArticles=[],h1=clean($('h1').first().text());const walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(walk);return;}const types=[o['@type']].flat();if(types.includes('BreadcrumbList'))for(const i of o.itemListElement||[])add(typeof i.item==='string'?i.item:i.item?.['@id'],i.name,'publisher_breadcrumb');if(types.some(t=>/^(?:NewsArticle|Article|BlogPosting|ReportageNewsArticle|VideoObject|AudioObject)$/.test(t||''))){const urls=[o.url,o['@id'],typeof o.mainEntityOfPage==='string'?o.mainEntityOfPage:o.mainEntityOfPage?.['@id']].filter(Boolean);if(urls.some(v=>{try{return articleKey(new URL(v,url).href)===current;}catch{return false;}})||h1.length>=15&&o.headline&&publicationHeadlinesMatch($,o.headline,h1,o))ownArticles.push(o);}if(o['@graph'])walk(o['@graph']);if(o.mainEntity)walk(o.mainEntity);};
 $('script[type="application/ld+json"]').each((i,e)=>{try{walk(JSON.parse($(e).text()));}catch{}});
 let ownProduct=false;const products=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o))return o.forEach(products);if([o['@type']].flat().includes('Product'))for(const raw of [o.url,o['@id']].filter(Boolean))try{if(articleKey(new URL(raw,url).href)===current)ownProduct=true;}catch{}if(o['@graph'])products(o['@graph']);if(o.mainEntity)products(o.mainEntity);};$('script[type="application/ld+json"]').each((i,e)=>{try{products(JSON.parse($(e).text()));}catch{}});
 const ownStory=ownArticles.some(a=>a.datePublished&&a.headline),ogType=clean($('meta[property="og:type"]').attr('content')).toLowerCase(),clock=$('head meta[property="article:published_time"],head meta[name="pubdate"],head meta[itemprop="datePublished"]').toArray().some(e=>!!$(e).attr('content'));
 const selfArticle=ownStory||/^article$/.test(ogType)&&clock;
 const articles=[...new Map(found.articles.map(a=>[articleKey(a.url),a])).values()].filter(a=>!categories.has(articleKey(a.url)));
 const primary=primaryNewsListingLinks(html,url,site,$),isHome=new URL(url).pathname==='/'||[source.config?.homepage,source.config?.discovery?.homepage].filter(Boolean).some(raw=>articleKey(raw)===current),allowedSection=isHome||!!categoryUrl(url,url,source),listing=allowedSection&&!selfArticle&&!ownProduct&&!paginationKeys.has(current)&&primary.articles.length>=2;
 const breadcrumbs=publisherBreadcrumbCategories($,url,source);
 return {articles,categories:selfArticle?breadcrumbs:[...categories.values()],breadcrumbCategories:breadcrumbs,listing,selfArticle,primaryArticleCount:primary.articles.length,primaryArticles:primary.articles,primaryScope:primary.scope,title:clean($('h1').first().text()||$('title').text()).slice(0,250),canonical:canonical||null,reason:!allowedSection?'utility_or_non_editorial_url':selfArticle?'self_article_not_section':ownProduct?'product_page_not_editorial_section':paginationKeys.has(current)?'pagination_not_a_new_section':listing?'primary_editorial_listing':'section_listing_unconfirmed'};
}
