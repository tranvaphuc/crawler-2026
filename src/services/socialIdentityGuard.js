import {READ_STATE,attachReadState} from './socialReadState.js';
/** Never silently return another entity when a stored ES5 URL/ID pair is wrong. */
export function verifySystemIdentity(target,result){
 const expected=target.expectedNativeId;if(!expected||!['ok','partial','resolved'].includes(result.status)||result.identityVerified!==true)return result;
 const observed=result.post?.id||result.nativeId||result.nativePostId||(target.operation==='source'?result.source?.id:null);
 const alias=target.platform==='facebook'&&/^\d+_\d+$/.test(expected)&&result.post?.postId===expected.split('_')[1]&&[result.post?.profileId,result.post?.ownerId,result.post?.pageId].includes(expected.split('_')[0]);
 const matches=!!observed&&(alias||result.nativeIdentityAliases?.includes(expected)||String(observed)===expected||target.platform==='facebook'&&/^\d+_\d+$/.test(expected)&&String(observed)===expected.split('_')[1]);
 const systemIdentity={expected,observed:observed||null,verified:matches};if(matches){const verified={...result,systemIdentity};if(result[READ_STATE])attachReadState(verified,result[READ_STATE]);return verified;}
 const failed={...result,status:observed?'error':'unavailable',reason:observed?'SYSTEM_ID_URL_MISMATCH':'SYSTEM_NATIVE_ID_UNVERIFIED',identityVerified:false,systemIdentity};
 if(Array.isArray(result.items))Object.assign(failed,{items:[],count:0,rootComments:0,replies:0,pagination:{nextCursor:null,hasMore:null,complete:false,reason:failed.reason}});
 if(result.post)failed.post=null;if(result.metrics){failed.metrics=Object.fromEntries(Object.keys(result.metrics).map(k=>[k,null]));failed.extraMetrics={};}
 return failed;
}
