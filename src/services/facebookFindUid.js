import {load} from 'cheerio';
import {snapshotPayloads} from './socialMetrics.js';
import {facebookAuthorRoute,facebookPublicAuthorProfileUrl,numericFacebookProfileUrl} from './facebookAuthorIdentity.js';
import {createAnonymousFacebookGraphqlRequest} from './facebookAnonymousGraphql.js';
import {responseError} from '../../scripts/facebook_post_errors.js';
const numeric=x=>typeof x==='string'&&/^[1-9]\d*$/.test(x)?x:typeof x==='number'&&Number.isSafeInteger(x)&&x>0?String(x):null;
const fail=code=>Object.assign(Error(code),{code});
export function uidLookupUrl(item){
 const opaque=item?.author?.opaqueId||(/^pfbid[A-Za-z0-9]{10,250}$/.test(item?.author?.id||'')?item.author.id:null);
 if(/^pfbid[A-Za-z0-9]{10,250}$/.test(opaque||''))return 'https://www.facebook.com/'+opaque;
 return facebookPublicAuthorProfileUrl({profileUrl:item?.author?.profileUrl,opaqueId:opaque});
}
// Explicit operator mappings are bound to the exact author profile and source file.
export function operatorSuppliedUid(item){
 const id=numeric(item?.author?.id),mapping=item?.author?.uidMapping,url=uidLookupUrl(item);
 if(!id||item.author.idEvidence!=='operator_excel_uid_mapping'||!mapping||!/^[a-f0-9]{64}$/.test(mapping.sourceFileSha256||'')||!Number.isSafeInteger(mapping.row)||mapping.row<2||!url||facebookAuthorRoute(mapping.lookupUrl)!==facebookAuthorRoute(url))return null;
 return{status:'resolved',id,url,evidence:'operator_excel_uid_mapping.'+mapping.sourceFileSha256,sourceFileSha256:mapping.sourceFileSha256,sourceRow:mapping.row};
}
export function needsUidLookup(data,error){
 return data?.source?.platform==='facebook'&&!numeric(data?.item?.author?.id)&&
  ['FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED','POST_AUTHOR_SOURCE_MISMATCH'].includes(error)&&!!uidLookupUrl(data.item);
}
// Read only target-profile projections; viewer IDs, comment IDs and unrelated actors
// elsewhere in the HTML are deliberately excluded.
export function profileUidFromSnapshot(snapshot,url){
 if(snapshot.httpStatus!==200)return null;
 const $=load(snapshot.html||''),roots=snapshotPayloads(snapshot.html||''),wanted=facebookAuthorRoute(url),proofs=[];
 const add=(id,evidence)=>{id=numeric(id);if(id)proofs.push({id,evidence});};
 let gate=false;
 const walk=(v,path='response')=>{if(!v||typeof v!=='object')return;
  const routeName=v.canonicalRouteName||v.routeName||'';
  if(/ErrorRoute|LoginRoute|Checkpoint/.test(routeName))gate=true;
  const targetRoute=path.endsWith('.initialRouteInfo.route')||v.canonicalUrl&&facebookAuthorRoute(new URL(v.canonicalUrl,url).href)===wanted;
  if(targetRoute&&/Profile|Page/.test(routeName)&&!/Error|Login|Checkpoint|Story|Video|Permalink/.test(routeName)){
   const props=v.rootView?.props||v.exports?.rootView?.props;
   if(props)for(const key of ['userID','profileID','profileId','pageID','pageId'])add(props[key],path+'.rootView.props.'+key);
  }
  if(['User','Page'].includes(v.__typename)){
   const actorUrl=v.url||v.profile_url;
   if(actorUrl&&facebookAuthorRoute(actorUrl)===wanted){add(v.id,path+'.id');for(const key of ['user_id','profile_id','actor_id','legacy_fbid','strong_id__'])add(v[key],path+'.'+key);}
  }
  for(const[k,x]of Object.entries(v))if(x&&typeof x==='object')walk(x,path+'.'+k);
 };
 roots.forEach(x=>walk(x));
 const title=$('title').text();if(/log in|login|đăng nhập/i.test(title)&&!proofs.length)gate=true;
 if(gate)return null;
 const canonical=$('meta[property="og:url"]').attr('content')||$('link[rel="canonical"]').attr('href');
 const canonicalId=numericFacebookProfileUrl(canonical);
 // App profile deep links must agree with the page's own canonical identity.
 for(const el of $('meta[property="al:android:url"],meta[property="al:ios:url"]').toArray()){
  const match=/^fb:\/\/profile\/(\d+)(?:[/?#]|$)/.exec($(el).attr('content')||'');
  if(match&&(canonicalId===match[1]||canonical&&facebookAuthorRoute(canonical)===wanted))add(match[1],'response.profile_app_link');
 }
 if(canonicalId&&proofs.some(p=>p.id===canonicalId))add(canonicalId,'response.canonical_profile_url');
 const ids=new Set(proofs.map(x=>x.id));if(ids.size>1)throw fail('FACEBOOK_PROFILE_UID_CONFLICT');
 return proofs[0]||null;
}
export async function findFacebookUid(session,item,{onSnapshot=async()=>{}}={}){
 const url=uidLookupUrl(item);if(!url)throw fail('FACEBOOK_AUTHOR_PROFILE_URL_REQUIRED');
 const snapshot=await session.request(url);
 await onSnapshot(snapshot,url);
 const upstreamError=responseError({status:snapshot.httpStatus,location:snapshot.finalUrl,retryAfter:snapshot.retryAfter});if(upstreamError)throw upstreamError;
 const proof=profileUidFromSnapshot(snapshot,url);
 if(proof)return{status:'resolved',...proof,url};
 const request=createAnonymousFacebookGraphqlRequest(session,{bootstrapUrl:url,bootstrapSnapshot:snapshot});
 const routes=await request.resolveAuthorRoutes([url]);
 const route=routes.get(facebookAuthorRoute(url));
 if(route?.id)return{status:'resolved',id:route.id,evidence:'public_profile.'+route.evidence,url};
 return{status:'unavailable',reason:'FACEBOOK_PROFILE_UID_NOT_RETURNED',url};
}
