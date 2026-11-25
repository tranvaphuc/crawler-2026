import {createAnonymousFacebookGraphqlRequest} from '../src/services/facebookAnonymousGraphql.js';
import 'dotenv/config';
import fs from 'node:fs/promises';
import {createConfiguredProxyProvider} from '../src/services/socialProxyConfig.js';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
import {snapshotPayloads} from '../src/services/socialMetrics.js';
import {walkContent} from '../src/services/socialContent.js';
import {createFacebookPostFetcher} from './facebook_posts.js';
import {createFacebookCommentFetcher} from './facebook_comments.js';
import {parseChunks,mergeChunks} from './paginate_facebook_group_capture.js';
const mode=process.argv[2]||'instagram',out='outputs/production-api-fixes-2026-10-24';await fs.mkdir(out,{recursive:true,mode:0o700});
const execute=createHttpExecutor({getProxy:createConfiguredProxyProvider(),timeoutMs:60000});
let r;
if(mode==='bootstrap')r=await execute({platform:'facebook',pool:'facebook_page_posts'},async session=>{let headers={};if(process.env.BOOTSTRAP_CAPTURED_UA==='1'){const h=JSON.parse(await fs.readFile('/Users/phuctran/Downloads/www.facebook.com_page.har'));const entry=h.log.entries.find(x=>x.request?.headers?.some(h=>h.name.toLowerCase()==='user-agent'));const ua=entry.request.headers.find(x=>x.name.toLowerCase()==='user-agent').value;headers={'user-agent':ua};}const snap=await session.request('https://www.facebook.com/1794121197534939',{headers});const modules=[];for(const root of snapshotPayloads(snap.html))walkContent(root,v=>{if(Array.isArray(v)&&['LSD','SiteData','CurrentUserInitialData','DTSGInitialData'].includes(v[0]))modules.push({name:v[0],keys:Object.keys(v[2]||{}),tokenPresent:!!v[2]?.token,anonymous:v[0]==='CurrentUserInitialData'?String(v[2]?.USER_ID)==='0':undefined});});return{status:'ok',upstreamStatus:snap.httpStatus,finalPath:new URL(snap.finalUrl).pathname,modules};});
else if(mode==='instagram')r=await execute({platform:'instagram',operation:'source'},async session=>{
 const snap=await session.request('https://www.instagram.com/shopmichaelangelos/');const shapes=[];
 for(const root of snapshotPayloads(snap.html))walkContent(root,(v,p)=>{
  if(v.username?.toLowerCase()==='shopmichaelangelos')shapes.push({path:p,keys:Object.keys(v),id:v.id,pk:v.pk,strong_id__:v.strong_id__,fbid_v2:v.fbid_v2,typename:v.__typename,username:v.username});
  if(v.code&&v.user?.username==='shopmichaelangelos')shapes.push({path:p,postKeys:Object.keys(v),code:v.code,taken_at:v.taken_at,taken_at_timestamp:v.taken_at_timestamp,creation_time:v.creation_time,userFields:Object.keys(v.user)});
 });
 return{status:'ok',upstreamStatus:snap.httpStatus,shapes};
});else r=await execute({platform:'facebook',operation:'source',pool:mode==='comments'?'facebook_api_comments':'facebook_page_posts'},async session=>{
 const summaries=[];
 const anonymousRequest=process.env.FRESH_FB_BOOTSTRAP==='1'?createAnonymousFacebookGraphqlRequest(session,{bootstrapUrl:mode==='comments'?'https://www.facebook.com/100201629178552/posts/1131594819369667':'https://www.facebook.com/1794121197534939'}):null;
 const request=async(form,headers)=>{if(anonymousRequest)return anonymousRequest(form,headers);const snap=await session.request('https://www.facebook.com/api/graphql/',{method:'POST',headers:{...headers,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form).toString()});let chunks=[];try{chunks=parseChunks(snap.html);}catch{}
  const merged=mergeChunks(chunks);const shapes=[];walkContent(merged,(v,p)=>{if(p.split('.').length<5||v.__typename==='Story'||v.edges||v.comments){shapes.push({path:p,typename:v.__typename,keys:Object.keys(v).slice(0,35),edgeCount:v.edges?.length,postId:v.post_id,postType:v.post_id?typeof v.post_id:undefined});}});
  summaries.push({upstreamStatus:snap.httpStatus,chunkKeys:chunks.map(x=>Object.keys(x)),envelopeErrors:chunks.filter(x=>x.error).map(x=>({code:x.error,summary:String(x.errorSummary||'').replace(/<[^>]+>/g,'').slice(0,160),description:String(x.errorDescription||'').replace(/<[^>]+>/g,'').slice(0,220)})),errorCodes:chunks.flatMap(x=>x.errors||[]).map(x=>({code:x.code,extensionsCode:x.extensions?.code})),shapes:shapes.slice(0,35)});return{status:snap.httpStatus,text:snap.html,location:snap.finalUrl,retryAfter:snap.retryAfter};};
 try{
  const template=process.argv[3]||(mode==='comments'?'outputs/public-api-deploy-2026-10-24/release.credentials/deploy-private/templates/group.json':'outputs/public-api-deploy-2026-10-24/release.credentials/deploy-private/templates/page.json');
  if(mode==='comments')await createFacebookCommentFetcher({harPath:template,request})({idPost:'1131594819369667'});
  else await createFacebookPostFetcher({harPaths:{page:template},request,maxPages:1,delayMs:0})({groupId:'100064046949411',type:'page',numberPosts:2});
  return{status:'ok',summaries};
 }catch(e){return{status:'error',reason:e.code||'READ_FAILED',upstreamCode:e.sourceCode||null,httpStatus:e.httpStatus||null,summaries};}
});
await fs.writeFile(out+'/'+mode+'-payload-shapes.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));
