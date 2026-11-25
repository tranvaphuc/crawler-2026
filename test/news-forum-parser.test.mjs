import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {legacyNewsId,legacyForumTopicId,legacyForumCommentId,weeklyIndex,parseVietnamDate,parseListing,parseNewsArticle} from '../src/web/newsParser.mjs';
const config=JSON.parse(fs.readFileSync(new URL('../config/web-sources/news/antt.vn.json',import.meta.url)));
const fixture=`<html><meta name="description" content="Tóm tắt"><meta property="og:image" content="/image.jpg"><nav class="menu_main"><a href="/thoi-su.htm">Tin</a><a href="//evil.test/x.htm">Khác</a></nav><a href="/tin-tuc-moi-123456.htm?utm_source=x#comments">Bài</a><div class="title_detail">Bài tiếng Việt</div><div class="grid730"><span class="time_home">09/11/2026 08:23:28</span><div class="sapo_news">Tóm tắt</div><div id="main-detail"><p>Đoạn đầu của bài viết cần giữ đầy đủ và tuyệt đối không cắt mất khi trang có các khối nội dung lồng bên trong.</p><div class="detail-content"><p>Đoạn cuối là nội dung bổ sung.</p></div><p class="insert-dcb">Tác giả: Nguyễn An</p><script>BAD_SCRIPT_CONTENT</script><img src="/image.jpg"></div><div class="soucre_news"></div><div style="color: gray"><a href="https://nguon.test/bai" rel="nofollow">Nguồn</a></div></div></html>`;
test('legacy binary hash matches real master Vietnamese News ID',()=>{
 assert.equal(legacyNewsId({registrableDomain:'antt.vn',title:'DIG thu hẹp nợ vay, hàng nghìn tỷ đồng vẫn nằm ở các dự án dở dang',identityUrl:'http://antt.vn/dig-thu-hep-no-vay-hang-nghin-ty-dong-van-nam-o-cac-du-an-do-dang-404335.htm'}),'3bfc4f679b2b00fa86b81dbcaaf6d4c5');
});
test('forum topic and comment IDs match master and preserve exact permalink',()=>{
 assert.equal(legacyForumTopicId('https://voz.vn/t/nho-chuyen-cu-sau-khi-nhau-1-nguoi-bi-%C4%91am-chet.1060742'),'3b427537dd4310d9ffb54a410c968031');
 assert.equal(legacyForumCommentId('https://voz.vn/t/co-phai-em-%C4%91ang-bi-roi-loan-tram-cam-khong-cac-thim-em-co-nen-%C4%91i-kham-khong-a.1051956/post-35523882'),'946ee56456a36c05c7e053d28a53d35d');
 assert.notEqual(legacyForumCommentId('https://f.test/t/1#post-1'),legacyForumCommentId('https://f.test/t/1#post-2'));
});
test('weekly index respects local Monday and ISO week-year',()=>{
 assert.equal(weeklyIndex('2026-11-08T16:59:59Z'),'master202645');assert.equal(weeklyIndex('2026-11-08T17:00:00Z'),'master202646');assert.equal(weeklyIndex('2021-01-01T00:00:00Z'),'master202053');
});
test('date is converted from Vietnam once and invalid dates are rejected',()=>{
 assert.equal(parseVietnamDate('09/11/2026 08:23:28'),'2026-11-09T01:23:28.000Z');assert.throws(()=>parseVietnamDate('31/02/2026 08:00:00'));assert.throws(()=>parseVietnamDate(''));assert.throws(()=>parseVietnamDate('09/11/2026 29:00:00'));
});
test('listing rejects external categories and strips tracking, preserves IDs',()=>{
 const r=parseListing(fixture,config.homepage,config);assert.deepEqual(r.categories,['http://antt.vn/thoi-su.htm']);assert.deepEqual(r.articles,['http://antt.vn/tin-tuc-moi-123456.htm']);
});
test('outer body selector preserves beginning and nested tail, removes scripts/byline',()=>{
 const d=parseNewsArticle(fixture,'http://antt.vn/tin-tuc-moi-123456.htm',config,'2026-11-09T12:00:00Z');assert(d.extracted.bodyText.startsWith('Đoạn đầu'));assert(d.extracted.bodyText.includes('Đoạn cuối'));assert(!d._source.content.includes('BAD_SCRIPT'));assert(!d._source.content.includes('Tác giả:'));assert.equal(d._source.author,'Nguyễn An');assert.equal(d._source.authorId,'Nguyễn An');assert.equal(d.extracted.images[0].url,'http://antt.vn/image.jpg');assert.deepEqual(d.extracted.sourceLinks,['https://nguon.test/bai']);
});
test('missing date/body/title never become a fabricated success',()=>{
 assert.throws(()=>parseNewsArticle(fixture.replace('09/11/2026 08:23:28',''),'http://antt.vn/x-123456.htm',config));assert.throws(()=>parseNewsArticle('<div class="title_detail">OK</div><div class="grid730"><span class="time_home">09/11/2026 08:00:00</span></div>','http://antt.vn/x-123456.htm',config));
});

const {parseForumThread,forumTopicUrl,parseForumDateTitle}=await import('../src/web/forumParser.mjs');
test('forum topic URL strips reply navigation without losing topic identity',()=>{
 assert.equal(forumTopicUrl('https://voz.vn/t/test.123/page-2#post-7'),'https://voz.vn/t/test.123');assert.equal(forumTopicUrl('https://f.test/threads/test.12/post-89'),'https://f.test/threads/test.12');
});
test('XenForo 1 Vietnamese timestamp uses posted time and preserves anchor permalink',()=>{
 const html='<h1>Chủ đề</h1><div class="navTabs"></div><li class="message" id="post-123"><a class="username">Người viết</a><span class="DateTime" title="15/6/24 lúc 16:54">Sửa</span><a class="datePermalink"><span class="DateTime" title="15/6/24 lúc 16:27">Ngày</span></a><div class="messageContent">Nội dung thực tế của bài viết</div></li>';
 const d=parseForumThread(html,'https://f.test/threads/chu-de.1/','f.test');assert.equal(d.parsedPosts.length,1);assert.equal(d.parsedPosts[0].publishedDate,'2024-06-15T09:27:00.000Z');assert.equal(d.parsedPosts[0].url,'https://f.test/threads/chu-de.1/#post-123');
 assert.equal(parseForumDateTitle('11 Tháng sáu 2019 lúc 08:07'),'2019-06-11T01:07:00.000Z');assert.equal(parseForumDateTitle('18 Tháng chín 2026 lúc 19:18'),'2026-09-18T12:18:00.000Z');assert.equal(parseForumDateTitle('không biết'),null);
});
test('forum media-only posts retain attachments and verification badges do not alter author',()=>{
 const html='<h1>Bài ảnh</h1><article class="message--post" id="js-post-456"><a class="username">Tên<svg><title>Đã xác minh</title></svg><span class="user_verified">✔</span></a><time datetime="2026-11-08T20:00:00+0700"></time><div class="message-body"><img src="https://img.test/a.jpg"></div><a href="/threads/a.1/post-456">#1</a></article>';
 const d=parseForumThread(html,'https://f.test/threads/a.1','f.test');assert.equal(d.parsedPosts[0].author,'Tên');assert.equal(d.parsedPosts[0].attachments.length,1);assert.equal(d.parsedPosts[0].content,'Images/Video');
});
