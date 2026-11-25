import * as cheerio from 'cheerio';import {parsePublishedDate} from './configurableNewsParser.mjs';
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
const slug=x=>clean(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function normalizeCamauPoliceArticle(html,url){
 const u=new URL(url),m=u.pathname.match(/^\/ch\d+\/(\d+)-(.+)\.html$/);if(u.hostname!=='congan.camau.gov.vn'||!m)return null;
 const $=cheerio.load(html),owners=$('.NoidungLeft').filter((i,e)=>$(e).find('.fonttitle').length===1&&$(e).find('.fonttime').length===1&&$(e).find('.noidung').length===1);if(owners.length!==1)return {error:'camau_owned_article_scope_unconfirmed'};
 const owner=owners.first(),title=clean(owner.find('.fonttitle').text()),date=clean(owner.find('.fonttime').text()),body=owner.find('.noidung');
 if(slug(title).replaceAll('-','')!==slug(decodeURIComponent(m[2])).replaceAll('-','')||!parsePublishedDate(date,'Asia/Ho_Chi_Minh')||clean(body.text()).length<200)return {error:'camau_native_article_identity_or_fields_unconfirmed'};
 const description=body.find('p,div').toArray().filter(e=>!$(e).find('img,video,iframe').length).map(e=>clean($(e).text())).find(s=>s.length>=30&&s.length<=2000)||'';
 const out=cheerio.load('<html><head></head><body><article><h1></h1><div class="article-date"></div><div class="article-sapo"></div><div class="article-content"></div></article></body></html>');out('h1').text(title);out('.article-date').text(date);out('.article-sapo').text(description);out('.article-content').html(body.html());out('head').append(out('<link>').attr({rel:'canonical',href:u.href}),out('<meta>').attr({name:'description',content:description}),out('<meta>').attr({name:'crawler:native-id',content:m[1]}),out('<meta>').attr({name:'crawler:date-source',content:'native_visible_article_clock'}));return {html:out.html(),nativeId:m[1]};
}
