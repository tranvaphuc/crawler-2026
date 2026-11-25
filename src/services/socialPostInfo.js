import {youtubePublicationTime,publicationTextTime} from './socialPublicationTime.js';
import {readOnlyHtml} from './socialHtmlSnapshot.js';
import {readOnlyAssignedJson as assignedJson,snapshotPayloads,extractSocialMetrics} from './socialMetrics.js';
import {metaPost,walkContent} from './socialContent.js';
export function extractPostInfo(target,snapshot){
 const metrics=extractSocialMetrics(target,snapshot);let conflict=false;const result={...metrics,operation:'post_info',post:null};
 if(['error','auth_required','security_checkpoint','rate_limited','proxy_error'].includes(metrics.status))return result;
 if(target.platform==='youtube'){
  const p=assignedJson(snapshot.html||'','ytInitialPlayerResponse')||snapshotPayloads('',snapshot.jsonResponses).find(v=>v?.videoDetails?.videoId===target.id),d=p?.videoDetails,m=p?.microformat?.playerMicroformatRenderer;
  if(d?.videoId===target.id){
   let publication=youtubePublicationTime(p);
   if(!publication){const $=readOnlyHtml(snapshot.html||'',{platform:target.platform});for(const value of [$('meta[itemprop="datePublished"]').attr('content'),$('meta[itemprop="uploadDate"]').attr('content')]){publication=publicationTextTime(value,snapshot.observedAt);if(publication)break;}}
   if(!publication){const initial=assignedJson(snapshot.html||'','ytInitialData');for(const section of initial?.contents?.twoColumnWatchNextResults?.results?.results?.contents||[]){const renderer=section.videoPrimaryInfoRenderer,text=renderer?.dateText?.simpleText||renderer?.dateText?.runs?.map(x=>x.text||'').join('');publication=publicationTextTime(text,snapshot.observedAt);if(publication)break;}}
   result.post={id:d.videoId,url:target.url,type:'video',title:d.title||null,text:d.shortDescription||null,author:{id:d.channelId||null,name:d.author||null},createdAt:publication?.createdAt||null,dateEvidence:publication?.evidence||null,datePrecision:publication?.datePrecision||null,dateIsEstimated:publication?.dateIsEstimated||false,publishedDate:m?.publishDate||m?.uploadDate||null,durationSeconds:/^\d+$/.test(d.lengthSeconds)?Number(d.lengthSeconds):null,thumbnails:d.thumbnail?.thumbnails||[],metrics:metrics.metrics};result.identityVerified=true;
  }
 }else for(const root of snapshotPayloads(snapshot.html,snapshot.jsonResponses))walkContent(root,v=>{
  if((v.code===target.id||v.shortcode===target.id)&&(v.pk||v.id)){
   const post=metaPost(v,target.platform);if(post&&!conflict){if(result.post&&result.post.id!==post.id){conflict=true;result.identityVerified=false;result.post=null;result.reason='CONFLICTING_POST_IDENTITY';return false;}const previous=result.post;result.post={...post,text:post.text||previous?.text||'',author:{...post.author,id:post.author.id||previous?.author?.id||null,username:post.author.username||previous?.author?.username||null},createdAt:post.createdAt||previous?.createdAt||null,attachments:post.attachments.length?post.attachments:previous?.attachments||[],metrics:metrics.metrics};result.identityVerified=true;}
  }
 });
 if(!result.post){result.status='unavailable';result.reason ||= 'POST_INFO_NOT_IN_PUBLIC_RESPONSE';}else result.status='partial';return result;
}
