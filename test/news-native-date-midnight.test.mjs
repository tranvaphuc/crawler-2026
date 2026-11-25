import test from 'node:test';import assert from 'node:assert/strict';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {toEs5News} from '../src/newsFlow/identity.mjs';
import {hasNativePublicationTimezone} from '../src/web/newsTimezoneEvidence.mjs';
const config={siteName:'official.vn',siteId:'official.vn',registrableDomain:'official.vn',timezone:'Asia/Ho_Chi_Minh',title:{strategy:'selector',selector:'h1'},publishedDate:{strategy:'selector',selector:'.publication'},body:{strategy:'selector',selector:'article'}};
function parse(date,overrides={}){const c={...config,...overrides};return {config:c,parsed:parseConfiguredArticle('<meta name="description" content="Native original article description"><h1>Native original article headline</h1><div class="publication">'+date+'</div><article><p>'+('A long native article paragraph. '.repeat(40))+'</p></article>','https://official.vn/native-123456.html',c)};}
test('date-only is opt-in and becomes midnight in Vietnam without changing source precision',()=>{
 const strict=parse('15/11/2026');assert.throws(()=>toEs5News(strict.parsed,strict.config),/PRECISION_UNCONFIRMED/);
 const {parsed,config:c}=parse('15/11/2026',{publicationTimePolicy:'native_date_midnight_if_missing'});assert.equal(parsed.extracted.datePrecision,'day');assert.equal(parsed._source.publishedDate,'2026-11-14T17:00:00.000Z');assert(hasNativePublicationTimezone(parsed,c));assert.equal(toEs5News(parsed,c)._source.publishedDate,'2026-11-14T17:00:00.000Z');
});
test('published hour is preserved and missing/invalid original date cannot be replaced',()=>{
 const policy={publicationTimePolicy:'native_date_midnight_if_missing'};
 const {parsed}=parse('15/11/2026 09:25',policy);assert.equal(parsed._source.publishedDate,'2026-11-15T02:25:00.000Z');assert.equal(parsed.extracted.datePrecision,'minute');
 for(const raw of ['', '31/02/2026']){const value=parse(raw,policy);assert(value.parsed.error);assert.throws(()=>toEs5News(value.parsed,value.config),/PARSE_NOT_VERIFIED/);}
});
