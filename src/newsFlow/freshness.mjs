import {getNewsStructuredData,newsObjectBelongsToPage,parsePublishedDate} from '../web/configurableNewsParser.mjs';
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
const precise=d=>d&&['minute','second'].includes(d.precision)&&Date.parse(d.iso)<=Date.now()+300000;
// Scheduling hints never supply an ES field or justify dropping a queued URL.
export function linkPublicationHint($,anchor,url,timezone){
 const card=$(anchor).closest('article,.story,.item-news,.news-item,.box-category-item,.bm-card,.td_module_wrap,.b-grid,li');
 if(!card.length||card.find('h2 a[href],h3 a[href]').length>3)return null;
 const dates=card.find('time[datetime],[itemprop="datePublished"][content],[data-published],[data-timestamp],.time-ago[data-time],.time[data-time]');if(!dates.length||dates.length>4)return null;
 const parsed=dates.toArray().map(e=>{const n=$(e);return parsePublishedDate(n.attr('datetime')||n.attr('content')||n.attr('data-published')||n.attr('data-timestamp')||n.attr('data-time'),timezone);});
 if(parsed.some(d=>!d||Date.parse(d.iso)>Date.now()+300000))return null;
 const times=parsed.map(d=>Date.parse(d.iso));if(Math.max(...times)-Math.min(...times)>=60000)return null;
 return {publishedHint:times[0],hintSource:'publisher_card_clock',hintPrecision:parsed[0].precision};
}
export function urlPublicationHint(url,timezone){
 const path=new URL(url).pathname,stamp=path.match(/(?:^|[-/])((?:19|20)\d{6})(\d{6})\d{0,6}(?:\.[a-z]+|\/)?$/i),calendar=path.match(/\/((?:19|20)\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/);
 let raw;if(stamp){const s=stamp[1]+stamp[2];raw=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+' '+s.slice(8,10)+':'+s.slice(10,12)+':'+s.slice(12,14);}else if(calendar)raw=calendar[1]+'-'+calendar[2].padStart(2,'0')+'-'+calendar[3].padStart(2,'0');
 const date=raw&&parsePublishedDate(raw,timezone);return date&&Date.parse(date.iso)<=Date.now()+300000?{publishedHint:Date.parse(date.iso),hintSource:'url_calendar_scheduling_only',hintPrecision:date.precision}:null;
}
export function articlePublicationPreflight($,html,url,config,{now=Date.now(),maxAgeHours=24}={}){
 if(config.publicationEvidencePolicy||config.ignoreCanonicalIdentity||config.requiresTimezoneReviewBeforeWrite)return null;
 const declared=$('link[rel="canonical"]').attr('href');if(declared&&!newsObjectBelongsToPage({url:declared},url))return null;
 const own=getNewsStructuredData(html,$).filter(a=>newsObjectBelongsToPage(a,url)&&/Article|BlogPosting/.test(String(a['@type'])));
 const titles=new Set($('h1').toArray().filter(e=>!$(e).parents('nav,footer,aside,.related').length).map(e=>clean($(e).text())));
 const evidence=own.filter(a=>titles.has(clean(a.headline))).map(a=>({raw:a.datePublished,source:'owned_jsonld'}));
 // Exact-page schema is required; a sidebar clock or URL date cannot discard an article.
 if(!evidence.length)return null;
 for(const e of $('head meta[property="article:published_time"],head meta[itemprop="datePublished"],head meta[name="pubdate"]').toArray())evidence.push({raw:$(e).attr('content'),source:'publication_meta'});
 const values=evidence.filter(e=>e.raw).map(e=>({...e,date:parsePublishedDate(e.raw,config.timezone,config.dateOrder,config.clockFormat)}));
 if(!values.length||values.some(e=>!precise(e.date)))return null;
 const times=values.map(e=>Date.parse(e.date.iso));if(Math.max(...times)-Math.min(...times)>=60000)return null;
 // When a configured selector is present, it must corroborate native publication.
 if(config.publishedDate?.strategy==='selector'){
  let nodes;try{nodes=$(config.publishedDate.selector);}catch{return null;}
  const n=nodes.eq(config.publishedDate.index||0);if(!n.length||n.parents('nav,footer,aside,.related').length)return null;
  const raw=config.publishedDate.attribute?n.attr(config.publishedDate.attribute):n.attr('content')||n.attr('datetime')||clean(n.text());
  const d=parsePublishedDate(raw,config.timezone,config.dateOrder,config.clockFormat);if(!precise(d)||Math.abs(Date.parse(d.iso)-times[0])>=60000)return null;
 }else if(config.publishedDate?.strategy!=='jsonld'&&config.publishedDate?.strategy!=='native_self_jsonld')return null;
 const publishedAt=Math.min(...times);return {publishedAt,publishedDate:new Date(publishedAt).toISOString(),outsideWindow:now-publishedAt>maxAgeHours*3600000,source:'matching_owned_publication',evidence:values.map(e=>({source:e.source,raw:e.raw}))};
}
