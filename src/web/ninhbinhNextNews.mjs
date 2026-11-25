import * as ch from 'cheerio';
import {ninhbinhNativeHeaderEvidence} from './newsNinhbinhVisibleClock.mjs';
import {readNextFlightJsonRecords} from './nextFlightJson.mjs';
import {publicationPageKey} from './newsPublicationPageIdentity.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim().toLocaleLowerCase();
export function normalizeNinhbinhNextArticle(html,url){
 const u=new URL(url);if(u.hostname.replace(/^www\./,'')!=='baoninhbinh.org.vn'||!/-\d{6}(?:\d{9}|\d{11})?\.html$/.test(u.pathname))return null;
 const $=ch.load(html),schemas=[],visible=()=>ninhbinhNativeHeaderEvidence($,url)?{html,normalization:'url_bound_ninhbinh_native_visible_clock'}:null;
 const flight=readNextFlightJsonRecords($('script:not([src])').toArray().map(e=>$(e).text()));if(!flight)return visible()||{error:'ninhbinh_original_schema_unconfirmed'};
 let visited=0,overflow=false;
 const visit=(value,depth=0)=>{if(!value||typeof value!=='object')return;if(depth>40||++visited>50000){overflow=true;return;}if(!Array.isArray(value)&&value.id==='article-schema'&&value.type==='application/ld+json'&&typeof value.children==='string'){let text=value.children;const ref=text.match(/^\$([a-f0-9]+)$/i);if(ref)text=flight.strings.get(ref[1].toLowerCase());if(typeof text==='string')try{schemas.push(JSON.parse(text));}catch{}}for(const v of Object.values(value))if(v&&typeof v==='object')visit(v,depth+1);};
 for(const value of flight.records)visit(value);
 if(overflow)return {error:'ninhbinh_original_schema_unconfirmed'};
 if(schemas.length!==1)return visible()||{error:'ninhbinh_original_schema_unconfirmed'};
 const schema=schemas[0],canonical=$('link[rel=canonical]'),headline=$('h1'),body=$('.content-detail'),original=schema.mainEntityOfPage?.['@id']||schema.url;
 const legacy=()=>{try{const c=new URL(canonical.attr('href'),url),a=u.pathname.match(/^\/([a-z0-9-]+)-(\d{6}|\d{17})\.html$/),b=c.pathname.match(/^\/([a-z0-9-]+?)(?:-|\/d)(\d{6}|\d{17})\.htm$/);return c.hostname===u.hostname&&!u.search&&!c.search&&a&&b&&a[2]===b[2]&&b[1].length>=30&&(a[1]===b[1]||a[1].startsWith(b[1]+'-'))&&publicationPageKey($('meta[property="og:url"]').attr('content'),url)===publicationPageKey(c.href);}catch{return false;}};
 if(schema['@type']!=='NewsArticle'||canonical.length!==1||(publicationPageKey(canonical.attr('href'),url)!==publicationPageKey(url)&&!legacy())||publicationPageKey(original,url)!==publicationPageKey(canonical.attr('href'),url)||headline.length!==1||clean(headline.text())!==clean(schema.headline)||body.length!==1||body.text().trim().length<150||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/.test(schema.datePublished||''))return {error:'ninhbinh_original_article_identity_unconfirmed'};
 $('head').append($('<script type="application/ld+json" data-original-next-schema="article-schema">').text(JSON.stringify(schema).replace(/</g,'\\u003c')));
 return {html:$.html(),normalization:'url_bound_public_next_article_schema'};
}
