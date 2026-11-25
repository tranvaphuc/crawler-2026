import {isDantriCategory,readDantriJsonAssignment} from './dantriNews.mjs';
import * as cheerio from 'cheerio';
import {classifyNewsLink} from './newsLinkPolicy.mjs';
// A directory entry is not a news post. Never invent its publication date.
export function classifyNewsDocument(html,url,domain=new URL(url).hostname.replace(/^www\./,''),dom){
 const link=classifyNewsLink(url,domain);if(link.kind!=='unknown')return {kind:link.reason,skip:true,evidence:'Observed non-article URL shape; excluded from news article parsing'};
 const $=dom||cheerio.load(html);
 if(domain==='vanhoadoanhnhan.net.vn'&&/^\/[^/0-9]+\.html$/.test(new URL(url).pathname)&&$('div.blog,table.blog').length&&!$('.item-page,[itemprop=articleBody]').length&&new Set($('a.blogsection[href]').toArray().map(e=>$(e).attr('href'))).size>=3)return {kind:'native_joomla_category',skip:true,evidence:'Native Joomla blog/category layout with distinct blogsection story links; bare section path rather than a numeric article path.'};
 if(domain==='baohatinh.vn'&&/^\/tv\/[^/.]+$/.test(new URL(url).pathname)&&!$('.c-news-detail,.c-video-detail,.c-video-view').length&&$('.b-grid__title').length>=3&&$('meta[property="og:type"]').attr('content')==='website')return {kind:'native_video_section_listing',skip:true,evidence:'Native video programme hub with section cards and no current video detail/player.'};
 if(domain==='baohatinh.vn'&&$('body').hasClass('epaper-page')&&$('.epaper-header').length)return {kind:'printed_edition_reader',skip:true,evidence:'Native epaper-page and epaper-header reader template, distinct from an editorial report.'};
 if(domain==='langsontv.vn'&&/^\/(?:video|audio)\/\d+\/[^/]+\/?$/.test(new URL(url).pathname)&&!$('.video_info,.audio_info,video#video_player,audio').length&&!$('.pt15.pb15 > p.date').length&&$('.box_title').length&&(new Set($('[data-id][data-name]').toArray().map(e=>$(e).attr('data-id'))).size>=3||new Set($('a[href]').toArray().map(e=>$(e).attr('href')).filter(h=>/^\/audio\/[^/]+$/.test(h||''))).size>=3))return {kind:'native_multimedia_listing',skip:true,evidence:'Native multimedia cards with distinct data-id/data-name and section title; no player or current-item info.'};
 if(domain==='xemgame.com'&&/^\/game\/[^/]+\.html$/.test(new URL(url).pathname)&&$('.detail-news-game #game-intro #intro-container #content-height').length===1&&/HĐH:/.test($('.detail-news-game').text())&&/Nhà phát hành:/.test($('.detail-news-game').text()))return {kind:'game_catalog_profile',skip:true,evidence:'Native Thư viện game profile: game-intro/content-height, operating system and publisher fields; generic SEO NewsArticle does not make this a news report.'};
 if(domain==='dantri.com.vn'){const state=readDantriJsonAssignment(html,'window.wDataLayer',$);if(state?.page_type==='donation_campaign'&&state.published_date===null&&$('body').hasClass('nhan-ai'))return {kind:'native_donation_campaign',skip:true,evidence:'Publisher page_type=donation_campaign, published_date=null and native nhan-ai campaign template; not an individual news article'};}
 if(domain==='dantri.com.vn'&&isDantriCategory(html,url,$))return {kind:'native_category_page',skip:true,evidence:'Publisher wDataLayer declares page_type=cate and no article item_id'};
 const types=[],objects=[];function walk(x){if(!x||typeof x!=='object')return;if(Array.isArray(x))return x.forEach(walk);if(x['@type']){types.push(...(Array.isArray(x['@type'])?x['@type']:[x['@type']]));objects.push(x);}if(x['@graph'])walk(x['@graph']);if(x.mainEntity)walk(x.mainEntity);}
 $('script[type="application/ld+json"]').each((i,e)=>{try{walk(JSON.parse($(e).text()));}catch{}});
 const articleType=t=>/^(?:NewsArticle|Article|BlogPosting|ReportageNewsArticle|LiveBlogPosting|VideoObject|AudioObject|PodcastEpisode|RadioEpisode)$/.test(t);
 if(['thv.vn','thuonghieuquocgia.nhandan.vn'].includes(domain)&&types.some(articleType))return {kind:'news_article',skip:false};
 const text=value=>cheerio.load(String(value||''),null,false).text().replace(/\s+/g,' ').trim();const headlines=[$('h1').first().text(),$('meta[property="og:title"]').attr('content')].map(text).filter(Boolean);
 const nativeArticle=objects.some(a=>{if(!(Array.isArray(a['@type'])?a['@type']:[a['@type']]).some(articleType))return false;const declared=a.url||(typeof a.mainEntityOfPage==='string'?a.mainEntityOfPage:a.mainEntityOfPage?.['@id']);if(declared){try{if(new URL(declared,url).pathname!==new URL(url).pathname)return false;}catch{return false;}}return declared||headlines.includes(text(a.headline||a.name));});
 if(!nativeArticle&&types.some(t=>/^(?:CollectionPage|ItemList)$/.test(t)))return {kind:'news_listing',skip:true,evidence:'Native CollectionPage/ItemList schema without an Article belonging to this page'};
 if(!nativeArticle&&$('body').is('.archive,.category,.tag,.search-results')&&!/^article|^video\./i.test($('meta[property="og:type"]').attr('content')||''))return {kind:'news_listing',skip:true,evidence:'Native archive/category document template without a matching Article'};
 if(!nativeArticle&&!types.some(articleType)&&objects.some(a=>{if(!/^(?:Product|ProfilePage)$/.test(String(a['@type'])))return false;try{return new URL(a.url||a['@id'],url).pathname===new URL(url).pathname;}catch{return false;}}))return {kind:'product_or_profile',skip:true,evidence:'Native product/profile schema for this exact page without Article metadata'};
 if(domain==='thv.vn'&&new URL(url).pathname.startsWith('/doanh-nghiep/')&&types.includes('LocalBusiness'))return {kind:'business_directory',skip:true,evidence:'Native LocalBusiness schema under the publisher business directory'};
 if(domain==='thuonghieuquocgia.nhandan.vn'&&$('.s01-brand-logo-wrap').length&&/CHỨNG NHẬN/.test($('body').text()))return {kind:'company_profile',skip:true,evidence:'Certification/company profile hero; no Article/NewsArticle schema'};
 // A list of article cards is not its own article. Be conservative: any native
 // article schema, publication clock or substantive content outside those cards
 // keeps the page eligible, including older publishers using og:type=website.
 if(!nativeArticle&&!/^(?:article|video\.)/i.test($('meta[property="og:type"]').attr('content')||'')){
  const cards='article,.story,.item-news,.news-item,.b-item-news,.bm-card,.box-category-item,.b-grid,.news-li',outside=e=>!$(e).parents(cards+',nav,footer,.related,.comments,.comment-list').length;
  const headlines=new Set();$('h2 a[href],h3 a[href]').each((i,e)=>{if(!$(e).parents(cards).length||$(e).parents('nav,footer').length||text($(e).text()).length<18)return;try{const h=new URL($(e).attr('href'),url);if(/^https?:$/.test(h.protocol)&&h.hostname.replace(/^www\./,'')===new URL(url).hostname.replace(/^www\./,''))headlines.add(h.href);}catch{}});
  if(headlines.size>=6&&!$('h1').first().parents(cards).length){
   const metaClock=$('meta[property="article:published_time"],meta[itemprop="datePublished"],meta[name="pubdate"],meta[name="publish_date"],meta[name="publishdate"]').toArray().some(e=>!!$(e).attr('content'));
   const ownClock=$('time[datetime],[itemprop="datePublished"],.entry-meta,.post-meta,.article__meta,.detail-meta,.post-time,.article-time,.publish-date').toArray().some(e=>outside(e)&&!$(e).parents('header,.site-header,#header').length&&/\d{4}/.test($(e).attr('datetime')||$(e).attr('content')||$(e).text()));
   const ownParagraphs=$('p').toArray().filter(e=>outside(e)&&text($(e).text()).length>=100).length;
   const ownBody=$('[itemprop="articleBody"],.article-content,.post-content,.entry-content,#main-detail,#content-detail,#article-body,#contentBody,.cms-body,.the-article-body,.article__body,.detail-content,.content-detail,.detail-body,.content-article').toArray().some(e=>outside(e)&&(text($(e).clone().find('script,style').remove().end().text()).length>=300||$(e).find('img,amp-img').length>=2));
   if(!metaClock&&!ownClock&&ownParagraphs<2&&!ownBody)return {kind:'news_listing',skip:true,evidence:'At least six native article cards, with no publication clock or article content belonging to the page itself'};
  }
 }
 return {kind:'unknown',skip:false};
}
