import express from 'express';
import {createSocialInfoReaders} from '../services/socialInfo.js';
import {classifySocialUrl,createEs5ReferenceLookup,createSystemInputAdapter,ReferenceError} from '../services/socialSystemReference.js';
import {normalizeMetricsInput,SocialMetricsInputError} from '../services/socialMetrics.js';
import {FacebookShareInputError} from '../services/facebookShare.js';
import {jsonApiError,setRetryAfter} from './apiResponse.js';
import {createApiRequestGate} from '../services/apiRequestGate.js';
import {apiAwait,throwIfApiAborted} from '../services/apiRequestContext.js';
export function createSocialInfoRouter({readers=createSocialInfoReaders(),lookup=createEs5ReferenceLookup(),prepareInput=createSystemInputAdapter({lookup}),maxConcurrent=2,requestGates={}}={}){
 const router=express.Router();
 for(const operation of ['post_info','comment_info','resolve']){
 const path=operation==='resolve'?'/api/social/resource/resolve':operation==='post_info'?'/api/social/post/info':'/api/social/comment/info';
 router.post(path,express.json({limit:'16kb'}),(requestGates[operation]||createApiRequestGate({name:operation,maxConcurrent})).wrap(async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
   let result;
   if(operation==='post_info'){
    const body=await apiAwait(prepareInput(req.body,operation)),target=normalizeMetricsInput(body);result=await apiAwait(readers.postInfo(target));
   }else{
    const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b))throw new ReferenceError('JSON object required');
    if(b.platform!==undefined&&!['facebook','threads','instagram','youtube'].includes(b.platform))throw new ReferenceError('INVALID_PLATFORM');
    let ref=b.id!==undefined?await apiAwait(lookup({id:b.id,url:b.url||b.link,platform:b.platform,type:b.type,index:b.index,kind:operation==='comment_info'?'comment':b.kind})):classifySocialUrl(b.url||b.link);
    if(b.id===undefined&&b.kind!=='source'&&(ref.kind!=='source'||ref.platform==='facebook'&&ref.id)){try{ref=await apiAwait(lookup({url:b.url||b.link,platform:ref.platform,kind:operation==='comment_info'?'comment':b.kind,type:b.type,index:b.index}));}catch(e){throwIfApiAborted();if(e.status===409)throw e;}}
    if(b.platform&&b.platform!==ref.platform)throw new ReferenceError('PLATFORM_URL_MISMATCH');
    for(const key of ['url','link'])if(b[key]){const r=classifySocialUrl(b[key]),focusedComment=ref.kind==='comment'&&r.kind==='comment';if(r.platform!==ref.platform||r.kind!==ref.kind&&!(ref.platform==='threads'&&ref.kind==='comment'&&r.kind==='post')||(focusedComment?r.id!==ref.id||!!(ref.parentId&&r.parentId&&ref.parentId!==r.parentId):r.id!==classifySocialUrl(ref.url).id))throw new ReferenceError('REFERENCE_MISMATCH');}
    if(operation==='comment_info'){if(ref.kind!=='comment')throw new ReferenceError('COMMENT_REFERENCE_REQUIRED');result=await apiAwait(readers.commentInfo(ref));}
    else if(ref.evidence?.startsWith('es5.'))result={...ref,status:'resolved',liveStatus:'not_checked',checkedAt:new Date().toISOString()};
    else if(ref.kind==='source')result=await apiAwait(readers.sourceInfo(ref));
    else if(ref.kind==='post'){
     const r=await apiAwait(readers.postInfo({...normalizeMetricsInput({url:ref.url}),apiOperation:'resolve_post'})),id=r.post?.id;
     result={platform:ref.platform,kind:'post',type:r.post?.type||'post',id:id||null,systemId:r.post?.id&&(ref.platform==='facebook'||ref.platform==='youtube')?r.post.id:r.post?.id&&r.post?.author?.id?`${r.post.author.id}_${r.post.id}`:null,url:r.post?.url||ref.url,idVerified:!!id&&r.identityVerified===true,status:id&&r.identityVerified?'resolved':r.status,reason:r.reason||null,transport:r.transport,evidence:id?'matched_public_post_payload':null,checkedAt:r.checkedAt};
    }else result={...ref,status:'resolved',verificationScope:'url_structure',liveStatus:'not_checked',checkedAt:new Date().toISOString()};
   }
   setRetryAfter(res,result);return res.json(result);
  }catch(e){throwIfApiAborted();const status=e instanceof ReferenceError?e.status:e instanceof SocialMetricsInputError||e instanceof FacebookShareInputError?400:500;setRetryAfter(res,e);return res.status(status).json({retryAfterMs:e.retryAfterMs||null,status:e.resultStatus||(status>=500?'error':[404,422].includes(status)?'unavailable':'invalid_input'),reason:status===500?'INTERNAL_ERROR':e.message});}
 }));}
 router.use(jsonApiError);return router;
}
