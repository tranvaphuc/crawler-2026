import test from 'node:test';import assert from 'node:assert/strict';
import {classifyNewsLink} from '../src/web/newsLinkPolicy.mjs';import {discoverNewsLinks,parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';import {isNewsCategoryUrl} from '../src/web/newsCategoryPolicy.mjs';

test('Brands Vietnam recruitment routes are excluded from article discovery',()=>{
 const base='https://www.brandsvietnam.com';
 for(const path of ['/jobs/farmersmarket','/job/30-younet-group-head-of-social-commerce'])assert.equal(classifyNewsLink(base+path,'brandsvietnam.com').reason,'publisher_recruitment_page');
 assert.equal(classifyNewsLink(base+'/top50-2026-15-nam-ghi-dau-suc-ben-cua-doanh-nghiep-viet-nam','brandsvietnam.com').kind,'unknown');
 assert.equal(classifyNewsLink('https://example.com/jobs/market-news','example.com').kind,'unknown');
});

test('verified Kenh14 advertising contact is excluded without blocking article routes',()=>{
 assert.equal(classifyNewsLink('https://kenh14.vn/adv.chn','kenh14.vn').kind,'excluded');
 assert.equal(isNewsCategoryUrl('https://kenh14.vn/adv.chn',{domain:'kenh14.vn'}),false);
 assert.equal(classifyNewsLink('https://kenh14.vn/quang-cao-cong-nghe-215261112155438014.chn','kenh14.vn').kind,'unknown');
});
test('verified Blogger label categories remain seeds while search and pagination stay excluded',()=>{
 for(const domain of ['autovn.com.vn','kinhtenews.com','phunustyle.vn']){
  const url='https://'+domain+'/search/label/Tin%20tuc';
  assert.equal(isNewsCategoryUrl(url,{domain}),true);
  assert.equal(classifyNewsLink(url,domain).kind,'listing');
  assert.equal(isNewsCategoryUrl('https://'+domain+'/search?q=tin',{domain}),false);
  assert.equal(isNewsCategoryUrl(url+'?updated-max=2026-11-01',{domain}),false);
 }
 assert.equal(isNewsCategoryUrl('https://example.com/search/label/unknown',{domain:'example.com'}),false);
});
test('Sports category, tag, player and scoreboard URLs cannot become articles through headline scoring',()=>{const base='https://bongda24h.vn';for(const p of ['/europa-conference-league-c616-p1.html','/tin-chuyen-nhuong-liverpool-tag11270.html','/cau-thu/nguyen-duc-tung-1095700.html','/truc-tiep-ket-qua/team-one-vs-team-two-314919.html']){assert.notEqual(classifyNewsLink(base+p,'bongda24h.vn').kind,'unknown');const r=discoverNewsLinks('<h2><a href="'+p+'">Một tiêu đề thật dài nhưng đây là trang danh sách</a></h2>',base+'/',{domain:'bongda24h.vn'});assert.equal(r.articles.length,0);}assert.equal(classifyNewsLink(base+'/video/ket-qua-the-cong-vs-thanh-hoa-hom-nay-189-464329.html','bongda24h.vn').kind,'unknown');});
test('Topic/category shapes and utility links stay separate from native news and video links',()=>{for(const u of ['https://tinxe.vn/trien-lam-o-to-thuong-hai-2023-cd1005','https://vov.vn/dong-su-kien/mot-chuyen-de-ky-niem-123456','https://kienthuc.net.vn/chu-de/ky-hop-quoc-hoi-4277.html','https://example.vn/ttps:/example.vn/bai-viet-123456.html','https://example.vn/dieu-khoan-su-dung'])assert.notEqual(classifyNewsLink(u,new URL(u).hostname).kind,'unknown');assert.equal(classifyNewsLink('https://example.vn/kinh-te/dieu-khoan-moi-cho-vay-123456.html','example.vn').kind,'unknown');assert.equal(classifyNewsLink('https://en.vietstock.vn/2026/11/native-stock-news-737-1234567.htm','en.vietstock.vn').kind,'unknown');});
test('Category policies keep native page one but do not expand page ten, topics or accounts',()=>{const site={domain:'bongda24h.vn'};assert(isNewsCategoryUrl('https://bongda24h.vn/europa-conference-league-c616-p1.html',site));assert(!isNewsCategoryUrl('https://bongda24h.vn/europa-conference-league-c616-p10.html',site));assert(!isNewsCategoryUrl('https://bongda24h.vn/doi-tuyen-tag12345.html',site));assert(!isNewsCategoryUrl('https://bongda24h.vn/account/settings',site));});
test('Known categories and plain navigation anchors are not articles, while slug-only WordPress stories remain discoverable',()=>{const url='https://example.vn/',category=url+'nhung-cau-chuyen-kinh-doanh-thanh-cong.html',story=url+'mot-bai-viet-voi-duong-dan-dai-khong-co-native-id/';const html='<nav><a href="'+category+'">Những câu chuyện kinh doanh thành công</a></nav><h2><a href="'+category+'">Những câu chuyện kinh doanh thành công</a></h2><article><h2><a href="'+story+'">Một bài viết thật với đường dẫn dài không có số</a></h2></article>';const r=discoverNewsLinks(html,url,{domain:'example.vn',knownCategoryUrls:[category]});assert.deepEqual(r.articles.map(a=>a.url),[story]);assert(r.categories.some(c=>c.url===category));});
test('Parsing a known category URL never manufactures a news date from its article cards',()=>{const r=parseConfiguredArticle('<h1>Danh sách các bản tin nổi bật</h1>','https://bongda24h.vn/europa-conference-league-c616-p1.html',{siteName:'bongda24h.vn'});assert.equal(r.error,'non_news_document:native_category_id');});
test('Observed community topic and exact English utility pages stay out of article discovery',()=>{for(const url of ['https://www.24h.com.vn/mxh/clb-manchester-united-tp1745460394680998669011277942893466.html','https://ambcrypto.com/about-us/','https://ambcrypto.com/advertise-with-us/','https://ambcrypto.com/our-authors/','https://ambcrypto.com/coins/spiko-amundi-overnight-swap-fund-eur/'])assert.equal(classifyNewsLink(url,new URL(url).hostname.replace(/^www\./,'')).kind,'excluded');assert.equal(classifyNewsLink('https://example.vn/news/privacy-policy-changes-123456.html','example.vn').kind,'unknown');});
test('a verified article accidentally listed among seeds remains discoverable while categories stay excluded',()=>{
 const home='https://publisher.vn/',story=home+'mot-bai-viet-da-duoc-kiem-chung/',category=home+'chuyen-muc/';
 const html=`<article><h2><a href="${story}">Bài viết có nội dung gốc đã được xác minh</a></h2><h2><a href="${category}">Các bài viết thuộc chuyên mục kinh doanh</a></h2></article>`;
 const found=discoverNewsLinks(html,home,{domain:'publisher.vn',knownCategoryUrls:[story,category],knownArticleUrls:[story]});
 assert.deepEqual(found.articles.map(a=>a.url),[story]);
});
test('only explicitly approved publisher aliases can contribute article links',()=>{
 const story='https://publisher-alias.vn/mot-bai-viet-da-duoc-kiem-chung-123456.html',outside='https://outside.vn/mot-bai-viet-khac-123457.html';
 const html=`<article><h2><a href="${story}">Bài viết chính chủ trên tên miền chuyển đổi</a></h2><h2><a href="${outside}">Bài viết ngoài publisher phải được loại bỏ</a></h2></article>`;
 assert.equal(discoverNewsLinks(html,'https://publisher.vn/',{domain:'publisher.vn'}).articles.length,0);
 assert.deepEqual(discoverNewsLinks(html,'https://publisher.vn/',{domain:'publisher.vn',allowedHosts:['publisher-alias.vn']}).articles.map(a=>a.url),[story]);
});
