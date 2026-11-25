import test from 'node:test';
import assert from 'node:assert/strict';
import {learnNewsConfig,parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {classifyNewsLink} from '../src/web/newsLinkPolicy.mjs';
const title='A complete native publisher article headline',url='https://example.vn/native-123456.html',site={domain:'example.vn',url:'https://example.vn/'};
const schema=declared=>'<script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',headline:title,datePublished:'2026-11-09T08:00:00+07:00',url:declared})+'</script>';
const paragraphs=Array.from({length:4},(_,i)=>'<p>'+('Original substantial paragraph '+i+'. ').repeat(15)+'</p>').join('');
test('Text-only CMS recommendation tables cannot overwhelm the native video body; ordinary text tables remain',()=>{
 const html='<h1>'+title+'</h1>'+schema(url)+'<div class="media-box"><table class="__MB_ARTICLE_A"><tr><td><a href="/other-1">A complete unrelated recommendation headline one</a><a href="/other-2">A complete unrelated recommendation headline two</a></td></tr></table><iframe src="https://www.youtube.com/embed/native"></iframe><table><tr><td>Original native table content</td></tr></table></div>',r=learnNewsConfig(html,url,site);
 assert(r.config);const parsed=parseConfiguredArticle(html,url,r.config);assert(!parsed.error);assert(!parsed._source.content.includes('recommendation'));assert(parsed._source.content.includes('Original native table content'));assert.equal(parsed.extracted.media[0].url,'https://www.youtube.com/embed/native');
});
test('Structural body learning requires schema identity and retains the complete paragraph block',()=>{
 const html='<h1>'+title+'</h1>'+schema(url)+'<div class="mb-8">Toolbar</div><div class="mb-8"><div>'+paragraphs+'</div></div>',r=learnNewsConfig(html,url,site);
 assert(r.config);assert.equal(r.config.body.selector,'.mb-8:eq(1)');const parsed=parseConfiguredArticle(html,url,r.config);assert(!parsed.error);assert(parsed._source.content.includes('paragraph 0'));assert(parsed._source.content.includes('paragraph 3'));
 const unrelated=learnNewsConfig(html.replace(schema(url),schema('https://example.vn/other-123456.html')),url,site);assert.equal(unrelated.error,'missing_body');
});
test('Structural learning refuses a single section that would drop most of the article',()=>{
 const html='<h1>'+title+'</h1>'+schema(url)+'<section class="segment">'+paragraphs+'</section><section class="segment">'+paragraphs+'</section>',r=learnNewsConfig(html,url,site);assert.equal(r.error,'missing_body');
});
test('MasterCMS iframe and media-box bodies retain native media while recommendation tables are removed',()=>{
 for(const cls of ['__MASTERCMS_CONTENT','media-box']){const html='<h1>'+title+'</h1>'+schema(url)+'<div class="'+cls+'"><iframe src="https://www.youtube.com/embed/native"></iframe><table class="__MB_ARTICLE_A"><tr><td><a href="/other"><img src="/ad.jpg">An unrelated recommended publisher headline</a></td></tr></table></div>',r=learnNewsConfig(html,url,site);assert(r.config);const parsed=parseConfiguredArticle(html,url,r.config);assert(!parsed.error);assert.deepEqual(parsed.extracted.media,[{type:'iframe',url:'https://www.youtube.com/embed/native'}]);assert(!parsed._source.content.includes('unrelated'));}
});
test('Mixed publisher hash/numeric/media article routes survive category filtering',()=>{
 for(const [d,p] of [['baovinhlong.com.vn','/chinh-tri/bao-ve-nen-tang-tu-tuong-cua-dang/'],['dautuvietnam.com.vn','/kinh-doanh/khoi-nghiep-lam-giau'],['techz.vn','/tin-moi-nhat.html'],['doisongphapluat.nguoiduatin.vn','/ev204/native-topic.html'],['tapchikinhtetaichinh.vn','/tieu-diem/native-topic.topic'],['langngheviet.com.vn','/doc-tap-chi-in/native-issue.paper']])assert.notEqual(classifyNewsLink('https://'+d+p,d).kind,'unknown');
 for(const [d,p] of [['baovinhlong.com.vn','/thoi-su/202611/native-story-8e80c57/'],['doanhnghiephoinhap.vn','/native-video-2349.media'],['kiemsat.vn','/native-story-123456.html']])assert.equal(classifyNewsLink('https://'+d+p,d).kind,'unknown');
});
