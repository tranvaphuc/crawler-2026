import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';

test('verified public-API discovery supersedes only its false empty-shell failure across rounds',()=>{
 for(const normalization of ['publisher_public_news_api','public_government_api','public_web30_state','static_public_api_fields','public_publication_feed_listing']){
  const s=new ThreeFlowState(new DatabaseSync(':memory:'));
  try{
   const url='https://publisher.test/',cycle='round-1';s.cycle(cycle);s.enqueue(cycle,url,'publisher.test','seed');const task=s.claim('seed');
   s.failUrl(task,'empty_page');assert.equal(s.failedUrl(url,{role:'seed',cycle:'round-2'}),true);
   s.completeSeed(task,'links_found',{normalization,links:4},{sample:null});
   assert.equal(s.failedUrl(url,{role:'seed',cycle:'round-2'}),false);
   assert.equal(s.db.prepare('SELECT state FROM tasks WHERE id=?').get(task.id).state,'done');
  }finally{s.close();}
 }
});

test('no links, unverified normalizers, and genuine access errors retain the failure ledger',()=>{
 for(const [normalization,links,reason] of [['publisher_public_news_api',0,'empty_page'],['unknown_adapter',4,'empty_page'],['publisher_public_news_api',4,'access_blocked'],['public_web30_state',4,'request_deadline_exceeded']]){
  const s=new ThreeFlowState(new DatabaseSync(':memory:'));
  try{
   const url='https://publisher.test/';s.cycle('round');s.enqueue('round',url,'publisher.test','seed');const task=s.claim('seed');s.failUrl(task,reason);
   s.completeSeed(task,'links_found',{normalization,links},{sample:null});
   assert.equal(s.db.prepare('SELECT reason FROM url_failures WHERE url_key=?').get(url).reason,reason);
  }finally{s.close();}
 }
});

test('verified normalization clears its owned redirect shell while foreign and real access errors remain blocked',()=>{
 for(const [finalUrl,reason,cleared] of [['https://publisher.test/vn','empty_page',true],['https://publisher.test/vn','URL_AWAITING_SEPARATE_REVIEW',true],['https://other.test/vn','empty_page',false],['https://publisher.test/vn','access_blocked',false],['https://user:pass@publisher.test/vn','empty_page',false]]){
  const s=new ThreeFlowState(new DatabaseSync(':memory:'));
  try{
   const url='https://publisher.test/';s.cycle('round');s.enqueue('round',url,'publisher.test','seed');const task=s.claim('seed');
   s.failUrl({...task,url:finalUrl,url_key:finalUrl},reason);
   s.completeSeed(task,'links_found',{normalization:'publisher_public_news_api',links:4,finalUrl},{sample:null});
   assert.equal(!!s.db.prepare('SELECT 1 FROM url_failures WHERE url_key=?').get(finalUrl),!cleared);
  }finally{s.close();}
 }
});
