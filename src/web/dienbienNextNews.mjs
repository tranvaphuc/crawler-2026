import * as cheerio from 'cheerio';
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
export function normalizeDienbienNextArticle(html,url){
 const u=new URL(url),match=decodeURIComponent(u.pathname).match(/^\/tin-bai\/([^/]+)\/([^/]+)\/?$/);if(u.hostname.replace(/^www\./,'')!=='baodienbienphu.vn'||!match)return null;
 const $=cheerio.load(html),records=[];
 for(const element of $('script:not([src])').toArray()){
  const source=$(element).text();if(!source.startsWith('self.__next_f.push('))continue;
  let tuple;try{tuple=JSON.parse(source.slice(source.indexOf('(')+1,source.lastIndexOf(')')));}catch{continue;}
  if(tuple[0]!==1||typeof tuple[1]!=='string')continue;
  for(const line of tuple[1].split('\n')){const m=line.match(/^[a-f0-9]+:(\{.*\})$/s);if(!m)continue;try{const r=JSON.parse(m[1]);if(r.article_slug===match[2]&&r.category_slug===match[1]&&r.article_type_slug==='tin-bai')records.push(r);}catch{}}
 }
 if(records.length!==1)return {error:'dienbien_native_article_identity_unconfirmed'};
 const p=records[0],title=clean(p.article_title),body=$('.editor-content');
 const metadata=clean($('meta[property="og:title"]').attr('content')||$('title').text());
 if(!Number.isSafeInteger(p.article_id)||!title||!metadata.startsWith(title)||body.length!==1||body.text().trim().length<200||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(p.publish_date||''))return {error:'dienbien_native_article_fields_unconfirmed'};
 const out=cheerio.load('<html><head></head><body><article><h1></h1><div class="article-sapo"></div><div class="article-content"></div></article></body></html>');out('h1').text(title);out('.article-sapo').text(p.article_sapo||'');out('.article-content').html(body.html());
 out('head').append(out('<link>').attr({rel:'canonical',href:u.href}),out('<meta>').attr({name:'description',content:p.article_sapo||''}),out('<meta>').attr({property:'article:published_time',content:p.publish_date}),out('<meta>').attr({name:'author',content:p.pen_name||p.author_name||''}),out('<meta>').attr({property:'og:image',content:p.avatar_image||''}),out('<meta>').attr({name:'crawler:native-id',content:String(p.article_id)}),out('<meta>').attr({name:'crawler:date-source',content:'public_next_publish_date'}),out('<meta>').attr({name:'crawler:source-api',content:u.href}));out('head').append(out('<script type="application/ld+json">').text(JSON.stringify({'@type':'NewsArticle',url:u.href,headline:title,datePublished:p.publish_date}).replace(/</g,'\\u003c')));return {html:out.html(),nativeId:String(p.article_id)};
}
