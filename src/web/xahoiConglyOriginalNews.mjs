import * as cheerio from 'cheerio';
import {publicationPageKey,publicationHeadlinesMatch} from './newsPublicationPageIdentity.mjs';
// This template omits a URL on its single NewsArticle. Bind only when the
// native heading, canonical, OG URL and visible original clock all agree.
export function normalizeXahoiConglyOriginal(html,url){
 const u=new URL(url);if(u.hostname!=='xahoi.congly.vn'||!/-\d{6,}\.html$/.test(u.pathname))return null;
 const $=cheerio.load(html),head=$('h1.block-sc-title'),clock=$('.block-sc-publish-time');
 if(head.length!==1||clock.length!==1||publicationPageKey($('link[rel="canonical"]').attr('href'),url)!==publicationPageKey(url)||publicationPageKey($('meta[property="og:url"]').attr('content'),url)!==publicationPageKey(url))return null;
 const own=[];$('script[type="application/ld+json"]').each((i,node)=>{try{const a=JSON.parse($(node).text());if(a['@type']==='NewsArticle')own.push({a,node});}catch{}});
 if(own.length!==1)return null;const {a,node}=own[0];
 if(a.url||a.mainEntityOfPage||a['@id']||!publicationHeadlinesMatch($,a.headline,head.text(),a)||!publicationHeadlinesMatch($,$('meta[property="og:title"]').attr('content'),head.text(),a))return null;
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}\+07:00$/.exec(a.datePublished||''),visible=clock.text().replace(/\s+/g,' ').trim();
 if(!match||!Number.isFinite(Date.parse(a.datePublished))||visible!==`${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`)return null;
 a.mainEntityOfPage={'@type':'WebPage','@id':url};$(node).text(JSON.stringify(a));
 return {html:$.html(),normalization:'xahoi_congly_native_heading_canonical_original_clock'};
}
