import * as ch from 'cheerio';
import {createHash} from 'node:crypto';
import {parsePublicPublicationFeed} from './newsDateContext.mjs';
import {publicationPageKey} from './newsPublicationPageIdentity.mjs';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
export function wordpressFullRssEntries(xml,feedUrl){
 const $=ch.load(xml,{xmlMode:true}),records=[];
 for(const item of $('rss > channel > item').toArray().slice(0,50)){
  const url=$(item).children('link').text().trim();
  if(!normalizeWordpressFullRss(xml,feedUrl,url))continue;
  const one=ch.load(xml,{xmlMode:true});one('rss > channel > item').filter((i,e)=>publicationPageKey(one(e).children('link').text().trim(),feedUrl)!==publicationPageKey(url)).remove();
  records.push({url,xml:one.xml(),sourceFeedSha256:createHash('sha256').update(xml).digest('hex')});
 }
 return records;
}
export function normalizeWordpressFullRss(xml,feedUrl,articleUrl){
 try{
  const source=new URL(feedUrl),target=new URL(articleUrl);
  if(source.hostname.replace(/^www\./,'')!==target.hostname.replace(/^www\./,'')||source.username||source.password||target.username||target.password)return null;
  const $=ch.load(xml,{xmlMode:true}),rss=$('rss');
  if(rss.length!==1||rss.attr('xmlns:content')!=='http://purl.org/rss/1.0/modules/content/')return null;
  const items=rss.children('channel').children('item').toArray().filter(e=>publicationPageKey($(e).children('link').text().trim(),feedUrl)===publicationPageKey(articleUrl));
  if(items.length!==1)return null;
  const item=$(items[0]),context=parsePublicPublicationFeed(xml,feedUrl),dates=context.items.filter(x=>publicationPageKey(x.url)===publicationPageKey(articleUrl));
  if(dates.length!==1)return null;
  const title=clean(item.children('title').text()),body=item.children('content\\:encoded'),raw=body.text();
  if(!title||body.length!==1||!raw)return null;
  const doc=ch.load('<html><head></head><body><article><h1></h1><div id="publisher-full-rss-content"></div></article></body></html>');
  doc('#publisher-full-rss-content').html(raw);
  const content=doc('#publisher-full-rss-content');
  if(content.find('.more-link,.read-more,[class*="excerpt"],script').length||/(?:read more|continue reading|đọc tiếp|xem thêm)\s*(?:[.…]|<\/a>|$)/i.test(raw.slice(-700)))return null;
  const paragraphs=content.find('p').toArray().map(e=>clean(doc(e).text())).filter(s=>s.length>=30);
  if(new Set(paragraphs).size<3||clean(content.text()).length<800)return null;
  doc('h1').text(title);doc('head').append(doc('<title>').text(title),doc('<link rel="canonical">').attr('href',articleUrl));
  const schema={'@context':'https://schema.org','@type':'NewsArticle',url:articleUrl,mainEntityOfPage:articleUrl,headline:title,datePublished:dates[0].iso};
  doc('head').append(doc('<script type="application/ld+json">').text(JSON.stringify(schema).replace(/</g,'\\u003c')));
  return {html:doc.html(),publicationContext:context,normalization:'public_wordpress_full_rss_article',method:'HTTP/publisher-RSS-content:encoded',sourceFeedUrl:feedUrl,sourceFeedSha256:createHash('sha256').update(xml).digest('hex')};
 }catch{return null;}
}
