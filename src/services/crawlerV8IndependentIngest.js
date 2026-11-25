import {POST_TYPES,serializeCrawlItem,verifyDocumentMapping} from './crawlerV8Es5.js';
import {hasVerifiedSourceReceipt} from './crawlerV8Policy.js';

export const INDEPENDENT_INGEST_POLICY='own_fields_create_or_existing_v1';
export function publicReadFinished(result,state){return result?.pagination?.hasMore===false&&result?.coverage?.exhausted===true&&!(state?.queue?.length||state?.items?.length);}
export function nativeDocumentKey(raw,source,parent=null){
 const postType=typeof POST_TYPES[source?.platform]==='object'?POST_TYPES[source.platform][source.type]:POST_TYPES[source?.platform];
 if(!postType||!raw?.id)return null;
 const numeric=x=>typeof x==='string'&&/^\d+$/.test(x);let id;
 if(parent){
  const aliases=[parent.nativeId,...(source.platform==='facebook'?[parent.systemId]:[])];
  if(['instagram','threads'].includes(source.platform))try{const path=new URL(parent.url).pathname,code=path.match(source.platform==='instagram'?/^\/(?:p|reel)\/([\w-]+)/:/^\/@[^/]+\/post\/([\w-]+)/)?.[1];if(code)aliases.push(code);}catch{}
  if(raw.postId!==undefined&&!aliases.includes(String(raw.postId)))return null;
  if(source.platform==='youtube'){if(!/^Ug[\w.-]+$/.test(raw.id))return null;id=raw.id;}
  else if(source.platform==='threads'){if(!numeric(raw.id)||!numeric(raw.author?.id))return null;id=raw.author.id+'_'+raw.id;}
  else{if(!numeric(raw.id)||!numeric(parent.nativeId))return null;id=parent.nativeId+'_'+raw.id;}
 }else if(source.platform==='facebook'){if(!numeric(raw.postId)||raw.id!==source.nativeId+'_'+raw.postId)return null;id=raw.id;}
 else if(source.platform==='youtube'){if(!/^[\w-]{11}$/.test(raw.id))return null;id=raw.id;}
 else{if(!numeric(source.nativeId)||!numeric(raw.id))return null;id=source.nativeId+'_'+raw.id;}
 const type=parent?postType.replace(/Topic$/,'Comment'):postType;return{key:type+':'+id,id,type};
}
export function ownParentReady(job,parent,source,context={}){
 if(!parent?.raw||parent.kind!=='post'||parent.sourceId!==job.sourceId||source?.canonicalSourceId)return false;
 try{const d=serializeCrawlItem(parent.raw,source,{since:job.windowSince||context.since,until:job.windowUntil||context.until});return d._id===job.parent.systemId&&d.nativeId===job.parent.nativeId&&d._type===parent.document._type;}catch{return false;}
}
export function ownCandidate(record,source,parent,context={},mappings){
 if(!source||source.canonicalSourceId||source.platform==='facebook'&&source.type!=='group'&&!hasVerifiedSourceReceipt(source))throw Object.assign(Error(),{code:'OWN_SOURCE_IDENTITY_UNVERIFIED'});
 const since=record.windowSince||context.since,until=record.windowUntil||context.until;
 let p=null;if(record.kind==='comment'){
  if(!parent?.raw||parent.sourceId!==record.sourceId)throw Object.assign(Error(),{code:'OWN_PARENT_FIELDS_REQUIRED'});
  const post=serializeCrawlItem(parent.raw,source);
  p={systemId:post._id,nativeId:post.nativeId,url:post._source.url,createdAt:post._source.publishedDate,text:post._source.content};
 }
 const raw=record.platform==='youtube'&&record.raw.dateIsEstimated&&record.raw.dateOriginalEstimate?{...record.raw,createdAt:record.raw.dateOriginalEstimate}:record.raw;
 const d=serializeCrawlItem(raw,source,{parent:p,since,until});
 if(d._id!==record.document._id||d._type!==record.document._type)throw Object.assign(Error(),{code:'OWN_NATIVE_ID_OR_TYPE_CHANGED'});
 if(mappings)verifyDocumentMapping(d,mappings[d._index]?.[d._type]);return d;
}

