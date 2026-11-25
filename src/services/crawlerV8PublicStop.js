export const PUBLIC_STOP_POLICY='stop_login_keep_public_data_v1';
export function accessRequired(r={}){return !/^PROXY_/.test(r.reason||'')&&(['auth_required','security_checkpoint'].includes(r.status)||/^(?:AUTH_REQUIRED|LOGIN_OR_CHECKPOINT|LOGIN_REQUIRED|UPSTREAM_API_AUTH_REQUIRED|SECURITY_CHECKPOINT|FACEBOOK_AUTH_REQUIRED|FACEBOOK_SECURITY_CHECKPOINT)$/.test(r.reason||''));}
export function publicReadStop(r={}){
 if(/^(?:WORKER_STOPPED|CONTINUATION_PENDING|DATE_HYDRATION_IN_PROGRESS|RECOVERY_IN_PROGRESS|COLLECTION_IN_PROGRESS|IDENTITY_POLICY_RECHECK)$/.test(r.reason||''))return null;
 if(accessRequired(r))return{state:'skipped_access_required',reason:r.reason||'LOGIN_REQUIRED'};
 if(r.status==='rate_limited'||/^PROXY_|RATE_LIMIT|HTTP_429|NETWORK|TIMEOUT|CONNECT|TUNNEL|SOCKET|ECONN|ETIMEDOUT|HTTP_5\d\d/.test(r.reason||''))return null;
 if(r.identityVerified&&r.pagination?.hasMore===false&&r.coverage?.exhausted===true&&(r.operation==='source'||r.coverage.complete===true))return null;
 if(!r.items?.length&&/^(?:PUBLIC_ITEMS_NOT_RETURNED|PUBLIC_DATA_NOT_RETURNED|PUBLIC_COUNTERS_NOT_RETURNED|NO_PUBLIC_COMMENTS_RETURNED|SOURCE_OR_POST_UNAVAILABLE|COMMENTS_UNAVAILABLE|COMMENT_COUNT_UNVERIFIED)$/.test(r.reason||''))return{state:'partial_public',reason:r.reason};
 if(['unavailable','unknown'].includes(r.status))return{state:'partial_public',reason:r.reason||'PUBLIC_DATA_NOT_RETURNED'};
 if(['error','proxy_error'].includes(r.status)&&!/^PROXY_|NETWORK|TIMEOUT|CONNECT|TUNNEL|SOCKET|ECONN|ETIMEDOUT|HTTP_5\d\d|^INTERNAL_|CHECKPOINT_|JOB_LEASE_LOST|CONFIG|TEMPLATE|QUERY|IDENTITY|PARENT/.test(r.reason||''))return{state:'partial_public',reason:r.reason||'PUBLIC_READ_UNAVAILABLE'};
 return null;
}
export function bufferedPublicRows(result,state,{platform,kind}={}){
 const delivered=new Set(Array.isArray(state?.items)&&state.kind!=='facebook'&&state.kind!=='meta_comments'?state.items.slice(0,state.offset||0).map(x=>x.id):[]),buffered=Array.isArray(state?.items)?state.items.slice(state.kind==='facebook'||state.kind==='meta_comments'?0:state.offset||0):[],rows=[...new Map([...(result?.items||[]),...buffered].filter(x=>x?.id&&!delivered.has(x.id)).map(x=>[x.id,{...x}])).values()];
 if(platform==='threads'&&kind==='comments')for(const item of rows){const ancestors=[],seen=new Set([item.id]);let id=item.id,valid=true;while(id!==state?.context?.nativeId){const f=state?.context?.facts?.get(id);if(!f||!['native_reply_level_stack','native_reply_to_post'].includes(f.parentEvidence)){valid=false;break;}const p=f.type==='comment'?state.context.nativeId:f.parentId;if(!p||seen.has(p)){valid=false;break;}ancestors.push(p);seen.add(p);id=p;if(ancestors.length>64){valid=false;break;}}if(valid&&ancestors.length)item.nativeThreadContext={policy:'native_reply_ancestry_v1',rootId:state.context.nativeId,ancestors,observedAt:state.dateObservedAt||new Date().toISOString()};}
 return rows;
}
export function publicBufferHeldReason(job,source,state,parent){
 if(!source||source.canonicalSourceId)return'SOURCE_IDENTITY_UNVERIFIED';
 if(source.platform==='facebook'&&source.type!=='group'&&(source.identityStatus!=='verified'||source.identityProof?.nativeId!==source.nativeId||source.identityProof?.type!==source.type))return'SOURCE_IDENTITY_UNVERIFIED';
 if(job.kind==='comments'&&(!['indexed','existing'].includes(parent?.state)||!(job.lastVerifiedCommentCount>0)))return'PARENT_OR_COMMENT_COUNT_UNVERIFIED';
 if(source.platform!=='facebook'&&state?.base?.identityVerified!==true&&state?.kind!=='meta_comments')return'BUFFER_SOURCE_IDENTITY_UNVERIFIED';
 return null;
}
export function publicStopMigrationDecision(job,archive){
 if(job.publicStopPolicy===PUBLIC_STOP_POLICY)return null;
 if(job.lastReason==='WORKER_STOPPED')return null;
 const failureReason=job.state==='skipped_retry_exhausted'?job.lastFailureReason:job.lastReason;
 if(/NETWORK|TIMEOUT|RATE_LIMIT|HTTP_429|HTTP_5\d\d|^PROXY_(?!50_PUBLIC_RETRY)/.test(failureReason||''))return null;
 if(job.state==='partial'){
  if(accessRequired({status:job.lastStatus,reason:job.lastReason}))return publicReadStop({status:job.lastStatus,reason:job.lastReason});
  if(job.readComplete===true||/NETWORK|TIMEOUT|RATE_LIMIT|HTTP_429|^PROXY_|^(?:WORKER_STOPPED|CONTINUATION_PENDING|DATE_HYDRATION_IN_PROGRESS|RECOVERY_IN_PROGRESS|COLLECTION_IN_PROGRESS|IDENTITY_POLICY_RECHECK)$/.test(job.lastReason||''))return null;
  return{state:'partial_public',reason:job.lastReason||'PUBLIC_COVERAGE_PARTIAL'};
 }
 const current={status:job.lastStatus,reason:job.state==='skipped_retry_exhausted'?job.lastFailureReason:job.lastReason};
 if(job.state==='blocked')return accessRequired(current)?publicReadStop(current):null;
 if(!['pending','retry','skipped_retry_exhausted'].includes(job.state))return null;
 if(job.lastReason==='PROXY50_PUBLIC_RETRY'&&archive?.before)return publicReadStop({status:archive.before.lastStatus,reason:archive.before.lastReason});
 return publicReadStop(current);
}
