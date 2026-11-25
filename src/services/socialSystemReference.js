/** Exact, read-only ES5 reference resolution. No writes or arbitrary query DSL. */
import ES from 'elasticsearch';
import {normalizeMetricsInput} from './socialMetrics.js';
import {normalizeContentInput} from './socialContent.js';
import {normalizeFacebookSource} from '../../scripts/facebook_source_resolver.mjs';
const TYPES=['fbPageTopic','fbUserTopic','fbGroupTopic','fbPageComment','fbUserComment','fbGroupComment','threadsTopic','threadsComment','snsTopic','snsComment','youtubeTopic','youtubeComment'];
export class ReferenceError extends Error{constructor(reason,status=400,details={}){super(reason);this.status=status;this.resultStatus=details.resultStatus||null;this.retryAfterMs=details.retryAfterMs||null;}}
export function classifySocialUrl(input){
 if(typeof input!=='string'||input.length>4096)throw new ReferenceError('INVALID_REFERENCE');
 let u;try{u=new URL(input);}catch{throw new ReferenceError('URL_REQUIRED');}
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port)throw new ReferenceError('PUBLIC_SOCIAL_URL_REQUIRED');
 if(/^(?:www\.|m\.|web\.|mbasic\.)?(?:facebook\.com|fb\.com)$/.test(u.hostname)){const source=normalizeFacebookSource(u.href);if(source.status==='SOURCE')return{platform:'facebook',kind:'source',type:source.typeHint,id:source.numericId,url:source.url,idVerified:false,evidence:'url_structure'};}
 const commentId=u.searchParams.get('comment_id')||u.searchParams.get('lc')||(/^#\d+$/.test(u.hash)?u.hash.slice(1):null);
 try{const p=normalizeMetricsInput({url:u.href});return{platform:p.platform,kind:commentId?'comment':'post',type:commentId?'comment':'post',id:commentId||p.id,url:p.url,originalUrl:input,parentUrl:commentId?p.url:null,parentId:commentId?p.id:null,idVerified:p.platform==='youtube'||!!commentId,evidence:'url_structure'};}catch{}
 try{const s=normalizeContentInput('source',{url:u.href});return{platform:s.platform,kind:'source',type:s.platform==='youtube'?'channel':'profile',id:s.id,url:s.url,username:s.username||null,idVerified:false,evidence:'url_structure'};}catch{}
 const s=normalizeFacebookSource(u.href);if(s.status==='SOURCE')return{platform:'facebook',kind:'source',type:s.typeHint,id:s.numericId,url:s.url,idVerified:false,evidence:'url_structure'};
 throw new ReferenceError('UNSUPPORTED_SOCIAL_REFERENCE');
}
export function referenceFromEsHit(h,kind){
 const s=h._source||{},url=s.url||s.link;let ref;try{ref=classifySocialUrl(url);}catch{throw new ReferenceError('ES5_RECORD_HAS_NO_SUPPORTED_URL',422);}
 const type=h._type,platform=type.startsWith('fb')?'facebook':type.startsWith('threads')?'threads':type.startsWith('youtube')?'youtube':ref.platform;
 if(platform!==ref.platform)throw new ReferenceError('ES5_TYPE_URL_CONFLICT',409);
 if(kind==='source'){
  const sourceType=type.startsWith('fb')?type.replace(/^fb/,'').replace(/Topic|Comment/g,'').toLowerCase():platform==='youtube'?'channel':'profile';
  const sourceUrl=platform==='facebook'?`https://www.facebook.com/${sourceType==='group'?'groups/':''}${s.siteId}`:platform==='youtube'?`https://www.youtube.com/channel/${s.siteId}`:platform==='threads'?`https://www.threads.com/${new URL(ref.url).pathname.split('/').filter(Boolean)[0]}`:null;
  if(!s.siteId)throw new ReferenceError('SOURCE_URL_NOT_AVAILABLE_IN_ES5',422);
  return{platform,kind:'source',type:sourceType,id:String(s.siteId),url:sourceUrl,seedPostUrl:ref.url,name:s.siteName||null,idVerified:true,evidence:'es5.siteId',verificationScope:'stored_record',systemId:h._id};
 }
 const isComment=/Comment$/.test(type);if(kind&&kind!==(isComment?'comment':'post')&&!(platform==='threads'&&kind==='post'&&isComment))throw new ReferenceError('REFERENCE_KIND_MISMATCH',400);
 // Composite ES comment IDs are parentPost_nativeComment, not owner_post.
 const id=isComment?(ref.kind==='comment'?ref.id:/^(?:fb|sns|threads)/.test(type)&&/^\d+_\d+$/.test(h._id)?h._id.split('_')[1]:null):platform==='facebook'?h._id:platform==='youtube'?ref.id:/^\d+_\d+$/.test(h._id)?h._id.split('_')[1]:h._id;
 if(!id)throw new ReferenceError('NATIVE_ID_NOT_PROVEN_BY_ES5_RECORD',422);
 return{...ref,platform,kind:isComment?'comment':'post',type:isComment?'comment':type.startsWith('fb')?type.replace(/^fb/,'').replace('Topic','').toLowerCase()+'Post':'post',id,systemId:h._id,systemType:type,sourceId:s.siteId?String(s.siteId):null,parentSystemId:s.parentId||null,sourceName:s.siteName||null,idVerified:true,evidence:'es5._id_and_url',verificationScope:'stored_record'};
}
export function selectReferenceIndices(rows,{at=new Date(),limit=12}={}){
 // Leave a week of headroom for local-time rollover. Corrupt future dates in
 // stored data must not displace real weekly indices (e.g. master206844).
 const date=new Date(at);date.setUTCDate(date.getUTCDate()+7);date.setUTCHours(0,0,0,0);date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
 const year=date.getUTCFullYear(),week=Math.ceil(((date-Date.UTC(year,0,1))/86400000+1)/7),ceiling=`master${year}${String(week).padStart(2,'0')}`;
 return rows.filter(row=>/^master20\d{4}$/.test(row.index)&&Number(row.index.slice(-2))>=1&&Number(row.index.slice(-2))<=53&&row.index<=ceiling&&row.status==='open'&&Number(row['docs.count'])>0).map(row=>row.index).sort().reverse().slice(0,limit);
}
export function createEs5ReferenceLookup({client=null,indices=null,cacheTtlMs=60000,indexCacheTtlMs=60000,now=Date.now,indexNow=Date.now}={}){
 const cache=new Map(),pending=new Map();
 let active=client,indexPromise,indexCache,indexExpires=0;const getClient=()=>active||=(process.env.ES5_HOST?new ES.Client({host:process.env.ES5_HOST,log:[],requestTimeout:8000,maxRetries:0}):null);
 const loadIndices=c=>{
  if(indexCache&&indexExpires>now())return Promise.resolve(indexCache);
  if(!indexPromise)indexPromise=Promise.resolve().then(()=>c.cat.indices({index:'master*',format:'json',h:'index,status,docs.count'})).then(rows=>{
   const selected=selectReferenceIndices(rows,{at:new Date(indexNow())});
   if(selected.length){indexCache=selected;indexExpires=now()+indexCacheTtlMs;}return selected;
  }).finally(()=>{indexPromise=null;});
  return indexPromise;
 };
 const query=async({id,url,platform,kind,type,index})=>{
  if(id!==undefined&&(typeof id!=='string'||!id||id.length>300))throw new ReferenceError('id must be a non-empty string, max 300');
  if(index!==undefined&&(typeof index!=='string'||!/^master20\d{4}$/.test(index)))throw new ReferenceError('INVALID_ES5_INDEX');
  if(kind!==undefined&&!['post','comment','source'].includes(kind))throw new ReferenceError('INVALID_KIND');
  if(platform!==undefined&&!['facebook','threads','instagram','youtube'].includes(platform))throw new ReferenceError('INVALID_PLATFORM');
  if(type!==undefined&&!TYPES.includes(type))throw new ReferenceError('UNSUPPORTED_SYSTEM_TYPE');
  const c=getClient();if(!c)throw new ReferenceError('ES5_LOOKUP_NOT_CONFIGURED',503);
  try{
   // A known typed ID is an exact GET, not a distributed search across shards.
   if(index&&type&&id&&kind!=='source'&&typeof c.get==='function'){
    let hit;try{hit=await c.get({index,type,id,_source:'url,link,siteId,siteName,parentId,commentParentId'});}catch(e){if(e.status!==404&&e.statusCode!==404)throw e;}
    if(hit&&hit.found!==false){const ref=referenceFromEsHit(hit,kind);if(platform&&ref.platform!==platform)throw new ReferenceError('ES5_TYPE_URL_CONFLICT',409);return ref;}
    // Legacy ES5 documents can use custom routing. A GET without routing may
    // miss an existing ID; the bounded exact search below resolves that case.
    if(typeof c.search!=='function')throw new ReferenceError('SYSTEM_REFERENCE_NOT_FOUND',404);
   }
   const selected=index?[index]:indices||await loadIndices(c);
   if(!selected.length)throw new ReferenceError('ES5_INDICES_UNAVAILABLE',503);
   const filters=[];if(type)filters.push({term:{_type:type}});else filters.push({terms:{_type:TYPES.filter(t=>!platform||(platform==='facebook'?t.startsWith('fb'):platform==='instagram'?t.startsWith('sns'):t.startsWith(platform)))}});
   if(kind==='source')filters.push({term:{siteId:id}});else if(id)filters.push({term:{_id:id}});else if(url)filters.push({bool:{should:[{term:{url}},{term:{link:url}}],minimum_should_match:1}});else throw new ReferenceError('id or url is required');
   const r=await c.search({index:selected.join(','),size:6,body:{timeout:'3s',_source:['url','link','siteId','siteName','parentId','commentParentId'],query:{bool:{filter:filters}},sort:['_doc']}});
   if(r.timed_out||r._shards?.failed)throw new ReferenceError('ES5_LOOKUP_INCOMPLETE',503);
   const candidates=[];for(const h of r.hits?.hits||[])try{const x=referenceFromEsHit(h,kind);if(!platform||x.platform===platform)candidates.push(x);}catch(e){if(e.status!==422)throw e;}
   const unique=[...new Map(candidates.map(x=>[[x.platform,x.kind,x.id,x.url].join('|'),x])).values()];
   if(!unique.length)throw new ReferenceError('SYSTEM_REFERENCE_NOT_FOUND',404);
   if(unique.length>1)throw new ReferenceError('AMBIGUOUS_SYSTEM_REFERENCE_SUPPLY_PLATFORM_TYPE_KIND',409);
   return unique[0];
  }catch(e){if(e instanceof ReferenceError)throw e;throw new ReferenceError('ES5_LOOKUP_UNAVAILABLE',503);}
 };
 return async args=>{
  const key=JSON.stringify([args.id,args.url,args.platform,args.kind,args.type,args.index]);
  const cached=cache.get(key);if(cached&&cached.expires>now())return structuredClone(cached.value);
  if(!pending.has(key))pending.set(key,query(args).then(value=>{if(cacheTtlMs>0){while(cache.size>=512)cache.delete(cache.keys().next().value);cache.set(key,{expires:now()+cacheTtlMs,value});}return value;}).finally(()=>pending.delete(key)));
  return structuredClone(await pending.get(key));
 };
}
export function createSystemInputAdapter({lookup=createEs5ReferenceLookup(),resolveSource=null}={}){
 return async(body,operation)=>{
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ReferenceError('JSON object required');
  body={...body};delete body.reference;delete body.profileId;
  if(body.id===undefined){if(operation==='source'&&resolveSource&&(body.url||body.link)){let ref;try{ref=classifySocialUrl(body.url||body.link);}catch{return body;}if(ref.platform==='facebook'&&ref.kind==='source'&&(!ref.id||!body.sourceType||body.sourceType==='page')){const r=await resolveSource(ref);if(!r.idVerified)throw new ReferenceError(r.reason||'SOURCE_ID_UNVERIFIED',['rate_limited','auth_required','security_checkpoint','proxy_error','error'].includes(r.status)?200:422,{resultStatus:r.status,retryAfterMs:r.retryAfterMs});const url=r.type==='group'?`https://www.facebook.com/groups/${r.id}`:`https://www.facebook.com/${r.id}`;if(body.url&&body.link&&body.url!==body.link)throw new ReferenceError('SOURCE_LINK_URL_MISMATCH');return{...body,url,...(body.link?{link:url}:{}),sourceType:r.type,profileId:r.profileId,reference:r};}}return body;}
  if(typeof body.id!=='string'||!body.id||body.id.length>300)throw new ReferenceError('id must be a string, max 300');
  const kind=operation==='source'?'source':operation==='comment_info'?'comment':'post';
  let ref=await lookup({id:body.id,platform:body.platform,kind,type:body.type,index:body.index});
  if(resolveSource&&(!ref.url||kind==='source'&&ref.platform==='facebook'&&ref.type==='page')){ref=await resolveSource(ref);if(!ref.idVerified)throw new ReferenceError(ref.reason||'SOURCE_ID_UNVERIFIED',['rate_limited','auth_required','security_checkpoint','proxy_error','error'].includes(ref.status)?200:422,{resultStatus:ref.status,retryAfterMs:ref.retryAfterMs});}
  if(!ref.url)throw new ReferenceError('SOURCE_URL_NOT_AVAILABLE_IN_ES5',422);
  for(const key of ['link','url'])if(body[key]!==undefined){let supplied;try{supplied=classifySocialUrl(body[key]);}catch{throw new ReferenceError('INVALID_URL');}const expected=classifySocialUrl(ref.url);if(supplied.platform!==expected.platform||supplied.id!==expected.id||supplied.kind!==expected.kind)throw new ReferenceError('ID_URL_MISMATCH');}
  return{...body,url:ref.url,platform:ref.platform,reference:ref};
 };
}
