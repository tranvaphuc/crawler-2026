import {randomUUID} from 'node:crypto';
export const CRAWL_WORKER_CLASSES=['facebook_source','comments','other_source'];
export function workerClass(job){return job.kind==='comments'?'comments':job.platform==='facebook'?'facebook_source':'other_source';}
export function shardAllocation(total,index,count){if(!Number.isInteger(total)||total<0||!Number.isInteger(count)||count<1||!Number.isInteger(index)||index<0||index>=count)throw Error('INVALID_WORKER_SHARD');return Math.floor(total/count)+(index<total%count?1:0);}
export function workerPlan({mainTotal=390,facebookSource=300,comments=60,otherSource=30,shardIndex=0,shardCount=2}={}){
 const values={facebook_source:facebookSource,comments,other_source:otherSource};if(!Number.isInteger(mainTotal)||mainTotal<0||Object.values(values).some(x=>!Number.isInteger(x)||x<0)||Object.values(values).reduce((a,b)=>a+b,0)!==mainTotal)throw Error('INVALID_WORKER_BUDGET');
 return Object.fromEntries(CRAWL_WORKER_CLASSES.map(key=>[key,shardAllocation(values[key],shardIndex,shardCount)]));
}
export function eligibleWorkerClasses(plan,active,cycle=0){const offset=cycle%CRAWL_WORKER_CLASSES.length,ordered=[...CRAWL_WORKER_CLASSES.slice(offset),...CRAWL_WORKER_CLASSES.slice(0,offset)];return ordered.filter(key=>(active[key]||0)<plan[key]).sort((a,b)=>(plan[b]-(active[b]||0))/plan[b]-(plan[a]-(active[a]||0))/plan[a]);}
export function plannedClaimSlots({plan,activeByClass,commentPlan,activeCommentPlatforms,cycle=0,max=8}){
 const classes={...activeByClass},platforms={...activeCommentPlatforms},slots=[];
 for(let n=0;n<max;n++){
  let selected=null;
  for(const kind of eligibleWorkerClasses(plan,classes,cycle+n)){
   if(kind==='comments'){
    const platform=eligibleCommentPlatforms(commentPlan,platforms,cycle+n)[0];
    if(!platform)continue;
    selected={kind,platform};platforms[platform]=(platforms[platform]||0)+1;
   }else selected={kind,platform:null};
   classes[kind]=(classes[kind]||0)+1;break;
  }
  if(!selected)break;slots.push(selected);
 }
 return slots;
}
export function mainCapacity({configured,pool,recovery=10}){const capacity=Number.isFinite(pool?.backgroundLeaseCapacity)?Math.max(0,pool.backgroundLeaseCapacity-recovery):Math.max(0,(pool?.keyCount||0)-5-recovery);return Math.min(configured,capacity);}
export function adaptiveWorkerBudget({total,configured,facebookSource,comments,facebookDemand,otherDemand}){
 const baseFacebook=Math.floor(total*facebookSource/configured),baseComments=Math.floor(total*comments/configured),baseOther=total-baseFacebook-baseComments;
 const needed=(value,max)=>Number.isSafeInteger(value)&&value>=0?Math.min(value,max):max;
 const facebook=needed(facebookDemand,baseFacebook),other=needed(otherDemand,baseOther);
 return{facebookSource:facebook,comments:total-facebook-other,otherSource:other,borrowed:baseFacebook-facebook+baseOther-other};
}
export function jobClassFilter(kind,{continuous=false}={}){if(kind==='facebook_source')return continuous?{kind:'source',sourceId:{$regex:'^(facebook:(page|group|user):|threads:|instagram:|youtube:)'}}:{kind:'source',platform:'facebook',sourceId:{$regex:'^facebook:(page|group|user):'}};if(kind==='comments')return{kind:'comments'};if(kind==='other_source')return{kind:'source',platform:{$in:['threads','instagram','youtube']}};throw Error('INVALID_WORKER_CLASS');}
export function commentPlatformPlan(total){
 if(!Number.isSafeInteger(total)||total<0)throw Error('INVALID_COMMENT_BUDGET');
 const weights={facebook:3,youtube:1,threads:1,instagram:1},plan=Object.fromEntries(Object.entries(weights).map(([k,w])=>[k,Math.floor(total*w/6)]));
 let remainder=total-Object.values(plan).reduce((a,b)=>a+b,0);
 for(const [key]of Object.entries(weights).sort((a,b)=>(total*b[1]%6)-(total*a[1]%6)))if(remainder-->0)plan[key]++;
 return plan;
}
export function eligibleCommentPlatforms(plan,active,cycle=0){
 const keys=Object.keys(plan),offset=cycle%keys.length;
 return [...keys.slice(offset),...keys.slice(0,offset)].filter(k=>(active[k]||0)<plan[k]);
}

// Finish a small set of already-scanned sources before widening the comment queue.
export function commentSourceFocus(rows,slots){
 const out=Object.fromEntries(Object.keys(slots).map(k=>[k,[]]));
 for(const platform of Object.keys(out)){if(!(slots[platform]>0))continue;const candidates=rows.filter(r=>r._id?.platform===platform&&r.runnable>0).sort((a,b)=>Number(a.blocked>0)-Number(b.blocked>0)||a.remaining-b.remaining||(b.active||0)-(a.active||0)||Date.parse(a.oldest)-Date.parse(b.oldest)||a._id.sourceId.localeCompare(b._id.sourceId));out[platform]=candidates.slice(0,Math.max(1,Math.ceil(slots[platform]/4))).map(r=>r._id.sourceId);}
 return out;
}

