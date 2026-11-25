import * as cheerio from 'cheerio';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
export function normalizeGovernmentNuxtArticle(html,url){
 const u=new URL(url);if(u.hostname!=='botruong.bocongan.gov.vn'||!/^\/bai-viet\/[^/]+\/?$/.test(u.pathname))return null;
 const $=cheerio.load(html);let values;
 try{values=JSON.parse($('#__NUXT_DATA__').text());}catch{return {error:'public_nuxt_article_state_missing'};}
 if(!Array.isArray(values)||values.length>100000)return {error:'public_nuxt_article_state_invalid'};
 const ref=i=>Number.isInteger(i)&&i>=0&&i<values.length?values[i]:undefined;
 const slug=decodeURIComponent(u.pathname).replace(/^\/bai-viet\//,'').replace(/\/$/,'');
 const records=values.filter(v=>v&&typeof v==='object'&&!Array.isArray(v)&&ref(v.slug)===slug&&typeof ref(v.content)==='string');
 if(records.length!==1)return {error:'public_nuxt_article_identity_mismatch'};
 const r=records[0],title=ref(r.title),body=ref(r.content),date=ref(r.publish_date),id=ref(r.id),description=ref(r.short_content),author=ref(r.author),picture=ref(r.thumb_path);
 if(typeof title!=='string'||!clean(title)||typeof body!=='string'||cheerio.load(body).text().trim().length<200||!id||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)$/.test(date||''))return {error:'public_nuxt_article_fields_unconfirmed'};
 const headings=$('h1').map((i,e)=>clean($(e).text())).get();if(!headings.includes(clean(title)))return {error:'public_nuxt_article_headline_mismatch'};
 const out=cheerio.load('<html><head></head><body><article><h1></h1><div class="article-sapo"></div><div class="article-content"></div></article></body></html>');
 out('h1').text(title);out('.article-sapo').text(description||'');out('.article-content').html(body);
 out('head').append(out('<link>').attr({rel:'canonical',href:u.href}),out('<meta>').attr({name:'description',content:description||''}),out('<meta>').attr({property:'article:published_time',content:date}),out('<meta>').attr({name:'author',content:author||''}),out('<meta>').attr({property:'og:image',content:picture||''}),out('<meta>').attr({name:'crawler:native-id',content:String(id)}),out('<meta>').attr({name:'crawler:date-source',content:'public_nuxt_publish_date'}),out('<meta>').attr({name:'crawler:source-api',content:u.href}));
 out('head').append(out('<script type="application/ld+json">').text(JSON.stringify({'@type':'NewsArticle',url:u.href,headline:clean(title),datePublished:date}).replace(/</g,'\\u003c')));
 return {html:out.html(),nativeId:String(id),publicationDate:date};
}
