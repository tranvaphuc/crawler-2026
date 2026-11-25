import {checkFacebookPostShare,getFacebookPostDetails,normalizeFacebookPostInput} from './facebookShare.js';
import {createHttpExecutor} from './socialHttpTransport.js';
/** Direct anonymous HTTPS through a leased proxy; never opens a browser. */
export function createFacebookHttpReaders(options={}){
 const execute=createHttpExecutor({...options,timeoutMs:options.timeoutMs||45000});
 const run=(details)=>async (input,apiOperation)=>{
  const target={...normalizeFacebookPostInput(input),platform:'facebook',apiOperation:apiOperation||(details?'post_details':'share')};
  const result=await execute(target,async session=>{
   let firstFailure;
   const value=await (details?getFacebookPostDetails:checkFacebookPostShare)(input,{fetchPage:async url=>{
    try{const r=await session.request(url);return {status:r.httpStatus,body:r.html,retryAfter:r.retryAfter,gate:/\/(?:login|checkpoint|challenge)(?:\/|\.php|[?]|$)/.test(r.finalUrl)};}
    catch(error){firstFailure ||= error;throw error;}
   }});
   if(firstFailure&&!value.ok)throw firstFailure;
   return value;
  });
  return typeof result.ok==='boolean'?result:{...result,ok:false,status:'unknown',requestedUrl:target.url,httpStatus:null,checkedAt:new Date().toISOString()};
 };
 return {check:run(false),details:run(true)};
}
