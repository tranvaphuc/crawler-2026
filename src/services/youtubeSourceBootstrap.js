import {assignedJson} from './socialMetrics.js';
import {sourceRestrictionEvidence} from './socialAuthGate.js';
import {publicApiIssue} from './socialApiErrors.js';

export function canonicalYoutubeSourceId(target){
 if(target?.platform!=='youtube'||target.operation!=='source'||target.order!=='latest')return null;
 try{const u=new URL(target.url),id=/^\/channel\/(UC[\w-]{22})(?:\/videos)?\/?$/.exec(u.pathname)?.[1];return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^(?:www\.)?youtube\.com$/.test(u.hostname)&&id&&id===target.expectedNativeId?id:null;}catch{return null;}
}
const selectedGrid=body=>body?.contents?.twoColumnBrowseResultsRenderer?.tabs?.map(x=>x.tabRenderer).find(x=>x?.selected&&/^videos$/i.test(x.title||''))?.content?.richGridRenderer;
const text=v=>typeof v==='string'?v:v?.simpleText||v?.content||v?.runs?.map(x=>x.text||'').join('')||'';
function latestSelected(value,depth=0){
 if(!value||typeof value!=='object'||depth>30)return false;
 const chip=value.chipCloudChipRenderer||value.chipViewModel;
 if(chip&&(chip.isSelected||chip.selected||chip.isActive)&&/^(?:latest|newest|most recent)$/i.test(text(chip.text)))return true;
 return Object.values(value).some(x=>x&&typeof x==='object'&&latestSelected(x,depth+1));
}
function knownFeedEntry(row){
 const content=row?.richItemRenderer?.content||row,model=content?.lockupViewModel,video=content?.videoRenderer||content?.gridVideoRenderer;
 if(/^[\w-]{11}$/.test(video?.videoId||''))return 'video';
 if(model?.contentType==='LOCKUP_CONTENT_TYPE_VIDEO'&&/^[\w-]{11}$/.test(model.contentId||''))return 'video';
 const item=row?.continuationItemRenderer,command=item?.continuationEndpoint||item?.button?.buttonRenderer?.command,api=command?.commandMetadata?.webCommandMetadata?.apiUrl;
 if(typeof command?.continuationCommand?.token==='string'&&command.continuationCommand.token&&(!api||api==='/youtubei/v1/browse'))return 'continuation';
 return null;
}
const serialize=value=>JSON.stringify(value).replace(/</g,'\\u003c');
export function youtubeChannelRestriction(body,expectedId){
 if(!body||typeof body!=='object')return null;
 const observedId=body?.metadata?.channelMetadataRenderer?.externalId;
 if(observedId&&expectedId&&observedId!==expectedId)return null;
 const restriction=sourceRestrictionEvidence({html:'<script>var ytInitialData = '+serialize(body)+';</script>'});
 return restriction?.confirmed?{status:'auth_required',reason:'YOUTUBE_CHANNEL_AGE_RESTRICTED',authGate:restriction}:null;
}
/** Public client configuration only: never retains visitorData, cookies or headers. */
export function createYoutubeSourceBootstrap({now=Date.now,ttlMs=300000}={}){
 const ttl=Math.max(1000,Math.min(300000,ttlMs));let cached=null;const unsupported=new Map();
 return{
  observe(target,snapshot){
   const id=canonicalYoutubeSourceId(target);if(!id||snapshot.httpStatus!==200)return false;
   const initial=assignedJson(snapshot.html||'','ytInitialData');if(initial?.metadata?.channelMetadataRenderer?.externalId!==id||!selectedGrid(initial))return false;
   const cfg=assignedJson((snapshot.html||'').replace(/ytcfg\.set\(/g,'ytcfgHttpConfig = '),'ytcfgHttpConfig'),client=cfg?.INNERTUBE_CONTEXT?.client;
   if(client?.clientName!=='WEB'||typeof client.clientVersion!=='string'||! /^[\w.-]{1,100}$/.test(client.clientVersion))return false;
   cached={until:now()+ttl,context:{client:{clientName:'WEB',clientVersion:client.clientVersion,hl:'en',gl:'US'}}};return true;
  },
  async read(session,target){
   const id=canonicalYoutubeSourceId(target);if(!id||!cached||now()>=cached.until||now()<(unsupported.get(id)||0))return null;
   const context={client:{...cached.context.client}},response=await session.request('https://www.youtube.com/youtubei/v1/browse',{method:'POST',headers:{'content-type':'application/json',accept:'application/json',origin:'https://www.youtube.com',referer:target.url},body:{context,browseId:id,params:'EgZ2aWRlb3PyBgQKAjoA'}});
   if(response.httpStatus===429)return{failure:{status:'rate_limited',reason:'UPSTREAM_HTTP_429',retryAfterMs:response.retryAfterMs}};
   if([400,404].includes(response.httpStatus))cached=null;
   const issue=publicApiIssue([response.html]);if(issue)return{failure:{...issue,...(issue.status==='error'?{reason:response.httpStatus>=500?'UPSTREAM_HTTP_'+response.httpStatus:'YOUTUBE_SOURCE_JSON_API_ERROR'}:{}),retryAfterMs:response.retryAfterMs}};
   if(response.httpStatus!==200)return{failure:{status:[401,403].includes(response.httpStatus)?'auth_required':'error',reason:(response.httpStatus>=500?'UPSTREAM_HTTP_':'YOUTUBE_SOURCE_JSON_HTTP_')+response.httpStatus,retryAfterMs:response.retryAfterMs}};
   let body;try{body=JSON.parse(response.html);}catch{return{failure:{status:'error',reason:'YOUTUBE_SOURCE_JSON_INVALID'}};}
   const observedId=body?.metadata?.channelMetadataRenderer?.externalId;
   if(observedId&&observedId!==id)return{failure:{status:'error',reason:'YOUTUBE_SOURCE_JSON_IDENTITY_MISMATCH'}};
   // A native channel age gate legitimately omits channel metadata. Preserve
   // that restriction instead of reporting a parser/identity failure.
   const restriction=youtubeChannelRestriction(body,id);
   if(restriction)return{failure:restriction};
   if(!observedId)return{failure:{status:'error',reason:'YOUTUBE_SOURCE_JSON_IDENTITY_UNVERIFIED'}};
   const grid=selectedGrid(body),kinds=Array.isArray(grid?.contents)?grid.contents.map(knownFeedEntry):[];
   if(!grid||typeof grid.targetId!=='string'||!grid.targetId||grid.targetId.length>128||!kinds.length||kinds.some(x=>!x)||!kinds.includes('video')){
    while(unsupported.size>=128)unsupported.delete(unsupported.keys().next().value);unsupported.set(id,now()+ttl);
    return{unsupported:true,reason:'YOUTUBE_SOURCE_JSON_LAYOUT_UNSUPPORTED'};
   }
   if(!latestSelected(grid.header)){
    while(unsupported.size>=128)unsupported.delete(unsupported.keys().next().value);unsupported.set(id,now()+ttl);
    return{unsupported:true,reason:'YOUTUBE_SOURCE_JSON_LATEST_UNVERIFIED'};
   }
   // Compatibility input for existing native identity/date/end/checkpoint guards.
   // This is generated locally from JSON; no HTML request was made for this page.
   const html='<script>var ytInitialData = '+serialize(body)+';ytcfg.set('+serialize({INNERTUBE_CONTEXT:context})+');</script>';
   return{snapshot:{...response,html,jsonResponses:[],finalUrl:target.url,sourceBootstrap:'json'}};
  }
 };
}
