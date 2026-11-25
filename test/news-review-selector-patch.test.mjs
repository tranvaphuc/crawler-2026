import test from 'node:test';import assert from 'node:assert/strict';
import {newsReviewCandidateConfig,newsReviewPatchMatches} from '../src/web/newsReviewSelectorPatch.mjs';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';

test('metadata selector patches read the content attribute and preserve all unpatched fields',()=>{
  const original={title:{strategy:'selector',selector:'h1'},body:{strategy:'selector',selector:'.body'},description:{strategy:'selector',selector:'.missing'},publishedDate:{strategy:'jsonld'},timezone:'Asia/Ho_Chi_Minh'};
  const config=newsReviewCandidateConfig(original,{description:'head > meta[name="description"], meta[property="og:description"]'});
  assert.deepEqual(config.description,{strategy:'selector',selector:'head > meta[name="description"], meta[property="og:description"]',attribute:'content'});
  assert.deepEqual(config.body,original.body);assert.deepEqual(config.publishedDate,original.publishedDate);
  assert.equal(original.description.selector,'.missing');
});

test('visible article clocks and explicit metadata attributes remain distinct',()=>{
  assert.deepEqual(newsReviewCandidateConfig({}, {time:'time[datetime]'}).publishedDate,{strategy:'selector',selector:'time[datetime]',attribute:'datetime'});
  assert.deepEqual(newsReviewCandidateConfig({}, {time:'.article-clock'}).publishedDate,{strategy:'selector',selector:'.article-clock'});
  assert.deepEqual(newsReviewCandidateConfig({}, {description:'meta[name="description"]::attr(content)'}).description,{strategy:'selector',selector:'meta[name="description"]',attribute:'content'});
});

test('metadata summaries and JSON literals cannot be promoted to article bodies or clocks',()=>{
  for(const patch of [{content:'meta[name="description"]'},{content:'meta[name="description"]::attr(content)'},{time:'script[type="application/ld+json"]'},{description:'.sapo::attr(content)'},{title:'h1:has(a)'},{time:'meta[name="pubdate"], time[datetime]::attr(content)'}])assert.throws(()=>newsReviewCandidateConfig({},patch),/NEWS_AI_INVALID_SELECTOR/);
  assert.equal(newsReviewCandidateConfig({},null),null);
});

test('a visible article summary retains a verifiable article scope',()=>{
  const config=newsReviewCandidateConfig({}, {description:'article .sapo'});
  assert.deepEqual(config.description,{strategy:'selector',selector:'.sapo',scope:'article'});
  const parsed={_source:{description:'The native article summary'},extracted:{variant:0}};
  assert.equal(newsReviewPatchMatches('<aside><div class="sapo">Unrelated text</div></aside><article><h1>The current native article</h1><p class="sapo">The native article summary</p></article>',config,{description:'article .sapo'},parsed),true);
  assert.equal(newsReviewPatchMatches('<article><p class="sapo">The native article summary</p></article><article><p>Other story</p></article>',config,{description:'article .sapo'},parsed),false);
});

test('a metadata description patch reads publisher text from a captured article',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('./fixtures/news-requested-7/manifest.json',import.meta.url)));
  const row=manifest.find(r=>r.domain==='banker.vn');
  const html=gunzipSync(fs.readFileSync(new URL('./fixtures/news-requested-7/'+row.fixture,import.meta.url))).toString();
  const original=JSON.parse(fs.readFileSync(new URL('../config/web-sources/news/banker.vn.json',import.meta.url)));
  const config=newsReviewCandidateConfig(original,{description:'meta[name="description"]'});
  const parsed=parseConfiguredArticle(html,row.url,config);
  assert.equal(parsed.error,undefined);
  assert(parsed._source.description.length>20);
  assert.equal(parsed._source.title,row.title);
  assert.equal(parsed._source.publishedDate,row.publishedDate);
  assert.equal(parsed.extracted.contentSha256,row.contentSha256);
  assert.equal(newsReviewPatchMatches(html,config,{description:'meta[name="description"]'},parsed),true);
  assert.equal(newsReviewPatchMatches(html,{...config,title:{strategy:'selector',selector:'.missing-title'}},{title:'.missing-title'},parsed),false);
  assert.equal(newsReviewPatchMatches(html,config,{description:'meta[name="description"]'},{...parsed,extracted:{...parsed.extracted,variant:1}}),false);
});
