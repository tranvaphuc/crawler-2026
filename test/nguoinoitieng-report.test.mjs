import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {groupProfiles,isSubjectPlatformLink,generateReport} from '../scripts/report_nguoinoitieng.mjs';

test('groups identical names and exact birthdates, while preserving homonyms with different or unknown dates',()=>{
  const grouped=groupProfiles([
    {source_id:'a',name:'Mr. Siro',birth_date:'1982-11-18'},
    {source_id:'b',name:'Mr Siro',birth_date:'1982-11-18'},
    {source_id:'c',name:'Thanh Hà',birth_date:'1969-03-18'},
    {source_id:'d',name:'Thanh Hà',birth_date:'2000-03-18'},
    {source_id:'e',name:'Thanh Hà',birth_date:null},
    {source_id:'f',name:'Thanh Hà',birth_date:null}
  ]);
  assert.equal(grouped.length,5);
  assert.deepEqual(grouped[0].map(p=>p.source_id),['a','b']);
});
test('counts source-attributed accounts but excludes body links, share targets, groups, content and ordinary websites',()=>{
  const source={platform:'facebook',attribution:'subject_profile_link',link_kind:'account_or_page',url:'https://facebook.com/example.person'};
  assert.equal(isSubjectPlatformLink(source),true);
  assert.equal(isSubjectPlatformLink({...source,attribution:'biography_link_requires_review'}),false);
  assert.equal(isSubjectPlatformLink({...source,link_kind:'group'}),false);
  assert.equal(isSubjectPlatformLink({...source,link_kind:'content_link'}),false);
  assert.equal(isSubjectPlatformLink({...source,platform:'website'}),false);
  assert.equal(isSubjectPlatformLink({...source,url:'https://facebook.com/search/top'}),false);
  assert.equal(isSubjectPlatformLink({...source,url:'https://facebook.com/example.person/photos'}),false);
  assert.equal(isSubjectPlatformLink({...source,url:'https://facebook.com/'}),false);
});
test('merges explicitly reviewed aliases only when source identity guards match, and never relies on impossible dates',()=>{
  const p=[{source_id:'a',name:'Alias A',birth_date:'1987-06-18'},{source_id:'b',name:'Alias B',birth_date:'1987-06-18'}];
  const review=[{identity_id:'same',birth_date:'1987-06-18',members:[{source_id:'a',expected_name:'Alias A'},{source_id:'b',expected_name:'Alias B'}]}];
  assert.equal(groupProfiles(p,review).length,1);
  assert.equal(groupProfiles([{...p[0],name:'Other'},p[1]],review).length,2);
  assert.equal(groupProfiles(p.map(x=>({...x,name:'Same Name'})),[{...review[0],decision:'keep_separate',members:review[0].members.map(m=>({...m,expected_name:'Same Name'}))}]).length,2);
  assert.equal(groupProfiles(p.map(x=>({...x,name:'Same Name',birth_date:'1985-02-30'}))).length,2);
});
test('refuses a final report while queued work remains or a failed URL is unresolved',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec("CREATE TABLE crawl_queue(kind TEXT,status TEXT);INSERT INTO crawl_queue VALUES('profile','pending')");
    assert.throws(()=>generateReport(db,'.',{final:true}),/COLLECTION_NOT_COMPLETE: pending=1/);
    db.exec("UPDATE crawl_queue SET status='failed'");
    assert.throws(()=>generateReport(db,'.',{final:true}),/failed=1/);
  }finally{db.close();}
});
