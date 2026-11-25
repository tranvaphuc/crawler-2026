import * as cheerio from 'cheerio';
import {parsePublicPublicationFeed} from './newsDateContext.mjs';

function publisherFeedLinks(xml,url){
  const $=cheerio.load(xml,{xmlMode:true}),origin=new URL(url),links=new Map();
  const add=(raw,title)=>{try{const u=new URL(raw,url);if(!raw||!/^https?:$/.test(u.protocol)||u.username||u.password||u.hostname.replace(/^www\./,'')!==origin.hostname.replace(/^www\./,''))return;u.hash='';if(links.size<10000)links.set(u.href,{url:u.href,title:String(title||'').trim().slice(0,600)});}catch{}};
  $('item,entry').each((i,e)=>{const n=$(e),link=n.children('link').filter((j,a)=>!$(a).attr('rel')||$(a).attr('rel')==='alternate').first();add(link.attr('href')||link.text().trim(),n.children('title').first().text());});
  $('url').each((i,e)=>{const n=$(e),news=n.children().filter((j,a)=>/(?:^|:)news$/.test(a.tagName||''));if(!news.length)return;add(n.children('loc').text().trim(),news.find('*').filter((j,a)=>/(?:^|:)title$/.test(a.tagName||'')).first().text());});
  return [...links.values()];
}

export function normalizePublicationFeedListing(xml,url){
  if(/\/comments\/feed\/?/i.test(new URL(url).pathname))return null;
  if(!/^\s*(?:<\?xml\b[^>]*>\s*)?<(?:rss\b|feed\b|urlset\b)/i.test(xml||''))return null;
  const feed=parsePublicPublicationFeed(xml,url),links=publisherFeedLinks(xml,url);if(!links.length)return null;
  const $=cheerio.load('<html><head><title>Publisher public article feed</title></head><body><main></main></body></html>');
  // Preserve the publisher's article context so short native slugs do not
  // depend on URL length to pass ordinary link discovery.
  for(const item of links)$('main').append($('<article>').append($('<h2>').append($('<a>').attr('href',item.url).text(item.title))));
  return {html:$.html(),articleLinks:links.length,publicationListingLinks:links,publicationContext:feed,normalization:'public_publication_feed_listing'};
}

// Only a parsed publisher feed supplies this context. These links still go
// through source scope, article parsing and the normal publication proof gate.
export function publicationFeedDiscovery(page){
  if(page?.normalization!=='public_publication_feed_listing'||!Array.isArray(page.publicationContext?.items))return null;
  let origin;try{origin=new URL(page.publicationContext.feedUrl);}catch{return null;}
  if(!/^https?:$/.test(origin.protocol)||origin.username||origin.password)return null;
  const clocks=new Map(page.publicationContext.items.map(i=>[i.url,i.iso]));
  const articles=(Array.isArray(page.publicationListingLinks)?page.publicationListingLinks:page.publicationContext.items).filter(item=>{
    try{const u=new URL(item.url);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&u.hostname.replace(/^www\./,'')===origin.hostname.replace(/^www\./,'');}catch{return false;}
  }).map(item=>{const iso=clocks.get(item.url),at=Date.parse(iso);return {url:item.url,title:item.title,...(Number.isFinite(at)&&at>=Date.UTC(1990,0,1)&&at<=Date.now()+86400000?{publishedHint:iso}:{})};});
  return {articles,categories:[]};
}
