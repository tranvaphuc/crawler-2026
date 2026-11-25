import test from 'node:test';import assert from 'node:assert/strict';
import {parsePublishedDate} from '../src/web/configurableNewsParser.mjs';import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
test('RFC publication needs a real clock and a valid original calendar; Date rollover is refused',()=>{
 for(const raw of ['Mon, 16 Nov 2026 GMT','Mon, 30 Feb 2026 10:30:00 GMT','Mon, 31 Apr 2026 10:30:00 +0700','Mon, 16 Nov 2026 24:00:00 GMT','Mon, 16 Nov 2026 10:30:00 +1500'])assert.equal(parsePublishedDate(raw,null),null,raw);
 assert.equal(parsePublishedDate('Mon, 16 Nov 2026 00:00 GMT',null).iso,'2026-11-16T00:00:00.000Z');
 assert.equal(parsePublishedDate('Mon, 16 Nov 2026 08:30:17 +0700',null).iso,'2026-11-16T01:30:17.000Z');
 assert.equal(parsePublishedDate('Mon, 16 Nov 2026 08:30 GMT+7',null).iso,'2026-11-16T01:30:00.000Z');
});
test('feeds do not synthesize midnight or normalize an invalid source date',()=>{
 const rss=raw=>'<rss><channel><item><title>Original article</title><link>https://publisher.vn/original.html</link><pubDate>'+raw+'</pubDate></item></channel></rss>';
 for(const raw of ['Mon, 16 Nov 2026 GMT','Mon, 30 Feb 2026 10:30 GMT','2026-02-30T10:30:00Z'])assert.equal(parsePublicPublicationFeed(rss(raw),'https://publisher.vn/rss').items.length,0);
 assert.equal(parsePublicPublicationFeed(rss('Mon, 16 Nov 2026 00:00 GMT'),'https://publisher.vn/rss').items[0].iso,'2026-11-16T00:00:00.000Z');
});
