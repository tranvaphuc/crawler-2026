import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfiguredArticle } from '../src/web/configurableNewsParser.mjs';
import { toEs5News } from '../src/newsFlow/identity.mjs';
const url = 'https://suckhoecong.vn/native-story-d103255.html';
const selector = 'section.box-author .info-author > ul > li:first-child';
const config = { publicationTimePolicy: 'user_confirmed_suckhoecong_utc_plus_7', siteName: 'suckhoecong.vn', siteId: 'suckhoecong.vn', registrableDomain: 'suckhoecong.vn', timezone: 'Asia/Ho_Chi_Minh', publicationValidationPolicy: 'strict_native_publication_v1', publicationEvidencePolicy: { kind: 'suckhoecong_owned_local_clock_v1' }, title: { strategy: 'selector', selector: 'h1' }, publishedDate: { strategy: 'selector', selector }, body: { strategy: 'selector', selector: '.content-detail' } };
const html = (clock = '03/08/2026 14:33') => `<meta name="description" content="Original article description for publisher time validation."><link rel="canonical" href="${url}"><section class="box-author"><div class="head-detail"><h1>Original publication headline for this article</h1></div><div class="content-author"><div class="right"><div class="info-author"><ul><li>${clock}</li><li><div class="fb-like" data-href="${url}"></div></li></ul></div></div></div></section><div class="content-detail"><p>${'Original complete article paragraph. '.repeat(50)}</p></div><aside><h3><a href="/other-d104786.html">Recommendation headline</a></h3><div class="date">15/11/2026 10:11</div></aside>`;
test('user-confirmed publisher timezone accepts only its owned native clock', () => {
  const parsed = parseConfiguredArticle(html(), url, config);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed._source.publishedDate, '2026-08-03T07:33:00.000Z');
  assert.equal(parsed.extracted.publicationProof.source,'scoped_original_article_clock');
  assert.equal(toEs5News(parsed,config)._source.publishedDate,'2026-08-03T07:33:00.000Z');
  assert.match(parseConfiguredArticle(html(),url,{...config,publicationTimePolicy:undefined}).error,/UNCONFIRMED/);
  const today = parseConfiguredArticle(html('16/11/2026 07:13'), url, config);
  assert.equal(today._source.publishedDate, '2026-11-16T00:13:00.000Z');
});
test('user timezone confirmation does not waive source ownership checks', () => {
  for (const source of [html().replace(`data-href="${url}"`, 'data-href="/other-d999999.html"'), html().replace('<section class="box-author">', '<section class="other">'), html().replace(`<link rel="canonical" href="${url}">`, ''), html().replace('03/08/2026 14:33', 'Cập nhật: 03/08/2026 14:33')]) {
    assert.ok(parseConfiguredArticle(source, url, config).error);
  }
  for (const patch of [{ timezone: 'UTC' }, { publicationEvidencePolicy: undefined }, { publishedDate: { strategy: 'selector', selector: '.date' } }]) assert.ok(parseConfiguredArticle(html(), url, { ...config, ...patch }).error);
});
test('missing original clock never falls back to recommendation dates', () => {
  const parsed = parseConfiguredArticle(html().replace('03/08/2026 14:33', ''), url, config);
  assert.ok(parsed.error.includes('missing_published_date'));
});
