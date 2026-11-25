import {publicationPageKey,publicationHeadlinesMatch} from './newsPublicationPageIdentity.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
export function ninhbinhNativeHeaderEvidence($,url){
 let u;try{u=new URL(url);}catch{return null;}
 if(u.hostname.replace(/^www\./,'')!=='baoninhbinh.org.vn'||!/-\d{15}\.html$/.test(u.pathname)||$.html().includes('article-schema')||/datePublished["']?\s*[:=]/.test($.html().replace(/\\"/g,'"')))return null;
 const heading=$('h1.header-title'),clock=$('h1.header-title + div'),body=$('.content-detail'),canonical=$('link[rel=canonical]'),documentTitle=$('head > title');
 if(heading.length!==1||clock.length!==1||body.length!==1||canonical.length!==1||documentTitle.length!==1||heading.parent()[0]!==clock.parent()[0]||heading.parent()[0]!==body.parent()[0]||clean(body.text()).length<150||publicationPageKey(canonical.attr('href'),url)!==publicationPageKey(url)||!publicationHeadlinesMatch($,documentTitle.text(),heading.text()))return null;
 const text=clean(clock.text());if(!/^(?:(?:Thứ\s+(?:Hai|Ba|Tư|Năm|Sáu|Bảy)|Chủ\s+Nhật),?\s*)?\d{1,2}\/\d{1,2}\/20\d{2},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*\(GMT\+7\))?$/iu.test(text))return null;
 return {heading,clock,body,root:heading.parent(),text};
}
export function verifiedNinhbinhNativeHeaderClock($,url,config,node,title){if(config.siteName!=='baoninhbinh.org.vn'||config.publicationClockPolicy!=='ninhbinh_native_visible_header_v1'||config.title?.selector!=='h1.header-title'||config.body?.selector!=='.content-detail'||config.publishedDate?.selector!=='h1.header-title + div')return false;const r=ninhbinhNativeHeaderEvidence($,url);return !!r&&r.clock[0]===node[0]&&clean(r.heading.text())===clean(title);}
