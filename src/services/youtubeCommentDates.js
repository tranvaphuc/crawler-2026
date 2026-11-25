export const YOUTUBE_RELATIVE_DATE_POLICY='youtube_relative_text_v1';
const units={s:'second',sec:'second',second:'second',seconds:'second',m:'minute',min:'minute',minute:'minute',minutes:'minute',h:'hour',hr:'hour',hour:'hour',hours:'hour',d:'day',day:'day',days:'day',w:'week',wk:'week',week:'week',weeks:'week',mo:'month',month:'month',months:'month',y:'year',yr:'year',year:'year',years:'year','giây':'second','phút':'minute','giờ':'hour','ngày':'day','tuần':'week','tháng':'month','năm':'year'};
export function estimateYoutubeCommentDate(text,observedAt=Date.now()){
 if(typeof text!=='string')return null;
 const anchor=observedAt instanceof Date?+observedAt:typeof observedAt==='number'?observedAt:Date.parse(observedAt);
 if(!Number.isFinite(anchor))return null;
 const label=text.normalize('NFC').trim().toLowerCase().replace(/\s*\((?:edited|đã chỉnh sửa)\)\s*$/u,'').trim();
 let count,unit;
 if(/^(just now|a moment ago|vừa xong)$/.test(label)){count=0;unit='second';}
 else{const m=label.match(/^(\d+)\s*([a-zà-ỹ]+)\s*(?:ago|trước)$/u);if(!m)return null;count=Number(m[1]);unit=units[m[2]];}
 if(!unit||!Number.isSafeInteger(count)||count<0||count>1000000000)return null;
 let value;
 if(unit==='month'||unit==='year'){
  const date=new Date(anchor),day=date.getUTCDate(),months=unit==='year'?count*12:count;
  if(months>1200)return null;
  date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-months);
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));value=+date;
 }else value=anchor-count*({second:1000,minute:60000,hour:3600000,day:86400000,week:604800000}[unit]);
 if(!Number.isFinite(value)||value<0||value>anchor)return null;
 return{createdAt:new Date(value).toISOString(),dateIsEstimated:true,dateEvidence:YOUTUBE_RELATIVE_DATE_POLICY,datePrecision:'relative_'+unit,dateObservedAt:new Date(anchor).toISOString(),dateText:text};
}
export function applyYoutubeCommentDate(item,observedAt=Date.now()){
 if(item.createdAt)return item;
 const estimate=estimateYoutubeCommentDate(item.publishedText,observedAt);
 if(estimate)Object.assign(item,estimate);
 return item;
}
// Freeze the first estimate: retries must not move an existing comment between
// dates/weekly indices just because the current clock or display label changed.
export async function stabilizeYoutubeCommentDate(collection,item,videoId){
 if(!item.dateIsEstimated)return item;
 const root=item.type==='reply'?item.parentId:null;
 const fact=await collection.findOneAndUpdate({_id:item.id},{$setOnInsert:{videoId,rootCommentId:root,createdAt:item.createdAt,dateObservedAt:item.dateObservedAt,datePrecision:item.datePrecision,dateText:item.dateText,policy:YOUTUBE_RELATIVE_DATE_POLICY,firstSeenAt:new Date()}},{upsert:true,returnDocument:'after'});
 if(fact.videoId!==videoId||fact.rootCommentId!==root)throw Object.assign(Error('COMMENT_PARENT_MISMATCH'),{code:'COMMENT_PARENT_MISMATCH'});
 return{...item,createdAt:fact.canonicalPublishedDate||fact.createdAt,dateObservedAt:fact.dateObservedAt,nativeObservedAt:item.nativeObservedAt||item.dateObservedAt,datePrecision:fact.datePrecision,dateText:fact.dateText,dateEvidence:fact.canonicalPublishedDate?'youtube_preserved_es5_date_v1':fact.policy,dateIsEstimated:true,...(fact.canonicalPublishedDate?{dateOriginalEstimate:fact.createdAt,dateCanonicalizedFromExisting:true,dateCanonicalProof:fact.canonicalPolicy}:{})};
}
