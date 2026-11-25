import test from 'node:test';import assert from 'node:assert/strict';
import {normalizePublicationFeedListing,publicationFeedDiscovery} from '../src/web/newsPublicationListing.mjs';
import {discoverNewsLinks} from '../src/web/configurableNewsParser.mjs';

const target='https://www.vietnam.vn/mo-ky-vong-cho-chang-duong-moi';
function sitemap(url=target,date='2026-11-19T10:03:00Z'){return `<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>${url}</loc><news:news><news:publication_date>${date}</news:publication_date><news:title>Mở kỳ vọng cho chặng đường mới</news:title></news:news></url></urlset>`;}
test('a native news sitemap discovers a short article slug with its original headline',()=>{
  const page=normalizePublicationFeedListing(sitemap(),'https://www.vietnam.vn/news-sitemap.xml');
  const found=discoverNewsLinks(page.html,'https://www.vietnam.vn/news-sitemap.xml',{domain:'vietnam.vn'});
  assert(found.articles.some(a=>a.url===target));
  assert.equal(page.publicationContext.items[0].iso,'2026-11-19T10:03:00.000Z');
});
test('feed normalization does not admit an external publisher or invent a publication clock',()=>{
  assert.equal(normalizePublicationFeedListing(sitemap('https://elsewhere.example/article'),'https://www.vietnam.vn/news-sitemap.xml'),null);
  const withoutClock=normalizePublicationFeedListing(sitemap(target,'not-a-clock'),'https://www.vietnam.vn/news-sitemap.xml');
  assert.equal(withoutClock.publicationContext.items.length,0);
  assert.equal(publicationFeedDiscovery(withoutClock).articles[0].publishedHint,undefined);
  assert.equal(normalizePublicationFeedListing('<html><article>ordinary HTML</article></html>','https://www.vietnam.vn/'),null);
});
test('publisher feed discovery retains article slugs resembling utility page names',()=>{
  const url='https://www.vietnam.vn/gioi-thieu-van-hoa-ca-phe-viet-nam-toi-ban-be-quoc-te-tai-new-york';
  const page=normalizePublicationFeedListing(sitemap(url),'https://www.vietnam.vn/news-sitemap.xml');
  assert.equal(publicationFeedDiscovery(page).articles[0].url,url);
  assert.equal(publicationFeedDiscovery({publicationContext:page.publicationContext}),null);
  const forged={...page,publicationListingLinks:[{url:'https://elsewhere.example/story'},{url:'https://user:secret@www.vietnam.vn/story'}]};
  assert.deepEqual(publicationFeedDiscovery(forged).articles,[]);
});
test('RSS links remain discoverable without treating an unproven clock as publication evidence',()=>{
  const url='https://viettimes.vn/example-post208639.html',xml=`<rss><channel><item><title>Native publisher article</title><link>${url}</link><pubDate>Thu, 19 Nov 2026 20:51:00</pubDate></item></channel></rss>`,page=normalizePublicationFeedListing(xml,'https://viettimes.vn/rss/home.rss');
  assert.equal(page.publicationContext.items.length,0);
  assert.deepEqual(publicationFeedDiscovery(page).articles,[{url,title:'Native publisher article'}]);
});
