import {snapshotPayloads} from './socialMetrics.js';
import {facebookAuthorProfileKey,facebookAuthorRoute} from './facebookAuthorIdentity.js';
import {facebookAnonymousContext,createAnonymousFacebookGraphqlRequest} from './facebookAnonymousGraphql.js';
const numeric=x=>typeof x==='string'&&/^[1-9]\d*$/.test(x)?x:null;
export function publicFacebookProfileIdentity(snapshot,expectedUrl){
 // The anonymous context validator rejects explicit login, unavailable and authenticated contexts.
 facebookAnonymousContext(snapshot);
 const expected=facebookAuthorProfileKey(expectedUrl),actual=facebookAuthorProfileKey(snapshot.finalUrl);if(!expected||!actual)return null;
 const candidates=[];const visit=(x,depth=0)=>{if(!x||typeof x!=='object'||depth>80)return;
  const props=x.rootView?.props,routeName=x.canonicalRouteName||'';
  if(props&&(!routeName||/Profile|Page/.test(routeName))&&!/Login|Checkpoint|Story|Video|Permalink|Error/.test(routeName)){
   for(const field of ['userID','profileID','profileId','pageID','pageId'])if(numeric(props[field]))candidates.push({id:props[field],evidence:'public_profile.rootView.props.'+field});
  }
  if(['User','Page'].includes(x.__typename)&&numeric(x.id)&&[expected,actual].includes(facebookAuthorProfileKey(x.url||x.profile_url)))candidates.push({id:x.id,evidence:'public_profile.matched_'+x.__typename+'.id'});
  for(const v of Object.values(x))if(v&&typeof v==='object')visit(v,depth+1);
 };
 for(const root of snapshotPayloads(snapshot.html))visit(root);
 if(new Set(candidates.map(x=>x.id)).size!==1)return null;
 return {...candidates[0],profileKey:expected};
}
async function resolveOnce(session,url,{capture}={}){
 if(!facebookAuthorProfileKey(url))return{status:'unknown',reason:'INVALID_PUBLIC_PROFILE_URL'};
 const snapshot=await session.request(url);await capture?.('profile',snapshot);
 const direct=publicFacebookProfileIdentity(snapshot,url);
 // Reuse the anonymous page already fetched; all following requests remain on this session.
 const wrapped={request:async (value,options)=>value===url&&!options?.method?snapshot:session.request(value,options)};
 const request=createAnonymousFacebookGraphqlRequest(wrapped,{bootstrapUrl:url});
 const routes=await request.resolveAuthorRoutes([url]),route=routes.get(facebookAuthorRoute(url));
 if(direct&&route&&direct.id!==route.id)return{status:'unknown',reason:'PROFILE_UID_EVIDENCE_CONFLICT'};
 if(!direct&&!route)return{status:'unknown',reason:'PUBLIC_PROFILE_UID_NOT_RETURNED'};
 return{status:'resolved',id:(direct||route).id,evidence:direct&&route?'public_profile.route_and_html_agree':direct?.evidence||'public_profile.'+route.evidence,independentHtmlVerified:!!direct,independentRouteVerified:!!route};
}

export async function resolvePublicFacebookAuthor(session,url,options={}){
 const result=await resolveOnce(session,url,options);
 if(result.status!=='unknown'||result.reason!=='PUBLIC_PROFILE_UID_NOT_RETURNED')return result;
 const route=facebookAuthorRoute(url),opaque=/^\/profile\.php\?id=(pfbid[A-Za-z0-9]+)$/.exec(route||'')?.[1];
 if(!opaque)return result;
 return resolveOnce(session,'https://www.facebook.com/'+opaque,options);
}
