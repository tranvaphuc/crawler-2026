import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseConfiguredArticle,learnNewsConfig} from '../src/web/configurableNewsParser.mjs';
const url='https://suckhoecong.vn/vinamilk-d39473.html';
const config={siteName:'suckhoecong.vn',registrableDomain:'suckhoecong.vn',timezone:'Asia/Ho_Chi_Minh',title:{strategy:'selector',selector:'h1'},publishedDate:{strategy:'selector',selector:'.date'},body:{strategy:'selector',selector:'.content-detail'}};
const html='<h1>Vinamilk thuong hieu manh Viet Nam</h1><section class="box-author"><div class="info-author"><a href="/">SUCKHOE+</a><ul><li>08/04/2016 11:19</li></ul></div></section><div class="content-detail"><p>'+('Native article body text. '.repeat(40))+'</p></div><div class="item-sp"><div class="info"><h3><a href="/other-d104786.html">Other recommended article title</a></h3><div class="date">15/11/2026 10:11</div></div></div>';
test('a broad date selector cannot accept a recommendation clock',()=>{
 assert.match(parseConfiguredArticle(html,url,config).error,/publication_selector_points_to_other_article/);
});
test('a recommendation marker on the date node itself is rejected',()=>{
 const page=html+'<div class="related-date">14/11/2026</div>';
 const parsed=parseConfiguredArticle(page,url,{...config,publicationTimePolicy:'native_date_midnight_if_missing',publishedDate:{strategy:'selector',selector:'.related-date'}});
 assert.match(parsed.error,/publication_selector_points_outside_article/);
});
test('original article date survives recommendations and keeps the correct local clock',()=>{
 const cfg={...config,publishedDate:{strategy:'selector',selector:'section.box-author .info-author > ul > li:first-child'}};
 const parsed=parseConfiguredArticle(html,url,cfg);
 assert.equal(parsed.error,undefined);
 assert.equal(parsed._source.publishedDate,'2016-04-08T04:19:00.000Z');
 assert.equal(parsed.extracted.dateEvidence,'08/04/2016 11:19');
 const learned=learnNewsConfig(html,url,{domain:'suckhoecong.vn',url:'https://suckhoecong.vn',timezone:config.timezone,legacy:{}});
 assert.equal(learned.config.publishedDate.selector,cfg.publishedDate.selector);
});
test('date in aside fails and an author profile near a valid date does not fail',()=>{
 assert.match(parseConfiguredArticle(html+'<aside><div class="publication">15/11/2026 10:11</div></aside>',url,{...config,publishedDate:{strategy:'selector',selector:'.publication'}}).error,/outside_article/);
 const valid=html.replace('<ul><li>08/04/2016 11:19','<a href="/author-profile.html">Article author full name</a><ul><li>08/04/2016 11:19');
 assert.equal(parseConfiguredArticle(valid,url,{...config,publishedDate:{strategy:'selector',selector:'.info-author li:first-child'}})._source.publishedDate,'2016-04-08T04:19:00.000Z');
});
test('the other repaired publishers use their article clock ahead of recommendation clocks',()=>{
 for(const [domain,native] of [['thuongtruong24h.vn','<div class="dt-news__body"><div class="tacgia-area"><div class="datetime">08/04/2016 11:19</div></div></div>'],['vietq.vn','<article class="detail-art"><div class="datetimeup">11:19 08/04/2016</div></article>']]){
  const cfg=JSON.parse(fs.readFileSync(new URL('../config/web-sources/news/'+domain+'.json',import.meta.url)));
  const parsed=parseConfiguredArticle(html.replace('suckhoecong','publisher')+native,'https://'+domain+'/story-12345.html',{...config,siteName:domain,publishedDate:cfg.publishedDate});
  assert.equal(parsed._source?.publishedDate,'2016-04-08T04:19:00.000Z',domain+': '+parsed.error);
 }
});
test('an unlinked native audio headline prevents neighboring links from owning its clock',()=>{
 const audio='<div><h3>Original native audio programme</h3><span class="publication">08/04/2016 11:19</span></div><h3><a href="/another.html">Another programme title</a></h3>';
 const parsed=parseConfiguredArticle(html+audio,url,{...config,publishedDate:{strategy:'selector',selector:'.publication'}});
 assert.equal(parsed._source?.publishedDate,'2016-04-08T04:19:00.000Z');
});
