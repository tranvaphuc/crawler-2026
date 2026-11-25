import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import https from 'node:https';
const env=dotenv.parse(await fs.readFile('.env'));
const base=new URL(env.DOMAIN_FOR_API.includes('://')?env.DOMAIN_FOR_API:'https://'+env.DOMAIN_FOR_API);base.protocol='https:';
const auth='Bearer '+env.AUTHEN_KEY_FOR_DOMAIN;
const paths=['/api/social/post/metrics','/api/social/source/posts','/api/social/post/comments','/api/social/search','/api/social/post/info','/api/social/comment/info','/api/social/resource/resolve','/api/facebook/post/share','/api/facebook/post/details'];
const results=[];
async function check(name,path,{method='GET',headers={},body,expected}={}){
 const r=await fetch(new URL(path,base),{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(15000)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{}
 if(text.includes(env.AUTHEN_KEY_FOR_DOMAIN))throw Error('SECRET_REFLECTED_IN_RESPONSE');
 const row={name,path,httpStatus:r.status,status:data?.status||null,reason:data?.reason||data?.error||null,passed:r.status===expected};results.push(row);if(!row.passed)throw Error('DEPLOYMENT_CHECK_FAILED_'+name+'_'+r.status);
 return data;
}
await check('health_missing_key','/api/health',{expected:401});
await check('health_correct_key','/api/health',{headers:{authorization:auth},expected:200});
for(const path of paths){
 await check('missing_key',path,{method:'POST',headers:{'content-type':'application/json'},body:'{broken',expected:401});
 await check('wrong_key',path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer invalid-deployment-key-0000000000000000'},body:'{broken',expected:401});
 await check('authorized_input_validation',path,{method:'POST',headers:{'content-type':'application/json',authorization:auth},body:'{}',expected:400});
}
await check('forwarded_header_not_auth','/api/health',{headers:{'x-forwarded-for':'127.0.0.1','x-api-key':'wrong'},expected:401});
await check('unknown_path_protected','/does-not-exist',{expected:401});
const duplicate=await new Promise((resolve,reject)=>{const req=https.request(new URL('/api/health',base),{headers:['Host',base.host,'Authorization',auth,'Authorization',auth]},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
results.push({name:'duplicate_authorization',httpStatus:duplicate,passed:[400,401].includes(duplicate)});if(![400,401].includes(duplicate))throw Error('DUPLICATE_HEADER_ACCEPTED');
const insecure=await fetch('http://'+base.host+'/api/health',{redirect:'manual',signal:AbortSignal.timeout(15000)});results.push({name:'http_redirects_to_https',httpStatus:insecure.status,passed:[301,308].includes(insecure.status)&&insecure.headers.get('location')==='https://'+base.host+'/api/health'});
const report={checkedAt:new Date().toISOString(),baseUrl:base.origin,tlsCertificateValidated:true,checks:results,passed:results.every(x=>x.passed),secretsOmitted:true};
await fs.writeFile('outputs/public-api-deploy-2026-10-24/domain-auth-checks.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({baseUrl:report.baseUrl,checks:results.length,passed:report.passed}));
if(!report.passed)process.exitCode=1;
