import {assignedJson} from './socialMetrics.js';
import {publicApiIssue} from './socialApiErrors.js';

export function canonicalYoutubeCommentId(target){
 if(target?.platform!=='youtube'||target.operation!=='comments'||! /^[\w-]{11}$/.test(target.id||''))return null;
 try{const u=new URL(target.url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^(?:www\.)?youtube\.com$/.test(u.hostname)&&u.pathname==='/watch'&&u.searchParams.get('v')===target.id?target.id:null;}catch{return null;}
}
const serialize=value=>JSON.stringify(value).replace(/</g,'\\u003c');
function rootCommentContinuation(value,inside=false,depth=0){
 if(!value||typeof value!=='object'||depth>40)return false;
 const section=value.itemSectionRenderer,panel=value.engagementPanelSectionListRenderer;
 if(section&&(section.targetId==='comments-section'||section.sectionIdentifier==='comment-item-section'))return rootCommentContinuation(section.contents,true,depth+1);
 if(panel&&/comments-section/.test(panel.targetId||panel.panelIdentifier||''))return rootCommentContinuation(panel.content,true,depth+1);
 if(inside&&typeof value.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token==='string')return !!value.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
 return Object.entries(value).some(([key,x])=>!['secondaryResults','replies'].includes(key)&&x&&typeof x==='object'&&rootCommentContinuation(x,inside,depth+1));
}

// Cache public WEB client configuration, never visitor identity or credentials.
// A challenge is propagated unchanged; there is no retry through another route.
export function createYoutubeCommentBootstrap({now=Date.now,ttlMs=300000}={}){
 let cached=null,unavailableUntil=0;const unsupported=new Map(),ttl=Math.max(1000,Math.min(300000,ttlMs));
 return{
  observe(target,snapshot){
   const id=canonicalYoutubeCommentId(target);if(!id||snapshot.httpStatus!==200)return false;
   const player=assignedJson(snapshot.html||'','ytInitialPlayerResponse');
   if(player?.videoDetails?.videoId!==id||player.playabilityStatus?.status&&player.playabilityStatus.status!=='OK')return false;
   const cfg=assignedJson((snapshot.html||'').replace(/ytcfg\.set\(/g,'ytcfgHttpConfig = '),'ytcfgHttpConfig'),client=cfg?.INNERTUBE_CONTEXT?.client;
   if(client?.clientName!=='WEB'||typeof client.clientVersion!=='string'||! /^[\w.-]{1,100}$/.test(client.clientVersion))return false;
   cached={until:now()+ttl,context:{client:{clientName:'WEB',clientVersion:client.clientVersion,hl:'en',gl:'US'}}};return true;
  },
  async read(session,target){
   const id=canonicalYoutubeCommentId(target);if(!id||!cached||now()>=cached.until||now()<unavailableUntil||now()<(unsupported.get(id)||0))return null;
   const context={client:{...cached.context.client}},response=await session.request('https://www.youtube.com/youtubei/v1/next',{method:'POST',headers:{'content-type':'application/json',accept:'application/json',origin:'https://www.youtube.com',referer:target.url},body:{context,videoId:id}});
   if(response.httpStatus===429)return{failure:{status:'rate_limited',reason:'UPSTREAM_HTTP_429',retryAfterMs:response.retryAfterMs}};
   const issue=publicApiIssue([response.html]);
   if([400,404].includes(response.httpStatus)&&(!issue||issue.status==='error')){unavailableUntil=now()+ttl;return{unsupported:true,reason:'YOUTUBE_COMMENT_JSON_HTTP_'+response.httpStatus};}
   if(response.httpStatus!==200)return{failure:{status:[401,403].includes(response.httpStatus)?'auth_required':'error',reason:'UPSTREAM_HTTP_'+response.httpStatus,retryAfterMs:response.retryAfterMs}};
   if(issue)return{failure:{...issue,retryAfterMs:response.retryAfterMs}};
   let body;try{body=JSON.parse(response.html);}catch{return{failure:{status:'error',reason:'YOUTUBE_COMMENT_JSON_INVALID'}};}
   const observed=body?.currentVideoEndpoint?.watchEndpoint?.videoId;
   if(observed&&observed!==id)return{failure:{status:'error',reason:'YOUTUBE_COMMENT_JSON_IDENTITY_MISMATCH'}};
   if(!observed||!body?.contents?.twoColumnWatchNextResults||!rootCommentContinuation(body)){
    while(unsupported.size>=128)unsupported.delete(unsupported.keys().next().value);unsupported.set(id,now()+ttl);
    return{unsupported:true,reason:!observed?'YOUTUBE_COMMENT_JSON_IDENTITY_UNVERIFIED':'YOUTUBE_COMMENT_JSON_LAYOUT_UNSUPPORTED'};
   }
   // Adapt the native currentVideoEndpoint identity to the existing watch parser.
   // The requested ID alone is never accepted as proof of the returned video.
   const html='<script>var ytInitialData = '+serialize(body)+';var ytInitialPlayerResponse = '+serialize({videoDetails:{videoId:observed}})+';ytcfg.set('+serialize({INNERTUBE_CONTEXT:context})+');</script>';
   return{snapshot:{...response,html,jsonResponses:[],finalUrl:target.url,commentBootstrap:'json'}};
  }
 };
}
