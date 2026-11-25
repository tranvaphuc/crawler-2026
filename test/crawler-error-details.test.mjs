import test from 'node:test';import assert from 'node:assert/strict';
import {crawlerErrorDetails,publicErrorCase,isolatedClassifiedError} from '../src/services/crawlerErrorDetails.js';
import {UnrecoverableError} from 'bullmq';
import {MongoNetworkError} from 'mongodb';
import {flowReadAction} from '../src/services/crawlerQueueFlow.js';
const context={queue:'facebook-comment',platform:'facebook',operation:'comments'};
test('Mongo getter-only names remain classifiable without masking the original network error',()=>{
 const error=new MongoNetworkError('private network details'),detail=crawlerErrorDetails({}, {...context,phase:'mongo_job_start',error});
 const copy=isolatedClassifiedError(error,detail,'MONGO_NETWORK_ERROR');
 assert.ok(copy instanceof MongoNetworkError);assert.equal(copy.name,'MongoNetworkError');assert.equal(copy.code,detail.code);assert.equal(copy.cause,error);assert.equal(error.message,'private network details');
 class ReadOnlyError extends Error{get name(){return 'ReadOnlyError'}get code(){return 'ORIGINAL'}}
 const original=new ReadOnlyError('original'),wrapped=isolatedClassifiedError(original,{code:'CLASSIFIED'},'ORIGINAL');assert.equal(wrapped.code,'CLASSIFIED');assert.equal(original.code,'ORIGINAL');
});
const network=(phase,nativeCode='ECONNRESET',extra={})=>({status:'error',reason:'NETWORK_ERROR',upstreamCode:nativeCode,transport:{networkTimings:[{phase,nativeCode,outcome:'error',route:'https://www.facebook.com/public?token=SECRET',elapsedMs:123,connectStatus:phase==='proxy_connect'?undefined:200,...extra}]}});
test('each reset, DNS, TCP, TLS, headers, body, decode and timeout gets a distinct code/group',()=>{
 const rows=[...['proxy_connect','proxy_tls','response_headers','response_body'].map(p=>network(p)),network('proxy_connect','ENOTFOUND'),network('proxy_connect','ECONNREFUSED'),network('proxy_tls','ERR_TLS_CERT_ALTNAME_INVALID'),network('response_decode','Z_DATA_ERROR'),network('proxy_tls','UPSTREAM_TIMEOUT'),network('response_headers','UPSTREAM_TIMEOUT')].map(r=>crawlerErrorDetails(r,context));
 assert.equal(new Set(rows.map(r=>r.code)).size,rows.length);assert.equal(new Set(rows.map(r=>r.groupKey)).size,rows.length);
 for(const row of rows){assert.equal(row.originalReason,'NETWORK_ERROR');assert.equal(row.requestRoute,'https://www.facebook.com/public');assert.doesNotMatch(JSON.stringify(row),/SECRET|token=/);}
});
test('HTTP status, API code, query and stage distinguish otherwise identical reader errors',()=>{
 const rows=[{reason:'UPSTREAM_HTTP_ERROR',upstreamHttpStatus:403},{reason:'UPSTREAM_HTTP_ERROR',upstreamHttpStatus:429},{reason:'UPSTREAM_HTTP_ERROR',upstreamHttpStatus:503},...[190,4,613].map(n=>({reason:'UPSTREAM_API_ERROR',upstreamCode:n})),{reason:'UPSTREAM_API_ERROR',upstreamCode:190,upstreamContext:{stage:'bootstrap'}},{reason:'UPSTREAM_API_ERROR',upstreamCode:190,upstreamContext:{stage:'graphql'}},{reason:'UPSTREAM_API_ERROR',upstreamCode:190,upstreamQuery:'CommentQuery'}].map(r=>crawlerErrorDetails(r,context));
 assert.equal(new Set(rows.map(r=>r.code)).size,rows.length);assert.equal(rows[3].apiCode,'190');
});
test('gzip/deflate, body truncation and absent wire-completion evidence are separate groups',()=>{
 const rows=[{bodyEncoding:'gzip',wireComplete:false},{bodyEncoding:'deflate',wireComplete:false},{bodyEncoding:'gzip',wireComplete:true},{bodyEncoding:'gzip'}].map(x=>crawlerErrorDetails(network('response_decode','Z_DATA_ERROR',x),context));
 assert.equal(new Set(rows.map(r=>r.groupKey)).size,4);assert.equal(rows.at(-1).wireComplete,null);
});
test('unknown stage remains explicit; proxy-acquire and read-budget timeouts are not lumped together',()=>{
 const values=[crawlerErrorDetails({reason:'NETWORK_ERROR'},context),...['proxy_acquire','proxy_permit','read_attempt_deadline'].map(failurePhase=>crawlerErrorDetails({reason:'UPSTREAM_TIMEOUT',transport:{failurePhase}},context))];
 assert.equal(values[0].phase,'unobserved');assert.equal(values[0].nativeCode,null);assert.equal(new Set(values.map(v=>v.code)).size,4);
 const afterSuccess=crawlerErrorDetails({reason:'UPSTREAM_TIMEOUT',transport:{failurePhase:'read_attempt_deadline',networkTimings:[{phase:'complete',outcome:'complete',httpStatus:200}]}},context);assert.equal(afterSuccess.phase,'read_attempt_deadline');
});
test('runtime, Mongo, validation and ES mapping fields stay distinct',()=>{
 const a=crawlerErrorDetails({}, {...context,phase:'reader_parse',error:new TypeError('private body SECRET')});assert.match(a.code,/TYPEERROR/);assert.doesNotMatch(JSON.stringify(a),/SECRET/);
 const b=crawlerErrorDetails({}, {...context,phase:'mongo_job_start',error:{name:'MongoServerError',code:50,codeName:'MaxTimeMSExpired'}});assert.equal(b.originalReason,'MaxTimeMSExpired');
 const errors=['publishedDate','parentDate'].map(field=>crawlerErrorDetails({}, {...context,phase:'es5_bulk_write',error:{name:'Error',code:'ES5_BULK_ITEM_FAILED',statusCode:400,esError:{type:'mapper_parsing_exception',reason:'failed to parse field ['+field+']',caused_by:{type:'illegal_argument_exception'}}}}));assert.notEqual(errors[0].code,errors[1].code);
 const esClient=crawlerErrorDetails({}, {...context,phase:'es_mapping_lookup',error:{name:'BadRequest',status:400,body:{error:{type:'index_not_found_exception'}}}});assert.equal(esClient.httpStatus,400);assert.equal(esClient.esErrorType,'index_not_found_exception');
});
test('unclassified runtime exceptions at different call sites do not collapse',()=>{
 const rows=['at readerOne (/app/read.js:1:2)','at readerTwo (/app/read.js:9:2)'].map(site=>crawlerErrorDetails({}, {...context,phase:'reader_runtime',error:{name:'TypeError',stack:'TypeError: PRIVATE\n '+site}}));assert.notEqual(rows[0].code,rows[1].code);assert.notEqual(rows[0].groupKey,rows[1].groupKey);assert.doesNotMatch(JSON.stringify(rows),/PRIVATE/);
});
test('classification does not rewrite policy reasons or silently change retry decisions',()=>{
 const result=network('proxy_tls');const before=JSON.stringify(result);assert.equal(flowReadAction(result),'rotate');crawlerErrorDetails(result,context);assert.equal(JSON.stringify(result),before);assert.equal(flowReadAction(result),'rotate');
});
test('long codes remain bounded and different operations cannot collide',()=>{
 const rows=['A','B'].map(s=>crawlerErrorDetails({reason:'ERROR_'+'R'.repeat(140),upstreamOperation:s.repeat(140)},context));for(const row of rows)assert.ok(row.code.length<=160);assert.notEqual(rows[0].code,rows[1].code);
 assert.notEqual(crawlerErrorDetails(network('proxy_tls'),context).groupKey,crawlerErrorDetails(network('proxy_tls'),{...context,queue:'youtube-source',platform:'youtube'}).groupKey);
});
test('case URLs discard credentials, query tokens and fragments',()=>{
 const value=publicErrorCase({data:{source:{_id:'s',url:'https://u:SECRET@facebook.com/public?token=SECRET#secret'},parent:{url:'https://www.facebook.com/1_2?token=SECRET'}}});assert.doesNotMatch(JSON.stringify(value),/SECRET|token|u:/);assert.equal(value.sourceUrl,'https://facebook.com/public');
});
test('public case links retain YouTube video/comment identity while dropping unrelated query strings',()=>{
 const value=publicErrorCase({data:{parent:{url:'https://www.youtube.com/watch?v=abcdefghijk&lc=UgxPublic&token=SECRET'}}});assert.equal(value.postUrl,'https://www.youtube.com/watch?v=abcdefghijk&lc=UgxPublic');
});
test('shared rejected Errors remain unchanged and produce identical diagnostics for independent jobs',()=>{
 const shared=Object.assign(new Error('RAW_NETWORK_FAILURE'),{code:'ECONNRESET'}),details=[],copies=[];
 for(let i=0;i<3;i++){const detail=crawlerErrorDetails({}, {...context,phase:'es5_bulk_write',error:shared});details.push(detail);copies.push(isolatedClassifiedError(shared,detail,shared.code));}
 assert.equal(shared.message,'RAW_NETWORK_FAILURE');assert.equal(shared.code,'ECONNRESET');assert.equal(new Set(details.map(d=>d.code)).size,1);assert.notEqual(copies[0],copies[1]);assert.equal(copies[0].cause,shared);
});
test('isolated classification preserves Bull unrecoverable semantics without mutating a single-flight rejection',()=>{
 const shared=new UnrecoverableError('FACEBOOK_PROFILE_UID_NOT_RETURNED'),detail=crawlerErrorDetails({}, {...context,phase:'uid_lookup',error:shared}),copy=isolatedClassifiedError(shared,detail,shared.message);
 assert.ok(copy instanceof UnrecoverableError);assert.equal(copy.name,'UnrecoverableError');assert.equal(shared.message,'FACEBOOK_PROFILE_UID_NOT_RETURNED');assert.equal(copy.originalFlowReason,shared.message);
});
