import test from 'node:test';
import assert from 'node:assert/strict';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {currentAuditGate} from '../scripts/news_current_audit_gate.mjs';
const url='https://publisher.test/news/native-123456.html';
const config={siteName:'publisher.test',siteId:'publisher.test',registrableDomain:'publisher.test',timezone:'Asia/Ho_Chi_Minh',title:{strategy:'selector',selector:'h1'},publishedDate:{strategy:'selector',selector:'.publication',precision:'day',timezone:'Asia/Ho_Chi_Minh'},body:{strategy:'selector',selector:'.article-content'}};
const title='A native article headline with original publication metadata';
const html=`<html><head><link rel="canonical" href="${url}"><meta name="description" content="A visible description of the original publisher article."><script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',url,headline:title,datePublished:'2026-11-15T10:25:33+07:00'})}</script></head><body><article><h1>${title}</h1><span class="publication">15/11/2026</span><div class="article-content">${[1,2,3].map(n=>`<p>Paragraph ${n}. ${'Original public news article text with verifiable native evidence. '.repeat(15)}</p>`).join('')}</div></article></body></html>`;
const registry={sources:new Map([['publisher.test',{quality:{}}]]),byHost:host=>host==='publisher.test'?{config}:undefined};
test('audit does not classify a successful extraction with day-only publication as production ready',async()=>{
 const pool=new NewsRepairPool(1,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
 try{
  const input={sample:{domain:config.siteName,url,html,kind:'article'},config,learn:true};
  const raw=await pool.run(input);assert.equal(raw.error,null);assert.equal(raw.parsed.extracted.datePrecision,'day');
  assert.equal(currentAuditGate(raw,config,registry).error,'NEWS_PUBLICATION_PRECISION_UNCONFIRMED');
  const forced=await pool.run({...input,forceLearn:true});assert(forced.proposal?.config);
  assert.equal(forced.parsed._source.publishedDate,raw.parsed._source.publishedDate,'proposal generation must not change current parser output');
  const quality=currentAuditGate({...raw,fields:{issues:[{code:'missing_description'}]}},config,registry);
  assert(quality.quality.some(q=>q.code==='missing_description'));
 }finally{await pool.close();}
});
