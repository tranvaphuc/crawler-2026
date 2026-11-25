import * as cheerio from 'cheerio';

// Read a literal JSON object from a public assignment. Never evaluate source JS.
export function readDantriJsonAssignment(html,name,dom){
 const $=dom||cheerio.load(html),escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp('(?:^|[;\\s])'+escaped+'\\s*=\\s*','g');
 for(const script of $('script:not([src])').toArray()){
  const text=$(script).text();pattern.lastIndex=0;let match;
  while((match=pattern.exec(text))){const start=pattern.lastIndex;if(text[start]!=='{')continue;let depth=0,quoted=false,escapedChar=false;
   for(let i=start;i<text.length;i++){const ch=text[i];if(quoted){if(escapedChar)escapedChar=false;else if(ch==='\\')escapedChar=true;else if(ch==='"')quoted=false;continue;}if(ch==='"'){quoted=true;continue;}if(ch==='{')depth++;if(ch==='}'&&--depth===0){try{return JSON.parse(text.slice(start,i+1));}catch{break;}}}
  }
 }
 return null;
}
const isDantri=url=>new URL(url).hostname.replace(/^www\./,'')==='dantri.com.vn';
export function dantriDt360ListingEndpoint(html,url){
 if(!isDantri(url))return null;const $=cheerio.load(html),node=$('[data-module="dt-360-page"][data-page-type="swiper"]'),tracking=readDantriJsonAssignment(html,'window.wDataLayer',$);
 const zone=node.attr('data-zone-id'),offset=node.attr('data-offset');
 if(node.length!==1||tracking?.page_type!=='cate'||String(tracking.cate_id)!==zone||!/^\d+$/.test(zone||'')||!/^\d+$/.test(offset||''))return null;
 return 'https://webapi.dantri.com.vn/api/articles/recent-by-cate/'+zone+'/'+offset+'/5?onlyId=false';
}
export function appendDantriDt360Links(html,url,records){
 if(!dantriDt360ListingEndpoint(html,url)||!Array.isArray(records))return {error:'dantri_dt360_public_listing_invalid'};
 const $=cheerio.load(html),first=readDantriJsonAssignment(html,'window.DT_GLOBAL.article',$),items=[first,...records],section=$('<section data-crawler-dt360="public-api">'),seen=new Set();
 for(const item of items){if(!item?.title||!item.id||!item.localPath)continue;let target;try{target=new URL(item.localPath,url);}catch{continue;}if(target.hostname!=='dantri.com.vn'||!/^\/dt360\/.+-(\d+)\.htm$/.test(target.pathname)||target.pathname.match(/-(\d+)\.htm$/)[1]!==String(item.id)||seen.has(target.href))continue;seen.add(target.href);section.append($('<article>').append($('<h2>').append($('<a>').attr('href',target.href).text(item.title))));}
 if(!seen.size)return {error:'dantri_dt360_public_listing_empty'};$('body').append(section);return {html:$.html(),articleLinks:seen.size};
}
export function isDantriCategory(html,url,dom){if(!isDantri(url))return false;const state=readDantriJsonAssignment(html,'window.wDataLayer',dom);return state?.page_type==='cate'&&state.item_id===null;}
export function normalizeDantriVideoPublication(html,url){
 if(!isDantri(url))return null;
 const target=new URL(url),match=target.pathname.match(/^\/video\/[^/]+-(\d+)\.htm$/);
 if(!match||target.search||target.hash)return null;
 const $=cheerio.load(html),canonical=$('head link[rel="canonical"]');
 const owns=value=>{try{return new URL(value).href===target.href;}catch{return false;}};
 if(canonical.length!==1||!owns(canonical.attr('href')))return null;
 const tracking=readDantriJsonAssignment(html,'window.wDataLayer',$),published=tracking?.published_date;
 if(tracking?.page_type!=='video'||String(tracking.item_id)!==match[1]||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(published||'')||!Number.isFinite(Date.parse(published)))return null;
 const videos=[];
 for(const element of $('script[type="application/ld+json"]').toArray()){
  try{const schema=JSON.parse($(element).text());if(schema['@type']==='VideoObject'&&owns(schema.url))videos.push({element,schema});}catch{}
 }
 if(videos.length!==1)return null;
 const {element,schema}=videos[0];
 if(schema.datePublished||Math.floor(Date.parse(schema.uploadDate)/1000)!==Math.floor(Date.parse(published)/1000))return null;
 const heading=$('h1'),normalize=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
 const title=normalize(heading.text()),label=typeof schema.name==='string'?normalize(cheerio.load(schema.name,null,false).text()):'';
 if(heading.length!==1||!title||label!=='Video: '+title)return null;
 $(element).text(JSON.stringify({...schema,headline:title,datePublished:published}).replace(/</g,'\\u003c'));
 return {html:$.html(),evidence:{normalization:'dantri_video_public_inline_json',nativeId:match[1],publishedDate:published}};
}
export function normalizeDantriDt360(html,url){
 if(!isDantri(url)||!/^\/dt360\/.+-\d+\.htm$/.test(new URL(url).pathname))return null;
 const $=cheerio.load(html);if(!$('[data-module="dt-360-page"][data-page-type="detail"]').length)return null;
 const article=readDantriJsonAssignment(html,'window.DT_GLOBAL.article',$),tracking=readDantriJsonAssignment(html,'window.wDataLayer',$),video=readDantriJsonAssignment(html,'window.DT_GLOBAL.article.videoInNews',$);
 const id=new URL(url).pathname.match(/-(\d+)\.htm$/)?.[1],canonical=$('link[rel=canonical]').attr('href');
 const same=raw=>{try{const a=new URL(raw,url),b=new URL(url);return a.hostname.replace(/^www\./,'')===b.hostname.replace(/^www\./,'')&&a.pathname===b.pathname;}catch{return false;}};
 if(!article||!tracking||!id||String(article.id)!==id||String(tracking.item_id)!==id||tracking.page_type!=='article'||!same(article.url)||!canonical||!same(canonical))return {error:'dantri_dt360_identity_unconfirmed'};
 if(!article.title||!article.sapo||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(tracking.published_date||''))return {error:'dantri_dt360_publication_or_content_unconfirmed'};
 if(!Number.isSafeInteger(video?.id)||video.id<=0||typeof video.streamLocalPath!=='string'||!/^\/vod\/[^?#]+\.(?:m3u8|mp4)$/.test(video.streamLocalPath)||video.streamLocalPath.includes('..'))return {error:'dantri_dt360_native_video_unconfirmed'};
 // VIDEO_DOMAIN verified in the publisher's public common bundle (evidence in deepcheck output).
 const videoUrl=new URL(video.streamLocalPath,'https://vcdn.dantri.com.vn').href;
 const out=cheerio.load('<html><head></head><body><main class="container"><h1></h1><article class="dantri-dt360"><p></p><video></video></article></main></body></html>');
 out('h1').text(article.title);out('p').text(article.sapo);out('video').attr('src',videoUrl);
 const authors=(article.listAuthor||[]).map(a=>a.authorName).filter(Boolean);
 const schema={'@context':'https://schema.org','@type':'NewsArticle',headline:article.title,datePublished:tracking.published_date,url,author:authors.map(name=>({'@type':'Person',name}))};
 out('head').append(out('<link>').attr({rel:'canonical',href:url}),out('<meta>').attr({name:'description',content:article.sapo}),out('<meta>').attr({name:'author',content:authors.join(', ')}),out('<meta>').attr({property:'og:image',content:article.image||''}),out('<script type="application/ld+json">').text(JSON.stringify(schema).replace(/</g,'\\u003c')));
 return {html:out.html(),evidence:{normalization:'dantri_dt360_public_inline_json',nativeId:id,videoId:video.id,publishedDate:tracking.published_date,videoUrl,authorNames:authors}};
}
