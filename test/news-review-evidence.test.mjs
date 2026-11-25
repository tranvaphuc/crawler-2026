import test from 'node:test';import assert from 'node:assert/strict';
import {newsReviewEvidence} from '../src/web/newsReviewEvidence.mjs';

test('bounded review evidence retains the late native article and publication clock instead of a long menu',()=>{
  const html='<html><head><meta name="description" content="Native article summary"><link rel="canonical" href="https://publisher.test/story"></head><body><nav>'+('Menu item '.repeat(10000))+'</nav><article class="news-detail"><h1 class="headline">A complete native article headline</h1><time datetime="2026-11-19T10:00:00+07:00"></time><div class="article-body"><p>'+('Native article paragraph. '.repeat(100))+'</p><p>Original final paragraph.</p></div></article></body></html>';
  const result=newsReviewEvidence(html);assert(Buffer.byteLength(result)<=4000);assert(result.includes('class="headline"'));assert(result.includes('datetime="2026-11-19T10:00:00+07:00"'));assert(result.includes('class="article-body"'));assert(result.includes('Native article paragraph'));assert(!result.includes('Menu item'));
});

test('source restrictions and exact-page structured publication remain in the evidence',()=>{
  const native={"@type":"NewsArticle",url:'https://publisher.test/story',headline:'The publisher native headline',datePublished:'2026-11-19T10:00:00Z',dateModified:'2026-11-19T11:00:00Z',isAccessibleForFree:false};
  const html='<head><script type="application/ld+json">'+JSON.stringify(native)+'</script><script>UNTRUSTED_EXECUTABLE()</script></head><body><h1>The publisher native headline</h1><article><p>'+('Tiếng Việt nguyên bản. '.repeat(150))+'</p></article></body>';
  const result=newsReviewEvidence(html);assert(result.includes('"isAccessibleForFree":false'));assert(result.includes(native.datePublished));assert(result.includes(native.dateModified));assert(!result.includes('UNTRUSTED_EXECUTABLE'));assert(!result.includes('\ufffd'));assert(Buffer.byteLength(result)<=4000);
});
