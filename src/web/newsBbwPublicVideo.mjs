import * as cheerio from 'cheerio';
import {getNewsStructuredData,newsObjectBelongsToPage} from './configurableNewsParser.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function assignedArray(script){
 const match=/\bconst\s+videosData\s*=\s*/.exec(script);if(!match)return null;
 const start=match.index+match[0].length;if(script[start]!=='[')return null;
 let depth=0,quoted=false,escaped=false;
 for(let i=start;i<script.length;i++){const ch=script[i];if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}else if(ch==='"')quoted=true;else if(ch==='[')depth++;else if(ch===']'&&--depth===0){try{return JSON.parse(script.slice(start,i+1));}catch{return null;}}}
 return null;
}
export function normalizeBbwPublicVideo(html,url){
 let u;try{u=new URL(url);}catch{return null;}if(u.hostname.replace(/^www\./,'')!=='bbw.vn')return null;
 const match=u.pathname.match(/^\/([a-z0-9-]+)-(\d+)\.html$/);if(!match)return null;
 const $=cheerio.load(html),self=getNewsStructuredData(html,$).filter(a=>newsObjectBelongsToPage(a,url)&&/Article/.test(String(a['@type'])));
 if(self.length!==1||self[0].isAccessibleForFree===false||String(self[0].isAccessibleForFree)==='false')return null;
 const schema=self[0];if($('h1').toArray().some(e=>clean($(e).text())===clean(schema.headline)))return null;
 const records=[];$('script:not([src])').each((i,e)=>{const array=assignedArray($(e).text());if(Array.isArray(array))records.push(...array);});
 const selected=records.filter(r=>String(r.PostId)===match[2]&&r.Slug===match[1]);
 if(selected.length!==1)return null;const record=selected[0];
 if(!/^[a-zA-Z0-9_-]{11}$/.test(record.youtubeId||'')||clean(record.Title)!==clean(schema.headline)||clean(record.PublishedTime)!==clean(schema.datePublished)||clean(schema.description).length<30)return {error:'BBW_PUBLIC_VIDEO_IDENTITY_UNCONFIRMED'};
 const declared=$('link[rel="canonical"]').attr('href');try{const c=new URL(declared,url);if(c.hostname.replace(/^www\./,'')!=='bbw.vn'||c.pathname!==u.pathname)return {error:'BBW_PUBLIC_VIDEO_IDENTITY_UNCONFIRMED'};}catch{return {error:'BBW_PUBLIC_VIDEO_IDENTITY_UNCONFIRMED'};}
 const safeSchema=JSON.stringify(schema).replace(/</g,'\\u003c');
 return {html:'<!doctype html><html><head><title>'+escape(schema.headline)+'</title><link rel="canonical" href="'+escape(url)+'"><meta name="description" content="'+escape(schema.description)+'"><meta name="crawler:body-source" content="'+escape(url)+'"><script type="application/ld+json">'+safeSchema+'</script></head><body><article class="bbw-native-video"><h1>'+escape(schema.headline)+'</h1><time>'+escape(record.PublishedTime)+'</time><div class="bbw-native-public-body"><p>'+escape(schema.description)+'</p><iframe src="https://www.youtube.com/embed/'+escape(record.youtubeId)+'"></iframe></div></article></body></html>',normalization:'url_bound_bbw_public_video'};
}
