import {es5FacebookIndex} from './facebookEs5.js';
export const POST_TYPES={facebook:{page:'fbPageTopic',group:'fbGroupTopic',user:'fbUserTopic'},threads:'threadsTopic',instagram:'snsTopic',youtube:'youtubeTopic'};
export class CrawlDataError extends Error{constructor(reason){super(reason);this.code=reason;}}
const fail=s=>{throw new CrawlDataError(s)};
const numeric=x=>typeof x==='string'&&/^\d+$/.test(x);
const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=2147483647?x:null;
function timestamp(x){if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(x)||!Number.isFinite(Date.parse(x)))fail('EXACT_PUBLICATION_DATE_REQUIRED');return new Date(x).toISOString();}
export function canonicalFacebookCommentUrl(parent,item){
 if(!/^\d+_\d+$/.test(parent.systemId||'')||parent.systemId.split('_')[1]!==parent.nativeId||!numeric(item.id))fail('PARENT_POST_UNVERIFIED');
 const u=new URL('https://www.facebook.com/'+parent.systemId);u.searchParams.set('comment_id',item.type==='reply'&&item.parentId?item.parentId:item.id);if(item.type==='reply')u.searchParams.set('reply_comment_id',item.id);return u.href;
}
export function serializeCrawlItem(item,source,{parent=null,now=new Date().toISOString(),since,until}={}){
 const p=source.platform,comment=!!parent,type=typeof POST_TYPES[p]==='object'?POST_TYPES[p][source.type]:POST_TYPES[p];if(!type)fail('SOURCE_TYPE_UNVERIFIED');
 const publishedDate=timestamp(item.createdAt);if(since&&Date.parse(publishedDate)<Date.parse(since)||until&&Date.parse(publishedDate)>Date.parse(until))fail('OUTSIDE_CRAWL_WINDOW');
 let id,nativeId=String(item.id||''),url=item.url;if(!item.id||typeof item.id!=='string')fail('NATIVE_ID_MUST_BE_STRING');
 if(!comment){
  if(p==='facebook'){if(!numeric(item.postId)||item.sourceId!==source.nativeId||item.id!==`${source.nativeId}_${item.postId}`)fail('FACEBOOK_CANONICAL_ID_MISMATCH');id=item.id;nativeId=item.postId;url=`https://www.facebook.com/${id}`;}
  else if(p==='youtube'){if(!/^[\w-]{11}$/.test(item.id))fail('YOUTUBE_VIDEO_ID_UNVERIFIED');id=item.id;url=`https://www.youtube.com/watch?v=${id}`;}
  else{if(!numeric(item.id)||!numeric(source.nativeId))fail('NATIVE_ID_UNVERIFIED');id=`${source.nativeId}_${item.id}`;}
  if(p!=='facebook'||source.type!=='group'){if(item.author?.id!==source.nativeId)fail('POST_AUTHOR_SOURCE_MISMATCH');}
 }else{
  if(!parent.systemId||!parent.nativeId)fail('PARENT_POST_UNVERIFIED');
  const parentAliases=p==='facebook'?[parent.systemId,parent.nativeId]:[parent.nativeId];
  if(['threads','instagram'].includes(p)){try{const u=new URL(parent.url),host=p==='threads'?/^(www\.)?threads\.(net|com)$/:/^(www\.)?instagram\.com$/;if(u.protocol==='https:'&&host.test(u.hostname)){const pattern=p==='threads'?/^\/@[^/]+\/post\/([\w-]+)\/?$/:/^\/(?:p|reel)\/([\w-]+)\/?$/;const code=u.pathname.match(pattern)?.[1];if(code)parentAliases.push(code);}}catch{}}
  if(item.postId!==undefined&&!parentAliases.includes(String(item.postId)))fail('COMMENT_PARENT_MISMATCH');
  if(p==='youtube'){if(!/^Ug[\w.-]+$/.test(item.id))fail('YOUTUBE_COMMENT_ID_UNVERIFIED');id=item.id;url=`https://www.youtube.com/watch?v=${parent.nativeId}&lc=${encodeURIComponent(item.id)}`;}
  else if(p==='threads'){if(!numeric(item.author?.id)||!numeric(item.id))fail('THREADS_COMMENT_AUTHOR_ID_REQUIRED');id=`${item.author.id}_${item.id}`;}
  else{if(!numeric(item.id))fail('COMMENT_ID_UNVERIFIED');id=`${parent.nativeId}_${item.id}`;
   if(p==='facebook')url=canonicalFacebookCommentUrl(parent,item);else{const u=new URL(parent.url);u.hash=item.id;url=u.href;}
  }
 }
 let u;try{u=new URL(url)}catch{fail('PUBLIC_URL_REQUIRED')};const hosts={facebook:/^(www\.)?facebook\.com$/,threads:/^(www\.)?threads\.(net|com)$/,instagram:/^(www\.)?instagram\.com$/,youtube:/^(www\.)?youtube\.com$/};if(u.protocol!=='https:'||!hosts[p].test(u.hostname)||u.username||u.password)fail('PLATFORM_URL_MISMATCH');
 if(p==='facebook'&&comment&&!numeric(item.author?.id))fail('FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED');
 const m=item.metrics||{},likes=count(m.likes??item.likes),shares=count(m.shares),comments=count(m.comment??(comment?item.replyCount:null)),views=p==='youtube'&&Number.isSafeInteger(m.views)&&m.views>=0?m.views:0;
 const author=item.author?.username||item.author?.name||'',doc={siteId:p==='threads'&&comment?item.author.id:source.nativeId,siteName:p==='threads'&&comment?author:source.name,insertedDate:timestamp(now),publishedDate,url,author,authorId:item.author?.id||null,title:comment?parent.text||'':item.title||'',description:item.description||'',content:item.text||'',likes,shares,comments,interactions:likes!==null&&shares!==null&&comments!==null?count(likes+shares+comments):null,delayCrawler:null,delayMongo:null,delayEs:null,ds:{source:`crawler-v8-${p}-${comment?'comment':'post'}`,ip:'25.10.20.26'}};
 if(p==='youtube'&&!comment)doc.views=views;
 if(comment){doc.parentId=parent.systemId;doc.parentDate=timestamp(parent.createdAt);if(item.type==='reply'&&item.parentId)doc.commentParentId=p==='youtube'?item.parentId:p==='threads'?null:`${parent.nativeId}_${item.parentId}`;}
 return{_index:es5FacebookIndex(publishedDate),_type:comment?type.replace(/Topic$/,'Comment'):type,_id:id,_source:doc,nativeId};
}
export function verifyDocumentMapping(doc,mapping){
 const props=mapping?.properties;if(!props)fail('ES5_TYPE_MAPPING_MISSING');
 for(const[k,v]of Object.entries(doc._source)){const m=props[k];if(!m)fail('ES5_UNMAPPED_FIELD_'+k);if(v==null)continue;if(m.type==='date')timestamp(v);if(m.type==='integer'&&count(v)===null)fail('ES5_INTEGER_INVALID_'+k);if(m.type==='long'&&(!Number.isSafeInteger(v)||v<0))fail('ES5_LONG_INVALID_'+k);if(m.type==='keyword'&&typeof v!=='string')fail('ES5_KEYWORD_INVALID_'+k);if(m.properties){for(const [sub,val]of Object.entries(v))if(!m.properties[sub]||typeof val!=='string')fail('ES5_OBJECT_FIELD_INVALID_'+k+'.'+sub);}}
 return true;
}
// Historical weekly indices predate some native types/fields. Repair only
// missing schema from the installed native template, never infer it from data
// or replace an existing field definition. Share concurrent cold lookups.
export function createCrawlMappingLoader({es,templateName='crawler-v8-native-types-20261102'}){
 const cache=new Map(),pending=new Map();let template;
 const allowed=new Set(Object.values(POST_TYPES).flatMap(t=>typeof t==='object'?Object.values(t):[t]).flatMap(t=>[t,t.replace(/Topic$/,'Comment')]));
 const missing=(doc,mapping)=>Object.keys(doc._source).filter(k=>!mapping?.properties?.[k]);
 async function load(doc){
  let live;
  try{live=await es.indices.getMapping({index:doc._index});}
  catch(e){
   if(e.status!==404||e.body?.error?.type!=='index_not_found_exception')throw e;
   try{await es.indices.create({index:doc._index});}catch(error){if(!['index_already_exists_exception','resource_already_exists_exception'].includes(error.body?.error?.type))throw error;}
   live=await es.indices.getMapping({index:doc._index});
  }
  let mapping=live[doc._index]?.mappings?.[doc._type],fields=missing(doc,mapping);
  if(!mapping?.properties||fields.length){
   if(!template){const t=await es.indices.getTemplate({name:templateName});template=t[templateName];}
   const reference=template?.mappings?.[doc._type];if(!reference?.properties)fail('ES5_TYPE_MAPPING_MISSING');
   for(const field of fields)if(!reference.properties[field])fail('ES5_UNMAPPED_FIELD_'+field);
   const body=mapping?.properties?{properties:Object.fromEntries(fields.map(k=>[k,reference.properties[k]]))}:reference;
   await es.indices.putMapping({index:doc._index,type:doc._type,body});
   live=await es.indices.getMapping({index:doc._index});mapping=live[doc._index]?.mappings?.[doc._type];
  }
  verifyDocumentMapping(doc,mapping);return mapping;
 }
 return async doc=>{
  if(!/^master\d{6}$/.test(doc._index)||!allowed.has(doc._type))fail('ES5_MAPPING_TARGET_UNVERIFIED');
  const key=doc._index+':'+doc._type;
  // Recheck this document even when another concurrent item filled the cache.
  for(;;){
   const saved=cache.get(key);if(saved&&!missing(doc,saved).length){verifyDocumentMapping(doc,saved);return saved;}
   let task=pending.get(key);
   if(!task){task=load(doc).then(mapping=>{cache.set(key,mapping);return mapping;}).finally(()=>pending.delete(key));pending.set(key,task);}
   await task;
  }
 };
}
export function classifyCrawlResult(r){
 if(['ok','partial'].includes(r.status))return 'data';
 if(r.reason==='PROXY_AUTH_REQUIRED')return 'retry';
 if(['SOURCE_ID_NOT_IN_PUBLIC_RESPONSE','SOURCE_IDENTITY_UNVERIFIED'].includes(r.reason)||['auth_required','security_checkpoint','sort_unavailable'].includes(r.status)||/CONFIG|TEMPLATE|QUERY|AUTH_REQUIRED|SECURITY|NATIVE_PAGINATION_STALLED|COMMENT_PARENT_MISMATCH|META_(?:POST_IDENTITY|PAGE_IDENTITY|NATIVE_POST_ID|REPLY_PARENT|INLINE_RESPONSE|COMMENT_CONNECTION|NEXT_CURSOR|NATIVE_PAGINATION)/.test(r.reason||''))return 'blocked';
 return 'retry';
}
