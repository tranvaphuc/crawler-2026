/** Sequential, bounded production read audit. Never logs the API key or retries platform gates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
const env=dotenv.parse(await fs.readFile('.env'));
const base=new URL(env.DOMAIN_FOR_API.includes('://')?env.DOMAIN_FOR_API:'https://'+env.DOMAIN_FOR_API);
if(base.protocol!=='https:'||base.username||base.password)throw Error('PRODUCTION_HTTPS_REQUIRED');
const runId=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.resolve('outputs/production-api-audit-2026-10-24',runId);
await fs.mkdir(out,{recursive:true,mode:0o700});
const inventory=JSON.parse(await fs.readFile('outputs/api-es5-sample-audit-2026-10-23/es5-samples.json'));
const rows=[],blocked=new Map(),responses=new Map();
const byType=t=>inventory.results.find(x=>x.type===t&&x.sample)?.sample;
const secretValues=Object.entries(env).filter(([k,v])=>/PASS|AUTHEN_KEY|TOKEN|SECRET/.test(k)&&v?.length>=8).map(([,v])=>v);
function sanitized(value){return JSON.parse(JSON.stringify(value,(key,v)=>{if(/^(?:authorization|cookie|set-cookie|password|proxyPassword|access_token|fb_dtsg)$/i.test(key))return '[REDACTED]';if(typeof v==='string'){for(const secret of secretValues)v=v.split(secret).join('[REDACTED]');}return v;}));}
async function save(){await fs.writeFile(path.join(out,'report.json'),JSON.stringify({startedAt:runId,updatedAt:new Date().toISOString(),baseUrl:base.origin,state:'running',blockedPlatforms:Object.fromEntries(blocked),results:rows},null,2));}
function validate(name,p,operation,body,d,http){
 const failures=[],notes=[];const fail=x=>failures.push(x);
 if(http>=500)fail('HTTP_SERVER_ERROR_'+http);
 if(http===401)fail('API_AUTH_REJECTED');
 if(['error','proxy_error'].includes(d.status))fail('READ_FAILED_'+(d.reason||d.status));
 const success=['ok','partial','resolved'].includes(d.status)||d.ok===true;
 if(d.platform&&p!==d.platform)fail('RESPONSE_PLATFORM_MISMATCH');
 if(d.transport){const t=d.transport;if(t.mode!=='http'||t.browserUsed!==false)fail('RUNTIME_TRANSPORT_CONTRACT');if(t.requests>0&&!t.proxyUsed)fail('UPSTREAM_WITHOUT_PROXY');}
 if(['source','comments','search'].includes(operation)){
  if(!Array.isArray(d.items)||d.count!==d.items.length)fail('COUNT_ITEMS_MISMATCH');
  if(!d.pagination)fail('PAGINATION_ENVELOPE_MISSING');
  const items=d.items||[],ids=items.map(x=>x.platform+'|'+x.id);if(new Set(ids).size!==ids.length)fail('DUPLICATE_IDS_IN_PAGE');
  for(const item of items){if(typeof item.id!=='string'||!item.id)fail('ITEM_ID_NOT_STRING');if(item.platform!==p)fail('ITEM_PLATFORM_MISMATCH');}
  if(operation==='comments'&&d.rootComments+d.replies!==items.length)fail('COMMENT_REPLY_COUNTS_MISMATCH');
  if(d.ordering?.verified===true&&items.length>1&&['latest','oldest'].includes(body.order||'latest')){const dates=items.map(x=>Date.parse(x.createdAt));if(dates.some(x=>!Number.isFinite(x))){if(d.ordering?.serverFilterVerified!==true)fail('VERIFIED_ORDER_WITHOUT_EXACT_DATES');else notes.push('SERVER_SORT_VERIFIED_WITHOUT_EXACT_DATES');}else if(body.order==='oldest'&&dates.some((x,i)=>i&&x<dates[i-1]))fail('OLDEST_ORDER_INCORRECT');else if((body.order||'latest')==='latest'&&dates.some((x,i)=>i&&x>dates[i-1]))fail('LATEST_ORDER_INCORRECT');}
  if(d.coverage?.complete!==true)notes.push('COVERAGE_NOT_COMPLETE');
  if(d.ordering?.verified!==true)notes.push('ORDER_NOT_VERIFIED');
  if(d.phase==='collecting'||d.phase==='filtering')notes.push('INTERMEDIATE_'+d.phase.toUpperCase());
  if(success&&d.count===0&&!['collecting','filtering'].includes(d.phase))notes.push('NO_ITEMS_RETURNED');
  if(operation==='source'&&d.count>0&&items.every(x=>!x.createdAt))notes.push('SOURCE_TIMESTAMPS_MISSING');
  if(body.since&&items.some(x=>!Number.isFinite(Date.parse(x.createdAt))||Date.parse(x.createdAt)<Date.parse(body.since)))fail('DATE_FILTER_LEAK');
 }
 if(operation==='metrics'){
  if(!d.metrics)fail('METRICS_ENVELOPE_MISSING');
  for(const [k,v]of Object.entries(d.metrics||{}))if(v!==null&&(!Number.isSafeInteger(v)||v<0))fail('INVALID_METRIC_'+k);
  if(success&&!Object.values(d.metrics||{}).some(v=>v!==null))notes.push('NO_PUBLIC_COUNTER');
 }
 if(operation==='post_info'&&success){if(!d.post?.id)fail('POST_ID_MISSING');if(!d.identityVerified)notes.push('POST_ID_NOT_VERIFIED');if(!d.post?.text&&!d.post?.content&&!d.post?.title)notes.push('POST_TEXT_NOT_RETURNED');}
 if(operation==='comment_info'&&success){if(!d.comment?.id)fail('COMMENT_ID_MISSING');if(d.id&&d.comment?.id!==d.id)fail('FOCUSED_COMMENT_ID_MISMATCH');}
 if(operation==='resolve'&&d.status==='resolved'){if(!d.id)notes.push('RESOLVED_WITHOUT_NATIVE_ID');if(!d.idVerified)notes.push('ID_NOT_VERIFIED');if(d.liveStatus==='not_checked')notes.push('STORED_MAPPING_NOT_LIVE_PROOF');}
 if(operation==='share'&&d.isShare===false)fail('KNOWN_SHARE_CLASSIFIED_AS_NOT_SHARE');
 if(operation==='share'&&d.isShare===true&&d.originalPost?.id&&d.originalPost.id!=='1000419343151470_122138942931244237')fail('KNOWN_ORIGINAL_POST_ID_MISMATCH');
 if(operation==='share'&&d.isShare===null)notes.push('SHARE_UNDETERMINED');
 if(operation==='es5'&&d.ok===true&&!(d.documents?.length))fail('ES5_OK_WITHOUT_DOCUMENT');
 if(operation==='es5'&&d.rejected?.length)notes.push('ES5_RECORD_REJECTED');
 if(d.status==='partial')notes.push('PARTIAL_RESULT');
 return{failures:[...new Set(failures)],notes:[...new Set(notes)]};
}
async function call(p,name,operation,endpoint,body){
 if(process.env.AUDIT_PLATFORMS&&!process.env.AUDIT_PLATFORMS.split(',').includes(p))return null;
 if(blocked.has(p)){rows.push({platform:p,name,operation,endpoint,status:'unstarted',reason:'EARLIER_PLATFORM_GATE',gate:blocked.get(p)});await save();return null;}
 const start=Date.now();let record,d;
 try{
  const r=await fetch(new URL(endpoint,base),{method:'POST',headers:{authorization:'Bearer '+env.AUTHEN_KEY_FOR_DOMAIN,'content-type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(130000)});
  const text=await r.text();try{d=JSON.parse(text);}catch{throw Error('NON_JSON_HTTP_'+r.status);}
  const checked=validate(name,p,operation,body,d,r.status);
  record={platform:p,name,operation,endpoint,httpStatus:r.status,status:d.status||null,reason:d.reason||d.error||null,ok:d.ok??null,count:d.count??null,phase:d.phase||null,stagedCount:d.stagedCount??null,rootComments:d.rootComments??null,replies:d.replies??null,id:d.post?.id||d.comment?.id||d.id||null,idVerified:d.idVerified??d.identityVerified??null,isShare:d.isShare??null,originalPostId:d.originalPost?.id||null,availableMetrics:Object.fromEntries(Object.entries(d.metrics||{}).filter(([,v])=>v!==null)),ordering:d.ordering||null,coverage:d.coverage||null,hasNextCursor:!!d.pagination?.nextCursor,hasRetryCursor:!!d.retryCursor,transport:d.transport||null,retryAfter:r.headers.get('retry-after'),retryAfterMs:d.retryAfterMs||null,elapsedMs:Date.now()-start,...checked};
  const gate=['auth_required','security_checkpoint','rate_limited'].includes(d.status)||/AUTH_OR_SECURITY_REQUIRED|RATE_LIMITED|LOGIN_OR_CHECKPOINT|PROXY_AUTH_REQUIRED/.test(d.reason||'');
  if(gate)blocked.set(p,{status:d.status,reason:d.reason||null,retryAfterMs:d.retryAfterMs||null});
  responses.set(name,d);await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(sanitized({request:{endpoint,body},response:d,httpStatus:r.status}),null,2));
 }catch(e){record={platform:p,name,operation,endpoint,status:'test_error',reason:e.name==='TimeoutError'?'CLIENT_TIMEOUT':e.message,elapsedMs:Date.now()-start,failures:['AUDIT_REQUEST_FAILED'],notes:[]};blocked.set(p,{reason:'AUDIT_TRANSPORT_FAILURE_NO_AUTOMATIC_RETRY'});}
 rows.push(record);await save();console.log(JSON.stringify(record));return d;
}
async function content(p,name,operation,endpoint,body,maxNext=1){
 let d=await call(p,name,operation,endpoint,body),all=[...(d?.items||[])];
 for(let n=1;n<=maxNext&&d?.pagination?.nextCursor&&!blocked.has(p);n++){d=await call(p,name+'-next-'+n,operation,endpoint,{...body,cursor:d.pagination.nextCursor});all.push(...(d?.items||[]));}
 return{first:responses.get(name),last:d,items:all};
}
const src='/api/social/';
// Exercise the two legacy-only endpoints before independent social operations.
await call('facebook','facebook-share-real','share','/api/facebook/post/share',{id:'61588342686925_122131613781278089'});
await call('facebook','facebook-details-real','details','/api/facebook/post/details',{id:'1000419343151470_122138942931244237'});
for(const [p,type,source]of [
 ['facebook','fbPageTopic','https://www.facebook.com/1794121197534939'],
 ['threads','threadsTopic','https://www.threads.com/@jucudidi'],
 ['instagram','snsTopic','https://www.instagram.com/shopmichaelangelos/'],
 ['youtube','youtubeTopic','https://www.youtube.com/channel/UCECgx1uTr_Pkguhm58-WhlA']]){
 const post=byType(type),comment=inventory.results.find(x=>x.platform===p&&x.kind==='comment'&&x.sample)?.sample;
 const sourceBody={url:source,...(p==='facebook'?{sourceType:'page'}:{}),count:4,limit:2,order:'latest'};
 const feed=await content(p,p+'-source-real','source',src+'source/posts',sourceBody,1);
 let postUrl=feed.items.find(x=>x.url)?.url||post.url;
 if(p==='threads')postUrl='https://www.threads.com/@dthh___n/post/DSl1YphAcpY';
 await call(p,p+'-post-info-url-real','post_info',src+'post/info',{url:postUrl});
 await call(p,p+'-metrics-url-real','metrics',src+'post/metrics',{url:postUrl});
 const commentPostUrl=p==='facebook'?comment.url.split('?')[0]:p==='instagram'?'https://www.instagram.com/p/DeozdjJHyt6/':p==='youtube'?'https://www.youtube.com/watch?v=nQE7i4kVWYc':postUrl;
 await content(p,p+'-comments-real','comments',src+'post/comments',{url:commentPostUrl,count:6,limit:3,includeReplies:true,order:'oldest'},3);
 if(comment)await call(p,p+'-comment-info-id-real','comment_info',src+'comment/info',{id:comment.id,platform:p,type:comment.type,index:comment.index});
 await call(p,p+'-resolve-source-url-real','resolve',src+'resource/resolve',{url:source,kind:'source'});
 if(post){const idBody={id:post.id,platform:p,type:post.type,index:post.index};await call(p,p+'-resolve-post-id-real','resolve',src+'resource/resolve',idBody);await call(p,p+'-post-info-id-real','post_info',src+'post/info',idBody);await call(p,p+'-metrics-id-real','metrics',src+'post/metrics',idBody);}
 await call(p,p+'-source-date-filter-real','source',src+'source/posts',{...sourceBody,since:'2026-10-01T00:00:00+07:00'});
 if(['threads','youtube'].includes(p)){
  await call(p,p+'-search-latest-real','search',src+'search',{platform:p,keyword:'cà phê',limit:20,order:'latest'});
  await call(p,p+'-search-relevance-explicit-real','search',src+'search',{platform:p,keyword:'cà phê',limit:20,order:'relevance'});
 }
}
for(const type of ['fbUserTopic','fbGroupTopic']){
 const post=byType(type),sourceType=type==='fbUserTopic'?'user':'group',comment=byType(type.replace('Topic','Comment'));
 await content('facebook','facebook-'+sourceType+'-source-real','source',src+'source/posts',{url:`https://www.facebook.com/${sourceType==='group'?'groups/':''}${post.siteId}`,sourceType,count:4,limit:2,order:'latest'},1);
 await call('facebook','facebook-'+sourceType+'-post-info-id-real','post_info',src+'post/info',{id:post.id,platform:'facebook',type,index:post.index});
 await call('facebook','facebook-'+sourceType+'-metrics-id-real','metrics',src+'post/metrics',{id:post.id,platform:'facebook',type,index:post.index});
 if(comment)await call('facebook','facebook-'+sourceType+'-comment-info-id-real','comment_info',src+'comment/info',{id:comment.id,platform:'facebook',type:comment.type,index:comment.index});
}
await call('facebook','facebook-details-es5-real','es5','/api/facebook/post/details',{id:'1794121197534939_1557540236390860',format:'es5',source:{type:'page',id:'1794121197534939',name:'RangDong Vietnam'}});
const report={startedAt:runId,finishedAt:new Date().toISOString(),baseUrl:base.origin,state:'finished',blockedPlatforms:Object.fromEntries(blocked),results:rows,summary:{plannedCases:rows.length,executed:rows.filter(x=>x.httpStatus||x.status==='test_error').length,unstarted:rows.filter(x=>x.status==='unstarted').length,failures:rows.filter(x=>x.failures?.length).length,endpointsAttempted:[...new Set(rows.filter(x=>x.httpStatus).map(x=>x.endpoint))]}};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
await fs.writeFile('outputs/production-api-audit-2026-10-24/latest-run.json',JSON.stringify({out,finishedAt:report.finishedAt,summary:report.summary},null,2));
console.log(JSON.stringify({auditFinished:true,out,summary:report.summary}));
