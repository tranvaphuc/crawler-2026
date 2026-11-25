import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as cheerio from 'cheerio';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {legacyNewsId,weeklyIndex} from '../src/web/newsParser.mjs';

const fixtureRoot=new URL('./fixtures/news-requested-7/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',fixtureRoot)));
const configFor=domain=>JSON.parse(fs.readFileSync(new URL('../config/web-sources/news/'+domain+'.json',import.meta.url)));
const htmlFor=row=>gunzipSync(fs.readFileSync(new URL(row.fixture,fixtureRoot))).toString('utf8');
const addedDomains=['banker.vn','doanhnghiepkinhdoanh.doanhnhanvn.vn'];

for(const row of manifest){
  test('Captured public article parses with native publication and complete body: '+row.fixture,()=>{
    const config=configFor(row.domain),result=parseConfiguredArticle(htmlFor(row),row.url,config);
    assert.equal(result.error,undefined);
    assert.equal(result._source.title,row.title);
    assert.equal(result._source.publishedDate,row.publishedDate);
    assert.equal(result._source.url,row.url);
    assert.equal(result.extracted.bodyLength,row.bodyLength);
    assert.equal(result.extracted.contentSha256,row.contentSha256);
    assert.equal(result._id,legacyNewsId({registrableDomain:config.registrableDomain,title:row.title,identityUrl:row.url}));
    assert.equal(result._index,weeklyIndex(row.publishedDate));
    if(addedDomains.includes(row.domain)){
      const $=cheerio.load(htmlFor(row));
      assert.equal($(config.title.selector).length,1);
      assert.equal($(config.body.selector).length,1);
      assert.equal(result.extracted.variant,0);
      assert.equal(result.extracted.semanticTitleFallback,undefined);
    }
  });
}

for(const domain of addedDomains){
  test('Missing publication is rejected even when the URL contains an ID or timestamp: '+domain,()=>{
    const row=manifest.find(r=>r.domain===domain),config=configFor(domain),$=cheerio.load(htmlFor(row));
    if(config.publishedDate.strategy==='jsonld'){
      $('script[type="application/ld+json"]').remove();
    }else{
      $(config.publishedDate.selector).remove();
    }
    const result=parseConfiguredArticle($.html(),row.url,config);
    assert.match(result.error,/missing_published_date/);
    assert.equal(result._source,undefined);
  });
  test('New source validation has two independent holdouts and preserves source activation policy: '+domain,()=>{
    const config=configFor(domain),samples=manifest.filter(r=>r.domain===domain);
    assert.equal(samples.length,3);
    assert.equal(new Set(samples.map(r=>r.contentSha256)).size,3);
    assert.equal((config.validation.holdoutUrls||config.requested7Validation.independentHoldoutUrls).length,2);
    assert.notEqual(config.fullSiteCycleVerified,true);
    assert.equal(config.enabled,domain==='banker.vn');
  });
}

test('Doanh nghiệp & Kinh doanh reads its H2 headline and visible clock, independent of the URL timestamp',()=>{
  const row=manifest.find(r=>r.domain==='doanhnghiepkinhdoanh.doanhnhanvn.vn'),config=configFor(row.domain),$=cheerio.load(htmlFor(row));
  assert.equal($('h1').length,0);
  assert.match($(config.publishedDate.selector).text(),/18\/11\/2026 13:20/);
  const result=parseConfiguredArticle($.html(),row.url,config);
  assert.equal(result._source.publishedDate,'2026-11-18T06:20:00.000Z');
  assert.equal(result.extracted.datePrecision,'minute');
  assert.equal(result.extracted.dateTimezoneProvenance.authority,'explicit_user_confirmation');
  assert.equal(config.registrableDomain,'doanhnhanvn.vn');
  assert.equal(result.extracted.images.length,5);
  assert(!result._source.content.includes('TIN MỚI NHẤT'));
});
