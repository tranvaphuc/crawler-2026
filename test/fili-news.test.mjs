import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {filiPrintRequest,normalizeFiliPrintClock,fetchFiliPrintClock} from '../src/web/filiNews.mjs';

const root=new URL('./fixtures/news-requested-7/',import.meta.url);
const clocks=JSON.parse(fs.readFileSync(new URL('fili-print-clocks.json',root)));
const fixture=(id,index)=>({raw:clocks[id],url:new URL(clocks[id].url,'https://fili.vn').href,
  html:gunzipSync(fs.readFileSync(new URL(index===undefined?'fili.vn-requested.html.gz':'fili-independent-'+index+'.html.gz',root))).toString()});

for(const [id,index] of [[1515990,undefined],[1512787,0],[1512794,1]]){
  test('Fili public print preserves the original clock and matches native identity: '+id,()=>{
    const f=fixture(id,index),request=filiPrintRequest(f.html,f.url),result=normalizeFiliPrintClock(f.html,f.url,f.raw);
    assert.equal(request.id,id);
    assert.equal(result.error,undefined);
    assert.equal(result.evidence.publishTime,f.raw.publishTime);
    assert.match(result.evidence.originalPublication,/[+]07:00$/);
    assert(result.html.includes(f.raw.publishTime));
  });
}

test('Fili rejects another article, another canonical, missing publishTime and changed original clocks',()=>{
  const f=fixture(1515990);
  for(const raw of [{...f.raw,articleID:1},{...f.raw,url:'/other-757-1515990.htm'},
    {...f.raw,title:'Another unrelated article title'},{...f.raw,publishTime:null},
    {...f.raw,publishTime:f.raw.modifiedTime}])assert(normalizeFiliPrintClock(f.html,f.url,raw).error);
  assert(normalizeFiliPrintClock(f.html.replace('rel="canonical" href="https://fili.vn/','rel="canonical" href="https://other.test/'),f.url,f.raw).error);
});

test('Print requests keep a separate cache key per article and use only the fixed public endpoint',async()=>{
  const f=fixture(1515990),other=fixture(1512787,0),seen=[];
  assert.notEqual(filiPrintRequest(f.html,f.url).url,filiPrintRequest(other.html,other.url).url);
  const result=await fetchFiliPrintClock({html:f.html,statusCode:200},f.url,async(url,options)=>{
    seen.push({url,options});return {html:JSON.stringify(f.raw),finalUrl:url,statusCode:200};
  });
  assert.equal(result.error,undefined);
  assert.equal(seen.length,1);
  assert.equal(seen[0].options.method,'POST');
  assert.deepEqual(seen[0].options.data,{articleId:1515990});
  assert.equal(new URL(seen[0].url).pathname,'/_Partials/ContentGetArticle');
  assert.equal((await fetchFiliPrintClock({html:f.html},f.url,async()=>({error:'access_blocked'}))).error,'fili_print_unavailable');
  assert.equal((await fetchFiliPrintClock({html:f.html},f.url,async()=>({html:'{}',finalUrl:'https://other.test/'}))).error,'fili_print_redirect_unconfirmed');
});
