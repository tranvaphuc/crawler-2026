import * as cheerio from 'cheerio';import {parsePublicPublicationFeed} from './newsDateContext.mjs';import {parsePublishedDate} from './configurableNewsParser.mjs';
const host=u=>u.hostname.replace(/^www\./,''),text=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
export function taynguyenCategoryFeedUrl(url){
 const u=new URL(url);if(host(u)!=='taynguyen24h.com.vn'||!/^https?:$/.test(u.protocol)||u.username||u.password)return null;
 if(!/^\/index\.php\/(?:component\/content\/article\/|tin-(?:tuc-)?24h\/)/.test(u.pathname))return null;
 const parts=u.pathname.split('/').filter(Boolean),tail=parts.at(-1);if(!/^\d{4,}-[^/]+$/.test(tail||''))return null;
 const category=parts.at(-2),id=category?.match(/^(\d{1,3})-/)?.[1];if(id)return 'https://taynguyen24h.com.vn/index.php?'+new URLSearchParams({option:'com_content',view:'category',id,format:'feed',type:'rss',limit:'50'});
 if(!/^\/index\.php\/tin-(?:tuc-)?24h\//.test(u.pathname))return null;
 return 'https://taynguyen24h.com.vn/'+parts.slice(0,-1).join('/')+'?format=feed&type=rss&limit=50';
}
export function normalizeTaynguyenArticle(html,url,xml,feedUrl){
 const u=new URL(url),f=new URL(feedUrl);if(host(u)!=='taynguyen24h.com.vn'||host(f)!==host(u)||f.username||f.password||!/^https?:$/.test(f.protocol))return {error:'joomla_feed_source_mismatch'};
 const $=cheerio.load(html),title=text($('.contentheading').first().text()),tail=u.pathname.split('/').at(-1),id=tail?.match(/^(\d{4,})-/)?.[1];if(!id||!title)return {error:'joomla_article_identity_missing'};
 const feed=parsePublicPublicationFeed(xml,feedUrl),matches=feed.items.filter(item=>{const v=new URL(item.url);return v.pathname.split('/').at(-1)===tail&&text(item.title)===title;});
 const clocks=new Set(matches.map(m=>m.iso));if(clocks.size>1)return {error:'joomla_publication_date_ambiguous'};const match=matches[0],createdRaw=text($('.createdate').first().text()),visible=parsePublishedDate(createdRaw,'Asia/Ho_Chi_Minh');
 if(match&&visible&&Math.floor(Date.parse(match.iso)/60000)!==Math.floor(Date.parse(visible.iso)/60000))return {error:'joomla_feed_html_publication_conflict'};
 if(!match&&!visible)return {error:'joomla_original_publication_unconfirmed'};
 $('head').append($('<meta>').attr({name:'crawler:native-id',content:id}),$('<meta>').attr({name:'crawler:date-source',content:match?'public_joomla_rss_pubdate':'article_html_createdate'}),$('<meta>').attr({name:'crawler:source-api',content:match?feedUrl:url}));
 if(match)$('head').append($('<meta>').attr({name:'crawler:published-date',content:match.raw}),$('<meta>').attr({name:'crawler:publication-match-url',content:match.url}));
 return {html:$.html(),nativeId:id,publicationMatchedUrl:match?.url||url,publicationRaw:match?.raw||createdRaw,publicationSource:match?'rss_pubDate':'visible_createdate'};
}
