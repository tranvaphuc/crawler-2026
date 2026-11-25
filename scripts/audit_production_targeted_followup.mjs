import fs from 'node:fs/promises';import path from 'node:path';import dotenv from 'dotenv';
const e=dotenv.parse(await fs.readFile('.env')),latest=JSON.parse(await fs.readFile('outputs/production-api-audit-2026-10-24/latest-run.json')),report=JSON.parse(await fs.readFile(path.join(latest.out,'report.json')));
const base=report.baseUrl;
const collection=JSON.parse(await fs.readFile('outputs/postman-crawler-es5-2026-10-23/Crawler-2026.postman_collection.json'));
const shareUrl=collection.variable.find(x=>x.key==='facebook_share_url').value;
const cases=[
 {platform:'facebook',name:'facebook-share-original-permalink-confirm',operation:'share',endpoint:'/api/facebook/post/share',body:{url:shareUrl}},
 {platform:'instagram',name:'instagram-source-url-small-confirm',operation:'source',endpoint:'/api/social/source/posts',body:{url:'https://www.instagram.com/shopmichaelangelos/',count:2,limit:2,order:'latest'}},
 {platform:'instagram',name:'instagram-source-es5-id-confirm',operation:'source',endpoint:'/api/social/source/posts',body:{id:'6920202806',platform:'instagram',type:'snsTopic',index:'master202641',count:2,limit:2,order:'latest'}},
 {platform:'youtube',name:'youtube-source-es5-id-confirm',operation:'source',endpoint:'/api/social/source/posts',body:{id:'UCECgx1uTr_Pkguhm58-WhlA',platform:'youtube',type:'youtubeTopic',index:'master202641',count:2,limit:2,order:'latest'}}
];
const results=[];
for(const c of cases){
 if(report.blockedPlatforms[c.platform]){results.push({...c,status:'unstarted',reason:'EARLIER_PLATFORM_GATE'});continue;}
 const t=Date.now();try{
  const r=await fetch(base+c.endpoint,{method:'POST',headers:{authorization:'Bearer '+e.AUTHEN_KEY_FOR_DOMAIN,'content-type':'application/json'},body:JSON.stringify(c.body),signal:AbortSignal.timeout(130000),redirect:'manual'});const d=await r.json();
  const text=JSON.stringify(d);if(text.includes(e.AUTHEN_KEY_FOR_DOMAIN))throw Error('SECRET_REFLECTION');
  await fs.writeFile(path.join(latest.out,c.name+'.json'),JSON.stringify({request:{endpoint:c.endpoint,body:c.body},httpStatus:r.status,response:d},null,2));
  const row={platform:c.platform,name:c.name,operation:c.operation,endpoint:c.endpoint,httpStatus:r.status,status:d.status||null,reason:d.reason||d.error||null,ok:d.ok??null,count:d.count??null,isShare:d.isShare??null,originalPostId:d.originalPost?.id||null,source:d.source||null,systemIdentity:d.systemIdentity||null,authorIds:[...new Set((d.items||[]).map(x=>x.author?.id).filter(Boolean))],transport:d.transport||null,elapsedMs:Date.now()-t,failures:['error','proxy_error'].includes(d.status)?['READ_FAILED_'+d.reason]:[],notes:d.status==='partial'?['PARTIAL_RESULT']:[]};results.push(row);console.log(JSON.stringify(row));
  if(['rate_limited','auth_required','security_checkpoint'].includes(d.status))report.blockedPlatforms[c.platform]={status:d.status,reason:d.reason};
 }catch(err){const row={platform:c.platform,name:c.name,endpoint:c.endpoint,status:'test_error',reason:err.name,failures:['AUDIT_REQUEST_FAILED']};results.push(row);console.log(JSON.stringify(row));}
 await fs.writeFile(path.join(latest.out,'followup-report.json'),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
}
