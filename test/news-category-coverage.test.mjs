import test from 'node:test';import assert from 'node:assert/strict';
import {categoryUrl,inspectCategoryPage} from '../src/newsFlow/categoryCoverage.mjs';
import {DatabaseSync} from 'node:sqlite';import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
const source={domain:'example.com',config:{allowedHosts:['example.com','www.example.com'],validation:{sampleUrls:['https://example.com/known-story-123456.html']}}};
const cards=()=>`<article><h2><a href="/first-long-editorial-story-123456.html">First independently published editorial story</a></h2></article><article><h2><a href="/second-long-editorial-story-234567.html">Second independently published editorial story</a></h2></article>`;
const page=extra=>`<html><head><title>Editorial section and all latest reports</title></head><body>${extra}${cards()}</body></html>`;
test('category candidates reject forbidden hosts, utilities, stories, query pagination and foreign domains',()=>{
 for(const value of [undefined,null,'',42,{}])assert.equal(categoryUrl(value,'https://example.com/business',source),null);
 for(const value of ['/U%3Cli%3E%3Ca%20href=','/UB<li><a href=','/news?section=%3Cli%3E','/news%00broken'])assert.equal(categoryUrl(value,'https://example.com/',source),null);
 for(const url of ['https://fireant.vn/news','https://x.fireant.vn/news','https://other.com/business','https://example.com/search?q=money','https://example.com/news?page=2','https://example.com/lich-van-nien','https://example.com/known-story-123456.html','https://example.com/something-234567.html','https://example.com/news.rss','https://example.com/topics/money'])assert.equal(categoryUrl(url,'https://example.com/',source),null,url);
 assert.equal(categoryUrl('/business/banking','https://example.com/',source),'https://example.com/business/banking');
});
test('nested navigation and publisher breadcrumb expose children and image links without confusing article cards',()=>{
 const html=page(`<nav><a href="/business">Business</a><a href="/business/banking">Banking</a><a href="/tags/loans">Loans tag</a></nav><div class="sub-nav"><a href="/business/creative-banking">Creative banking</a></div><script type="application/ld+json">${JSON.stringify({'@type':'BreadcrumbList',itemListElement:[{name:'Banking innovation',item:'https://example.com/business/innovation'}]})}</script>`),r=inspectCategoryPage({html,url:'https://example.com/business',source});
 assert.equal(r.listing,true);assert.equal(r.articles.length,2);assert.deepEqual(r.categories.map(c=>new URL(c.url).pathname).sort(),['/business/banking','/business/creative-banking','/business/innovation']);
});
test('a real article with related story cards is never verified as a new section',()=>{
 const url='https://example.com/report-with-related-stories-999999.html',html=page(`<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle','@id':url+'#article',mainEntityOfPage:{'@id':url},headline:'Current editorial report',datePublished:'2026-11-20T16:00:00+07:00'})}</script><h1>Current editorial report</h1><p>Its own original article body is separate from the related article cards.</p>`),r=inspectCategoryPage({html,url,source});assert.equal(r.selfArticle,true);assert.equal(r.listing,false);
});
test('an article remains an article when its JSON-LD omits URL binding and publishes only a day',()=>{
 const headline='A native photo report with its own original headline',html=page('<h1>'+headline+'</h1><script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',headline,datePublished:'2026-11-20'})+'</script><nav><a href="/business/banking">Banking</a></nav>');const r=inspectCategoryPage({html,url:'https://example.com/a-report-with-no-numeric-id.html',source});assert.equal(r.selfArticle,true);assert.equal(r.listing,false);assert.deepEqual(r.categories,[]);
 const listing=inspectCategoryPage({html:html.replace('<h1>'+headline+'</h1>','<h1>Latest business and banking news</h1>'),url:'https://example.com/business',source});assert.equal(listing.selfArticle,false);assert.equal(listing.listing,true);
});
test('utility pages and sidebar recommendations do not establish editorial section coverage',()=>{
 const finance={domain:'finance.yahoo.com',config:{allowedHosts:['finance.yahoo.com']}};
 for(const path of ['/calendar/earnings/','/compare/','/markets/stocks/gainers/'])assert.equal(categoryUrl(path,'https://finance.yahoo.com/',finance),null);
 const kbs={domain:'world.kbs.co.kr',config:{allowedHosts:['world.kbs.co.kr']}};assert.equal(categoryUrl('/service/about_privacy.htm?lang=e','https://world.kbs.co.kr/',kbs),null);
 const r=inspectCategoryPage({html:page('<main><h1>A currency calculator</h1><p>This is a utility page with no primary editorial cards.</p></main><aside>'+cards()+'</aside>'),url:'https://example.com/utility',source});assert.equal(r.articles.length,2);assert.equal(r.primaryArticleCount,0);assert.equal(r.listing,false);
});
test('broken relative menus cannot grow repeated paths or borrow a fallback homepage listing',()=>{
 assert.equal(categoryUrl('/business/banking/business/','https://example.com/',source),null);assert.equal(categoryUrl('/business?order=price-desc','https://example.com/',source),null);
 const html=page('<nav><a href="business/">Business reports</a></nav>').replace('<head>','<head><link rel="canonical" href="https://example.com/">');const r=inspectCategoryPage({html,url:'https://example.com/business/business/',source});assert.equal(r.listing,false);assert.equal(r.reason,'section_canonical_identity_mismatch');assert.deepEqual(r.categories,[]);
});
test('pagination and product pages with related reports never create extra section branches',()=>{
 for(const path of ['/business/p52','/business/page27.htm','/business/trang-3'])assert.equal(categoryUrl(path,'https://example.com/',source),null);
 const html=page('<nav class="pagination"><a href="/business/2">2</a><a href="/business/3">3</a></nav><nav><a href="/business/banking">Banking</a></nav>'),r=inspectCategoryPage({html,url:'https://example.com/business',source});assert.deepEqual(r.categories.map(c=>new URL(c.url).pathname),['/business/banking']);
 const product=page('<script type="application/ld+json">'+JSON.stringify({'@type':'Product',url:'https://example.com/a-product',name:'A product',offers:{price:'100'}})+'</script>');assert.equal(inspectCategoryPage({html:product,url:'https://example.com/a-product',source}).listing,false);
 const car={domain:'oto.com.vn',config:{allowedHosts:['oto.com.vn']}};assert.equal(categoryUrl('https://oto.com.vn/bang-gia-xe-o-to-audi-q6-moi-nhat','https://oto.com.vn/',car),null);
});
test('HTTP success with a challenge or a single story link is not verified section coverage',()=>{
 const r=inspectCategoryPage({html:'<html><title>Just a moment</title><body>Please complete the captcha before proceeding</body></html>',url:'https://example.com/business',source});assert.equal(r.error,'access_blocked');
 const one=inspectCategoryPage({html:'<html><title>Navigation</title><body>'+('A place to start reading the newspaper. '.repeat(10))+'<a href="/only-long-story-123456.html">Only one available editorial report</a></body></html>',url:'https://example.com/business',source});assert.equal(one.listing,false);
});
test('recording a missing section creates only a review hint and preserves articles, failures and the shared AI ledger',()=>{
 const state=new ThreeFlowState(new DatabaseSync(':memory:')),s={...source,seeds:['https://example.com/business']};try{
 state.db.prepare('INSERT INTO ai_usage VALUES(?,?,?)').run('2026-11-23',141,1.96);state.db.prepare('INSERT INTO seed_sources(url_key,url,site) VALUES(?,?,?)').run('https://example.com/business/existing','https://example.com/business/existing',s.domain);
 state.discover('https://example.com/a-story-with-no-numeric-id',s.domain);state.db.prepare("UPDATE article_links SET parse_status='done' WHERE url=?").run('https://example.com/a-story-with-no-numeric-id');
 const hints=[{url:'/business'},{url:'/business/existing'},{url:'/business/banking'},{url:'/a-story-with-no-numeric-id'},{url:'https://fireant.vn/business'},{url:'/tags/money'}];
 assert.equal(state.rememberCategoryHints(s,hints,'https://example.com/',1000),1);assert.equal(state.rememberCategoryHints(s,hints,'https://example.com/',2000),0);
 assert.deepEqual({...state.db.prepare('SELECT url,state,last_at FROM news_category_hints').get()},{url:'https://example.com/business/banking',state:'pending',last_at:1000});
 assert.equal(state.db.prepare('SELECT count(*) n FROM seed_sources').get().n,1);assert.equal(state.db.prepare("SELECT parse_status FROM article_links WHERE url=?").get('https://example.com/a-story-with-no-numeric-id').parse_status,'done');assert.equal(state.db.prepare('SELECT calls FROM ai_usage').get().calls,141);
 }finally{state.close();}
});
