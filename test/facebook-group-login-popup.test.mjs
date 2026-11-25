import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFacebookPostFetcher} from '../scripts/facebook_posts.js';
import {createFacebookContentHttpReader} from '../src/services/facebookContentHttp.js';
import {READ_STATE} from '../src/services/socialReadState.js';

const target = {platform:'facebook', operation:'source', sourceType:'group',
  id:'997265710295664', url:'https://www.facebook.com/groups/997265710295664', limit:10, order:'latest'};
// Owned response fixtures: the dialog invites login while anonymous feed reads
// remain available. Native feed authentication failures must still stop reads.
const popup = '<div role="dialog"><h2>See more on Facebook</h2><input type="password"><button>Close</button></div>';
const bootstrap = {
  httpStatus:200, finalUrl:target.url,
  html:popup+'<script type="application/json">'+JSON.stringify({require:[
    ['CurrentUserInitialData',[],{USER_ID:'0'}], ['LSD',[],{token:'owned-anonymous-context'}],
  ]})+'</script>',
};

async function fixtureReader(t, {boot=bootstrap, feedError=false}={}) {
  const dir=await mkdtemp(join(tmpdir(),'fb-public-popup-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const har=join(dir,'group.har');
  await writeFile(har,JSON.stringify({log:{entries:[{request:{url:'https://www.facebook.com/api/graphql/',headers:[],postData:{
    text:new URLSearchParams({fb_api_req_friendly_name:'GroupsCometFeedRegularStoriesPaginationQuery',
      variables:JSON.stringify({id:'111',count:10,cursor:null})}).toString(),
  }}}]}}));
  const calls=[];
  const read=createFacebookContentHttpReader({
    respectPlatformCooldown:false, maxPages:1, splitFacebookPages:true,
    getProxy:async()=>({server:'http://owned-proxy.test:8080'}),
    createPostFetcher:options=>createFacebookPostFetcher({...options,harPaths:{group:har}}),
    makeSession:()=>({requests:0, close(){}, async request(url,options={}) {
      this.requests++;calls.push({url,options});
      if(options.method!=='POST')return boot;
      const form=new URLSearchParams(options.body),variables=JSON.parse(form.get('variables'));
      assert.equal(form.get('__user'),'0');
      assert.equal(form.get('access_token'),null);
      assert.equal(variables.id,target.id);
      assert.equal(variables.sortingSetting,'CHRONOLOGICAL');
      const second=variables.cursor==='owned-next-page';
      return {httpStatus:200,finalUrl:url,html:JSON.stringify(feedError
        ? {errors:[{message:'Login required'}]}
        : {data:{node:{id:target.id,group_feed:{
          edges:[{node:{__typename:'Story',post_id:second?'222':'111',creation_time:1793595600,
            actors:[{id:'77',name:'Owned author'}],message:{text:'Owned public post'}}}],
          page_info:{has_next_page:!second,end_cursor:second?null:'owned-next-page'},
        }}}})};
    }}),
  });
  return {read,calls};
}

test('login invitation does not prevent anonymous group posts or cursor continuation',async t=>{
  const {read,calls}=await fixtureReader(t);
  const first=await read(target);
  assert.equal(first.status,'partial');
  assert.equal(first.items[0].postId,'111');
  assert.equal(first.items[0].author.id,'77');
  assert.equal(first.items[0].createdAt,'2026-11-02T05:00:00.000Z');
  assert.equal(first.pagination.hasMore,true);
  const second=await read({...target,[READ_STATE]:first[READ_STATE]});
  assert.equal(second.items[0].postId,'222');
  assert.equal(second.pagination.hasMore,false);
  assert.equal(calls.filter(c=>c.options.method==='POST').length,2);
  assert.equal(calls.filter(c=>c.options.method!=='POST').length,2);
});

test('source login redirect can initialize fresh anonymous context before reading a permitted feed',async t=>{
  const {read,calls}=await fixtureReader(t,{boot:{...bootstrap,finalUrl:'https://www.facebook.com/login/'}});
  const result=await read(target);
  assert.equal(result.status,'partial');
  assert.equal(result.items[0].postId,'111');
  assert.equal(calls.filter(x=>x.options.method==='POST').length,1);
  assert.equal(calls.filter(x=>x.options.method!=='POST').length,2);
});

test('a dismissible invitation does not authorize reads rejected by the native feed',async t=>{
  const {read,calls}=await fixtureReader(t,{feedError:true});
  const result=await read(target);
  assert.equal(result.status,'auth_required');
  assert.equal(result.reason,'AUTH_REQUIRED');
  assert.equal(result.count,0);
  assert.equal(calls.length,2);
});
