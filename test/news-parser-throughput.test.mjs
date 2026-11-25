import test from 'node:test';import assert from 'node:assert/strict';import * as cheerio from 'cheerio';
import {verifyNewsFields} from '../src/web/newsFieldVerification.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {newsThreeFlowCapacity} from '../src/newsFlow/threeFlowCapacity.mjs';

test('overlapping body selectors clone a DOM node once and still reject missing native paragraphs',()=>{
 const a='First original paragraph with important facts. '.repeat(20),b='Last original paragraph must remain in the extracted article. '.repeat(20),html=`<meta name="description" content="Native description"><h1>Original headline</h1><div itemprop="articleBody" class="article-body article__body article-content detail-content cms-body"><p>${a}</p><p>${b}</p></div>`,$=cheerio.load(html);let clones=0;const original=$.fn.clone;$.fn.clone=function(...args){clones++;return original.apply(this,args);};
 try{const good=verifyNewsFields(html,{_source:{description:'Native description',content:a+b}},{dom:$});assert.equal(clones,1);assert.equal(good.issues.length,0);assert.equal(good.paragraphEvidence.selector,'[itemprop="articleBody"]');assert.equal(good.paragraphEvidence.coverage,1);
 const bad=verifyNewsFields(html,{_source:{description:'Native description',content:a}},{dom:$});assert(bad.issues.some(v=>v.code==='native_paragraph_coverage_requires_review'));}finally{$.fn.clone=original;}
});

test('parser pool reports queue time separately without changing results or running a job twice',async()=>{
 const url=new URL('data:text/javascript,'+encodeURIComponent("import {parentPort} from 'node:worker_threads';parentPort.on('message',v=>{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);parentPort.postMessage({id:v.id,ok:true});});")),pool=new NewsRepairPool(1,url,{fatalOnFailure:true});try{const r=await Promise.all([1,2,3].map(id=>pool.run({id})));assert.deepEqual(r.map(v=>v.id),[1,2,3]);assert(r.every(v=>v.ok&&v.parserWorkerRoundTripMs>=0));assert(r[1].parserQueueMs>=15);assert.equal(pool.stats().queued,0);}finally{await pool.close();}
});

test('CPU parser override scales an existing pool while preserving 40 seed and 152 parse jobs',()=>{
 const c=newsThreeFlowCapacity({NEWS_N1:'40',NEWS_N2:'152',NEWS_PARSER_CPU_WORKERS:'24'});assert.equal(c.n1,40);assert.equal(c.n2,152);assert.equal(c.parserWorkers,24);
 for(const value of ['0','33','bad','1.5'])assert.throws(()=>newsThreeFlowCapacity({NEWS_PARSER_CPU_WORKERS:value}),/INVALID_PARSER_CAPACITY/);
});
