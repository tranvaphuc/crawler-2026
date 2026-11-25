import {nativeDocumentKey} from './crawlerV8IndependentIngest.js';

// Publication dates are immutable metadata. Counters, text and authors always
// come from the fresh native response; a cache hit cannot replace those fields.
export function createSourcePublicationCache({collection,metadataCollection,maxEntries=20000,ttlMs=3600000,now=Date.now,onEvent=()=>{}}={}){
 const cache=new Map(),misses=new Map();
 const remember=async(target,items)=>{
  if(target.platform!=='instagram'||!target.expectedNativeId)return 0;
  const source={platform:'instagram',type:'profile',nativeId:target.expectedNativeId},rows=[];
  for(const item of items||[]){
   const identity=nativeDocumentKey(item,source);
   if(!identity||String(item.author?.id)!==String(source.nativeId)||item.dateEvidence!=='matched_post_detail'||item.dateIsEstimated===true||!Number.isFinite(Date.parse(item.createdAt)))continue;
   const row={_id:identity.key,platform:source.platform,sourceNativeId:source.nativeId,nativeId:item.id,systemId:identity.id,createdAt:new Date(item.createdAt).toISOString(),evidence:'matched_post_detail',isEstimated:false};
   cache.set(row._id,{sourceNativeId:row.sourceNativeId,until:now()+ttlMs,createdAt:row.createdAt,publication:{evidence:row.evidence,isEstimated:false}});misses.delete(row._id);rows.push(row);
  }
  while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
  if(rows.length&&metadataCollection)try{await metadataCollection.bulkWrite(rows.map(row=>({updateOne:{filter:{_id:row._id},update:{$setOnInsert:{...row,verifiedAt:new Date(now())}},upsert:true}})),{ordered:false,maxTimeMS:1500});}catch{onEvent('store_failed',{platform:target.platform});}
  return rows.length;
 };
 const restore=async(target,items)=>{
  if(!['instagram','youtube'].includes(target.platform)||!target.expectedNativeId)return 0;
  const source={platform:target.platform,type:target.platform==='youtube'?'channel':'profile',nativeId:target.expectedNativeId};
  const missing=(items||[]).filter(item=>!Number.isFinite(Date.parse(item.createdAt))).map(item=>({item,identity:nativeDocumentKey(item,source)})).filter(x=>x.identity);
  if(!missing.length)return 0;
  const wanted=[];for(const {identity}of missing){const entry=cache.get(identity.key);if(entry&&(entry.until<=now()||entry.sourceNativeId!==source.nativeId))cache.delete(identity.key);if(!cache.has(identity.key)&&!(misses.get(identity.key)>now()))wanted.push(identity.key);}
  if(wanted.length){
   if(metadataCollection)try{
    const rows=await metadataCollection.find({_id:{$in:[...new Set(wanted)]},platform:target.platform,sourceNativeId:source.nativeId},{maxTimeMS:1500}).toArray();
    for(const row of rows){const pair=missing.find(x=>x.identity.key===row._id);if(!pair||row.nativeId!==pair.item.id||row.systemId!==pair.identity.id||row.platform!==source.platform||row.sourceNativeId!==source.nativeId||row.evidence!=='matched_post_detail'||row.isEstimated!==false||!Number.isFinite(Date.parse(row.createdAt)))continue;cache.set(row._id,{sourceNativeId:source.nativeId,until:now()+ttlMs,createdAt:new Date(row.createdAt).toISOString(),publication:{evidence:row.evidence,isEstimated:false}});}
   }catch{onEvent('lookup_failed',{platform:target.platform});}
   const remaining=wanted.filter(key=>!cache.has(key));
   if(remaining.length)try{
    const rows=await collection.find({_id:{$in:[...new Set(remaining)]},platform:target.platform,'source.nativeId':source.nativeId},{projection:{platform:1,'source.nativeId':1,parent:1,esPostProof:1},maxTimeMS:1500}).toArray();
    for(const row of rows){
     const pair=missing.find(x=>x.identity.key===row._id),parent=row.parent,proof=row.esPostProof;
     if(!pair||row.platform!==source.platform||row.source?.nativeId!==source.nativeId||parent?.nativeId!==pair.item.id||parent.systemId!==pair.identity.id||proof?.id!==pair.identity.id||proof.type!==pair.identity.type||!proof.confirmedAt||!Number.isFinite(Date.parse(parent.createdAt)))continue;
     // An operator-approved estimate must never become a verified date on a later crawl.
     if(parent.publication?.isEstimated===true)continue;
     // Legacy Instagram dates were hydrated from matched post details. YouTube
     // dates require explicit provenance, so a prior relative estimate is never
     // promoted to an exact publication time by this cache.
     if(source.platform==='youtube'&&(!parent.publication?.evidence||parent.publication.isEstimated!==false))continue;
     cache.set(row._id,{sourceNativeId:source.nativeId,until:now()+ttlMs,createdAt:new Date(parent.createdAt).toISOString(),publication:parent.publication});
    }
    while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
   }catch{onEvent('lookup_failed',{platform:target.platform});}
   for(const key of wanted)if(!cache.has(key))misses.set(key,now()+30000);
   while(misses.size>maxEntries)misses.delete(misses.keys().next().value);
   while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
  }
  let hits=0;
  for(const {item,identity}of missing){const entry=cache.get(identity.key);if(!entry)continue;item.createdAt=entry.createdAt;item.dateEvidence=entry.publication?.evidence==='matched_post_detail'?'matched_post_detail.cache':'committed_post.publication';item.dateIsEstimated=false;if(entry.publication?.precision)item.datePrecision=entry.publication.precision;hits++;}
  if(hits)onEvent('hit',{platform:target.platform,count:hits});return hits;
 };
 restore.remember=remember;return restore;
}
