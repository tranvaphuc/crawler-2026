import * as cheerio from 'cheerio';
import {parsePublicPublicationFeed} from './newsDateContext.mjs';
export function normalizePublicationFeedListing(xml,url){
 if(!/^\s*(?:<\?xml\b[^>]*>\s*)?<(?:rss\b|feed\b|urlset\b)/i.test(xml||''))return null;
 const feed=parsePublicPublicationFeed(xml,url);if(!feed.items.length)return null;
 const $=cheerio.load('<html><head><title>Publisher public article feed</title></head><body><main></main></body></html>');
 for(const item of feed.items)$('main').append($('<a>').attr('href',item.url).text(item.title));
 return {html:$.html(),articleLinks:feed.items.length,publicationContext:feed,normalization:'public_publication_feed_listing'};
}
