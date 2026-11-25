import test from 'node:test';import assert from 'node:assert/strict';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {toEs5News} from '../src/newsFlow/identity.mjs';
import {STRICT_PUBLICATION_POLICY} from '../src/web/newsStrictPublication.mjs';
import {DatabaseSync} from 'node:sqlite';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {NewsCreateOnlySink} from '../src/newsFlow/createOnlySink.mjs';
import {NewsEs5Sink} from '../src/newsFlow/es5.mjs';
const url='https://publisher.vn/native-story-12345.html',title='Original native publication headline';
const cfg={siteName:'publisher.vn',siteId:'publisher.vn',registrableDomain:'publisher.vn',timezone:'Asia/Ho_Chi_Minh',publicationValidationPolicy:STRICT_PUBLICATION_POLICY,title:{strategy:'selector',selector:'h1'},publishedDate:{strategy:'selector',selector:'.publication'},body:{strategy:'selector',selector:'article p'}};
const page=({clock='16/11/2026 08:30 GMT+7',json=null,meta='',extra='',scope='article'}={})=>'<link rel="canonical" href="'+url+'"><meta name="description" content="Original publisher article summary.">'+meta+(json?'<script type="application/ld+json">'+JSON.stringify(json)+'</script>':'')+'<'+scope+'><h1>'+title+'</h1><time class="publication">'+clock+'</time><p>'+('Original native article paragraph content. '.repeat(30))+'</p>'+extra+'</'+scope+'>';
const schema=(date='2026-11-16T08:30:00+07:00',link=url)=>({'@type':'NewsArticle',url:link,headline:title,datePublished:date});
const parse=(options={},config={})=>parseConfiguredArticle(page(options),url,{...cfg,...config});
test('positive scoped timezone proof is bound to the exact article and instant',()=>{
 const p=parse();assert.equal(p.error,undefined);assert(p.extracted.publicationProof.ok);assert.equal(toEs5News(p,cfg)._source.publishedDate,'2026-11-16T01:30:00.000Z');
 const tampered=structuredClone(p);tampered._source.publishedDate='2026-11-16T02:30:00.000Z';assert.throws(()=>toEs5News(tampered,cfg),/PROOF_REQUIRED/);
});
test('local timezone guesses, midnight substitution, updated clocks and unscoped clocks fail closed',()=>{
 assert.equal(parse({clock:'16/11/2026 08:30'}).error,'NEWS_PUBLICATION_TIMEZONE_UNCONFIRMED');
 assert.equal(parse({clock:'16/11/2026'}).error,'NEWS_PUBLICATION_CLOCK_MISSING');
 const day=parse({clock:'16/11/2026'},{publicationTimePolicy:'native_date_midnight_if_missing'});assert.equal(day.error,undefined);assert.equal(day._source.publishedDate,'2026-11-15T17:00:00.000Z');assert.equal(day.extracted.publicationProof.defaultedClock,true);
 assert.equal(parse({clock:'Cập nhật: 16/11/2026 08:30 GMT+7'}).error,'NEWS_PUBLICATION_OWNERSHIP_UNCONFIRMED');
 assert.equal(parse({scope:'main'},{body:{strategy:'selector',selector:'main p'}}).error,'NEWS_PUBLICATION_OWNERSHIP_UNCONFIRMED');
});
test('owned original metadata corroborates local clocks; conflicting evidence is rejected',()=>{
 assert.equal(parse({clock:'16/11/2026 08:30',json:schema()}).error,undefined);
 assert.equal(parse({json:schema('2026-11-15T08:30:00+07:00')}).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
 assert.equal(parse({extra:'<time>16/11/2026 09:30 GMT+7</time>'}).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
});
test('a visible clock can borrow its own time element offset when the wall time matches',()=>{
 const json=schema('2026-11-16T13:47:00Z');
 const config={publishedDate:{strategy:'jsonld'}};
 const original='<time datetime="2026-11-16T10:47:00-03:00">16.11.2026 às 10:47</time>';
 const result=parse({clock:'',json,extra:original},config);
 assert.equal(result.error,undefined);
 assert.equal(result._source.publishedDate,'2026-11-16T13:47:00.000Z');
 assert.equal(parse({clock:'',json,extra:original.replace('às 10:47','às 10:48')},config).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
 assert.equal(parse({clock:'',json,extra:original.replace('às 10:47','às 10:47 GMT+7')},config).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
});
test('VTC event cards cannot contradict the original timestamp of the containing article',()=>{
 const vtcUrl='https://vtcnews.vn/main-article-ar1050049.html';
 const event='<div class="event-box"><ul class="event-list"><li><span class="date">16/11/2026 09:05 GMT+7</span><a href="/different-ar1051654.html">A different event article</a></li></ul></div>';
 const source=page({clock:'',json:schema(undefined,vtcUrl),extra:event}).replace(url,vtcUrl);
 const settings={...cfg,siteName:'vtcnews.vn',publishedDate:{strategy:'jsonld'}};
 assert.equal(parseConfiguredArticle(source,vtcUrl,settings).error,undefined);
 assert.equal(parseConfiguredArticle(source.replace('/different-ar1051654.html','/main-article-ar1050049.html'),vtcUrl,settings).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
});
test('JKN display dates corroborate UTC publication metadata in Seoul time',()=>{
 const jknUrl='https://news.jkn.co.kr/editions/english/post/1104365';
 const date='2026-11-18T04:20:09.000Z';
 const extra='<time datetime="'+date+'">2026.11.18 13:20</time>';
 const meta='<meta property="article:published_time" content="'+date+'">';
 const source=page({clock:'',json:schema(date,jknUrl),meta,extra}).replace(url,jknUrl);
 const settings={...cfg,siteName:'news.jkn.co.kr',publishedDate:{strategy:'jsonld'}};
 assert.equal(parseConfiguredArticle(source,jknUrl,settings)._source.publishedDate,date);
 assert.equal(parseConfiguredArticle(source.replace('13:20','13:21'),jknUrl,settings).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
 assert.equal(parseConfiguredArticle(source.replace(meta,''),jknUrl,settings).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
 const update='2026-11-18T04:44:39.000Z';
 const expanded=source.replace(meta,'<head>'+meta+'<meta property="article:modified_time" content="'+update+'"></head>').replace(extra,
  '<details><summary>'+extra+'</summary><div>수정 <time datetime="'+update+'">2026.11.18 13:44</time></div></details>');
 assert.equal(parseConfiguredArticle(expanded,jknUrl,settings)._source.publishedDate,date);
 assert.equal(parseConfiguredArticle(expanded.replace('content="'+update+'"','content="2026-11-18T04:45:39.000Z"'),jknUrl,settings).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
});
test('JSON-LD from another URL, uploadDate and modification fields cannot replace publication',()=>{
 assert.equal(parse({json:schema(undefined,'https://publisher.vn/other-999.html')},{publishedDate:{strategy:'jsonld'}}).error,'NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND');
 const j=schema();j.uploadDate=j.datePublished;delete j.datePublished;
 assert.equal(parse({json:j},{publishedDate:{strategy:'jsonld'}}).error,'NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND');
 assert.equal(parse({meta:'<meta property="article:modified_time" content="2026-11-16T08:30:00+07:00">'},{publishedDate:{strategy:'selector',selector:'meta[property="article:modified_time"]',attribute:'content'}}).error,'NEWS_PUBLICATION_FIELD_NOT_ORIGINAL');
});
test('bare metadata needs independent corroboration and mixed-date selectors are refused',()=>{
 const config={publishedDate:{strategy:'selector',selector:'meta[property="article:published_time"]',attribute:'content'}};
 const meta='<meta property="article:published_time" content="2026-11-16T08:30:00+07:00">';
 assert.equal(parse({clock:'',meta},config).error,'NEWS_PUBLICATION_METADATA_UNCORROBORATED');
 assert.equal(parse({clock:'16/11/2026 08:30',meta},config).error,undefined);
 assert.equal(parse({extra:'<div class="publication">15/11/2026 08:30 GMT+7</div>'}).error,'NEWS_PUBLICATION_SELECTOR_AMBIGUOUS');
});
test('the WordPress article footer corroborates the exact original meta clock',()=>{
 const address='https://tnktvmblog2.wordpress.com/2026/11/16/native-story/';
 const value='2026-11-16T01:30:22+00:00';
 const meta='<meta property="article:published_time" content="'+value+'">';
 const footer='<footer class="entry-footer"><span class="posted-on"><time class="entry-date published updated" datetime="'+value+'">November 16, 2026</time></span></footer>';
 const source=page({clock:'',meta,extra:footer}).replace(url,address).replace('<article>','<article class="post type-post status-publish">').replace('<p>','<p class="entry-content">');
 const config={...cfg,siteName:'tnktvmblog2.wordpress.com',publishedDate:{strategy:'selector',selector:'meta[property="article:published_time"]',attribute:'content'}};
 assert.equal(parseConfiguredArticle(source,address,config)._source.publishedDate,'2026-11-16T01:30:22.000Z');
 assert.equal(parseConfiguredArticle(source.replace('November 16','November 15'),address,config).error,'NEWS_PUBLICATION_METADATA_UNCORROBORATED');
 assert.equal(parseConfiguredArticle(source.replace('entry-footer','related'),address,config).error,'NEWS_PUBLICATION_METADATA_UNCORROBORATED');
});
test('both importers hold an outbox document without proof before any ES request',async()=>{
 for(const Sink of [NewsCreateOnlySink,NewsEs5Sink]){
  const state=new ThreeFlowState(new DatabaseSync(':memory:'));
  try{const parsed=parse(),doc=toEs5News(parsed,cfg);state.offer(doc,cfg,[url]);
   const sink=new Sink({state,es:new Proxy({},{get(){throw Error('ES_REQUEST_BEFORE_PROOF');}}),write:true,requirePublicationProof:true});sink.ready=true;
   await sink.flush();const row=state.db.prepare('SELECT * FROM outbox').get();assert.equal(row.state,'held');assert.equal(row.reason,'NEWS_PUBLICATION_PROOF_REQUIRED');
  }finally{state.close();}
 }
});
test('the outbox preserves proof and importer rejects proof from another URL or time',()=>{
 const state=new ThreeFlowState(new DatabaseSync(':memory:'));
 try{const p=parse(),doc=toEs5News(p,cfg);state.offer(doc,{...cfg,publicationProof:p.extracted.publicationProof},[url]);const saved=JSON.parse(state.db.prepare('SELECT config FROM outbox').get().config);
  const sink=new NewsCreateOnlySink({requirePublicationProof:true});assert(sink.publicationVerified(doc,saved));
  assert.equal(sink.publicationVerified({...doc,_source:{...doc._source,url:'https://publisher.vn/other.html'}},saved),false);
  assert.equal(sink.publicationVerified({...doc,_source:{...doc._source,publishedDate:'2026-11-16T02:30:00.000Z'}},saved),false);
 }finally{state.close();}
});
test('runtime overlays and parser variants cannot disable the mandatory policy',()=>{
 const state=new ThreeFlowState(new DatabaseSync(':memory:'));
 try{state.db.prepare('INSERT INTO parser_overlays VALUES(?,?,?,?)').run('publisher.vn',JSON.stringify({...cfg,publicationValidationPolicy:'disabled'}),'test',Date.now());const source={domain:'publisher.vn',config:cfg,quality:{}};state.loadOverlays({sources:new Map([['publisher.vn',source]])});assert.equal(source.config.publicationValidationPolicy,STRICT_PUBLICATION_POLICY);
  const result=parse({clock:'16/11/2026 08:30'},{publishedDate:{strategy:'selector',selector:'.missing'},variants:[{publishedDate:{strategy:'selector',selector:'.publication'},publicationValidationPolicy:'disabled'}]});assert.equal(result.error,'NEWS_PUBLICATION_TIMEZONE_UNCONFIRMED');
 }finally{state.close();}
});
test('confirmed unstable original publication is blocked even with valid-looking metadata or overlays',()=>{
 const reason='publisher datePublished occurs after first archived insertion',blocked={...cfg,originalPublicationBlockedReason:reason};
 assert.equal(parseConfiguredArticle(page(),url,blocked).error,'NEWS_ORIGINAL_PUBLICATION_QUARANTINED');
 assert.throws(()=>toEs5News(parse(),blocked),/ORIGINAL_PUBLICATION_QUARANTINED/);
 const state=new ThreeFlowState(new DatabaseSync(':memory:'));
 try{state.db.prepare('INSERT INTO parser_overlays VALUES(?,?,?,?)').run('publisher.vn',JSON.stringify(cfg),'test',Date.now());const source={domain:'publisher.vn',config:blocked,publicationQuarantine:reason,quality:{}};state.loadOverlays({sources:new Map([['publisher.vn',source]])});assert.equal(source.config.originalPublicationBlockedReason,reason);}finally{state.close();}
});
test('a new publisher-local shortcut cannot pass by reusing the proof version flag',()=>{
 const p=parse();p.extracted.publicationProof.source='suckhoecong_owned_local_article_clock';
 assert.throws(()=>toEs5News(p,cfg),/PUBLICATION_SOURCE_UNAPPROVED/);
 const sink=new NewsCreateOnlySink({requirePublicationProof:true});
 assert.equal(sink.publicationVerified({_source:p._source},{publicationProof:p.extracted.publicationProof}),false);
});

test('old midnight flags cannot authorize a date-only production publication',()=>{
 const production={...cfg,publicationTimePolicy:'original_clock_required',publicationDatePolicy:'original_only'};
 assert.equal(parse({clock:'16/11/2026'},production).error,'NEWS_PUBLICATION_CLOCK_MISSING');
 const p=parse();p._source.publishedDate='2026-11-15T17:00:00.000Z';p.extracted.datePrecision='day';Object.assign(p.extracted.publicationProof,{publishedDate:p._source.publishedDate,precision:'day',defaultedClock:true,publicationTimePolicy:'native_date_midnight_if_missing',timezone:'Asia/Ho_Chi_Minh'});
 assert.throws(()=>toEs5News(p,production),/PROOF_REQUIRED|ORIGINAL_PUBLICATION_CLOCK_REQUIRED/);
 for(const Sink of [NewsCreateOnlySink,NewsEs5Sink])assert.equal(new Sink({requirePublicationProof:true}).publicationVerified({_source:p._source},{publicationProof:p.extracted.publicationProof}),false);
});

test('update time is never an original production publication fallback',()=>{
 const production={...cfg,publicationTimePolicy:'original_clock_required',publicationDatePolicy:'original_only'};
 assert(parse({clock:'Cập nhật: 16/11/2026 08:30 GMT+7'},production).error);
 const p=parse();Object.assign(p.extracted.publicationProof,{source:'scoped_native_updated_fallback',publicationDateKind:'updated_fallback',publicationDatePolicy:'native_updated_when_original_missing'});
 assert.throws(()=>toEs5News(p,production),/SOURCE_UNAPPROVED|ORIGINAL_PUBLICATION_CLOCK_REQUIRED/);
 for(const Sink of [NewsCreateOnlySink,NewsEs5Sink])assert.equal(new Sink({requirePublicationProof:true}).publicationVerified({_source:p._source},{publicationProof:p.extracted.publicationProof}),false);
});

test('an explicitly selected owned original timestamp remains usable beside an update clock',()=>{
 const production={...cfg,publicationTimePolicy:'original_clock_required',publicationDatePolicy:'original_only',publishedDate:{strategy:'jsonld'}};
 const p=parse({clock:'Cập nhật: 16/11/2026 10:30 GMT+7',json:schema()},production);
 assert.equal(p.error,undefined);assert.equal(p._source.publishedDate,'2026-11-16T01:30:00.000Z');assert.notEqual(p.extracted.publicationDateKind,'updated_fallback');
});
test('WordPress updated CSS class retains original timestamp only with exact original metadata',()=>{
 const date='2026-11-16T08:30:00+07:00';
 const html=page({meta:`<meta property="article:published_time" content="${date}">`}).replace('<time class="publication">16/11/2026 08:30 GMT+7</time>',`<time class="entry-date updated" datetime="${date}">16/11/2026</time>`);
 const config={...cfg,publishedDate:{strategy:'selector',selector:'time.entry-date',attribute:'datetime'}};
 const p=parseConfiguredArticle(html,url,config);assert.equal(p.error,undefined);assert.equal(p.extracted.publicationProof.source,'scoped_original_article_clock');
 assert.equal(parseConfiguredArticle(html.replace(`content="${date}"`,'content="2026-11-15T08:30:00+07:00"'),url,config).error,'NEWS_PUBLICATION_OWNERSHIP_UNCONFIRMED');
});
test('body metadata from a different nested article cannot conflict with the current original clock',()=>{
 const p=parse({extra:'<article><h2>Another independent news headline</h2><meta itemprop="datePublished" content="2026-11-15T08:30:00+07:00"><time>15/11/2026 08:30 GMT+7</time></article>'});
 assert.equal(p.error,undefined);assert.equal(p._source.publishedDate,'2026-11-16T01:30:00.000Z');
});

test('KBS publication uses the original KST clock when a later update is shown',()=>{
 const kbsUrl='https://world.kbs.co.kr/service/news_view.htm?lang=a&Seq_Code=88219';
 const scope='section.comp_view_default#ele1';
 const kbs={...cfg,siteName:'world.kbs.co.kr',siteId:'world.kbs.co.kr',registrableDomain:'world.kbs.co.kr',timezone:'Asia/Seoul',publicationArticleScope:scope,title:{strategy:'selector',selector:scope+' > .title_area > h1'},publishedDate:{strategy:'selector',selector:scope+' > .title_area > p.date'},body:{strategy:'selector',selector:scope+' .body_txt'}};
 const html=clock=>'<meta name="description" content="Original publisher article summary."><section id="ele1" class="comp_view_default"><div class="title_area"><h1>'+title+'</h1><p class="date">'+clock+'</p></div><div class="body_txt">'+('Original native article paragraph content. '.repeat(30))+'</div></section>';
 const parsed=parseConfiguredArticle(html('Write: 2026-11-16 08:21:44 / Update: 2026-11-16 18:10:00'),kbsUrl,kbs);
 assert.equal(parsed.extracted?.publicationProof?.publishedDate,'2026-11-15T23:21:44.000Z');
 assert.ok(parseConfiguredArticle(html('Update: 2026-11-16 18:10:00'),kbsUrl,kbs).error);
 assert.ok(parseConfiguredArticle(html('Write: 2026-11-16 08:21:44'),kbsUrl.replace('lang=a','lang=k'),kbs).error);
});

test('English publisher templates require three agreeing fields before ignoring a mislabeled GMT duplicate',()=>{
 const enUrl='https://vnba.org.vn/en/original-native-publication-headline-24239.htm';
 const en={...cfg,siteName:'vnba.org.vn',siteId:'vnba.org.vn',registrableDomain:'vnba.org.vn',publishedDate:{strategy:'jsonld'}};
 const native='2026-11-16T17:00:00+07:00';
 const html=(label,metaTime=native)=>'<link rel="canonical" href="'+enUrl+'"><meta name="description" content="Original publisher article summary."><meta name="pubdate" content="'+metaTime+'"><meta property="article:published_time" content="'+native+'"><script type="application/ld+json">'+JSON.stringify(schema(native,enUrl))+'</script><article><h1>'+title+'</h1><div class="post-date"><span>'+label+'</span></div><p>'+('Original native article paragraph content. '.repeat(30))+'</p></article>';
 const result=parseConfiguredArticle(html('16/11/2026 at 17:00 (GMT)'),enUrl,en);
 assert.equal(result.extracted?.publicationProof?.publishedDate,'2026-11-16T10:00:00.000Z');
 assert.equal(parseConfiguredArticle(html('16/11/2026 at 16:00 (GMT)'),enUrl,en).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
 assert.equal(parseConfiguredArticle(html('16/11/2026 at 17:00 (GMT)','2026-11-16T18:00:00+07:00'),enUrl,en).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
});

test('Báo Nghệ An liveblog uses the original article clock corroborated by the visible header',()=>{
 const articleUrl='https://baonghean.vn/native-liveblog-example-10355939.html';
 const published='2026-11-16T13:14:21+07:00';
 const page=visible=>{
  const scripts=[
   {'@type':'LiveBlogPosting',headline:title,mainEntityOfPage:{'@id':articleUrl},datePublished:'2026-11-16T13:16:58+07:00',coverageStartTime:'2026-11-16T18:00:00+07:00',liveBlogUpdate:[{'@type':'BlogPosting'}]},
   {'@type':'Article',headline:title,url:articleUrl,mainEntityOfPage:{'@id':articleUrl},datePublished:published},
   {'@type':'NewsArticle',headline:title,datePublished:published},
  ].map(row=>'<script type="application/ld+json">'+JSON.stringify(row)+'</script>').join('');
  return '<head><link rel="canonical" href="'+articleUrl+'"><meta name="description" content="Original publisher article summary.">'+scripts+'</head><article><h1>'+title+'</h1><span class="sc-longform-header-date block-sc-publish-time">'+visible+'</span><p>'+('Original native article paragraph content. '.repeat(30))+'</p></article>';
 };
 const bna={...cfg,siteName:'baonghean.vn',siteId:'baonghean.vn',registrableDomain:'baonghean.vn',publishedDate:{strategy:'jsonld'}};
 assert.equal(parseConfiguredArticle(page('16/11/2026 13:14'),articleUrl,bna).extracted?.publicationProof?.publishedDate,'2026-11-16T06:14:21.000Z');
 assert.equal(parseConfiguredArticle(page('16/11/2026 13:16'),articleUrl,bna).error,'NEWS_PUBLICATION_EVIDENCE_CONFLICT');
});
