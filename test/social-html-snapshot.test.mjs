import test from'node:test';import assert from'node:assert/strict';import{readOnlyHtml}from'../src/services/socialHtmlSnapshot.js';import{snapshotPayloads}from'../src/services/socialMetrics.js';
const a='<html><head><title>A &amp; B</title><meta property="og:title" content="Native"></head><body><script type="application/json">{"data":{"id":"1"}}</script><p>Public</p></body></html>';
test('read-only DOM reuse preserves title/entities and native script while rejecting mutation',()=>{const $=readOnlyHtml(a);assert.equal($('title').text(),'A & B');assert.equal($('meta[property="og:title"]').attr('content'),'Native');assert.throws(()=>$('meta').attr('content','tampered'),TypeError);assert.throws(()=>$('p').text('tampered'),TypeError);assert.equal(readOnlyHtml(a),$);assert.equal($('p').text(),'Public');});
test('DOM cache is one-document and parsed native objects remain independent',()=>{const first=readOnlyHtml(a);readOnlyHtml('<title>Other</title>');assert.notEqual(readOnlyHtml(a),first);const p=snapshotPayloads(a);p[0].data.id='changed';assert.deepEqual(snapshotPayloads(a),[{data:{id:'1'}}]);assert.equal(readOnlyHtml('<svg><title>SVG</title></svg>')('title').text(),'SVG');});
test('noscript cannot introduce fake native proofs or page restriction headings',()=>{
 const html='<noscript><h1>This post was deleted</h1><script type="application/json">{"nativeId":"wrong"}</script></noscript><script type="application/json">{"nativeId":"right"}</script>';
 assert.equal(readOnlyHtml(html,{platform:'youtube'})('h1').length,0);assert.deepEqual(snapshotPayloads(html,[],{platform:'youtube'}),[{nativeId:'right'}]);
});
test('fast parser requires caller platform and never leaks its cached tree to other readers',()=>{
 const html='<script>ytcfg.set({});</script><title>Context</title>';
 const fast=readOnlyHtml(html,{platform:'youtube'}),ordinary=readOnlyHtml(html,{platform:'instagram'});
 assert.notEqual(fast,ordinary);assert.equal(readOnlyHtml(html),ordinary);assert.equal(ordinary('title').text(),'Context');
});
test('foreign JSON scripts preserve browser entity decoding and immutable evidence',()=>{
 const html='<script>ytcfg.set({});</script><svg><script type="application/json">{"id":"a&amp;b"}</script></svg>';
 assert.deepEqual(snapshotPayloads(html,[],{platform:'youtube'}),[{id:'a&b'}]);assert.throws(()=>readOnlyHtml(html,{platform:'youtube'})('script').text('tampered'),TypeError);
});
test('YouTube fast path preserves metadata, native scripts, entity decoding and immutability',()=>{
 const html='<head><script>ytcfg_p.set({"INNERTUBE_CONTEXT":{}});</script><title>A &amp; B</title><meta property="og:title" content="Native &amp; exact"></head><script type="application/json">{"id":"video"}</script>';
 const $=readOnlyHtml(html,{platform:'youtube'});assert.equal($('title').text(),'A & B');assert.equal($('meta').attr('content'),'Native & exact');assert.deepEqual(snapshotPayloads(html),[{id:'video'}]);assert.throws(()=>$('meta').attr('content','tampered'),TypeError);
});
