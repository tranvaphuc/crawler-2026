// A source snapshot supplies a lower bound already persisted in Mongo. Older
// posts still go through import; they cannot advance this monotonic watermark.
export function createSourceLatestPostObserver({sources,now=()=>new Date()}){
 const observed=new WeakMap();
 return async function observe({source,sourceId,item,nativeId}){
  const time=Date.parse(item.createdAt);if(!Number.isFinite(time))return false;
  const bound=source._id===sourceId?Math.max(Date.parse(source.latestPostAt)||0,observed.get(source)||0):0;
  if(time<=bound)return false;
  const at=new Date(time).toISOString();
  await sources.updateOne({_id:sourceId,$or:[{latestPostAt:null},{latestPostAt:{$lt:at}}]},{$set:{latestPostAt:at,latestPostId:nativeId||item.id,latestPostUrl:item.url,latestPostObservedAt:now()}});
  // A non-matching conditional update also proves an equal or newer watermark.
  if(source._id===sourceId)observed.set(source,Math.max(bound,time));
  return true;
 };
}
