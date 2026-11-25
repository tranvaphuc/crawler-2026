import {createHttpExecutor}from'../src/services/socialHttpTransport.js';
import {assignedJson}from'../src/services/socialMetrics.js';
import {walkContent,normalizeContentInput}from'../src/services/socialContent.js';
import {youtubeContinuations,youtubeHttpUi}from'../src/services/socialHttpReaders.js';
const target=normalizeContentInput('comments',{url:'https://www.youtube.com/watch?v=wlQndvtII1M',limit:10});
const r=await createHttpExecutor()(target,async session=>{
 const snapshot={...await session.request(target.url),jsonResponses:[]};const cfg=assignedJson(snapshot.html.replace(/ytcfg\.set\(/g,'ytcfgHttpConfig = '),'ytcfgHttpConfig');
 const queue=youtubeContinuations(snapshot,target),seen=new Set(),steps=[];
 for(let n=0;n<3&&queue.length;n++){
  const next=queue.shift();if(seen.has(next.token)){n--;continue;}seen.add(next.token);
  const response=await session.request('https://www.youtube.com'+next.api,{method:'POST',headers:{'content-type':'application/json',referer:target.url},body:{context:cfg.INNERTUBE_CONTEXT,continuation:next.token}});
  let json;try{json=JSON.parse(response.html);}catch{}
  const shapes=[];walkContent(json,(v,path)=>{if(v.commentEntityPayload||v.commentThreadRenderer||v.commentViewModel||v.commentRenderer||v.appendContinuationItemsAction||v.reloadContinuationItemsCommand)shapes.push({path,keys:Object.keys(v),propertyKeys:Object.keys(v.commentEntityPayload?.properties||{}),threadKeys:Object.keys(v.commentThreadRenderer||{}),target:v.appendContinuationItemsAction?.targetId||v.reloadContinuationItemsCommand?.targetId||null});});
  snapshot.jsonResponses.push(response.html);const ui=youtubeHttpUi(target,snapshot);
  const mutationShapes=(json?.frameworkUpdates?.entityBatchUpdate?.mutations||[]).slice(0,4).map(x=>({keys:Object.keys(x),payloadKeys:Object.keys(x.payload||{}),nested:Object.fromEntries(Object.entries(x.payload||{}).map(([k,v])=>[k,v&&typeof v==='object'?Object.keys(v):typeof v]))}));
  steps.push({httpStatus:response.httpStatus,rootKeys:Object.keys(json||{}),shapes:shapes.slice(0,3),mutationShapes,items:ui.commentItems.length});
  queue.push(...youtubeContinuations(snapshot,target,{response:json}).filter(x=>!seen.has(x.token)));
 }
 return{status:'checked',contextKeys:Object.keys(cfg?.INNERTUBE_CONTEXT||{}),steps};
});console.log(JSON.stringify(r));
