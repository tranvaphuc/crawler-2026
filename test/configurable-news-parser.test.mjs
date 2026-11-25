import {test} from 'node:test';import assert from 'node:assert/strict';
import {learnNewsConfig,parseConfiguredArticle,parsePublishedDate,discoverNewsLinks,pageIssue} from '../src/web/configurableNewsParser.mjs';
import {parseTinhteThread} from '../src/web/tinhteParser.mjs';
import {isNewsCategoryUrl} from '../src/web/newsCategoryPolicy.mjs';
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
test('VietnamFDI scopes its MDY publication clock to the article metadata',()=>{
 const html='<h1 class="article-title">Việt Nam trước cơ hội mới trong chuỗi cung ứng</h1><ul class="article-meta"><li>11/9/2026 9:00:00 PM</li></ul><div class="article-body"><ul class="article-meta"><li>11/6/2026 3:37:01 AM</li></ul><div class="description"><p>'+('Nội dung toàn văn của bài báo hiện tại. '.repeat(30))+'</p></div></div>';
 const site={domain:'vietnamfdi.vn',registrableDomain:'vietnamfdi.vn',url:'http://vietnamfdi.vn/',legacy:{}},url='http://vietnamfdi.vn/co-hoi-moi-3_134939.html',config=learnNewsConfig(html,url,site).config;
 const parsed=parseConfiguredArticle(html,url,config);assert(!parsed.error);assert.equal(parsed._source.publishedDate,'2026-11-05T20:37:01.000Z');assert.equal(config.homepage,'https://vietnamfdi.vn/');assert.equal(parsed.extracted.dateEvidence,'11/6/2026 3:37:01 AM');assert.equal(parsed.extracted.nativeId,'134939');
});
test('Dulichgiaitri uses the current article header instead of the logo or mega-menu timestamp',()=>{
 const html='<h1 class="td-logo">Dulichgiaitri</h1><div class="mega-menu"><h3 class="entry-title">Một bài khác trên menu</h3><span class="td-post-date"><time>01 Nov, 2026</time></span></div><header class="td-post-title"><h1 class="entry-title">Tiêu đề đúng của bài hiện tại</h1><span class="td-post-date"><time>06 Nov, 2026</time></span></header><div class="td-post-content"><p>'+('Nội dung bài hiện tại cần được thu thập đầy đủ. '.repeat(12))+'</p></div>';
 const s={domain:'dulichgiaitri.com',registrableDomain:'dulichgiaitri.com',url:'https://dulichgiaitri.com/',legacy:{}},url='https://dulichgiaitri.com/story-12345.html',config=learnNewsConfig(html,url,s).config;assert(config);
 const d=parseConfiguredArticle(html,url,config);assert.equal(d._source.title,'Tiêu đề đúng của bài hiện tại');assert.equal(d._source.publishedDate,'2026-11-05T17:00:00.000Z');
});
test('KBS news keeps the native query ID and exact sitemap publication time',()=>{
 const url='https://world.kbs.co.kr/service/news_view.htm?lang=e&Seq_Code=205427';
 const xml='<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>'+url.replace('&','&amp;')+'</loc><news:news><news:publication_date>2026-11-06T10:00:00+09:00</news:publication_date></news:news></url></urlset>';
 const context={...parsePublicPublicationFeed(xml,'https://world.kbs.co.kr/service/xml/sitemap_english_news.xml'),kind:'google_news_sitemap'};
 const html='<h1 class="logo">KBS WORLD</h1><h1>A complete public news headline</h1><div class="body_txt">'+('This is the complete public article body with all of its paragraphs. '.repeat(8))+'</div>';
 const s={domain:'world.kbs.co.kr',registrableDomain:'kbs.co.kr',url:'https://world.kbs.co.kr/',legacy:{}},config=learnNewsConfig(html,url,s,context).config;assert(config);
 const d=parseConfiguredArticle(html,url,config,context);assert.equal(d.extracted.nativeId,'205427');assert.equal(d._source.publishedDate,'2026-11-06T01:00:00.000Z');assert.equal(d.extracted.dateEvidenceSource,'google_news_sitemap');
});
test('public WordPress category listings yield canonical article links with strict source boundaries',()=>{
 const posts=[{id:2935,status:'publish',type:'post',link:'https://example.vn/my-tam/',title:{rendered:'Tiểu sử <b>Mỹ Tâm</b> và sự nghiệp'}},{id:2,status:'publish',type:'post',link:'https://other.test/article',title:{rendered:'Bài thuộc publisher khác'}},{id:3,status:'draft',type:'post',link:'https://example.vn/draft',title:{rendered:'Bài nháp không được thu thập'}}];
 const url='https://example.vn/wp-json/wp/v2/posts?categories=142&per_page=10',r=discoverNewsLinks(JSON.stringify(posts),url,{domain:'example.vn'});
 assert.equal(r.sourceKind,'wordpress_public_post_listing');assert.equal(r.articles.length,1);assert.equal(r.articles[0].url,'https://example.vn/my-tam/');assert.equal(r.articles[0].nativeId,'2935');
 assert(isNewsCategoryUrl(url,{domain:'example.vn'}));assert(!isNewsCategoryUrl('https://example.vn/wp-json/wp/v2/posts',{domain:'example.vn'}));
});
test('video metadata outside a clean caption can supply the publicly declared data-src',()=>{
 const html=`<h1>Bản tin video của Truyền hình Thông tấn</h1><time datetime="2026-11-06T08:00:00+07:00"></time><div class="video-detail__description">${'Đây là mô tả đầy đủ của bản tin video được xuất bản công khai. '.repeat(4)}</div><video id="tek4-player" data-src="https://media.test/public/master.m3u8"><span class="vjs-control-text">Loading player</span></video>`;
 const s={domain:'vietnammedia.vnanet.vn',registrableDomain:'vnanet.vn',url:'https://vietnammedia.vnanet.vn/',legacy:{}},url='https://vietnammedia.vnanet.vn/video/test-123456.htm',config=learnNewsConfig(html,url,s).config;assert(config);
 const d=parseConfiguredArticle(html,url,config);assert(!d.error);assert(!d._source.content.includes('Loading player'));assert.equal(d.extracted.media[0].url,'https://media.test/public/master.m3u8');
});
test('news sitemap publication_date is usable but lastmod alone never becomes a publication date',()=>{
 const xml='<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>https://example.vn/one</loc><lastmod>2026-11-07T09:00:00Z</lastmod><news:news><news:publication_date>2026-11-06T08:00:00+07:00</news:publication_date><news:title>First news title</news:title></news:news></url><url><loc>https://example.vn/two</loc><lastmod>2026-11-07T09:00:00Z</lastmod></url></urlset>';
 const context=parsePublicPublicationFeed(xml,'https://example.vn/news-sitemap.xml');assert.equal(context.items.length,1);assert.equal(context.publicationDates['https://example.vn/one'].iso,'2026-11-06T01:00:00.000Z');assert(!context.publicationDates['https://example.vn/two']);
});
test('a real article is not blocked merely because its scripts or login form mention CAPTCHA',()=>{
 const html=article('Bản tin có nội dung công khai bình thường','06/11/2026 08:00').replace('</body>','<script>const captcha="verify you are human";</script><form>CAPTCHA</form></body>');assert.equal(pageIssue(html),null);
 assert.equal(pageIssue('<html><title>Just a moment...</title><body>Verify you are human</body></html>'),'access_blocked');
});
test('publication locale is explicit and RFC timezone is read before month normalization',()=>{
 assert.equal(parsePublishedDate('11:01:44 AM | 10/28/2026','Asia/Ho_Chi_Minh','MDY').iso,'2026-10-28T04:01:44.000Z');
 assert.equal(parsePublishedDate('05/10/2026 08:00','Asia/Ho_Chi_Minh').iso,'2026-10-05T01:00:00.000Z');
 assert.equal(parsePublishedDate('Fri, 06 Nov 2026 08:00:00 +0700',null).iso,'2026-11-06T01:00:00.000Z');
});
test('category relative links honor a same-origin HTML base without admitting foreign hosts',()=>{
 const html='<base href="https://example.vn/"><h2><a href="mot-bai-viet-voi-tieu-de-day-du-123456.html">Một bài viết có tiêu đề đầy đủ để kiểm tra</a></h2><nav><a href="kinh-te/">Kinh tế</a></nav>';
 const r=discoverNewsLinks(html,'https://example.vn/sao/',{domain:'example.vn'});
 assert.equal(r.articles[0].url,'https://example.vn/mot-bai-viet-voi-tieu-de-day-du-123456.html');
 assert.equal(r.categories[0].url,'https://example.vn/kinh-te/');
 const foreign=discoverNewsLinks(html.replace('https://example.vn/','https://other.test/'),'https://example.vn/sao/',{domain:'example.vn'});
 assert(foreign.articles.every(a=>new URL(a.url).hostname==='example.vn'));
});
const site={domain:'example.vn',url:'https://example.vn/',legacy:{},registrableDomain:'example.vn'};
const body='Đây là nội dung bài viết đầy đủ, có nhiều đoạn riêng biệt để xác minh parser không lấy nhầm khung cookie hoặc danh sách bài liên quan. ';
test('RSS publication context matches the exact article URL and never uses comment or modified dates',()=>{
 const url='https://example.com/story-12345',second='https://example.com/story-54321';
 const xml=`<rss><channel><item><title>First</title><link>${url}</link><pubDate>Fri, 06 Nov 2026 08:00:00 +0700</pubDate></item><item><title>Second</title><link>${second}</link><pubDate>Sat, 07 Nov 2026 09:00:00 +0700</pubDate></item><item><link>${url}#comment-7</link><pubDate>Sat, 07 Nov 2026 09:00:00 +0700</pubDate></item></channel></rss>`;
 const context=parsePublicPublicationFeed(xml,'https://example.com/feed/');assert.equal(context.items.length,2);
 const foreign={...site,domain:'example.com',url:'https://example.com/'};
 const html=article('Một bài viết cần ngày đăng từ feed công khai','');const config=learnNewsConfig(html,url,foreign,context).config;
 assert(config);assert.equal(config.publishedDate.strategy,'public_feed');assert(!JSON.stringify(config).includes('2026-11-06T01:00:00'));
 assert.equal(parseConfiguredArticle(html,url,config,context)._source.publishedDate,'2026-11-06T01:00:00.000Z');
 assert.equal(parseConfiguredArticle(html,second,config,context)._source.publishedDate,'2026-11-07T02:00:00.000Z');
 assert(parseConfiguredArticle(html,second,config).error.includes('missing_published_date'));
 assert(parseConfiguredArticle(html,second,config,{...context,feedUrl:'https://other.test/feed/'}).error.includes('missing_published_date'));
 assert.equal(parsePublicPublicationFeed('<feed><entry><link href="'+url+'"/><updated>2026-11-06T01:00:00Z</updated></entry></feed>','https://example.com/feed/').items.length,0);
 const escaped=xml.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');assert.equal(parsePublicPublicationFeed('<html><body><pre>'+escaped+'</pre></body></html>','https://example.com/feed/').items.length,2);
});
function article(title,date,extra=''){return `<html><head><meta property="og:type" content="article"><meta name="description" content="Tóm tắt nội dung"><meta property="og:image" content="https://img.test/x.jpg"></head><body><header><time>09/11/2026 07:30</time></header><article><header class="entry-header"><h1>${title}</h1><span class="entry-date">${date}</span></header><div class="entry-content"><p>${body}${title}</p><p>${body}</p></div>${extra}</article><div class="cookie-preferences__body">COOKIE_UI_ONLY ${body.repeat(6)}</div></body></html>`;}
test('an empty publication node can expose its timestamp in an HTML attribute',()=>{
 const html=article('Bản tin có timestamp nằm trong thuộc tính','').replace('<span class="entry-date"></span>','<span class="publication-marker-time" title="2026-11-06T12:30:00+07:00"></span>');
 const config=learnNewsConfig(html,'https://example.vn/bai-12345.html',site).config;assert(config);
 assert.equal(config.publishedDate.attribute,'title');assert.equal(parseConfiguredArticle(html,'https://example.vn/bai-12345.html',config)._source.publishedDate,'2026-11-06T05:30:00.000Z');
});
test('a configured video programme may contain a linked programme list without allowing ordinary link directories',()=>{
 const html=`<h1>Chương trình truyền hình xe và xu hướng</h1><time datetime="2026-11-06T12:30:00+07:00"></time><div class="entry-content"><p><a href="/story">${body.repeat(2)}</a></p><iframe src="https://www.youtube.com/embed/test"></iframe></div>`;
 const s={...site,domain:'xe-vietnam.com',url:'https://xe-vietnam.com/'},url='https://xe-vietnam.com/video-test';const config=learnNewsConfig(html,url,s).config;assert(config);
 assert(!parseConfiguredArticle(html,url,config).error);assert(parseConfiguredArticle(html,url,{...config,allowMediaLinkDensity:false}).error.includes('body_link_density'));
});
test('invalid apostrophe escaping in public JSON-LD does not hide its publication date behind a logo heading',()=>{
 const ld=String.raw`{"@type":"NewsArticle","headline":"We're reading public news","description":"A publisher string with an invalid escape: we\'re here","datePublished":"2026-11-06T03:00:00+0000"}`;
 const html=article('Tiêu đề thực tế nằm sau logo của website','').replace('<body>','<body><h1 class="logo">Site Logo</h1>').replace('</head>','<script type="application/ld+json">'+ld+'</script></head>');
 const c=learnNewsConfig(html,'https://example.vn/story-12345',site).config;assert(c);const d=parseConfiguredArticle(html,'https://example.vn/story-12345',c);
 assert.equal(d._source.title,'Tiêu đề thực tế nằm sau logo của website');assert.equal(d._source.publishedDate,'2026-11-06T03:00:00.000Z');
});
test('a proven broken canonical is retained as evidence while requested URLs remain separate identities',()=>{
 const s={...site,domain:'taichinhso.net.vn',registrableDomain:'taichinhso.net.vn'};
 const html=article('Bài thứ nhất có canonical bị khai báo sai','06/11/2026 08:00').replace('</head>','<link rel="canonical" href="https://taichinhso.net.vn/tin-tuc/tien-ao-tien-that.html"></head>');
 const url='https://taichinhso.net.vn/chi-tiet/bai-thu-nhat.html',c=learnNewsConfig(html,url,s).config;assert(c);
 const d=parseConfiguredArticle(html,url,c);assert.equal(d.extracted.canonicalUrl,url);assert(d.extracted.canonicalIgnored);assert(d.extracted.declaredCanonicalUrl.includes('tien-ao-tien-that'));
});
test('video player controls do not become article content or create fake independent documents',()=>{
 const s={...site,domain:'tiim.com.vn',registrableDomain:'tiim.com.vn'},url='https://tiim.com.vn/video/test/123456.html';
 const html=`<h1>Bản tin video có nguồn media công khai</h1><time datetime="2026-11-06T12:30:00+07:00"></time><div class="video-player-detail"><video src="blob:https://tiim.com.vn/session"><source src="https://media.test/one.mp4">&gt;</video><div class="vjs-control-bar">Play video Current Time 0:00</div><span class="vjs-control-text">Video Player is loading.</span></div>`;
 const c=learnNewsConfig(html,url,s).config;assert(c);const first=parseConfiguredArticle(html,url,c),second=parseConfiguredArticle(html.replace('0:00','0:01'),url,c),third=parseConfiguredArticle(html.replace('one.mp4','two.mp4'),url,c);
 assert.equal(first._source.content,'Images/Video');assert.equal(first.extracted.media[0].url,'https://media.test/one.mp4');assert.equal(first.extracted.contentSha256,second.extracted.contentSha256);assert.notEqual(first.extracted.contentSha256,third.extracted.contentSha256);
});
test('article header date is accepted; site header clock and cookie content are excluded',()=>{
 const r=learnNewsConfig(article('Tiêu đề thứ nhất đủ dài để kiểm tra','05/11/2026, 06:00'),'https://example.vn/bai-12345.html',site);assert(r.config);assert.equal(r.config.body.selector,'.entry-content');assert.equal(r.config.publishedDate.selector,'.entry-date');const d=parseConfiguredArticle(article('Tiêu đề thứ nhất đủ dài để kiểm tra','05/11/2026, 06:00'),'https://example.vn/bai-12345.html',r.config);assert(!d.error);assert.equal(d._source.publishedDate,'2026-11-04T23:00:00.000Z');assert(!d._source.content.includes('COOKIE_UI_ONLY'));});
