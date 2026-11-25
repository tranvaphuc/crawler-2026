import {crawlerQueue,validProxyQueue} from './crawlerQueueContext.js';
export const ORIGIN_DEFAULT_WAIT_MS=15*60*1000;
const scopePattern=/^(facebook|instagram|youtube|threads):origin$/;
export function validOriginScope(scope){return typeof scope==='string'&&(scopePattern.test(scope)||scope.startsWith('queue:')&&validProxyQueue(scope.slice(6)));}
// Facebook limits rotate the current read's proxy, never hold other readers.
const rotatesAllOrigins=()=>process.env.CRAWL_ORIGIN_LIMIT_POLICY==='proxy-rotation';
export function originCooldownEnabled(scope){return validOriginScope(scope)&&scope!=='facebook:origin'&&!scope.startsWith('queue:crawler-flow-facebook-')&&scope!=='queue:crawler-flow-find-uid'&&!rotatesAllOrigins();}
export function isReadProxyLimit(result,scope){
 if(['auth_required','security_checkpoint'].includes(result?.status))return false;
 return result?.reason==='FACEBOOK_RATE_LIMITED'||(scope==='facebook:origin'||result?.transport?.scope?.startsWith('facebook.')||rotatesAllOrigins()&&(validOriginScope(scope)||/^(facebook|instagram|youtube|threads)\./.test(result?.transport?.scope||'')))&&isOriginRateLimit(result);
}
// Compatibility export; policy can also opt other flow origins into bounded proxy retries.
export const isFacebookReadLimit=isReadProxyLimit;
// Worker cooldowns use the exact queue; API callers retain their origin scope.
export function originCooldownScope(target,queue=crawlerQueue()){const scope=queue?'queue:'+queue:target.platform+':origin';if(!validOriginScope(scope))throw Error('ORIGIN_SCOPE_INVALID');return scope;}
export function originWaitMs(value){return Number.isSafeInteger(value)&&value>=0&&value<=8.64e15-Date.now()?Math.max(1000,value):ORIGIN_DEFAULT_WAIT_MS;}
export function isOriginRateLimit(result){
 if(/^PROXY_/.test(result?.reason||''))return false;
 return result?.status==='rate_limited'||['HTTP_429','UPSTREAM_HTTP_429','FACEBOOK_RATE_LIMITED','API_COOLDOWN'].includes(result?.reason);
}
