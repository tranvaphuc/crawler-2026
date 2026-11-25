const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
export function observeYoutubeCommentItems(state,items){
 state.expectedReplies ||= new Map();for(const item of items)if(item.type==='comment'){const n=count(item.replyCount);if(n!==null)state.expectedReplies.set(item.id,n);else if(!state.expectedReplies.has(item.id))state.expectedReplies.set(item.id,null);}
}
export function youtubeCommentCoverage(state,target){
 const exhausted=!!state.context&&state.queue.length===0&&!state.paginationStalled,rootIds=state.knownRootIds||new Set(),observedReplies=new Map();let orphanReplies=0;
 for(const id of state.seenIds){if(rootIds.has(id))continue;const parent=id.includes('.')?id.split('.')[0]:null;if(!parent||!rootIds.has(parent)){orphanReplies++;continue;}observedReplies.set(parent,(observedReplies.get(parent)||0)+1);}
 let unknownReplyCounts=0,missingRepliesAtLeast=0,replyCountMismatch=false,declared=0;
 for(const id of rootIds){const expected=count(state.expectedReplies?.get(id)),observed=observedReplies.get(id)||0;if(expected===null)unknownReplyCounts++;else{declared+=expected;missingRepliesAtLeast+=Math.max(0,expected-observed);replyCountMismatch||=expected!==observed;}}
 const expected=count(state.expected),nativeCountVerified=expected!==null&&expected===state.seenIds.size,replyCountsVerified=(!target.includeReplies||!replyCountMismatch)&&orphanReplies===0&&(unknownReplyCounts===0||nativeCountVerified);
 // Exact native total plus every reply count proves full coverage independently of display sort.
 const complete=target.operation==='comments'&&exhausted&&nativeCountVerified&&replyCountsVerified;
 return{version:3,recoveries:state.recoveries||0,scope:'anonymous_public_response',unfilteredVerified:state.nativeNewestConfirmed===true,exhausted,complete,expectedPublicCount:expected,observedUnique:state.seenIds.size,countMismatch:expected!==null&&!nativeCountVerified,nativeCountVerified,observedRootComments:rootIds.size,observedReplies:state.seenIds.size-rootIds.size,unknownReplyCounts,replyCountsVerifiedByNativeTotal:unknownReplyCounts>0&&nativeCountVerified&&replyCountsVerified,replyCountMismatch,orphanReplies,minimumExpectedFromReplyCounts:rootIds.size+declared,missingAtLeast:Math.max(0,(expected??rootIds.size+declared)-state.seenIds.size),missingRepliesAtLeast,publicPaginationComplete:exhausted,evidence:complete?'matched_native_total_and_reply_counts_exhausted':null,reason:state.paginationStalled?'UPSTREAM_REPEATED_PAGE':!exhausted?'COLLECTION_IN_PROGRESS':expected===null?'COMMENT_COUNT_UNVERIFIED':!nativeCountVerified?'PUBLIC_COMMENT_COUNT_MISMATCH':!replyCountsVerified?'PUBLIC_REPLY_COUNT_UNVERIFIED':'PUBLIC_CONTINUATIONS_EXHAUSTED'};
}
