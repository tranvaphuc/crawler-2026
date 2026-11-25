import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizeMetricsInput} from '../src/services/socialMetrics.js';
import {normalizeContentInput} from '../src/services/socialContent.js';
import {normalizeFacebookPostInput} from '../src/services/facebookShare.js';
const require=createRequire(import.meta.url),folder='outputs/postman-crawler-2026-10-23';
const c=JSON.parse(await fs.readFile(folder+'/Crawler-2026.postman_collection.json'));
const env=JSON.parse(await fs.readFile(folder+'/Crawler-2026-Local.postman_environment.json'));
const requests=c.item.flatMap(f=>f.item),base=new Map(c.variable.map(v=>[v.key,v.value])),environment=new Map(env.values.map(v=>[v.key,v.value]));
assert.equal(requests.length,39);assert.equal(c.item.length,7);assert.equal(new Set(requests.map(r=>r.request.url.split('}}')[1])).size,6);
const schemaFile=process.argv[2] || '/private/tmp/crawler-postman-v2.1.schema.json';
const schema=JSON.parse(await fs.readFile(schemaFile));assert.ok(schema.definitions?.request,'Official bundled schema definitions are required');
const Ajv=require('ajv'),ajv=new Ajv({allErrors:true,strictKeywords:false,schemaId:'auto'});
if(schema.$schema?.includes('draft-04'))ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'));
const validate=ajv.compile(schema);assert.ok(validate(c),JSON.stringify(validate.errors));
let assertions=0,compiled=0,inputs=0,savedExamples=0;
const SKIP=Symbol('SKIP');
function context(item,store=base,environmentValues=environment){
 const local=new Map(),tests=[];const api=map=>({get:k=>map.get(k),set:(k,v)=>map.set(k,v),unset:k=>map.delete(k)});
 const pm={collectionVariables:api(store),environment:api(environmentValues),variables:{
  get:k=>local.has(k)?local.get(k):environmentValues.has(k)?environmentValues.get(k):store.get(k),
  set:(k,v)=>local.set(k,v),replaceIn:s=>String(s).replace(/\{\{([^{}]+)\}\}/g,(m,k)=>{const x=pm.variables.get(k);return x===undefined?m:String(x);})},
  request:{body:item.request.body,url:{toString:()=>item.request.url}},info:{requestName:item.name},execution:{skipRequest:()=>{pm.skipped=true;throw SKIP;},setNextRequest:x=>{pm.next=x;}},test:(name,fn)=>{try{fn();tests.push({name,pass:true});assertions++;}catch(e){tests.push({name,pass:false,message:e.message});}},skipped:false,tests};
 const sandbox=vm.createContext({pm,console:{log(){},warn(){}}});return{pm,sandbox,local};
}
function event(item,type){return item.event.find(e=>e.listen===type).script.exec.join('\n');}
function execute(ctx,item,type){try{new vm.Script(event(item,type)).runInContext(ctx.sandbox,{timeout:1500});}catch(e){if(e!==SKIP)throw e;}}
function cfg(item){return JSON.parse(/^const cfg = (.*);$/m.exec(event(item,'prerequest'))[1]);}
function body(ctx,item){return JSON.parse(ctx.pm.variables.replaceIn(item.request.body.raw));}
function mock(config,input,phase='first'){
 if(config.negative)return{status:'invalid_input',reason:'INVALID_INPUT',error:'INVALID_INPUT'};
 if(config.operation==='share'||config.operation==='details')return{transport:{anonymous:true,browserUsed:false,proxyUsed:true,mode:'http'},ok:true,status:'resolved',isShare:config.expectedShare??false,post:{postId:'122138942931244237'},originalPost:{id:'1000419343151470_122138942931244237'}};
 if(config.operation==='es5')return{transport:{anonymous:true,browserUsed:false,proxyUsed:true,mode:'http'},ok:true,format:'es5',documents:[{_id:'sample'}],rejected:[],warnings:[]};
 const transport={anonymous:true,browserUsed:false,proxyUsed:true,mode:'http'};
 if(config.operation==='metrics')return{status:'partial',identityVerified:true,metrics:{reactions:1,shares:null,comment:0,views:null,saved:null,reshares:null,repost:null,likes:1,quotes:null},transport};
 const single=keyword=>{
  if(config.latest)return{status:'sort_unavailable',reason:'LATEST_SORT_UNVERIFIED',items:[],count:0,identityVerified:true,ordering:{requested:'latest',verified:false},pagination:{nextCursor:null},transport};
  const item={id:config.platform+'_'+config.operation+'_'+phase,type:config.operation==='comments'?'comment':'post',parentId:null,url:'https://www.youtube.com/watch?v=wlQndvtII1M'};
  return{status:'partial',identityVerified:true,items:[item],count:1,rootComments:config.operation==='comments'?1:0,replies:0,ordering:{requested:config.operation==='search'?'relevance':config.operation==='source'?'latest':'oldest',verified:config.operation==='search'},pagination:{nextCursor:'00000000-0000-4000-8000-000000000001',hasMore:true,complete:false},keyword,transport};
 };
 return Array.isArray(input.keywords)?{status:'checked',results:input.keywords.map(single),unstartedKeywords:[]}:single(input.keyword);
}
function setResponse(ctx,data,code=200,headers={}){ctx.pm.response={code,json:()=>structuredClone(data),headers:{get:k=>headers[k]||null}};}
function assertPass(ctx,label){assert.deepEqual(ctx.pm.tests.filter(t=>!t.pass),[],label);}
for(const item of requests){
 for(const type of ['prerequest','test']){new vm.Script(event(item,type));compiled++;}
 assert.equal(item.request.method,'POST');assert.ok(item.request.header.some(x=>x.key==='Content-Type'&&x.value==='application/json'));
 const config=cfg(item),ctx=context(item);execute(ctx,item,'prerequest');assert.ok(!ctx.pm.skipped,item.name+' unexpectedly skipped');
 const b=body(ctx,item);assert.ok(!/\{\{[^{}]+\}\}/.test(ctx.pm.variables.replaceIn(item.request.url)),item.name);
 function normalize(){
  if(config.operation==='share'||config.operation==='details'||config.operation==='es5'||item.request.url.includes('/api/facebook/')){
   const keys=['input','url','id'].filter(k=>Object.hasOwn(b,k));assert.equal(keys.length,1);assert.equal(typeof b[keys[0]],'string');return normalizeFacebookPostInput(b[keys[0]]);
  }
  if(item.request.url.endsWith('/metrics'))return normalizeMetricsInput(b);
  const op=item.request.url.endsWith('/source/posts')?'source':item.request.url.endsWith('/comments')?'comments':'search';
  if(Array.isArray(b.keywords))return b.keywords.map(keyword=>normalizeContentInput(op,{...b,keyword}));
  return normalizeContentInput(op,b);
 }
 if(config.negative)assert.throws(normalize,item.name);else normalize();inputs++;
 setResponse(ctx,mock(config,b,config.next?'next':'first'),config.http);execute(ctx,item,'test');assertPass(ctx,item.name);
 for(const example of item.response){JSON.parse(example.body);savedExamples++;}
}
// Guard tests use fresh stores, not actual requests or upstream browsers.
const next=requests.find(x=>cfg(x).next),first=requests.find(x=>cfg(x).cursorKey===cfg(next).cursorKey&&!cfg(x).next);
const empty=new Map(c.variable.map(v=>[v.key,v.value]));let ctx=context(next,empty);execute(ctx,next,'prerequest');assert.ok(ctx.pm.skipped,'NEXT without cursor must skip');
ctx=context(first,empty);execute(ctx,first,'prerequest');setResponse(ctx,mock(cfg(first),body(ctx,first)));execute(ctx,first,'test');assertPass(ctx,'FIRST cursor seed');
const changedEnv=new Map(environment);changedEnv.set('threads_source_url','https://www.threads.com/@different');ctx=context(next,empty,changedEnv);execute(ctx,next,'prerequest');assert.ok(ctx.pm.skipped,'Changed source must skip NEXT');
empty.set(cfg(next).cursorKey+'_at',String(Date.now()-31*60*1000));ctx=context(next,empty);execute(ctx,next,'prerequest');assert.ok(ctx.pm.skipped,'Expired cursor must skip');
const metric=requests.find(x=>cfg(x).operation==='metrics'),cool=new Map(c.variable.map(v=>[v.key,v.value]));cool.set('cooldown_facebook',String(Date.now()+30000));ctx=context(metric,cool);execute(ctx,metric,'prerequest');assert.ok(ctx.pm.skipped,'Cooldown must skip');
const missing=new Map(environment);missing.set('facebook_original_url','{{missing_post_url}}');ctx=context(metric,new Map(c.variable.map(v=>[v.key,v.value])),missing);execute(ctx,metric,'prerequest');assert.ok(ctx.pm.skipped,'Unresolved template must skip');
ctx=context(metric,new Map(c.variable.map(v=>[v.key,v.value])));execute(ctx,metric,'prerequest');setResponse(ctx,{status:'rate_limited',reason:'HTTP_429',retryAfterMs:30000});execute(ctx,metric,'test');assert.ok(ctx.pm.tests.some(t=>!t.pass),'HTTP200 rate limit must fail business test');assert.equal(ctx.pm.next,null);assert.ok(Number(ctx.pm.collectionVariables.get('cooldown_facebook'))>Date.now());
const legacy=requests.find(x=>cfg(x).operation==='share');ctx=context(legacy,new Map(c.variable.map(v=>[v.key,v.value])));execute(ctx,legacy,'prerequest');setResponse(ctx,{ok:false,status:'unknown',isShare:null,reason:'RATE_LIMITED',retryAfter:'30'});execute(ctx,legacy,'test');assert.equal(ctx.pm.next,null);const cooldown=Number(ctx.pm.collectionVariables.get('cooldown_facebook'));assert.ok(cooldown>=Date.now()+28000 && cooldown<=Date.now()+31000,'Legacy retryAfter seconds must be respected');
const comment=requests.find(x=>cfg(x).operation==='comments'&&!cfg(x).next);
ctx=context(comment,new Map(c.variable.map(v=>[v.key,v.value])));execute(ctx,comment,'prerequest');
let staged=mock(cfg(comment),body(ctx,comment));Object.assign(staged,{phase:'collecting',reason:'COLLECTION_IN_PROGRESS',items:[],count:0,rootComments:0,replies:0,stagedCount:40});setResponse(ctx,staged);execute(ctx,comment,'test');assertPass(ctx,'Collecting oldest is not an empty completed result');
ctx=context(comment,new Map(c.variable.map(v=>[v.key,v.value])));execute(ctx,comment,'prerequest');let cached=mock(cfg(comment),body(ctx,comment));cached.transport={mode:'http',browserUsed:false,anonymous:true,proxyUsed:false,sourceProxyUsed:true,cacheHit:true,requests:0};setResponse(ctx,cached);execute(ctx,comment,'test');assertPass(ctx,'Proxy-derived cached page needs no new request');
ctx=context(comment,new Map(c.variable.map(v=>[v.key,v.value])));execute(ctx,comment,'prerequest');cached.transport.sourceProxyUsed=false;setResponse(ctx,cached);execute(ctx,comment,'test');assert.ok(ctx.pm.tests.some(t=>!t.pass),'Non-proxy origin must fail transport validation');
const report={checkedAt:new Date().toISOString(),officialSchema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',folders:c.item.length,requests:requests.length,endpoints:6,scriptsCompiled:compiled,requestInputsValidated:inputs,savedJsonExamples:savedExamples,assertionsPassed:assertions,guardScenarios:10,liveUpstreamRequestsSent:0,notes:'VM checks use simulated pm API; no claim that the Postman Desktop UI was automated/imported.'};
await fs.writeFile(folder+'/validation-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
