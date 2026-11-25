import test from 'node:test';
import assert from 'node:assert/strict';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';

test('an inline related-content card cannot override or conflict with the original article clock',()=>{
 const url='https://publisher.vn/article-12345.html';
 const html='<link rel="canonical" href="'+url+'"><meta name="description" content="Original publisher article summary."><article><h1>Original publication headline</h1><time class="publication">17/11/2026 08:30 GMT+7</time><p>'+('Original article paragraph. '.repeat(40))+'</p><related-content><div class="info"><a href="https://publisher.vn/other-12346.html">Another article</a><div class="date">16/11/2026 09:30 GMT+7</div></div></related-content></article>';
 const config={siteName:'publisher.vn',siteId:'publisher.vn',registrableDomain:'publisher.vn',timezone:'Asia/Ho_Chi_Minh',publicationValidationPolicy:'strict_native_publication_v1',title:{strategy:'selector',selector:'h1'},body:{strategy:'selector',selector:'article p'},publishedDate:{strategy:'selector',selector:'.publication'}};
 const parsed=parseConfiguredArticle(html,url,config);
 assert.equal(parsed.error,undefined);
 assert.equal(parsed._source.publishedDate,'2026-11-17T01:30:00.000Z');
 const unrelated=parseConfiguredArticle(html,url,{...config,publishedDate:{strategy:'selector',selector:'related-content .date'}});
 assert.equal(unrelated.error,'publication_selector_points_outside_article');
});
