import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {refreshCategoryAuditCheckpoint,reusablePrimaryArticleProof,distinctPrimaryArticleUrls,verifiedCategoryArticleCount} from '../src/newsFlow/categoryAuditCheckpoint.mjs';
test('hourly review revisits homepages and stale unknown branches without repeating approved branches or losing prior proofs',()=>{
 const db=new DatabaseSync(':memory:'),now=200000000;try{
 db.exec("CREATE TABLE pages(key TEXT PRIMARY KEY,origin TEXT,state TEXT,checked_at INTEGER);CREATE TABLE proofs(key TEXT PRIMARY KEY,urls TEXT);INSERT INTO pages VALUES('home','configured','done',199999999),('old','discovered','done',1),('recent','discovered','done',199999999),('approved','discovered','done',1);INSERT INTO proofs VALUES('old','[\"original-a\",\"original-b\"]')");
 assert.deepEqual(refreshCategoryAuditCheckpoint(db,{hintsOnly:false,now}),{homepages:0,unconfirmed:0});assert.equal(db.prepare("SELECT count(*) n FROM pages WHERE state='pending'").get().n,0);
 assert.deepEqual(refreshCategoryAuditCheckpoint(db,{hintsOnly:true,knownSeedKeys:new Set(['approved']),now}),{homepages:1,unconfirmed:1});
 assert.deepEqual(db.prepare("SELECT key FROM pages WHERE state='pending' ORDER BY key").all().map(r=>r.key),['home','old']);assert.equal(db.prepare('SELECT urls FROM proofs').get().urls,'["original-a","original-b"]');
 }finally{db.close();}
});
test('primary article proof cache is reused only for the same saved section observation',()=>{
 const row={cached_urls:'["a","b"]',prior_reason:'awaiting_two_verified_editorial_articles',checked_at:100,proof_checked_at:200};assert.equal(reusablePrimaryArticleProof(row),true);assert.equal(reusablePrimaryArticleProof({...row,checked_at:300}),false);assert.equal(reusablePrimaryArticleProof({...row,prior_reason:'self_article_not_section'}),false);
});
test('two URL aliases or two canonical paths for one verified article cannot establish two independent original proofs',()=>{
 const source={domain:'example.com',config:{siteName:'example.com',registrableDomain:'example.com'}},registry={byUrl:url=>new URL(url).hostname.endsWith('example.com')?source:null},urls=['https://example.com/story-123456.html','http://www.example.com/story-123456.html/','https://example.com/category/story-123456.html'];assert.equal(distinctPrimaryArticleUrls(urls).length,2);
 assert.equal(verifiedCategoryArticleCount(urls,source,registry,()=>({parse_status:'done'})),1);assert.equal(verifiedCategoryArticleCount(['https://example.com/a','https://example.com/b'],source,registry,()=>({parse_status:'done',es_id:'same',es_index:'master202647'})),1);
 assert.equal(verifiedCategoryArticleCount(['https://example.com/story-123456.html','https://example.com/story-654321.html'],source,registry,()=>({parse_status:'done'})),2);assert.equal(verifiedCategoryArticleCount(urls,source,registry,()=>({parse_status:'fail'})),0);
});
