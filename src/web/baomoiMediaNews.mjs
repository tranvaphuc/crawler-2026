import * as cheerio from 'cheerio';

const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
function pageId(value,base){try{const u=new URL(value,base);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.hostname.replace(/^www\./,'')==='baomoi.com'?u.pathname.match(/(?:^\/c|-c)(\d+)\.epi$/)?.[1]:null;}catch{return null;}}
function mediaUrl(value,type){try{const u=new URL(value),host=/^(?:[a-z0-9-]+\.)*bmcdn\.me$/i.test(u.hostname)||type==='video'&&u.hostname==='baomoi-video.zadn.vn',extension=type==='video'?/\.mp4$/i:type==='audio'?/\.(?:mp3|m4a)$/i:/\.(?:jpe?g|png|webp|avif)$/i;return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&host&&extension.test(u.pathname)?u.href:null;}catch{return null;}}

// Bao Moi renders video placeholders on the server; the actual article media
// is in its public Next.js payload. Never infer a player from a thumbnail.
export function normalizeBaomoiMedia(html,url,{allowEmptyDescription=false}={}){
 const id=pageId(url);if(!id||!html.includes('__NEXT_DATA__'))return null;
 const $=cheerio.load(html),body=$('.content-body'),heading=$('h1'),state=$('script#__NEXT_DATA__[type="application/json"]');
 if(body.length!==1||heading.length!==1||state.length!==1||body.find('video,iframe,audio').length)return null;
 let response;try{response=JSON.parse(state.text()).props.pageProps.resp;}catch{return null;}
 const data=response?.data,c=data?.content;
 if(response?.err!==0||data?.page!=='contentdetail'||!c||c.status!==1||String(c.id)!==id||String(c.contentId)!==id||pageId(c.url,url)!==id||pageId(data.head?.meta?.canonicalUrl,url)!==id||pageId($('link[rel="canonical"]').attr('href'),url)!==id||clean(c.title)!==clean(heading.text())||!Array.isArray(c.bodys))return null;
 const objects=[];for(const e of $('script[type="application/ld+json"]').toArray()){try{const a=JSON.parse($(e).text());for(const o of Array.isArray(a)?a:[a])if(o['@type']==='NewsArticle'&&pageId(o.mainEntityOfPage?.['@id']||o.url,url)===id)objects.push(o);}catch{}}
 if(objects.length!==1||String(objects[0].isAccessibleForFree).toLowerCase()==='false'||clean(objects[0].headline)!==clean(c.title)||!Number.isFinite(c.publishedDate)||Date.parse(objects[0].datePublished)!==c.publishedDate*1000)return null;
 const media=c.bodys.filter(b=>['video','image','audio'].includes(b.type));
 if(!media.length||c.bodys.some(b=>String(b.contentId)!==id&&!(b.type==='table'&&b.contentId===undefined))||media.some(b=>!mediaUrl(b.content,b.type))||body.find('.video-wrapper').length!==media.filter(b=>b.type==='video').length||body.find('.body-image').length!==media.filter(b=>b.type==='image').length)return null;
 if(body.find('img').toArray().some(e=>!/^data:image\//.test($(e).attr('src')||'')))return null;
 const nativeSapo=$('h3.sapo'),nativeCaption=clean(nativeSapo.text());
 if(allowEmptyDescription&&!nativeCaption&&!clean(c.description)&&!clean(objects[0].description)&&nativeSapo.length<=1){
  body.find('.body-author,.content-social').remove();
  for(const b of c.bodys.filter(b=>b.type==='table')){const table=cheerio.load(String(b.content||''),null,false);table('script,style,iframe,video,audio,form,img').remove();const rows=table('tr').toArray().map(e=>table(e).find('th,td').toArray().map(n=>clean(table(n).text())).join(' | ')).filter(Boolean);if(rows.length)body.prepend($('<p class="baomoi-native-table">').text(rows.join('\n')));}
  for(const type of ['video','image'])body.find(type==='video'?'.video-wrapper':'.body-image').each((i,e)=>{const b=media.filter(b=>b.type===type)[i];$(e).replaceWith(type==='video'?$('<video controls>').attr('src',mediaUrl(b.content,type)):$('<img>').attr('src',mediaUrl(b.content,type)));});
  for(const b of media.filter(b=>b.type==='audio'))body.append($('<audio controls>').attr('src',mediaUrl(b.content,'audio')));
  $('head').append($('<meta>').attr({name:'crawler:baomoi-empty-description',content:'native_media_without_description'}));return {html:$.html()};
 }
 // Restore media only in short/empty bodies. Native paragraphs and credits
 // must match the payload and stay in place; ordinary text articles are unchanged.
 if(c.bodys.some(b=>!['video','image','audio','text'].includes(b.type)))return null;
 const remainder=body.clone();remainder.find('.video-wrapper,.body-image,.body-author,.content-social').remove();if(clean(remainder.text()).length>=100)return null;
 const texts=c.bodys.filter(b=>b.type==='text'&&b.subType!=='body-author').map(b=>clean(cheerio.load(String(b.content||''),null,false).text())),paragraphs=remainder.children('p.text');
 if(JSON.stringify(texts)!==JSON.stringify(paragraphs.toArray().map(e=>clean($(e).text()))))return null;
 paragraphs.remove();if(clean(remainder.text()))return null;
 const sapo=$('h3.sapo'),caption=clean(sapo.text());
 if(sapo.length>1||caption!==clean(c.description)||caption!==clean(objects[0].description))return null;
 if(!caption)return {error:'missing_description'};
 body.find('.body-author,.content-social').remove();
 body.prepend($('<p class="baomoi-native-media-caption">').text(caption));
 for(const type of ['video','image'])body.find(type==='video'?'.video-wrapper':'.body-image').each((i,e)=>{const b=media.filter(b=>b.type===type)[i];$(e).replaceWith(type==='video'?$('<video controls>').attr('src',mediaUrl(b.content,type)):$('<img>').attr({src:mediaUrl(b.content,type),alt:''}));});
 for(const b of media.filter(b=>b.type==='audio')){body.children('p.text').filter((i,e)=>/^(?:Tốc độ phát:1x|00:00)$/.test(clean($(e).text()))).remove();body.append($('<audio controls>').attr('src',mediaUrl(b.content,'audio')));}
 $('head').append($('<meta>').attr({name:'crawler:body-source',content:url+'#__NEXT_DATA__.props.pageProps.resp.data.content.bodys'}),$('<meta>').attr({name:'crawler:body-kind',content:'native_media_caption_not_transcript'}));
 return {html:$.html()};
}
