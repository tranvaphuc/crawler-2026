import test from 'node:test';import assert from 'node:assert/strict';
import {serializeCrawlItem} from '../src/services/crawlerV8Es5.js';import {verifiedExistingPublication} from '../src/services/existingImportPublication.js';
const source={platform:'instagram',type:'profile',nativeId:'123',name:'Account'},item={id:'456',url:'https://www.instagram.com/p/NativePost/',type:'post',text:'Native content',author:{id:'123',username:'native_account'}};
const hit=()=>serializeCrawlItem({...item,createdAt:'2026-10-26T02:03:04.000Z'},source);
test('recovers only exact canonical publication from a complete search',()=>{assert.equal(verifiedExistingPublication(item,source,[hit()],{complete:true}).createdAt,'2026-10-26T02:03:04.000Z');assert.equal(verifiedExistingPublication(item,source,[hit()]),null);});
test('rejects different post, source, author, text, URL, malformed date or conflicting exact dates',()=>{
 for(const key of ['_index','_type','_id']){const h=hit();h[key]+='other';assert.equal(verifiedExistingPublication(item,source,[h],{complete:true}),null);}
 for(const key of ['siteId','authorId','author','content','url','publishedDate']){const h=hit();h._source[key]='other';assert.equal(verifiedExistingPublication(item,source,[h],{complete:true}),null);}
 const other=serializeCrawlItem({...item,createdAt:'2026-10-26T04:05:06.000Z'},source);assert.equal(verifiedExistingPublication(item,source,[hit(),other],{complete:true}),null);
});
test('equivalent Instagram p/reel URLs and trailing slash still identify the same media',()=>{const h=hit();h._source.url='https://www.instagram.com/reel/NativePost';assert.ok(verifiedExistingPublication(item,source,[h],{complete:true}));h._source.url='https://www.instagram.com/reel/OtherPost';assert.equal(verifiedExistingPublication(item,source,[h],{complete:true}),null);});
test('restores exact comment counts to preserve Mongo comment eligibility',()=>{const h=hit();h._source.comments=7;h._source.likes=12;const proof=verifiedExistingPublication(item,source,[h],{complete:true});assert.deepEqual(proof.metrics,{comment:7,likes:12});const other=hit();other._source.comments=8;assert.equal(verifiedExistingPublication(item,source,[h,other],{complete:true}).metrics.comment,undefined);});
