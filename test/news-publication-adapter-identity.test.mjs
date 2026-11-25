import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeWordpressArticle,declaredWordpressPostEndpoint,createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {parseConfiguredArticle,learnNewsConfig} from '../src/web/configurableNewsParser.mjs';
import {normalizeMofApiArticle,normalizeTourismApiArticle} from '../src/web/governmentPublicApis.mjs';
import {normalizeGovernmentNuxtArticle} from '../src/web/governmentNuxtNews.mjs';
const policy='strict_native_publication_v1',content='<p>'+('Native complete original public article content. '.repeat(30))+'</p>';
test('WordPress retains the API-verified original link and GMT under the unchanged strict gate',()=>{
 const url='https://publisher.vn/original-article/',post={id:123,status:'publish',type:'post',link:url,date_gmt:'2026-11-15T01:22:33',title:{rendered:'Original API article headline'},content:{rendered:content,protected:false},excerpt:{rendered:'Original publisher article summary.'}};
 const html=normalizeWordpressArticle([post],url).html,config=learnNewsConfig(html,url,{domain:'publisher.vn',url:'https://publisher.vn/',legacy:{}}).config;
 const p=parseConfiguredArticle(html,url,{...config,publicationValidationPolicy:policy});assert.equal(p.error,undefined);assert.equal(p.extracted.publicationProof.source,'url_bound_original_jsonld');assert.equal(p._source.publishedDate,'2026-11-15T01:22:33.000Z');
 assert(normalizeWordpressArticle([{...post,link:'https://publisher.vn/another-article/'}],url).error);
 assert(normalizeWordpressArticle([{...post,date_gmt:undefined}],url).error);
 assert(normalizeWordpressArticle([{...post,link:'https://publisher.vn/?p=999'}],'https://publisher.vn/?p=123').error);
});
test('new WordPress sources need an explicitly declared same-host native post endpoint',()=>{
 const page=href=>'<link rel="alternate" type="application/json" href="'+href+'">',url='https://publisher.vn/original-article/';
 assert.equal(declaredWordpressPostEndpoint(page('https://publisher.vn/wp-json/wp/v2/posts/123'),url),null);
 assert.equal(new URL(declaredWordpressPostEndpoint(page('https://publisher.vn/wp-json/wp/v2/posts/123'),url,{allowDeclaredHost:true})).pathname,'/wp-json/wp/v2/posts/123');
 for(const href of ['https://other.vn/wp-json/wp/v2/posts/123','https://publisher.vn/wp-json/wp/v2/posts?slug=other','https://publisher.vn/wp-json/wp/v2/comments/123'])assert.equal(declaredWordpressPostEndpoint(page(href),url,{allowDeclaredHost:true}),null);
});
function strict(html,url,domain){const cfg=learnNewsConfig(html,url,{domain,url:'https://'+domain+'/',timezone:'Asia/Ho_Chi_Minh',legacy:{}}).config;return parseConfiguredArticle(html,url,{...cfg,publicationValidationPolicy:policy});}
test('official original publication fields retain their verified native URL, never an invented binding',()=>{
 const url='https://mof.gov.vn/official/news/native-article',data={id:'native-id',slug:'native-article',status:6,articleType:1,title:'Original official ministry article',description:'Original native ministry article summary.',publicationTime:'2026-11-15T01:23:45Z',articleContent:JSON.stringify({Content:content})};
 const missing=normalizeMofApiArticle({success:true,data},url,url);assert.equal(strict(missing.html,url,'mof.gov.vn').error,'NEWS_PUBLICATION_METADATA_UNCORROBORATED');
 assert.equal(strict(normalizeMofApiArticle({success:true,data:{...data,link:url}},url,url).html,url,'mof.gov.vn')._source.publishedDate,'2026-11-15T01:23:45.000Z');
 assert(normalizeMofApiArticle({success:true,data:{...data,link:'https://mof.gov.vn/other/native-article'}},url,url).error);
 const tourism='https://vietnamtourism.gov.vn/post/123',p={id:'123',type:'1',title:'Native original tourism publication',summary:'Native original article summary.',content,publishup:'1794700000',dateedit:'2030-01-01'};
 assert.equal(strict(normalizeTourismApiArticle(p,tourism,tourism).html,tourism,'vietnamtourism.gov.vn')._source.publishedDate,new Date(Number(p.publishup)*1000).toISOString());
});
test('Nuxt keeps the exact slug-bound publish_date offset instead of borrowing a nearby clock',()=>{
 const url='https://botruong.bocongan.gov.vn/bai-viet/native-story-123',record={id:1,slug:2,title:3,content:4,publish_date:5,short_content:6},values=[record,'uuid','native-story-123','Original native official headline',content,'2026-11-15T01:23:45Z','Original official article summary.'];
 const html='<h1>'+values[3]+'</h1><script id="__NUXT_DATA__">'+JSON.stringify(values)+'</script>',normalized=normalizeGovernmentNuxtArticle(html,url);
 assert.equal(strict(normalized.html,url,'botruong.bocongan.gov.vn')._source.publishedDate,'2026-11-15T01:23:45.000Z');
});

test('article publication adapter never rejects a seed listing without a post endpoint',async()=>{const html='<h1>Publisher latest news</h1><a href="/new-story-123456.html">A newly published article headline</a>';let requests=0;const transport=createNewsResearchTransport({taskRole:'seed',nativePublicationAdapter:'declared_wordpress_post',persistEvidence:false,baseTransport:{get:async()=>{requests++;return {statusCode:200,html};},close:async()=>{}}});try{const r=await transport.get('https://publisher.vn/',null,'seed');assert.equal(r.error,undefined);assert.equal(r.html,html);assert.equal(requests,1);}finally{await transport.close();}});

test('Camnang original-post adapter never rejects a category seed without article identity',async()=>{const html='<h1>Publisher latest news</h1><a href="/new-story-123456.html">A newly published article headline</a>';let requests=0;const transport=createNewsResearchTransport({taskRole:'seed',nativePublicationAdapter:'url_bound_camnang_original_post',persistEvidence:false,baseTransport:{get:async()=>{requests++;return {statusCode:200,html};},close:async()=>{}}});try{const r=await transport.get('https://camnangdulich.vn/',null,'seed');assert.equal(r.error,undefined);assert.equal(r.html,html);assert.equal(requests,1);}finally{await transport.close();}});
