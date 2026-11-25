import test from 'node:test';import assert from 'node:assert/strict';import {classifyNewsLink} from '../src/web/newsLinkPolicy.mjs';
import {DatabaseSync} from 'node:sqlite';import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';import {ThreeFlowProcessor} from '../src/newsFlow/threeFlowProcessor.mjs';

test('VnExpress driving practice is a utility while license news and native article URLs remain eligible',()=>{
 for(const path of ['/oto-xe-may/thi-bang-lai/ly-thuyet','/oto-xe-may/thi-bang-lai/ly-thuyet/600-cau-hoi/cau-61386','/oto-xe-may/thi-bang-lai/ly-thuyet/600-cau-hoi/cau-61398'])assert.equal(classifyNewsLink('https://vnexpress.net'+path,'vnexpress.net').reason,'publisher_driving_exam_utility');
 for(const path of ['/oto-xe-may/thi-bang-lai','/kinh-doanh/ebank/ngan-hang-sang-tao','/vib-chu-dong-von-qua-hoan-doi-ngoai-te-cua-ngan-hang-nha-nuoc-5147108.html','/oto-xe-may/thi-bang-lai/ly-thuyet/tin-thi-bang-lai-5147108.html'])assert.equal(classifyNewsLink('https://vnexpress.net'+path,'vnexpress.net').kind,'unknown');
 assert.equal(classifyNewsLink('https://example.com/oto-xe-may/thi-bang-lai/ly-thuyet/600-cau-hoi/cau-61386','example.com').kind,'unknown');
});

test('the full processor excludes an old driving-question task before any HTTP or outbox write',async()=>{
 const state=new ThreeFlowState(new DatabaseSync(':memory:')),source={domain:'vnexpress.net',config:{siteName:'vnexpress.net'},seeds:[]},registry={sources:new Map([[source.domain,source]])};try{
  state.cycle('utility-control');const url='https://vnexpress.net/oto-xe-may/thi-bang-lai/ly-thuyet/600-cau-hoi/cau-61386',id=state.db.prepare("INSERT INTO tasks(cycle,url,url_key,site,role,priority,state,created) VALUES(?,?,?,?,'article',50,'running',1)").run('utility-control',url,url,source.domain).lastInsertRowid;
  const processor=new ThreeFlowProcessor({state,registry,driver:{forCycle:()=>assert.fail('utility reached HTTP')},parsers:{run:()=>assert.fail('utility reached parser')}});await processor.process(state.db.prepare('SELECT * FROM tasks WHERE id=?').get(id));
  assert.equal(state.db.prepare('SELECT reason FROM tasks WHERE id=?').get(id).reason,'non_article:publisher_driving_exam_utility');assert.equal(state.db.prepare('SELECT count(*) n FROM outbox').get().n,0);assert.equal(state.db.prepare('SELECT count(*) n FROM ai_usage').get().n,0);
 }finally{state.close();}
});
