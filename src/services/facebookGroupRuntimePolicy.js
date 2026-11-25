// Group-only performance controls. Other reader defaults remain unchanged.
export function facebookGroupRuntimePolicy(env=process.env){
 const pageSize=Number(env.CRAWL_FACEBOOK_GROUP_PAGE_SIZE??3);
 const sessionMode=env.CRAWL_FACEBOOK_GROUP_SESSION_MODE||'shared';
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('FACEBOOK_GROUP_PAGE_SIZE_INVALID');
 if(!['shared','source'].includes(sessionMode))throw Error('FACEBOOK_GROUP_SESSION_MODE_INVALID');
 return {pageSize,sessionMode,reuseAcrossSources:sessionMode==='shared'};
}
export function retainGroupSession(policy,{yielded=false}={}){
 // Finished sources release their lease in source mode; only a live sliced
 // continuation may reserve its own transport/context for resumption.
 return policy.reuseAcrossSources||yielded;
}
