import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {refreshAnonymousGroupTemplate,DEFAULT_ANONYMOUS_GROUP} from '../src/services/anonymousGroupHeaderRefresh.js';
const base=process.env.CRAWL_HEADER_RUNTIME_ROOT||'/opt/crawler-v8/current',stateDir=process.env.CRAWL_HEADER_REFRESH_STATE_DIR||'/var/lib/crawler-v8/anonymous-header-refresh',activeFile=process.env.FACEBOOK_FEED_HAR_GROUP;
const cleanCode=e=>/^[A-Z0-9_]{1,80}$/.test(e?.code||'')?e.code:'REFRESH_FAILED';
async function readInput(){const chunks=[];let size=0;for await(const b of process.stdin){size+=b.length;if(size>600000)throw Object.assign(Error(),{code:'PAYLOAD_TOO_LARGE'});chunks.push(b)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
async function validate({candidateFile,candidate}){
 const {createProxiedSession}=await import('file://'+base+'/src/services/socialHttpTransport.js'),{createProxyManagerClient}=await import('file://'+base+'/src/services/proxyManagerClient.js'),{runCrawlerQueue}=await import('file://'+base+'/src/services/crawlerQueueContext.js'),{createAnonymousFacebookGraphqlRequest}=await import('file://'+base+'/src/services/facebookAnonymousGraphql.js'),{createFacebookPostFetcher}=await import('file://'+base+'/scripts/facebook_posts.js'),{parseChunks,mergeChunks}=await import('file://'+base+'/scripts/paginate_facebook_group_capture.js'),{unpackState}=await import('file://'+base+'/src/services/crawlerQueueFlow.js');
 return runCrawlerQueue('crawler-flow-facebook-group-source',async()=>{
  let lease,session,mongo;try{
   const provider=createProxyManagerClient({key:process.env.PROXY_MANAGER_BACKGROUND_AUTH_KEY||process.env.PROXY_MANAGER_AUTH_KEY});lease=await provider({platform:'facebook',operation:'source',sourceType:'group',minProxyRemainingMs:150000,proxyManagerTimeoutMs:15000});
   session=createProxiedSession({proxy:{...lease,beforeRequest:({reuseTransport})=>lease.permit({reuseTransport})},platform:'facebook',deadline:Date.now()+100000,requestTimeoutMs:22000,connectTimeoutMs:6000,tlsHandshakeTimeoutMs:6000});
   const groupId=candidate.groupId,target={platform:'facebook',operation:'source',sourceType:'group',id:groupId,profileId:groupId,url:`https://www.facebook.com/groups/${groupId}`};
   let nativeId=null;const wrapped={request:async(...args)=>{const r=await session.request(...args);if(new URL(args[0]).pathname==='/api/graphql/'){try{nativeId=String(mergeChunks(parseChunks(r.html))?.node?.id||'')}catch{nativeId=null}}return r;}};
   const request=createAnonymousFacebookGraphqlRequest(wrapped,{bootstrapUrl:target.url,sourceTarget:target,sourceContextFallback:true,missingContextFallback:true});
   const fetch=createFacebookPostFetcher({harPaths:{group:candidateFile},request,delayMs:0,maxPages:1,pageSize:1});
   const first=await fetch({groupId,type:'group',numberPosts:1});
   if(!first.ok||first.posts?.length<1||nativeId!==groupId)throw Object.assign(Error(),{code:'NATIVE_GROUP_PROOF_MISSING'});
   // Read one trusted saved cursor, never write/requeue any running job.
   const require=createRequire(base+'/package.json'),{MongoClient}=require('mongodb');mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{maxPoolSize:1,serverSelectionTimeoutMS:5000});await mongo.connect();
   const row=await mongo.db().collection('flow_jobs').findOne({queue:'facebook-group-source',entityKey:'source:facebook:group:'+groupId,state:{$in:['queued','running']},'data.page':{$gt:0},'data.checkpoint':{$type:'string',$ne:''}},{projection:{'data.checkpoint':1},sort:{createdAt:1},maxTimeMS:5000});
   const cursor=row?unpackState(row.data.checkpoint)?.nativeCursor:null;let checkpointChecked=false;
   if(row&&typeof cursor==='string'&&cursor){const resumed=await fetch({groupId,type:'group',numberPosts:1,cursor});if(!resumed.ok||nativeId!==groupId)throw Object.assign(Error(),{code:'CHECKPOINT_PROBE_FAILED'});checkpointChecked=true;}
   return{ok:true,groupId,posts:first.posts.length,checkpointCompatible:true,checkpointChecked};
  }finally{session?.close();await lease?.release().catch(()=>{});await mongo?.close()}
 });
}
try{
 if(!activeFile)throw Object.assign(Error(),{code:'ACTIVE_TEMPLATE_UNCONFIGURED'});
 fs.mkdirSync(stateDir,{recursive:true,mode:0o700});const input=await readInput();
 const result=await refreshAnonymousGroupTemplate({input,activeFile,historyDir:path.join(stateDir,'history'),validate});
 const output={at:new Date().toISOString(),...result};const temp=path.join(stateDir,'last-run.tmp');fs.writeFileSync(temp,JSON.stringify(output,null,2)+'\n',{mode:0o600});fs.renameSync(temp,path.join(stateDir,'last-run.json'));
 console.log(JSON.stringify(output));
}catch(error){console.log(JSON.stringify({at:new Date().toISOString(),status:'kept_current',reason:'request_rejected',code:cleanCode(error)}));process.exitCode=2;}
