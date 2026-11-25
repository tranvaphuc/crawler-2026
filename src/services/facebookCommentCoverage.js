const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
export function initializeFacebookCommentCoverage(state){
 if(state.commentCoverageVersion===2)return;
 state.rootCommentIds=new Set(state.seen||[]);state.replyParents=new Map();
 for(const [parent,ids]of state.observedReplies||[])for(const id of ids){state.rootCommentIds.delete(id);state.replyParents.set(id,parent);}
 state.expectedReplies ||= new Map();state.observedReplies ||= new Map();
 for(const id of state.rootCommentIds)if(!state.expectedReplies.has(id))state.expectedReplies.set(id,null);
 state.commentCoverageVersion=2;state.rootPagesVerified=state.rootCommentIds.size?state.unfiltered===true:true;state.rootPagesObserved=state.rootCommentIds.size?1:0;
 state.commentFieldErrors ||= false;state.expectedCommentCount ??=null;
}
export function observeFacebookCommentPage(state,page,job,postId){
 initializeFacebookCommentCoverage(state);const reply=job.idGetComment!==postId;
 if(page.warnings?.some(w=>w.coverageAffected!==false))state.commentFieldErrors=true;
 if(!reply){state.rootPagesObserved++;state.rootPagesVerified&&=page.ordering?.unfilteredVerified===true;state.unfiltered=state.rootPagesVerified;
  // Facebook's root connection total_count is the post counter including replies, not the number of root edges.
  if(count(page.totalCount)!==null)state.expectedCommentCount=Math.max(state.expectedCommentCount??0,page.totalCount);
 }else if(count(page.totalCount)!==null)state.expectedReplies.set(job.idGetComment,Math.max(state.expectedReplies.get(job.idGetComment)??0,page.totalCount));
 for(const c of page.comments){
  if(reply){if(state.rootCommentIds.has(c._id)||state.replyParents.has(c._id)&&state.replyParents.get(c._id)!==job.idGetComment)throw Object.assign(Error('COMMENT_PARENT_MISMATCH'),{code:'COMMENT_PARENT_MISMATCH'});
   let ancestor=job.idGetComment;const visited=new Set([c._id]);while(ancestor){if(visited.has(ancestor))throw Object.assign(Error('COMMENT_PARENT_MISMATCH'),{code:'COMMENT_PARENT_MISMATCH'});visited.add(ancestor);ancestor=state.replyParents.get(ancestor);}
   state.replyParents.set(c._id,job.idGetComment);if(!state.observedReplies.has(job.idGetComment))state.observedReplies.set(job.idGetComment,new Set());state.observedReplies.get(job.idGetComment).add(c._id);
  }else{if(state.replyParents.has(c._id))throw Object.assign(Error('COMMENT_PARENT_MISMATCH'),{code:'COMMENT_PARENT_MISMATCH'});state.rootCommentIds.add(c._id);const known=count(c.repliesCount);if(known!==null)state.expectedReplies.set(c._id,Math.max(state.expectedReplies.get(c._id)??0,known));else if(!state.expectedReplies.has(c._id))state.expectedReplies.set(c._id,null);}
 }
}
export function facebookCommentCoverage(state,target){
 initializeFacebookCommentCoverage(state);const includeReplies=target.includeReplies===true,rootCount=state.rootCommentIds.size,replyCount=state.replyParents.size,exhausted=state.queue.length===0&&!state.budgetStopped&&!state.paginationStalled;
 let missingRepliesAtLeast=0,unknownReplyCounts=0,replyCountMismatch=false;
 // Native root reply totals include descendants, not just direct children.
 const descendants=new Map();for(const id of state.replyParents.keys()){let parent=state.replyParents.get(id);const visited=new Set([id]);while(parent&&!visited.has(parent)){visited.add(parent);descendants.set(parent,(descendants.get(parent)||0)+1);parent=state.replyParents.get(parent);}}
 for(const root of state.rootCommentIds){const expected=state.expectedReplies.get(root),observed=descendants.get(root)||0;if(count(expected)===null)unknownReplyCounts++;else{missingRepliesAtLeast+=Math.max(0,expected-observed);replyCountMismatch||=expected!==observed;}}
 const expectedPublicCount=count(state.expectedCommentCount),declaredReplies=[...state.rootCommentIds].reduce((n,id)=>n+(state.expectedReplies.get(id)||0),0),nativeCountVerified=expectedPublicCount!==null&&expectedPublicCount===(includeReplies?state.seen.size:rootCount+declaredReplies),unfiltered=state.rootPagesObserved>0&&state.rootPagesVerified===true;
 const complete=exhausted&&unfiltered&&nativeCountVerified&&!state.commentFieldErrors&&unknownReplyCounts===0&&(!includeReplies||!replyCountMismatch);
 const reason=state.paginationStalled?'NATIVE_PAGINATION_STALLED':!exhausted?'CONTINUATION_PENDING':!unfiltered?'FULL_COMMENT_MODE_UNVERIFIED':state.commentFieldErrors?'UPSTREAM_FIELD_ERRORS':includeReplies&&missingRepliesAtLeast>0?'PUBLIC_REPLY_COUNT_MISMATCH':expectedPublicCount===null?'COMMENT_COUNT_UNVERIFIED':!nativeCountVerified?'PUBLIC_COMMENT_COUNT_MISMATCH':unknownReplyCounts?'REPLY_COUNT_UNVERIFIED':includeReplies&&replyCountMismatch?'PUBLIC_REPLY_COUNT_MISMATCH':null;
 return{version:2,recoveries:state.recoveries||0,scope:'anonymous_public_response',complete,publicPaginationComplete:exhausted,exhausted,unfilteredVerified:unfiltered,nativeCountVerified,countScope:'comments_and_replies',expectedPublicCount,observedRootComments:rootCount,observedReplies:replyCount,observedUnique:state.seen.size,includeReplies,unknownReplyCounts,missingRepliesAtLeast:includeReplies?missingRepliesAtLeast:null,replyCountMismatch:includeReplies?replyCountMismatch:null,fieldErrors:state.commentFieldErrors,reason};
}
