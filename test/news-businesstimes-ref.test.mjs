import test from 'node:test';import assert from 'node:assert/strict';import * as c from 'cheerio';import {verifiedPublicationPageIdentity} from '../src/web/newsPublicationPageIdentity.mjs';import {parsePublishedDate} from '../src/web/configurableNewsParser.mjs';
const canonical='https://www.businesstimes.com.sg/opinion-features/original-story',url=canonical+'?ref=global-opinion',title='Original public publisher story',article={'@type':'NewsArticle',url:canonical,headline:title,datePublished:'2026-11-16T13:09:03+08:00',isAccessibleForFree:true},config={siteName:'businesstimes.com.sg',pageIdentityPolicy:'business_times_ref_article_alias'},parsed={_source:{title,publishedDate:'2026-11-16T05:09:03.000Z'}};
const run=(u=url,a=article,cfg=config,can=canonical)=>verifiedPublicationPageIdentity(c.load('<link rel="canonical" href="'+can+'"><h1>'+title+'</h1>'),u,cfg,parsed,[a],parsePublishedDate);
test('Business Times ref is only a navigation alias for an independently bound free original article',()=>{assert.equal(run()?.kind,'business_times_ref_article_alias_v1');});
test('Business Times feed URLs resolve to the publisher canonical only for independently bound free articles',()=>{
 const alias=canonical+'?ai-allowed=1';
 assert.equal(run(alias)?.kind,'business_times_feed_article_alias_v1');
 assert.equal(run(alias,{...article,isAccessibleForFree:false}),null);
 assert.equal(run(canonical+'?ai-allowed=0'),null);
 assert.equal(run(alias+'&ref=global'),null);
});
test('Business Times identity rule rejects paid articles, altered content identity, date and meaningful queries',()=>{for(const a of [{...article,isAccessibleForFree:false},{...article,url:canonical+'-other'},{...article,headline:'Another publisher article'},{...article,datePublished:'2026-11-17T13:09:03+08:00'}])assert.equal(run(url,a),null);for(const q of ['?id=10','?ref=global&id=10','?ref=global&ref=other'])assert.equal(run(canonical+q),null);assert.equal(run(url,article,{}),null);assert.equal(run(url,article,config,canonical.replace('businesstimes.com.sg','other.sg')),null);});
