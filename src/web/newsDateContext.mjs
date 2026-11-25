import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import {parsePublishedDate} from './configurableNewsParser.mjs';
export function parsePublicPublicationFeed(xml,feedUrl){
 if(/\/comments\/feed\/?/i.test(new URL(feedUrl).pathname))return {schemaVersion:1,feedUrl,publicationDates:{},items:[]};
 // Chromium renders text/xml responses inside a pre element on some sites.
 const visible=cheerio.load(xml)('body > pre').first().text();if(/^\s*(?:<\?xml\b|<rss\b|<feed\b|<urlset\b|<sitemapindex\b)/.test(visible))xml=visible;
 const $=cheerio.load(xml,{xmlMode:true}),items=[];
 $('item,entry').each((i,e)=>{const n=$(e),raw=n.children('pubDate,published').first().text().trim();
  if(!/(?:Z|GMT|[+-]\d{2}:?\d{2})$/i.test(raw))return;
  const parsed=parsePublishedDate(raw,null);if(!parsed||!['minute','second'].includes(parsed.precision))return;const date=new Date(parsed.iso);
  const link=n.children('link').filter((i,e)=>!$(e).attr('rel')||$(e).attr('rel')==='alternate').first();
  try{const u=new URL(link.attr('href')||link.text().trim(),feedUrl);if(!/^https?:$/.test(u.protocol)||u.hostname.replace(/^www\./,'')!==new URL(feedUrl).hostname.replace(/^www\./,'')||/comment/i.test(u.hash))return;u.hash='';
   items.push({url:u.href,title:n.children('title').text().trim(),iso:date.toISOString(),raw});
  }catch{}
 });
 // A news sitemap declares publication_date; ordinary lastmod is not a substitute.
 $('url').each((i,e)=>{const n=$(e),raw=n.find('*').filter((i,e)=>/(?:^|:)publication_date$/.test(e.tagName||'')).first().text().trim();
  if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw))return;const parsed=parsePublishedDate(raw,null);if(!parsed||!['minute','second'].includes(parsed.precision))return;const d=new Date(parsed.iso);
  try{const u=new URL(n.children('loc').text().trim(),feedUrl);if(u.hostname.replace(/^www\./,'')!==new URL(feedUrl).hostname.replace(/^www\./,'')||!/^https?:$/.test(u.protocol))return;
   const title=n.find('*').filter((i,e)=>/(?:^|:)title$/.test(e.tagName||'')).first().text().trim();items.push({url:u.href,title,iso:d.toISOString(),raw});
  }catch{}
 });
 return {schemaVersion:1,feedUrl,checkedAt:new Date().toISOString(),publicationDates:Object.fromEntries(items.map(i=>[i.url,{iso:i.iso,raw:i.raw}])),items};
}
export async function loadNewsDateContext(directory){try{return JSON.parse(await fs.readFile(path.join(directory,'publication-context.json'),'utf8'));}catch{return {};}}