test('frozen site config parses independent page and does not reuse training title or date',()=>{
 const c=learnNewsConfig(article('Tiêu đề thứ nhất đủ dài để kiểm tra','05/11/2026, 06:00'),'https://example.vn/bai-12345.html',site).config;const d=parseConfiguredArticle(article('Tiêu đề thứ hai và nội dung riêng','06/11/2026 07:01'),'https://example.vn/bai-54321.html',c);assert.equal(d._source.title,'Tiêu đề thứ hai và nội dung riêng');assert.equal(d._source.publishedDate,'2026-11-06T00:01:00.000Z');assert(d.extracted.contentSha256);});
test('Vietnamese text alone does not imply a Vietnam timezone for overseas sites',()=>{
 const foreign={...site,domain:'example.com',url:'https://example.com/',registrableDomain:'example.com'};const r=learnNewsConfig(article('Trang tiếng Việt ở nước ngoài','05/11/2026, 06:00'),'https://example.com/x',foreign);assert.equal(r.error,'missing_published_date');assert.equal(parsePublishedDate('2026-11-08T01:02:03-05:00',null).iso,'2026-11-08T06:02:03.000Z');});
test('timestamp timezone, precision and bad dates are explicit',()=>{
 assert.equal(parsePublishedDate('21:23 08/11/2026','Asia/Ho_Chi_Minh').iso,'2026-11-08T14:23:00.000Z');assert.equal(parsePublishedDate('05/11/2026','Asia/Ho_Chi_Minh').precision,'day');assert.equal(parsePublishedDate('31/02/2026 12:00','Asia/Ho_Chi_Minh'),null);assert.equal(parsePublishedDate('2026-11-08 13:00:00',null),null);
});
test('gate and parking pages cannot be successful article parses',()=>{
 assert.equal(pageIssue('<html><title>Just a moment...</title><body>Verify you are human</body></html>'),'access_blocked');assert.equal(pageIssue('<html><body>Domain registration has expired</body></html>'),'parked_or_default');
});
test('discovery keeps source origin and excludes category/tag links as article candidates',()=>{
 const r=discoverNewsLinks('<nav><a href="/kinh-te">Kinh tế</a></nav><h2><a href="/bai-viet-noi-dung-day-du-123456.html">Một tiêu đề bài viết thật dài</a></h2><h2><a href="https://other.test/article-123456.html">Tiêu đề thuộc nguồn khác</a></h2><a href="/tag/chung-khoan">Chứng khoán</a>','https://example.vn/',site);assert.equal(r.articles.length,1);assert.equal(r.categories[0].url,'https://example.vn/kinh-te');
});
test('Tinhte public hydration supplies exact IDs, parent date and replies without using API config',()=>{
 const state={props:{pageProps:{apiData:{jobs:{a:{thread:{thread_id:123,thread_title:'Một topic thử nghiệm Tinhte',thread_create_date:1794000000,thread_post_count:2},posts:[{post_id:456,thread_id:123,poster_user_id:7,poster_username:'Người A',post_create_date:1794000000,post_body_plain_text:'Nội dung bài đầu tiên',post_is_first_post:true},{post_id:457,thread_id:123,poster_user_id:8,poster_username:'Người B',post_create_date:1794000100,post_body_plain_text:'Nội dung phản hồi',post_is_first_post:false}]}}}}}};
 const d=parseTinhteThread('<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(state)+'</script>','https://tinhte.vn/thread/topic-thu-nghiem.123');assert(d.completeRequiredFields);assert.equal(d.parsedPosts.length,2);assert.equal(d.parsedPosts[1].parentId,d.topicId);assert.equal(d.parsedPosts[1].parentDate,d.parentDate);assert.equal(d.parsedPosts[1].nativePostId,'457');assert.equal(d.parsedPosts[1].url,'https://tinhte.vn/thread/123#post-457');
});
test('published date can be read from a Blogger abbr title, independent of two-digit visible year',()=>{
 const html=article('Bài có ngày trong thuộc tính title','').replace('<span class="entry-date"></span>','<abbr itemprop="datePublished" title="2026-11-07T09:07:00+07:00">7/11/26</abbr>');const c=learnNewsConfig(html,'https://example.vn/test-12345.html',site).config;const d=parseConfiguredArticle(html,'https://example.vn/test-12345.html',c);assert.equal(d._source.publishedDate,'2026-11-07T02:07:00.000Z');
});
test('opaque query IDs and image-only news cards are discoverable',()=>{
 const r=discoverNewsLinks('<a href="/r.php?id=R4rYJ">Một bản tin thật có tiêu đề dài đầy đủ</a><a href="/phong-cach-song/mot-bai-viet-co-duong-dan-dai-de-nhan-dien/"></a>','https://example.vn/',site);assert.equal(r.articles.length,2);
});
test('site-specific variants preserve core validation when article layout changes',()=>{
 const one=article('Tiêu đề thứ nhất đủ dài để kiểm tra','05/11/2026, 06:00'),two=article('Tiêu đề thứ hai với layout thay đổi','06/11/2026 07:01').replaceAll('entry-content','article-body');const primary=learnNewsConfig(one,'https://example.vn/a-12345.html',site).config,secondary=learnNewsConfig(two,'https://example.vn/b-54321.html',site).config;primary.variants=[{title:secondary.title,publishedDate:secondary.publishedDate,body:secondary.body}];const d=parseConfiguredArticle(two,'https://example.vn/b-54321.html',primary);assert(!d.error);assert.equal(d.extracted.variant,1);assert.equal(d._source.title,'Tiêu đề thứ hai với layout thay đổi');
});
test('explicit offset does not permit impossible calendar dates and AM/PM is respected',()=>{
 assert.equal(parsePublishedDate('2026-02-31T05:00:00+07:00','Asia/Ho_Chi_Minh'),null);assert.equal(parsePublishedDate('08/11/2026 09:30 PM','Asia/Ho_Chi_Minh').iso,'2026-11-08T14:30:00.000Z');
});
test('registration and footer bodies are excluded without rejecting WordPress body classes',()=>{
 const html=article('Bài viết có footer và form đăng ký','05/11/2026 06:00')
  .replace('<body>','<body class="footer-top-visible enable-search-modal">').replace('<article>','<div class="footer-fixed"><form id="Form"><article>').replace('</article>','</article></form></div>')
  .replace('</body>',`<div id="tabRegister"><div class="content-body"><p>${body.repeat(25)}</p></div></div><div class="footer"><div class="b-maincontent"><p>${body.repeat(30)}</p></div></div></body>`);
 const c=learnNewsConfig(html,'https://example.vn/bai-12345.html',site).config;
 assert(c);assert.equal(c.body.selector,'.entry-content');
 assert(!parseConfiguredArticle(html,'https://example.vn/bai-12345.html',c).error);
});
test('media-only podcast retains its source when the body selector is the audio element',()=>{
 const html='<head><meta name="description" content="Bản tin âm thanh tổng hợp các sự kiện trong tuần, được phát hành công khai để độc giả nghe trực tuyến và tìm lại những nội dung đã phát sóng."></head><h1>Bản tin podcast có thời gian xuất bản</h1><span class="text-gray-600 capitalize">08/11/2026 10:30</span><audio src="/storage/bantin.mp3"></audio>';
 const s={...site,domain:'baohaiquanvietnam.vn',registrableDomain:'baohaiquanvietnam.vn'};
 const c=learnNewsConfig(html,'https://baohaiquanvietnam.vn/podcast/bantin',s).config;
 assert(c);const d=parseConfiguredArticle(html,'https://baohaiquanvietnam.vn/podcast/bantin',c);
 assert(!d.error);assert.equal(d.extracted.media[0].url,'https://baohaiquanvietnam.vn/storage/bantin.mp3');assert.equal(d._source.content,'Images/Video');
});
test('compact English and Vietnamese publication dates do not depend on comma spacing',()=>{
 assert.equal(parsePublishedDate('Saturday, November 7,2026','Asia/Ho_Chi_Minh').iso,'2026-11-06T17:00:00.000Z');
 assert.equal(parsePublishedDate('05 Tháng 11 2026 16:48','Asia/Ho_Chi_Minh').iso,'2026-11-05T09:48:00.000Z');
});
test('public JSON-LD with literal newlines in descriptions retains its explicit timezone',()=>{
 const html=article('Bản tin phát thanh có metadata công khai','').replace('</head>','<script type="application/ld+json">{"@type":"NewsArticle","headline":"Bản tin phát thanh có metadata công khai","description":"Dòng đầu\nDòng thứ hai","datePublished":"2026-11-06T16:02:45+11:00"}</script></head>');
 const foreign={...site,domain:'example.com',url:'https://example.com/'};
 const c=learnNewsConfig(html,'https://example.com/story-12345',foreign).config;
 assert(c);const d=parseConfiguredArticle(html,'https://example.com/story-12345',c);
 assert.equal(d._source.publishedDate,'2026-11-06T05:02:45.000Z');
});
test('visible subscription gate and a short Nikkei teaser cannot be a complete article',()=>{
 const html=article('A long enough headline for this public article','2026-11-07T06:31:00+09:00','<div id="paywall-offer"><iframe src="https://example.test/subscribe"></iframe></div>');
 const s={...site,domain:'asia.nikkei.com',url:'https://asia.nikkei.com/'};
 const c=learnNewsConfig(html,'https://asia.nikkei.com/business/test-story',s).config;assert(c);
 const d=parseConfiguredArticle(html,'https://asia.nikkei.com/business/test-story',c);
 assert(d.error.includes('publisher_restricted_preview'));
});
test('video news preserves the public embed URL and nonnumeric native article ID',()=>{
 const html=`<h1>Bản tin kiểm sát có mã bài không chỉ gồm số</h1><div class="time">06/11/2026</div><div class="main_vd"><div class="desc">${body.repeat(2)}</div></div><input id="embedid" value="&lt;iframe src='/embed/ifnojde2oq'&gt;&lt;/iframe&gt;">`;
 const s={...site,domain:'tv.kiemsat.vn',url:'https://tv.kiemsat.vn/'};
 const url='https://tv.kiemsat.vn/ban-tin-kiem-sat-nojde2oq.html';const c=learnNewsConfig(html,url,s).config;assert(c);
 const d=parseConfiguredArticle(html,url,c);assert(!d.error);
 assert.equal(d.extracted.nativeId,'nojde2oq');assert.equal(d.extracted.media[0].url,'https://tv.kiemsat.vn/embed/ifnojde2oq');
});
test('category proof rejects homepage aliases and tools while retaining short news categories',()=>{
 assert(!isNewsCategoryUrl('https://antoanthongtin.vn/trang-chu',{domain:'antoanthongtin.vn'}));
 assert(!isNewsCategoryUrl('https://finance.yahoo.com/portfolios/',{domain:'finance.yahoo.com'}));
 assert(!isNewsCategoryUrl('https://tuoitre.vn/can-biet.htm',{domain:'baodoi.com'}));
 assert(isNewsCategoryUrl('https://finance.yahoo.com/news/',{domain:'finance.yahoo.com'}));
 assert(isNewsCategoryUrl('https://edition.cnn.com/us',{domain:'edition.cnn.com'}));
 assert(isNewsCategoryUrl('https://xevathethao.vn/xe',{domain:'xevathethao.vn'}));
 assert(isNewsCategoryUrl('https://blog.rever.vn/du-an',{domain:'blog.rever.vn'}));
});

test('site-scoped CMS clock normalization accepts redundant PM without weakening strict dates',()=>{
 assert.equal(parsePublishedDate('08/11/2026 13:02:32 PM','Asia/Ho_Chi_Minh'),null);
 assert.equal(parsePublishedDate('08/11/2026 13:02:32 PM','Asia/Ho_Chi_Minh','DMY','24h_with_meridiem').iso,'2026-11-08T06:02:32.000Z');
 assert.equal(parsePublishedDate('1/29/2021 3:44:00 PM','Asia/Ho_Chi_Minh','MDY').iso,'2021-01-29T08:44:00.000Z');
});
test('Nikkei HTTP teaser remains restricted before the paywall iframe loads',()=>{
 const html='<h1>A restricted publisher article headline</h1><meta property="article:published_time" content="2026-11-08T10:00:00+09:00"><article><p>'+('Only the public introductory paragraph is present. '.repeat(8))+'</p></article><div id="paywall-offer"></div>';
 const url='https://asia.nikkei.com/politics/story',learned=learnNewsConfig(html,url,{domain:'asia.nikkei.com',url:'https://asia.nikkei.com/',legacy:{}});assert(learned.config);assert.match(parseConfiguredArticle(html,url,learned.config).error,/publisher_restricted_preview/);
});
test('Cointelegraph SSR paragraphs can be parsed without a rendered browser DOM',()=>{
 const html='<h1>A new crypto report contains a complete public article</h1><meta property="article:published_time" content="2026-11-08T12:57:51.861Z"><div class="ct-prose"><p>'+('Full article content from the server response. '.repeat(30))+'</p></div>';
 const url='https://cointelegraph.com/news/report',config=learnNewsConfig(html,url,{domain:'cointelegraph.com',url:'https://cointelegraph.com/',legacy:{}}).config;assert(config);const doc=parseConfiguredArticle(html,url,config);assert(!doc.error);assert(doc._source.content.length>1000);
});

test('Skydoor excerpts cannot be counted as full publisher articles',()=>{
 const html='<h1>An aggregator headline pointing to the original publisher</h1><meta property="article:published_time" content="2026-11-08T10:00:00+07:00"><article><p>'+('This is only the brief syndicated introduction. '.repeat(5))+'</p><a class="sd-value-first__source" href="https://publisher.vn/story">Đọc tin gốc</a></article>';
 const url='https://tin.skydoor.net/news/story-123456',config=learnNewsConfig(html,url,{domain:'tin.skydoor.net',url:'https://tin.skydoor.net/',legacy:{}}).config;assert(config);assert.match(parseConfiguredArticle(html,url,config).error,/aggregator_excerpt_requires_publisher_parser/);
});

test('short media captions retain distinct assets and absolute URLs for deduplication',()=>{const site={domain:'baobariavungtau.com.vn',url:'http://baobariavungtau.com.vn/',legacy:{}},url=site.url+'story-817884/',make=asset=>'<head><meta name="description" content="A complete public video publication, including its source media and a brief caption, available without rendering the publisher page in a browser."></head><h1>A complete video publication headline</h1><div class="date">17:47, 04/11/2026 [GMT+7]</div><div id="content"><p>.</p><video src="/media/'+asset+'.mp4"></video><iframe src="about:blank"></iframe></div>',cfg=learnNewsConfig(make('first'),url,site).config,a=parseConfiguredArticle(make('first'),url,cfg),b=parseConfiguredArticle(make('second'),url,cfg);assert(!a.error&&!b.error);assert(a.extracted.mediaOnly);assert.equal(a._source.content,'.');assert.equal(a.extracted.media.length,1);assert.equal(a.extracted.media[0].url,'http://baobariavungtau.com.vn/media/first.mp4');assert.notEqual(a.extracted.contentSha256,b.extracted.contentSha256);});
