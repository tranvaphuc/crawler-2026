import * as cheerio from 'cheerio';import {getNewsStructuredData,newsObjectBelongsToPage} from './configurableNewsParser.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
export function normalizePublisherVideoCaption(html,url){
 let u;try{u=new URL(url);}catch{return null;}const host=u.hostname.replace(/^www\./,'');if(!['sggp.org.vn','baotintuc.vn','en.vietnamplus.vn'].includes(host))return null;
 const $=cheerio.load(html),articles=getNewsStructuredData(html,$).filter(a=>/^(?:NewsArticle|Article)$/.test(String(a['@type']))&&newsObjectBelongsToPage(a,url)),h=$('h1'),sapo=$('.article__sapo.cms-desc'),body=$('[itemprop="articleBody"]');
 if(articles.length!==1||h.length!==1||sapo.length!==1||body.length!==1||clean(articles[0].headline)!==clean(h.text())||String(articles[0].isAccessibleForFree)==='false')return null;
 try{if(new URL($('link[rel=canonical]').attr('href'),url).href!==u.href)return null;}catch{return null;}
 const caption=clean(sapo.text());if(caption.length<100||caption.length>3000||sapo.find('a,video,iframe').length)return null;
 const video=body.find('video,iframe');if(video.length!==1)return null;const src=video.attr('src')||video.find('source[src]').attr('src');try{const v=new URL(src),native=host==='sggp.org.vn'?v.hostname==='streaming-cms-sggp.epicdn.me'&&/\.mp4$/i.test(v.pathname):host==='baotintuc.vn'?v.hostname==='media3.baotintuc.vn'&&/\.(?:mp4|m3u8)$/i.test(v.pathname):['www.youtube.com','www.youtube-nocookie.com'].includes(v.hostname)&&/^\/embed\/[a-zA-Z0-9_-]{11}$/.test(v.pathname);if(v.protocol!=='https:'||!native||v.username||v.password)return null;}catch{return null;}
 const original=body.clone();original.find('script,style,video,audio,iframe,.vjs-control-bar,.social-share,.article__social,.related-news,.article__tag,.wrap-comment').remove();const text=clean(original.text()),authors=[articles[0].author?.name,$('meta[name=author]').attr('content'),...$('.article__author,.article-author,.article__source,[itemprop=author]').map((i,e)=>$(e).text()).get()].map(clean).filter(Boolean);
 if(text&&!authors.includes(text))return null;
 body.empty().append($('<p class="sggp-native-video-caption">').text(caption),video.clone());$('head').append($('<meta>').attr({name:'crawler:body-source',content:url+'#native-article-sapo'}),$('<meta>').attr({name:'crawler:body-kind',content:'native_video_caption_not_transcript'}));
 return {html:$.html(),normalization:'publisher_native_video_caption'};
}
