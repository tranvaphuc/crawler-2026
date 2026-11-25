import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = {location:{origin:'https://www.facebook.com'}, URL};
vm.runInNewContext(fs.readFileSync(new URL('../scripts/browser-facebook-source-recheck.js',import.meta.url),'utf8'), context);
const read = context.KompaSourceAudit._payloadIdentity;
test('a Facebook login wrapper resolves its same-site destination before reading',()=>{
 const wrap='https://web.facebook.com/login.php?next='+encodeURIComponent('https://web.facebook.com/stories/123/456/');
 assert.equal(context.KompaSourceAudit._sourceUrl(wrap),'https://www.facebook.com/stories/123/456/');
 assert.equal(context.KompaSourceAudit._sourceUrl('https://www.facebook.com/login.php?next=https://example.com/'),null);
});
const header = user => ({data:{user:{profile_header_renderer:{user}}}});
test('a wrapped story verifies its owner profile instead of opening the story',()=>{
 const wrap='https://web.facebook.com/login.php?next='+encodeURIComponent('https://web.facebook.com/stories/122103226982016774/expired-story/');
 assert.equal(context.KompaSourceAudit._target({originalLink:wrap}),'https://www.facebook.com/122103226982016774');
});
test('browser parser returns the delegate Page ID, never its Profile ID',()=>{
  const r = read('adp_ProfileCometHeaderQueryRelayPreloader_x',header({__typename:'User',id:'100064353684757',name:'MoMo',is_additional_profile_plus:true,delegate_page:{id:'138010322921640'}}));
  assert.equal(r.id,'138010322921640'); assert.equal(r.type,'page');
});
test('a personal user needs an explicit personal-profile flag',()=>{
  const u={__typename:'User',id:'123',name:'Person'};
  assert.equal(read('ProfileCometHeaderQuery',header(u)).id,null);
  assert.equal(read('ProfileCometHeaderQuery',header({...u,is_additional_profile_plus:false})).id,'123');
});
test('viewer metadata cannot become the requested source identity',()=>{
  assert.equal(read('ProfileCometHeaderQuery',{data:{viewer:{actor:{__typename:'Page',id:'999',name:'Viewer'}}}}),null);
});
test('only a primary post query can supply its author',()=>{
  const result={data:{node:{__typename:'Story',actors:[{__typename:'Page',id:'137952892978533',name:'ACB'}]}}};
  assert.equal(read('CometSinglePostRootQuery',result).id,'137952892978533');
  assert.equal(read('SuggestedFeedQuery',result),null);
});
test('group metadata remains a group identity',()=>{
  const r=read('GroupsCometGroupRootQuery',{data:{node:{__typename:'Group',id:'123456',name:'Group'}}});
  assert.equal(r.id,'123456'); assert.equal(r.type,'group');
});