export async function claimCrawlJob(collection,{runId,kind,shardIndex,ownerToken,cycle=0,platform,completedSourceIds=[],focusSourceIds=[],continuous=false,at=new Date()}={}){
 if(platform&&(kind!=='comments'||!['facebook','youtube','threads','instagram'].includes(platform)))throw Error('INVALID_COMMENT_PLATFORM');
 const base={runId,...jobClassFilter(kind,{continuous}),...(platform?{platform}:{}),$or:[{state:{$in:['pending','retry','partial']},nextAt:{$lte:at}}]},update={$set:{state:'running',leaseToken:randomUUID(),workerShard:shardIndex,workerOwnerToken:ownerToken,workerClass:kind,leasedUntil:new Date(at.getTime()+180000),startedAt:at},$inc:{attempts:1}},options={sort:{priority:1,nextAt:1},returnDocument:'after'};
 // Expired owners are reclaimed by the fenced watchdog, keeping this hot path
 // inside the runnable-only index instead of sorting every historical job.
 const find=async(query,change,opts)=>collection.findOneAndUpdate(query,change,{...opts,hint:'crawl_ready_'+(query.sourceId?.$in?'source_':'')+(query.resumePending===1?'resume_':'')+'priority'});
 let job=null,focusedAttempted=false;
 if(continuous){
  if(kind==='facebook_source'){
   const channel=['page','group','user','threads','instagram','youtube'][cycle%6];
   const channelFilter=['page','group','user'].includes(channel)?{platform:'facebook',sourceId:{$regex:`^facebook:${channel}:`}}:{platform:channel};
   job=await find({...base,...channelFilter},update,options);
  }else if(kind==='comments'&&platform==='facebook'){
   const channel=['page','group','user'][cycle%3];job=await find({...base,sourceId:{$regex:`^facebook:${channel}:`}},update,options);
  }
  return job||find(base,update,options);
 }
 // A completed Group focus may stay nonempty indefinitely. Give each Facebook
 // author channel a first chance before that focus so Page and User comments
 // with a valid native parent cannot starve behind Group jobs.
 if(kind==='comments'&&platform==='facebook'){
  const channel=['page','group','user'][cycle%3];
  job=await find({...base,sourceId:{$regex:`^facebook:${channel}:`}},update,options);
  if(job)return job;
 }
 if(kind==='comments'&&focusSourceIds.length){
  const completed=new Set(completedSourceIds),ids=focusSourceIds.filter(id=>completed.has(id));if(ids.length){focusedAttempted=true;const focused={...base,sourceId:{$in:ids}};job=await find({...focused,resumePending:1},update,options);if(!job)job=await find(focused,update,{...options,sort:{priority:1,nextAt:1}});}
 }
 if(!job&&kind==='comments'&&completedSourceIds.length&&!focusedAttempted){
  const preferred={...base,sourceId:{$in:completedSourceIds}};
  job=await find({...preferred,resumePending:1},update,options);
  if(!job)job=await find(preferred,update,{...options,sort:{priority:1,nextAt:1}});
 }
 if(!job)job=await find({...base,resumePending:1},update,options);
 if(!job&&kind==='facebook_source'){const channel=['page','group','user'][cycle%3];job=await find({...base,sourceId:{$regex:'^facebook:'+channel+':'}},update,{...options,sort:{priority:1,nextAt:1}});}
 if(!job)job=await find(base,update,{...options,sort:{priority:1,nextAt:1}});return job;
}
export async function renewCrawlJobLease(collection,jobId,leaseToken,at=new Date()){
 const result=await collection.updateOne({_id:jobId,leaseToken,state:'running'},{$set:{leasedUntil:new Date(at.getTime()+180000)}});return result.matchedCount===1;
}

export function adaptiveCommentPlatformPlan(total,demand){
 if(!Number.isSafeInteger(total)||total<0)throw Error('INVALID_COMMENT_BUDGET');
 const base=commentPlatformPlan(total),keys=Object.keys(base),out=Object.fromEntries(keys.map(k=>[k,0]));
 const available=k=>Number.isSafeInteger(demand?.[k])?Math.max(0,demand[k]):total;
 for(const k of keys)out[k]=Math.min(base[k],available(k));
 let left=total-Object.values(out).reduce((a,b)=>a+b,0);
 while(left>0){const eligible=keys.filter(k=>out[k]<available(k));if(!eligible.length)break;eligible.sort((a,b)=>(out[a]/(base[a]||1))-(out[b]/(base[b]||1)));out[eligible[0]]++;left--;}
 return out;
}

export const CRAWL_READY_INDEXES=[
 ['crawl_ready_priority',{runId:1,kind:1,platform:1,priority:1,nextAt:1}],
 ['crawl_ready_resume_priority',{runId:1,kind:1,platform:1,resumePending:1,priority:1,nextAt:1}],
 ['crawl_ready_source_priority',{runId:1,kind:1,platform:1,sourceId:1,priority:1,nextAt:1}],
 ['crawl_ready_source_resume_priority',{runId:1,kind:1,platform:1,sourceId:1,resumePending:1,priority:1,nextAt:1}]
].map(([name,key])=>({name,key,partialFilterExpression:{state:{$in:['pending','retry','partial']}}}));