// Presence only: never fetch, compare, adopt, update or delete another producer's fields.
export async function existingNativeIds(es,records,indices){
 const found=new Map(),types=new Set(records.map(d=>d.type||d.document?._type));
 for(const type of types){const ids=[...new Set(records.filter(d=>(d.type||d.document?._type)===type).map(d=>d.id||d.document._id))];
  for(let n=0;n<ids.length;n+=400){const chunk=ids.slice(n,n+400),r=await es.search({index:Array.isArray(indices)?indices.join(','):indices,type,ignoreUnavailable:true,size:Math.min(10000,chunk.length*16),body:{_source:false,timeout:'15s',query:{ids:{values:chunk}}}});
   if(r.timed_out||r._shards?.failed)throw Object.assign(Error(),{code:'ES5_PRESENCE_LOOKUP_INCOMPLETE'});
   for(const h of r.hits.hits){const key=type+':'+h._id,list=found.get(key)||[];if(!list.includes(h._index))list.push(h._index);found.set(key,list);}
   if(r.hits.total>r.hits.hits.length)for(const id of chunk.filter(id=>!found.has(type+':'+id))){const one=await es.search({index:Array.isArray(indices)?indices.join(','):indices,type,ignoreUnavailable:true,size:1,body:{_source:false,query:{ids:{values:[id]}}}});if(one.timed_out||one._shards?.failed)throw Object.assign(Error(),{code:'ES5_PRESENCE_LOOKUP_INCOMPLETE'});if(one.hits.total)found.set(type+':'+id,[one.hits.hits[0]._index]);}
  }
 }
 return found;
}

export async function flushIndependentCrawlDocuments({db,es,selected,dedupIndices=selected,runId,context={},mappings,canWrite,limit=1000}){
 if(!await canWrite())return;
 const collection=db.collection('documents'),records=await collection.find({runId,state:'pending',nextAt:{$lte:new Date()}}).limit(limit).toArray();if(!records.length)return{checked:0};
 const exists=await existingNativeIds(es,records,dedupIndices),sources=new Map((await db.collection('sources').find({_id:{$in:[...new Set(records.map(d=>d.sourceId))]}}).toArray()).map(s=>[s._id,s])),parentKeys=[...new Set(records.filter(d=>d.kind==='comment').map(d=>d.document._type.replace(/Comment$/,'Topic')+':'+d.document._source.parentId))],parents=new Map((await collection.find({_id:{$in:parentKeys}}).toArray()).map(d=>[d._id,d])),ops=[],create=[],out={checked:records.length,indexed:0,existing:0,held:0};let bytes=0;
 for(const record of records){const filter={_id:record._id,state:'pending'},indices=exists.get(record._id);
  if(indices){out.existing++;ops.push({updateOne:{filter,update:{$set:{state:'existing',existingIndices:indices,sinkReceipt:{policy:INDEPENDENT_INGEST_POLICY,result:'existing',at:new Date()},checkedAt:new Date()},$unset:{error:'',repairPreviousState:''}}}});continue;}
  try{const d=ownCandidate(record,sources.get(record.sourceId),parents.get(record.document._type.replace(/Comment$/,'Topic')+':'+record.document._source.parentId),context,mappings);if(!selected.includes(d._index))throw Object.assign(Error(),{code:'ES5_INDEX_OUTSIDE_VERIFIED_WINDOW'});const size=Buffer.byteLength(JSON.stringify(d._source))+200;if(bytes+size>8*1024*1024&&create.length)break;bytes+=size;create.push({record,document:d});}
  catch(e){out.held++;ops.push({updateOne:{filter,update:{$set:{state:e.code==='OUTSIDE_CRAWL_WINDOW'?'excluded':'held_own_fields',error:e.code||'OWN_FIELDS_INVALID',checkedAt:new Date()}}}});}
 }
 if(!await canWrite())return out;if(ops.length)await collection.bulkWrite(ops,{ordered:false});if(!create.length)return out;
 const body=create.flatMap(x=>[{create:{_index:x.document._index,_type:x.document._type,_id:x.document._id}},x.document._source]),r=await es.bulk({body,refresh:false});if(r.items?.length!==create.length)throw Object.assign(Error(),{code:'ES5_BULK_RESPONSE_INCOMPLETE'});
 const at=new Date(),updates=r.items.map((item,n)=>{const result=item.create,state=result.status===201?'indexed':result.status===409?'existing':[401,403,408,429].includes(result.status)||result.status>=500?'pending':'held_own_fields';if(state==='indexed')out.indexed++;if(state==='existing')out.existing++;return{updateOne:{filter:{_id:create[n].record._id,state:'pending'},update:{$set:{state,document:create[n].document,...(state==='indexed'?{indexedAt:at}:{}),nextAt:new Date(+at+2000),sinkReceipt:{policy:INDEPENDENT_INGEST_POLICY,result:state,status:result.status,at},...(result.error&&!['indexed','existing'].includes(state)?{error:result.error.type||'ES5_WRITE_ERROR'}:{})},...(['indexed','existing'].includes(state)?{$unset:{error:'',repairPreviousState:''}}:{})}}};});
 if(await canWrite())await collection.bulkWrite(updates,{ordered:false});return out;
}
