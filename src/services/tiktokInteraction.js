/** Private service-to-service adapter. Never forwards caller headers or exposes the provider key. */
import {metricsFailure,exactPublicCount,METRIC_KEYS} from './socialMetrics.js';
import {apiRequestContext,throwIfApiAborted} from './apiRequestContext.js';
const allowedStatuses=new Set(['live','die','ok','success','error','failed','unavailable','not_found','deleted','private','rate_limited','too_many_requests','auth_required','security_checkpoint']);
const nativeId=value=>typeof value==='string'&&/^\d{1,30}$/.test(value)?value:Number.isSafeInteger(value)&&value>=0?String(value):null;
const providerId=value=>{const id=nativeId(value);if(id)return{videoId:id,rawId:id};const composite=typeof value==='string'&&/^(\d{1,30})_(\d{1,30})$/.exec(value);return composite?{videoId:composite[2],rawId:value}:null;};
const delay=(headers,body)=>{const v=headers?.get('retry-after');if(v){const n=Number(v);if(Number.isFinite(n)&&n>=0)return n*1000;const d=Date.parse(v);if(Number.isFinite(d))return Math.max(0,d-Date.now());}return Number.isFinite(body?.retryAfterMs)&&body.retryAfterMs>=0?body.retryAfterMs:null;};
export function parseTiktokInteraction(target,payload,{httpStatus=200,retryAfterMs=null}={}){
 const r=metricsFailure(target,'unavailable','TIKTOK_COUNTERS_NOT_RETURNED');r.upstreamHttpStatus=httpStatus;
 const root=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:null;
 const data=root?.data&&typeof root.data==='object'&&!Array.isArray(root.data)?root.data:root;
 const status=String(root?.status??data?.status??'').toLowerCase();r.upstreamStatus=allowedStatuses.has(status)?status:null;
 const failure=(state,reason)=>({...r,status:state,reason,...(retryAfterMs!==null?{retryAfterMs}:{})});
 if(httpStatus===429||['rate_limited','too_many_requests'].includes(status))return{...failure('rate_limited','TIKTOK_UPSTREAM_RATE_LIMITED'),retryAfterMs:retryAfterMs??60000};
 if([401,403].includes(httpStatus))return failure('error','TIKTOK_UPSTREAM_AUTH_FAILED');
 if([404,410].includes(httpStatus))return failure('unavailable','TIKTOK_UPSTREAM_NOT_FOUND');
 if(httpStatus!==200)return failure('error','TIKTOK_UPSTREAM_HTTP_ERROR');
 if(!root)return failure('error','TIKTOK_UPSTREAM_INVALID_RESPONSE');
 if(['die','deleted','not_found','unavailable','private'].includes(status))return failure('unavailable','TIKTOK_UPSTREAM_REPORTED_UNAVAILABLE');
 if(status==='auth_required')return failure('auth_required','TIKTOK_ACCESS_REQUIRES_LOGIN');
 if(status==='security_checkpoint')return failure('security_checkpoint','TIKTOK_SECURITY_CHECKPOINT');
 if(['error','failed'].includes(status)||root.success===false)return failure('error','TIKTOK_UPSTREAM_ERROR');
 const identities=['id','aweme_id','itemId'].filter(k=>data[k]!==undefined&&data[k]!==null).map(k=>providerId(data[k]));
 if(!identities.length||identities.some(x=>!x))return failure('unavailable','TIKTOK_POST_ID_UNVERIFIED');
 if(identities.some(x=>x.videoId!==target.id))return failure('error','TIKTOK_POST_ID_MISMATCH');
 r.identityVerified=true;r.nativeId=target.id;r.upstreamPostId=identities[0].rawId;r.nativeIdentityAliases=[...new Set([target.id,...identities.map(x=>x.rawId)])];
 const stats=data.stats&&typeof data.stats==='object'&&!Array.isArray(data.stats)?data.stats:data;
 const mapping={likes:['likes','diggCount','digg_count','like_count'],shares:['shares','shareCount','share_count'],comment:['comments','comment','commentCount','comment_count'],views:['views','playCount','play_count','view_count'],saved:['saved','collectCount','collect_count','save_count'],reshares:['reshares','reshareCount','reshare_count'],repost:['repost','repostCount','repost_count'],quotes:['quotes','quoteCount','quote_count']};
 for(const[key,fields]of Object.entries(mapping)){
  const values=fields.filter(k=>Object.hasOwn(stats,k)).map(k=>[k,exactPublicCount(stats[k])]).filter(([,v])=>v!==null);
  if(new Set(values.map(([,v])=>v)).size>1){r.metricStatus[key]={status:'conflicting',reason:'Provider returned conflicting exact counts'};continue;}
  if(values.length){const[field,value]=values[0];r.metrics[key]=value;r.metricStatus[key]={status:'available',field:'upstream.'+field};r.evidence[key]='upstream.'+field;}
 }
 if(r.metrics.likes!==null){r.metrics.reactions=r.metrics.likes;r.metricStatus.reactions={status:'available',field:r.evidence.likes};r.evidence.reactions=r.evidence.likes;}
 for(const[key,value]of Object.entries(stats))if(/(?:_count|Count)$/.test(key)&&exactPublicCount(value)!==null)r.extraMetrics['upstream.'+key]=exactPublicCount(value);
 const count=METRIC_KEYS.filter(k=>r.metrics[k]!==null).length;
 r.status=count===METRIC_KEYS.length?'ok':count?'partial':'unavailable';r.reason=count?null:'TIKTOK_COUNTERS_NOT_RETURNED';return r;
}
export function createTiktokInteractionReader({url=process.env.TIKTOK_INTERACTION_API_URL,key=process.env.TIKTOK_INTERACTION_API_KEY,fetchImpl=fetch,timeoutMs=30000,maxBytes=1024*1024}={}){
 return async target=>{
  const transport={mode:'upstream_api',provider:'tiktok_interaction',browserUsed:false,proxyUsed:null,upstreamProxyUsed:null,requests:0};
  const fail=(status,reason)=>({...metricsFailure(target,status,reason),transport});
  let endpoint;try{endpoint=new URL(url);if(!['https:','http:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||typeof key!=='string'||key.length<16||/[\r\n]/.test(key))throw Error();}catch{return fail('error','TIKTOK_UPSTREAM_NOT_CONFIGURED');}
  endpoint.searchParams.set('url',target.url);
  try{
   throwIfApiAborted();const context=apiRequestContext(),timeoutSignal=AbortSignal.timeout(Math.max(1,Math.min(timeoutMs,context?context.deadline-Date.now():Infinity))),signal=context?AbortSignal.any([timeoutSignal,context.signal]):timeoutSignal;
   transport.requests=1;const response=await fetchImpl(endpoint,{method:'GET',headers:{'x-api-key':key,'content-type':'application/json','accept':'application/json'},redirect:'error',signal});
   if(response.status!==200){await response.body?.cancel();return{...parseTiktokInteraction(target,null,{httpStatus:response.status,retryAfterMs:delay(response.headers,null)}),transport};}
   // Only counters/status/ID are retained. Raw provider errors may echo credentials.
   let text='';if(response.body){const reader=response.body.getReader();let size=0;const chunks=[];while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();return fail('error','TIKTOK_UPSTREAM_RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(value));}text=Buffer.concat(chunks).toString('utf8');}
   let payload=null;try{payload=JSON.parse(text);}catch{if(response.status===200)return fail('error','TIKTOK_UPSTREAM_INVALID_JSON');}
   return{...parseTiktokInteraction(target,payload,{httpStatus:response.status,retryAfterMs:delay(response.headers,payload)}),transport};
  }catch(e){return fail('error',['TimeoutError','AbortError'].includes(e.name)?'TIKTOK_UPSTREAM_TIMEOUT':'TIKTOK_UPSTREAM_NETWORK_ERROR');}
 };
}
