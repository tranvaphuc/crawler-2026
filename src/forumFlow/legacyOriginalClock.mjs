import {forumTime} from './time.mjs';

// Old XenForo configs explicitly discarded seconds. Accept only that exact
// truncation, within the same minute, after replaying the native owned clock.
export function provenLegacyMinuteMatch(existing,doc,proof,site){
 const field=site?.legacy?.commentProcessor?.created_time;
 if(site?.adapter!=='xenforo'||typeof field?.format!=='string'||!field.format.includes(':mm')||field.format.includes('ss')||![undefined,'title','datetime'].includes(field.attribute))return false;
 const old=Date.parse(existing?._source?.publishedDate),original=Date.parse(doc?._source?.publishedDate);
 if(!Number.isFinite(old)||!Number.isFinite(original)||old%60000!==0||Math.floor(old/60000)!==Math.floor(original/60000)||proof?.time?.publishedDate!==doc._source.publishedDate)return false;
 try{return forumTime(proof.time.raw,{kind:proof.time.kind}).publishedDate===doc._source.publishedDate;}catch{return false;}
}

// Caller has already filtered candidates by publisher and native thread ID.
// Page-head pseudo-topics never outrank the original thread root.
export function selectOriginalTopicCandidate(hits,doc,proof,site){
 if(site?.adapter!=='xenforo'||doc?._type!=='forumTopic')return null;
 const original=Date.parse(doc._source.publishedDate),unit=proof?.time?.precision==='minute'?60000:1000;
 let replay;try{replay=forumTime(proof.time.raw,{kind:proof.time.kind}).publishedDate;}catch{return null;}
 if(replay!==doc._source.publishedDate)return null;
 const valid=hits.filter(h=>{
  try{const u=new URL(h._source.url);if(u.hash||u.search||/\/(?:page-\d+|post-\d+|posts\/\d+)\/?$/.test(u.pathname))return false;}catch{return false;}
  return Math.floor(Date.parse(h._source.publishedDate)/unit)===Math.floor(original/unit)||provenLegacyMinuteMatch(h,doc,proof,site);
 });
 const current=valid.filter(h=>h._id===doc._id&&h._index===doc._index);if(current.length===1)return current[0];
 if(valid.length===1)return valid[0];
 const exactUrl=valid.filter(h=>h._source.url===doc._source.url);return exactUrl.length===1?exactUrl[0]:null;
}
