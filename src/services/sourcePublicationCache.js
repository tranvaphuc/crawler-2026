import {nativeDocumentKey} from './crawlerV8IndependentIngest.js';

// Publication dates are immutable metadata. Counters, text and authors always
// come from the fresh native response; a cache hit cannot replace those fields.
export function createSourcePublicationCache({collection,maxEntries=20000,ttlMs=3600000,now=Date.now,onEvent=()=>{}}={}){
 const cache=new Map();
 return async(target,items)=>{
  if(!['instagram','youtube'].includes(target.platform)||!target.expectedNativeId)return 0;
  const source={platform:target.platform,type:target.platform==='youtube'?'channel':'profile',nativeId:target.expectedNativeId};
  const missing=(items||[]).filter(item=>!Number.isFinite(Date.parse(item.createdAt))).map(item=>({item,identity:nativeDocumentKey(item,source)})).filter(x=>x.identity);
  if(!missing.length)return 0;
  const wanted=[];for(const {identity}of missing){const entry=cache.get(identity.key);if(entry&&(entry.until<=now()||entry.sourceNativeId!==source.nativeId))cache.delete(identity.key);if(!cache.has(identity.key))wanted.push(identity.key);}
  if(wanted.length){
   try{
    const rows=await collection.find({_id:{$in:[...new Set(wanted)]},platform:target.platform,'source.nativeId':source.nativeId},{projection:{platform:1,'source.nativeId':1,parent:1,esPostProof:1},maxTimeMS:1500}).toArray();
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
   }catch{onEvent('lookup_failed',{platform:target.platform});return 0;}
  }
  let hits=0;
  for(const {item,identity}of missing){const entry=cache.get(identity.key);if(!entry)continue;item.createdAt=entry.createdAt;item.dateEvidence='committed_post.publication';item.dateIsEstimated=false;if(entry.publication?.precision)item.datePrecision=entry.publication.precision;hits++;}
  if(hits)onEvent('hit',{platform:target.platform,count:hits});return hits;
 };
}
