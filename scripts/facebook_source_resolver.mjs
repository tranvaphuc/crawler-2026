/** Anonymous Facebook source resolver. Keeps delegate Page ID separate from profile ID. */
import fs from 'node:fs/promises';
import https from 'node:https';
import {createProxyAgent} from './facebook_posts.js';
import {parseChunks} from './paginate_facebook_group_capture.js';

export function normalizeFacebookSource(input){
 let u;try{u=new URL(/^https?:/i.test(input)?input:'https://'+input);}catch{return {status:'INVALID_URL',inputUrl:input};}
 const host=u.hostname.toLowerCase();
 if(!/(^|\.)(facebook\.com|fb\.com)$/.test(host))return {status:'NOT_FACEBOOK_SOURCE',inputUrl:input};
 let path=decodeURIComponent(u.pathname).replace(/\/{2,}/g,'/').replace(/\/$/,'');
 if(/^\/l\.php$/.test(path)){const target=u.searchParams.get('u');return target?normalizeFacebookSource(target):{status:'INVALID_URL',inputUrl:input};}
 if(/^\/\d+_\d+$/.test(path))return {status:'CONTENT_REFERENCE',inputUrl:input};
 if(/\/(posts|videos|reels?|watch|photos?|permalink|story\.php|share)(\/|$|\.php)/i.test(path)||u.searchParams.has('story_fbid')||u.searchParams.has('fbid'))return {status:'CONTENT_REFERENCE',inputUrl:input};
 if(path==='/profile.php')path='/'+(u.searchParams.get('id')??'');
 if(path==='/groups'&&u.searchParams.get('id'))path='/groups/'+u.searchParams.get('id');
 const legacy=/^\/(?:pages|people)\/[^/]+\/(\d+)$/i.exec(path);if(legacy)path='/'+legacy[1];
 path=path.replace(/^\/pg\//i,'/');
 const group=/^\/groups\/([^/]+)(?:\/(?:about|members|discussion|announcements))?$/i.exec(path);
 if(group)return {status:'SOURCE',inputUrl:input,route:'/groups/'+group[1]+'/',key:'group:'+group[1].toLowerCase(),url:'https://www.facebook.com/groups/'+group[1]+'/',typeHint:'group',numericId:/^\d+$/.test(group[1])?group[1]:null};
 path=path.replace(/\/(?:about|photos|reels_tab|followers|following|mentions|reviews|videos)\/?$/i,'');
 const profile=/^\/([^/]+)$/.exec(path);
 if(!profile||/^(?:login|help|privacy|policies|search|home\.php|groups|events|settings|marketplace|gaming|pages|hashtag)$/i.test(profile[1]))return {status:'UNSUPPORTED_FACEBOOK_LINK',inputUrl:input};
 return {status:'SOURCE',inputUrl:input,route:'/'+profile[1],key:'profile:'+profile[1].toLowerCase(),url:'https://www.facebook.com/'+profile[1],typeHint:'profile',numericId:/^\d+$/.test(profile[1])?profile[1]:null};
}

const badHeaders=new Set(['cookie','authorization','host','content-length','accept-encoding','connection','x-fb-navigation-chain']);
function template(entry){
 const form=Object.fromEntries(new URLSearchParams(entry.request.postData?.text??''));form.__user='0';form.av='0';delete form.fb_dtsg;delete form.access_token;
 const headers=Object.fromEntries(entry.request.headers.filter(h=>!h.name.startsWith(':')&&!badHeaders.has(h.name.toLowerCase())).map(h=>[h.name.toLowerCase(),h.value]));
 return {form,headers};
}
function visit(value,fn,path='$'){
 if(!value||typeof value!=='object')return;fn(value,path);
 for(const[k,v]of Object.entries(value))if(v&&typeof v==='object')visit(v,fn,path+'.'+k);
}
export function readProfileIdentity(chunks,profileId){
 const matching=[];for(const c of chunks)visit(c,x=>{if(String(x.id)===String(profileId))matching.push(x);});
 const named=matching.find(x=>x.name);
 // Professional personal profiles may expose an auxiliary delegate Page.
 // A later partial projection must not erase the explicit personal-profile flag.
 if(named&&matching.some(x=>x.is_additional_profile_plus===false))return{name:named.name,id:String(profileId),profileId:String(profileId),type:'user',url:named.url??null,evidencePath:'matched_User.is_additional_profile_plus=false'};
 let answer=null;
 for(const c of chunks)visit(c,(x,path)=>{
  if(String(x.id)!==String(profileId)||!x.name)return;
  if(x.delegate_page?.id){answer={name:x.name,id:String(x.delegate_page.id),profileId:String(x.id),type:'page',url:x.url??null,evidencePath:path+'.delegate_page.id'};}
  else if(!answer&&x.__typename==='Page')answer={name:x.name,id:String(x.id),profileId:null,type:'page',url:x.url??null,evidencePath:path+'.id'};
  else if(!answer&&x.__typename==='User'&&(x.is_additional_profile_plus===false||Object.hasOwn(x,'delegate_page')&&x.delegate_page===null))answer={name:x.name,id:String(x.id),profileId:String(x.id),type:'user',url:x.url??null,evidencePath:path+'.id'};
 });
 return answer;
}

export async function createFacebookSourceResolver({harPath,proxy=null,timeoutMs=25000}={}){
 const har=JSON.parse(await fs.readFile(harPath,'utf8'));
 const routeEntry=har.log.entries.find(e=>e.request.url.split('?')[0]==='https://www.facebook.com/ajax/bulk-route-definitions/'&&e.request.postData);
 const feedEntry=har.log.entries.find(e=>new URLSearchParams(e.request.postData?.text??'').get('fb_api_req_friendly_name')==='ProfileCometTimelineFeedRefetchQuery');
 if(!routeEntry||!feedEntry)throw new Error('HAR must contain anonymous bulk-route-definitions and profile timeline requests');
 const routes=template(routeEntry),feed=template(feedEntry),agent=createProxyAgent(proxy);let requestId=0;
 async function send(endpoint,form,baseHeaders){
  form={...form,__req:(++requestId).toString(36)};
  const body=new URLSearchParams(form).toString(),headers={...baseHeaders,'content-length':Buffer.byteLength(body)};
  return new Promise((resolve,reject)=>{
   const req=https.request('https://www.facebook.com'+endpoint,{method:'POST',headers,agent},res=>{
    let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>{
     if(res.statusCode===429||res.statusCode===403){const e=new Error('Facebook access or rate limit');e.code='FACEBOOK_RATE_LIMITED';return reject(e);}
     if(res.statusCode!==200){const e=new Error('HTTP '+res.statusCode);e.code='FACEBOOK_HTTP_'+res.statusCode;return reject(e);}
     resolve(text);
    });
   });req.setTimeout(timeoutMs,()=>{const e=new Error('Request timed out');e.code='NETWORK_TIMEOUT';req.destroy(e);});req.on('error',reject);req.end(body);
  });
 }
 return {
  async resolveRoutes(sources){
   if(!sources.length)return [];
   if(sources.length>10){const combined=[];for(let i=0;i<sources.length;i+=10)combined.push(...await this.resolveRoutes(sources.slice(i,i+10)));return combined;}
   const form={...routes.form};for(const k of Object.keys(form))if(k.startsWith('route_urls['))delete form[k];
   sources.forEach((s,i)=>form[`route_urls[${i}]`]=s.route);
   const body=await send('/ajax/bulk-route-definitions/',form,routes.headers);
   let data;try{data=JSON.parse(body.replace(/^for\s*\(;;\);\s*/,''));}catch{throw Object.assign(new Error('Invalid route response'),{code:'INVALID_RESPONSE'});}
   return sources.map(s=>{
    const p=data.payload?.payloads?.[s.route];let result=p?.result;
    for(let depth=0;depth<5&&result?.type==='route_redirect';depth++)result=result.redirect_result;
    const e=result?.exports,props=e?.rootView?.props;
    if(p?.error||!props)return {...s,id:null,name:null,type:s.typeHint==='group'?'group':null,status:'ROUTE_UNAVAILABLE',unavailableReason:!p?'MISSING_ROUTE_PAYLOAD':p.error?'ROUTE_ERROR':result?.type??'MISSING_ROUTE_PROPS'};
    if(/Error|Login|Checkpoint/i.test(e.canonicalRouteName??''))return {...s,id:null,profileId:null,name:null,type:s.typeHint==='group'?'group':null,status:'SOURCE_UNAVAILABLE',routeName:e.canonicalRouteName};
    const groupId=props.groupID??props.groupId,profileId=props.userID??props.profileID??props.profileId,pageId=props.pageID??props.pageId;
    let url=e.canonicalUrl??s.url;if(url.startsWith('/'))url='https://www.facebook.com'+url;
    const personal=e.canonicalRouteName==='comet.fbweb.CometProfileLoggedOutRoute'&&profileId;
    const name=(e.meta?.title??'').replace(/\s*\(@[^)]+\)\s*•\s*Facebook.*$/i,'').replace(/\s*\|\s*Facebook$/i,'')||null;
    return {...s,name,url,id:groupId?String(groupId):pageId?String(pageId):personal?String(profileId):null,profileId:profileId?String(profileId):null,
     type:groupId?'group':pageId?'page':personal?'user':null,status:groupId||pageId||personal?'RESOLVED':'PROFILE_ID_ONLY',routeName:e.canonicalRouteName??null,evidencePath:groupId?'rootView.props.groupID':pageId?'rootView.props.pageID':'rootView.props.userID'};
   });
  },
  async resolveProfile(source){
   const variables=JSON.parse(feed.form.variables);Object.assign(variables,{id:source.profileId,cursor:null,count:1,omitPinnedPost:true});
   const form={...feed.form,variables:JSON.stringify(variables)};
   const text=await send('/api/graphql/',form,feed.headers);let chunks;
   try{chunks=parseChunks(text);}catch{return {...source,status:'INVALID_RESPONSE'};}
   const identity=readProfileIdentity(chunks,source.profileId);
   if(identity)return {...source,...identity,url:identity.url??source.url,status:'RESOLVED'};
   const errors=chunks.flatMap(c=>c.errors??[]);
   if(errors.some(e=>[1675004,3252001].includes(e.code)))return {...source,status:'FACEBOOK_RATE_LIMITED'};
   return {...source,status:errors.length?'PROFILE_QUERY_ERROR':'PROFILE_ID_ONLY'};
  }
 };
}
