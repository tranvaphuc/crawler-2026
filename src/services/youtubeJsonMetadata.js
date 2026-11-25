import {youtubePublicationTime} from './socialPublicationTime.js';
import {publicApiIssue} from './socialApiErrors.js';
// Uses the current anonymous source context. Never obtains streams or bypasses
// playability/login gates; only matching public post metadata is consumed.
export async function youtubeJsonPostMetadata(session,target,context,{sourceId}={}){
 if(!context)return{unsupported:true,reason:'YOUTUBE_CONTEXT_UNAVAILABLE'};
 const response=await session.request('https://www.youtube.com/youtubei/v1/player',{method:'POST',headers:{'content-type':'application/json',accept:'application/json',origin:'https://www.youtube.com',referer:target.url},body:{context,videoId:target.id}});
 if(response.httpStatus!==200)return{failure:{status:response.httpStatus===429?'rate_limited':[401,403].includes(response.httpStatus)?'auth_required':'error',reason:'UPSTREAM_HTTP_'+response.httpStatus,retryAfterMs:response.retryAfterMs}};
 const issue=publicApiIssue([response.html]);if(issue)return{failure:{...issue,retryAfterMs:response.retryAfterMs}};
 let player;try{player=JSON.parse(response.html);}catch{return{unsupported:true,reason:'YOUTUBE_PLAYER_JSON_UNAVAILABLE'};}
 if(player?.playabilityStatus?.status==='LOGIN_REQUIRED')return{failure:{status:'auth_required',reason:'YOUTUBE_PLAYER_LOGIN_REQUIRED'}};
 const details=player?.videoDetails;
 if(!details)return{unsupported:true,reason:'YOUTUBE_PLAYER_METADATA_UNAVAILABLE'};
 if(details.videoId!==target.id||sourceId&&details.channelId&&details.channelId!==sourceId)return{failure:{status:'error',reason:'YOUTUBE_PLAYER_IDENTITY_MISMATCH'}};
 if(!youtubePublicationTime(player))return{unsupported:true,reason:'YOUTUBE_PLAYER_DATE_UNAVAILABLE'};
 return{snapshot:{...response,html:'',jsonResponses:[response.html],finalUrl:target.url},player};
}
