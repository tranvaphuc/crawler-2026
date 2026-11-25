import fs from 'node:fs/promises';import path from 'node:path';import * as cheerio from 'cheerio';
import {parseConfiguredArticle} from './configurableNewsParser.mjs';import {parsePublicPublicationFeed} from './newsDateContext.mjs';

export function verifiedLandingPublisherUrl(html,landingUrl,target){
 try{const source=new URL(landingUrl),u=new URL(target);if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.hostname===source.hostname)return null;
  const $=cheerio.load(html),key=x=>x.origin+x.pathname.replace(/\/$/,'')+x.search;
  return $('a[href]').toArray().some(e=>{try{return key(new URL($(e).attr('href'),landingUrl))===key(u);}catch{return false;}})?u.href:null;
 }catch{return null;}
}

export function verifiedCanonicalPublisherUrl(html,url,targetHost){
 try{const $=cheerio.load(html),links=$('link[rel=canonical]'),og=$('meta[property="og:url"]');if(links.length!==1||og.length!==1)return null;
  const source=new URL(url),canonical=new URL(links.attr('href'),url),social=new URL(og.attr('content'),url),key=u=>{const n=new URL(u);n.searchParams.sort();return n.pathname+n.search;};
  if(!/^https?:$/.test(canonical.protocol)||canonical.username||canonical.password||canonical.hostname.replace(/^www\./,'')!==targetHost||source.hostname.replace(/^www\./,'')===targetHost||key(source)!==key(canonical)||social.href!==canonical.href)return null;
  return canonical.href;
 }catch{return null;}
}

export function originalSkydoorUrl(html,aggregatorUrl,finalUrl){const $=cheerio.load(html);const sourceHost=new URL(aggregatorUrl).hostname.replace(/^www\./,'');const selector=sourceHost==='msn.com'?'a[data-msn-original-publisher][href]':sourceHost==='tintuc.net'?'a.news-link[href]':'a.sd-value-first__source[href]';const raw=$(selector).first().attr('href')||(finalUrl&&new URL(finalUrl).hostname.replace(/^www\./,'')!==sourceHost?finalUrl:null);if(!raw)return null;try{const u=new URL(raw,aggregatorUrl);if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.hostname.replace(/^www\./,'')===sourceHost)return null;return u.href;}catch{return null;}}
export async function parseSkydoorWithPublisher({page,url,transport,directory,label,configDirectory=path.resolve('config/web-sources/news')}){
 if(page.error||!page.html)return {error:page.error||'missing_aggregator_html'};const originalUrl=originalSkydoorUrl(page.html,url,page.finalUrl);if(!originalUrl)return {error:'missing_original_publisher_url'};const domain=new URL(originalUrl).hostname.replace(/^www\./,'');if(!/^[a-z0-9.-]+$/.test(domain))return {error:'invalid_publisher_host'};let config;try{config=JSON.parse(await fs.readFile(path.join(configDirectory,domain+'.json'),'utf8'));}catch{return {error:'publisher_configuration_missing',publisher:domain,originalUrl};}if(!config.title||!config.publishedDate||!config.body)return {error:'publisher_configuration_incomplete',publisher:domain,originalUrl};
 const allowed=new Set([domain,...(config.allowedHosts||[])].map(h=>h.replace(/^www\./,'')));const publisher=await transport.get(originalUrl,directory,label+'-publisher');if(publisher.error||!publisher.html)return {error:publisher.error||'missing_publisher_html',publisher:domain,originalUrl};if(!allowed.has(new URL(publisher.finalUrl).hostname.replace(/^www\./,'')))return {error:'unexpected_publisher_redirect',publisher:domain,originalUrl};
 let context={};const feed=[config.publishedDate,...(config.variants||[]).map(v=>v.publishedDate)].find(d=>d?.strategy==='public_feed')?.feedUrl;if(feed){const f=await transport.get(feed,directory,label+'-publisher-feed');if(!f.error&&f.html)context=parsePublicPublicationFeed(f.html,f.finalUrl||feed);}
 const doc=parseConfiguredArticle(publisher.html,originalUrl,config,context);if(doc.error)return {...doc,publisher:domain,originalUrl};doc.extracted.discoveredVia={siteId:new URL(url).hostname.replace(/^www\./,''),url,nativeId:new URL(url).pathname.match(/(\d+)$/)?.[1]||null};doc.extracted.originalPublisherUrl=originalUrl;doc.extracted.identityReconciliationRequired=true;return {parsed:doc,publisher:domain,originalUrl,evidence:publisher.htmlFile};
}
