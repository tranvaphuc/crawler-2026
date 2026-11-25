import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
test('successful public API seed discovery clears only the matching shell failure',()=>{
 const s=new ThreeFlowState(new DatabaseSync(':memory:'));try{
  for(const [site,error,cleared] of [['mof.gov.vn','empty_page',true],['vietnamtourism.gov.vn','empty_page',true],['mof.gov.vn','access_blocked',false],['other.vn','empty_page',false]]){
   const cycle=site+'-'+error,url='https://'+site+'/';s.cycle(cycle);s.enqueue(cycle,url,site,'seed');const task=s.claim('seed');s.failUrl(task,error);s.completeSeed(task,'links_found',{links:3},{sample:null});assert.equal(s.failedUrl(task.url_key),!cleared);
  }
 }finally{s.close();}
});
