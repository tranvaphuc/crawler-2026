export const CONTINUOUS_FLOW_POLICY='continuous_source_comment_queues_v1';
export const RECENT_COMMENT_QUIET_MS=12*60*60*1000;
export const RECENT_COMMENT_FRESH_MS=24*60*60*1000;

export function continuousWorkerBudget({total,sourceDemand,commentDemand}){
 const demand=x=>Number.isSafeInteger(x)&&x>0?Math.min(total,x):0;
 const sources=demand(sourceDemand),comments=demand(commentDemand),capacity=Math.min(total,sources+comments);
 let source=Math.min(sources,Math.ceil(capacity/2));
 let comment=Math.min(comments,capacity-source);
 let spare=capacity-source-comment;
 const extraSource=Math.min(spare,sources-source);source+=extraSource;spare-=extraSource;
 comment+=Math.min(spare,comments-comment);
 return{source,comments:comment,total:source+comment};
}

export function recentCommentWatch(job,count,at=new Date()){
 const now=+(at instanceof Date?at:new Date(at));
 if(!Number.isFinite(now))throw Error('RECENT_COMMENT_CLOCK_INVALID');
 if(job?.watchRetiredAt)return{action:'retired',reason:'POST_COMMENT_WATCH_RETIRED'};
 if(Number.isSafeInteger(count)&&count>0&&!Number.isSafeInteger(job?.lastVerifiedCommentCount))return{action:'fetch',increased:false};
 const previous=Number.isSafeInteger(job?.maxObservedCommentCount)?job.maxObservedCommentCount:Number.isSafeInteger(job?.lastVerifiedCommentCount)?job.lastVerifiedCommentCount:0;
 const increased=Number.isSafeInteger(count)&&count>previous;
 const lastIncrease=Date.parse(job?.lastCountIncreaseAt||job?.createdAt||at);
 const lastComment=Date.parse(job?.lastCommentPublishedAt);
 if(!increased&&Number.isFinite(lastComment)&&now-lastComment>=RECENT_COMMENT_FRESH_MS)return{action:'retire',reason:'LAST_COMMENT_OLDER_THAN_24H'};
 if(!increased&&Number.isFinite(lastIncrease)&&now-lastIncrease>=RECENT_COMMENT_QUIET_MS)return{action:'retire',reason:'NO_COMMENT_COUNT_INCREASE_12H'};
 if(increased||Number.isSafeInteger(count)&&count>(job?.lastVerifiedCommentCount??0))return{action:'fetch',increased};
 return{action:'idle'};
}
