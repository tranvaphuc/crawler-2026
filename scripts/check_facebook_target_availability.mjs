/** Read-only public target probe; never interprets an inaccessible target as proven deleted. */
import fs from 'node:fs/promises';
import {createProxiedSession} from '../src/services/socialHttpTransport.js';
import {analyzeFacebookPostHtml,normalizeFacebookPostInput} from '../src/services/facebookShare.js';
import {facebookAnonymousContext} from '../src/services/facebookAnonymousGraphql.js';
const dir=process.env.FB_DIAG_DIR;if(!dir)throw Error('FB_DIAG_DIR_REQUIRED');
const proxy=JSON.parse(await fs.readFile(dir+'/fixed-proxy.credentials.json'));
if(Date.now()>proxy.expiresAt-30000)throw Error('FIXED_PROXY_EXPIRED');
const effective=process.env.FB_DIAG_RELAY==='1'?{...proxy,server:'http://127.0.0.1:'+(process.env.FB_PROXY_LOCAL_PORT||3852),host:'127.0.0.1',port:Number(process.env.FB_PROXY_LOCAL_PORT||3852)}:proxy;
const results=[];
for(const url of [process.env.FB_DIAG_URL,process.env.FB_TEST_UNAVAILABLE_URL].filter(Boolean)){
 const session=createProxiedSession({proxy:effective,platform:'facebook',deadline:Date.now()+40000});
 try{const r=await session.request(url);let reason=null;try{facebookAnonymousContext(r);}catch(e){reason=e.code;}
 const evidence=analyzeFacebookPostHtml(r.html,normalizeFacebookPostInput(url));
 results.push({url,http:r.httpStatus,postIdentityMatched:!!evidence.post,postReason:evidence.reason,status:reason==='POST_DELETED'?'deleted':reason==='TARGET_UNAVAILABLE'?'unavailable':reason?'unknown':evidence.post?'post_matched':'unknown',reason,deletedConfirmed:reason==='POST_DELETED',note:'An anonymous context alone does not prove post identity or accessible comments.'});
 }catch(e){results.push({url,status:'error',reason:e.code||e.name,deletedConfirmed:false});}finally{session.close();}
}
await fs.writeFile(dir+'/target-availability.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
