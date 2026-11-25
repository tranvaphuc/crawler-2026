import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeMofApiArticle,normalizeTourismApiArticle,normalizeGovernmentPublicListing,fetchGovernmentPublicPage} from '../src/web/governmentPublicApis.mjs';
const body='<p>'+('Native official paragraph. '.repeat(30))+'</p>';
const mof={success:true,data:{id:'native-id',slug:'native-article',status:6,articleType:1,title:'Official native article',description:'Native article introduction',publicationTime:'2026-11-15T01:23:45Z',articleContent:JSON.stringify({Content:body})}};
test('official API adapters require exact article identity, original publication and published status',()=>{
 const u='https://mof.gov.vn/official/news/native-article';assert(!normalizeMofApiArticle(mof,u,u).error);
 assert(normalizeMofApiArticle({...mof,data:{...mof.data,status:1}},u,u).error);assert(normalizeMofApiArticle(mof,u+'-other',u).error);
 const p={id:'123',type:'1',title:'Native tourism article',summary:'Native article introduction',content:body,publishup:'1794700000',dateedit:'2026-11-16'};
 assert(!normalizeTourismApiArticle(p,'https://vietnamtourism.gov.vn/post/123','https://public.vietnamtourism.gov.vn/post/123').error);
 assert(normalizeTourismApiArticle({...p,publishup:null},'https://vietnamtourism.gov.vn/post/123','x').error);assert(normalizeTourismApiArticle(p,'https://vietnamtourism.gov.vn/post/999','x').error);
});
test('public listing omits unpublished rows and does not infer dates from modified times',()=>{
 const r=normalizeGovernmentPublicListing({success:true,data:[{articleStatus:6,articleType:1,slug:'real-post',rootCategorySlug:'news',categorySlug:'official',title:'Real article'},{articleStatus:1,articleType:1,slug:'draft',categorySlug:'news',title:'Draft'}]},'https://mof.gov.vn/','mof.gov.vn');assert.equal(r.articleLinks,1);assert(r.html.includes('/news/official/real-post'));assert(!r.html.includes('draft'));
});
test('SPA uses only observed public read endpoint and never falls back after access denial',async()=>{
 let called=0;const fetch=async(url,opts)=>{called++;assert.equal(url,'https://mof.gov.vn/api/article/reads?offset=0&limit=40');assert.equal(opts.method,'POST');assert.deepEqual(opts.data,{});return {html:JSON.stringify({success:true,data:[{articleStatus:6,articleType:1,slug:'post',categorySlug:'news',title:'Native article'}]})};};
 assert.equal(await fetchGovernmentPublicPage({statusCode:403,error:'access_blocked'},'https://mof.gov.vn/',fetch),null);assert.equal(called,0);
 const r=await fetchGovernmentPublicPage({statusCode:200,error:'empty_page'},'https://mof.gov.vn/',fetch);assert(!r.error);assert.equal(called,1);
});
