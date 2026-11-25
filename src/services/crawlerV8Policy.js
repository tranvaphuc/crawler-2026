import {CrawlDataError} from './crawlerV8Es5.js';
const identityEvidence=new Set(['matched_User.explicit_personal_profile','matched_User.id','matched_Page.id','matched_profile.delegate_page.id','matched_Group.id']);
export function hasVerifiedEs5SiteIdReceipt(source){
 const p=source?.identityProof,e=p?.es5SiteId;
 return source?.platform==='facebook'&&!source?.canonicalSourceId&&['page','user'].includes(source.type)&&
  p?.evidence==='es5_siteid_unambiguous_v1'&&p.nativeId===source.nativeId&&p.type===source.type&&
  Number.isFinite(Date.parse(p.checkedAt))&&e?.siteId===source.nativeId&&
  e?.matchedType===(source.type==='page'?'fbPageTopic':'fbUserTopic')&&
  Number.isSafeInteger(e.matchedCount)&&e.matchedCount>=2&&e.conflictingPostTypes===0&&
  e.timedOut===false&&e.failedShards===0;
}
export function hasVerifiedSourceReceipt(source){const p=source?.identityProof;return !source?.canonicalSourceId&&p?.nativeId===source?.nativeId&&p?.type===source?.type&&Number.isFinite(Date.parse(p?.checkedAt))&&(identityEvidence.has(p?.evidence)||hasVerifiedEs5SiteIdReceipt(source));}
export function shouldInvalidateSourceIdentity(error,{attempted=false,verified=false}={}){return attempted&&!verified&&['SOURCE_ID_NOT_IN_PUBLIC_RESPONSE','SOURCE_IDENTITY_UNVERIFIED','SOURCE_IDENTITY_CONFLICT'].includes(error?.code);}
export function canRestoreSourceReceipt(source){return source?.identityStatus==='unverified'&&hasVerifiedSourceReceipt(source)&&/LOGIN|AUTH_REQUIRED|NETWORK|TIMEOUT|^INTERNAL_|PROXY_|RATE_LIMIT|COMMENT_|PARENT_/.test(source.identityFailure||'');}
export async function prepareCrawlSourceInput(runtime,source,options={}){
 const input={url:source.url,platform:source.platform,sourceType:source.type,limit:20,count:'all',order:'latest',...options};
 const facebookProfile=source.platform==='facebook'&&source.type!=='group';
 // A listed user/page label must never bypass the live identity resolver.
 if(facebookProfile)delete input.sourceType;
 const body=await runtime.prepareInput(input,'source');
 if(facebookProfile){const r=body.reference;if(r?.idVerified!==true||!['page','user','group'].includes(r.type)||typeof r.id!=='string'||!/^\d+$/.test(r.id)||!identityEvidence.has(r.evidence)){const e=new CrawlDataError('SOURCE_IDENTITY_UNVERIFIED');e.resultStatus='sort_unavailable';e.identityReview={actualType:r?.type||null,actualId:r?.id||null,evidence:r?.evidence||null};throw e;}}
 return body;
}
export function sourceIdentityChanged(source,body){return source.platform==='facebook'&&(body.reference?.id!==source.nativeId||body.reference?.type!==source.type);}
export function exactPostCommentCount(item){const value=item?.metrics?.comment;return Number.isSafeInteger(value)&&value>=0&&value<=2147483647?value:null;}
export function commentCountDecision(value){return Number.isSafeInteger(value)&&value>=0?value===0?'skip':'fetch':'verify';}
export function unverifiedCommentCountResult(metrics){
 const blocked=['auth_required','security_checkpoint','sort_unavailable'].includes(metrics?.status);
 return {status:blocked?metrics.status:['ok','partial','unavailable'].includes(metrics?.status)?'error':metrics?.status||'error',reason:metrics?.reason||'COMMENT_COUNT_UNVERIFIED',retryAfterMs:metrics?.retryAfterMs};
}
