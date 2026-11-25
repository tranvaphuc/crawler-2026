// This Symbol never serializes to JSON. Native continuation context stays server-side.
export const READ_STATE=Symbol('social-reader-continuation');
export function attachReadState(result,state){Object.defineProperty(result,READ_STATE,{value:state,enumerable:false,configurable:true});return result;}
export function cacheTransport(source){return {mode:'http',browserUsed:false,anonymous:source?.anonymous!==false,proxyUsed:false,sourceProxyUsed:source?.proxyUsed===true||source?.sourceProxyUsed===true,cacheHit:true,requests:0,...(source?.manager?{manager:true,scope:source.scope,sessionEpoch:source.sessionEpoch}:{})};}
