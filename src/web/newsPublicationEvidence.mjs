import {parsePublishedDate} from './configurableNewsParser.mjs';
import {verifiedUserVisiblePublicationClock} from './newsUserVisiblePublicationClock.mjs';
// Only publishers whose schema date was observed following response time while
// the visible article clock remained unchanged across archived HTTP responses.
const selectors={'doanhnhan.baophapluat.vn':'.main-article > .breadcrumb-and-date'};
export function verifiedNativePublicationOverride($,url,config,parsed){
 const selected=$(config.publishedDate?.selector||'__missing_publication__');
 if(verifiedUserVisiblePublicationClock($,url,config,selected,parsed._source.title))return parsePublishedDate(selected.text(),config.timezone,config.dateOrder,config.clockFormat)?.iso===parsed._source.publishedDate;
 const p=config.publicationEvidencePolicy,domain=new URL(url).hostname.replace(/^www\./,'');
 if(p?.kind!=='stable_article_clock_over_dynamic_metadata'||selectors[domain]!==p.selector||config.publishedDate?.selector!==p.selector||!Array.isArray(p.verifiedSnapshots)||new Set(p.verifiedSnapshots.filter(s=>s.oldHtmlPath&&s.freshHtmlPath&&s.nativeDateStable&&s.metadataChanged).map(s=>s.url)).size<2)return false;
 const n=$(p.selector);if(n.length!==1||n.parents('nav,header,footer,aside,.related,.comments').length||/cập nhật|updated|modified/i.test(n.text()))return false;
 const title=$('h1').toArray().map(e=>$(e).text().replace(/\s+/g,' ').trim());if(!title.includes(parsed._source.title))return false;
 let canonical;try{canonical=new URL($('link[rel="canonical"]').attr('href'),url);const current=new URL(url);if(canonical.hostname.replace(/^www\./,'')!==domain||canonical.pathname!==current.pathname)return false;}catch{return false;}
 const date=parsePublishedDate(n.text(),config.timezone,config.dateOrder,config.clockFormat);return date?.iso===parsed._source.publishedDate;
}
