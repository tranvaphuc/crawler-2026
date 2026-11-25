import {publicationPageKey} from './newsPublicationPageIdentity.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
// Exact publisher template defect: an unescaped double quote truncates og:title.
// The real native heading still needs its full document title and own URL.
export function verifiedMxpressBrokenOgHeading($,url,title){
 let u;try{u=new URL(url);}catch{return false;}
 if(u.hostname.replace(/^www\./,'')!=='mxpress.vn'||!/^\/tin-tuc\/[^/]+\/?$/.test(u.pathname))return false;
 const heading=clean(title),firstQuote=heading.indexOf('"'),meta=$('meta[property="og:title"]'),documentTitle=$('head > title');
 if(firstQuote<12||meta.length!==1||documentTitle.length!==1||!Object.keys(meta[0].attribs||{}).some(k=>!['property','content'].includes(k)))return false;
 return clean(meta.attr('content'))===heading.slice(0,firstQuote).trim()&&clean(documentTitle.text())===heading+' - Mxpress - Kênh thông ti thị trường'&&publicationPageKey($('meta[property="og:url"]').attr('content'),url)===publicationPageKey(url);
}
