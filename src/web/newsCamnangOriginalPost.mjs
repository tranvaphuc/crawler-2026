import * as cheerio from 'cheerio';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
// This source exposes its original UTC clock through its public post record.
// The HTML post ID, native heading, canonical URL and API record must agree.
export function camnangOriginalPostEndpoint(html,url){
 let u;try{u=new URL(url);}catch{return null;}
 if(u.hostname.replace(/^www\./,'')!=='camnangdulich.vn'||u.search||!/^\/[^/]+\.html$/.test(u.pathname))return null;
 const $=cheerio.load(html),headings=$('article[id^="post-"] h1').toArray();if(headings.length!==1)return null;
 const h=$(headings[0]),owner=h.closest('article'),id=(owner.attr('id')||'').match(/^post-([1-9]\d*)$/)?.[1];
 if(!id||!clean(h.text())||/isAccessibleForFree["']?\s*:\s*(?:false|["']false["'])/i.test(html))return null;
 const canon=$('link[rel="canonical"]').toArray();if(canon.length!==1)return null;
 try{const c=new URL($(canon[0]).attr('href'),url);if(c.origin!==u.origin||decodeURI(c.pathname)!==decodeURI(u.pathname)||c.search)return null;}catch{return null;}
 const api=new URL('/wp-json/wp/v2/posts/'+id,u);api.searchParams.set('_embed','author,wp:featuredmedia');
 return {id:Number(id),title:clean(h.text()),apiUrl:api.href};
}
export function camnangOriginalPostMatches(raw,identity){return raw?.id===identity?.id&&clean(cheerio.load(raw?.title?.rendered||'').text())===identity?.title;}
