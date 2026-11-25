/** Bounded real HTTP smoke tests using production ES5 samples already read locally. */
import 'dotenv/config';import fs from'node:fs/promises';import express from'express';import{once}from'node:events';
import{createSocialApiRuntime}from'../src/services/socialApiRuntime.js';import{referenceFromEsHit,ReferenceError}from'../src/services/socialSystemReference.js';
import{createSocialContentRouter}from'../src/routes/socialContent.js';import{createSocialMetricsRouter}from'../src/routes/socialMetrics.js';import{createSocialInfoRouter}from'../src/routes/socialInfo.js';
const dir='outputs/api-es5-sample-audit-2026-10-23',inventory=JSON.parse(await fs.readFile(dir+'/es5-samples.json'));
// Deterministic lookup of freshly queried ES5 samples prevents repeating expensive production searches in each smoke case.
const lookup=async({id,url,platform,kind,type})=>{const hits=inventory.results.filter(x=>x.sample&&(!platform||x.platform===platform)&&(!type||x.type===type)&&(kind==='source'?x.sample.siteId===id:id?x.sample.id===id:x.sample.url===url));if(!hits.length)throw new ReferenceError('SYSTEM_REFERENCE_NOT_FOUND',404);const mapped=hits.map(x=>referenceFromEsHit({_id:x.sample.id,_type:x.type,_source:x.sample},kind));const unique=[...new Map(mapped.map(x=>[[x.platform,x.kind,x.id,x.url].join('|'),x])).values()];if(unique.length!==1)throw new ReferenceError('AMBIGUOUS_SYSTEM_REFERENCE',409);return unique[0];};
const runtime=createSocialApiRuntime({lookup}),app=express();app.use(createSocialContentRouter({read:runtime.readContent,prepareInput:runtime.prepareInput}));app.use(createSocialMetricsRouter({read:runtime.readMetrics,prepareInput:runtime.prepareInput}));app.use(createSocialInfoRouter({readers:runtime.info,lookup,prepareInput:runtime.prepareInput}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const results=[],blocked=new Set();
const call=async(platform,name,path,body)=>{
 if(blocked.has(platform)){results.push({platform,name,status:'unstarted',reason:'EARLIER_AUTH_SECURITY_OR_RATE_LIMIT'});return;}
 const start=Date.now();try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/social/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(75000)}),data=await response.json();
 await fs.writeFile(`${dir}/${platform}-${name}.json`,JSON.stringify(data,null,2));results.push({platform,name,httpStatus:response.status,status:data.status,reason:data.reason||null,identityVerified:data.identityVerified??data.idVerified??false,count:data.count??null,phase:data.phase||null,transport:data.transport||null,elapsedMs:Date.now()-start});if(['auth_required','security_checkpoint','rate_limited'].includes(data.status))blocked.add(platform);
 }catch(e){results.push({platform,name,status:'test_error',reason:e.name,elapsedMs:Date.now()-start});}
 await fs.writeFile(dir+'/live-api-report.json',JSON.stringify({checkedAt:new Date().toISOString(),lookupMode:'freshly_queried_ES5_sample_fixture_no_repeated_ES_queries',results},null,2));console.log(JSON.stringify(results.at(-1)));
};
try{for(const platform of ['facebook','threads','instagram','youtube']){
 const post=inventory.results.find(x=>x.platform===platform&&x.kind==='post'&&x.sample)||inventory.results.find(x=>x.platform===platform&&x.sample),comment=inventory.results.find(x=>x.platform===platform&&x.kind==='comment'&&x.sample);if(!post){results.push({platform,status:'no_es5_sample'});continue;}
 await call(platform,'post-info-id','post/info',{id:post.sample.id,platform,type:post.type});
 await call(platform,'metrics-url','post/metrics',{url:post.sample.url});
 await call(platform,'comments-url','post/comments',{url:post.sample.url,count:10,limit:10,includeReplies:true,order:'oldest'});
 if(comment)await call(platform,'comment-info-id','comment/info',{id:comment.sample.id,platform,type:comment.type});
 await call(platform,'resolve-post-id','resource/resolve',{id:post.sample.id,platform,type:post.type});
 let source=platform==='facebook'?`https://www.facebook.com/${post.sample.siteId}`:platform==='youtube'?`https://www.youtube.com/channel/${post.sample.siteId}`:platform==='threads'?`https://www.threads.com/${new URL(post.sample.url).pathname.split('/').filter(Boolean)[0]}`:null;
 if(platform==='instagram'){try{const data=JSON.parse(await fs.readFile(`${dir}/${platform}-post-info-id.json`));if(data.post?.author?.username&&data.post.author.id===post.sample.siteId)source=`https://www.instagram.com/${data.post.author.username}/`;}catch{}}
 if(source)await call(platform,'source-posts','source/posts',{url:source,sourceType:platform==='facebook'?'page':undefined,count:5,limit:5,order:'latest'});else results.push({platform,name:'source-posts',status:'unstarted',reason:'SOURCE_USERNAME_NOT_VERIFIED'});
 }
 for(const type of ['fbUserTopic','fbGroupTopic']){const sample=inventory.results.find(x=>x.type===type)?.sample;if(sample&&!blocked.has('facebook'))await call('facebook',type+'-source','source/posts',{url:`https://www.facebook.com/${type==='fbGroupTopic'?'groups/':''}${sample.siteId}`,sourceType:type==='fbGroupTopic'?'group':'user',count:3,limit:3});}
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.writeFile(dir+'/live-api-report.json',JSON.stringify({checkedAt:new Date().toISOString(),lookupMode:'freshly_queried_ES5_sample_fixture_no_repeated_ES_queries',results},null,2));}
