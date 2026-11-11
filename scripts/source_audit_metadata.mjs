import https from 'node:https';
import http from 'node:http';
export const decode=s=>String(s??'').replace(/&#(?:x([\da-f]+)|(\d+));/gi,(_,h,d)=>String.fromCodePoint(parseInt(h||d,h?16:10))).replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
export function fetchPage(url,{timeout=15000,maxBytes=3500000,redirects=5,lookup}={}){
 return new Promise((resolve,reject)=>{let u;try{u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error('Invalid protocol');}catch(e){reject(e);return;}
  const request=(u.protocol==='https:'?https:http).get(u,{lookup,headers:{'user-agent':'Mozilla/5.0','accept':'text/html,application/json;q=0.9,*/*;q=0.8','accept-language':'en-US,en;q=0.8'}},r=>{
   if([301,302,303,307,308].includes(r.statusCode)&&r.headers.location&&redirects){r.resume();resolve(fetchPage(new URL(r.headers.location,u).href,{timeout,maxBytes,redirects:redirects-1,lookup}));return;}
   let body='',size=0;r.setEncoding('utf8');r.on('data',s=>{size+=Buffer.byteLength(s);if(size<=maxBytes)body+=s;else r.destroy();});r.on('end',()=>resolve({status:r.statusCode,url:u.href,body,headers:r.headers}));r.on('close',()=>{if(size>maxBytes)resolve({status:r.statusCode,url:u.href,body,headers:r.headers,truncated:true});});r.on('error',reject);
  });request.setTimeout(timeout,()=>request.destroy(Object.assign(Error('Timeout'),{code:'TIMEOUT'})));request.on('error',reject);
 });
}
const meta=(t,key)=>{for(const m of t.matchAll(/<meta\b[^>]*>/gi)){const tag=m[0];if(new RegExp('(?:property|name)=["\']'+key+'["\']','i').test(tag))return decode(tag.match(/content=["']([^"']*)/i)?.[1]??'');}return '';};
const title=t=>decode(t.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'').trim();
const cleanJson=s=>{try{return JSON.parse('"'+s+'"');}catch{return decode(s);}};
export function parseMetadata(s,p){
 const t=p.body.replace(/\\"/g,'"'),u=new URL(p.url);let id=s.id??null,name='',url=s.url,type=s.type??null,cid=null,placeId=null,note='',identityEvidence='';
 let status='chưa xác định';const og=meta(t,'og:title');
 if(s.channel==='YouTube'){
  id=t.match(/<meta\s+itemprop=["']channelId["']\s+content=["'](UC[\w-]{22})/i)?.[1]||t.match(/"channelMetadataRenderer"\s*:\s*\{[^}]*?"externalId"\s*:\s*"(UC[\w-]{22})"/)?.[1]||t.match(/"videoDetails"\s*:\s*\{[\s\S]{0,12000}?"channelId"\s*:\s*"(UC[\w-]{22})"/)?.[1]||(!/\/watch\?/.test(s.url)?t.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/)?.[1]:null)||id;
  name=cleanJson(t.match(/"channelMetadataRenderer"\s*:\s*\{[^}]*?"title"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1]||t.match(/"videoDetails"\s*:\s*\{[\s\S]{0,15000}?"author"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1]||'')||og||title(t);if(id){url='https://www.youtube.com/channel/'+id;identityEvidence='YouTube channel metadata';}
 }else if(s.channel==='Instagram'){
  id=meta(t,'instapp:owner_user_id')||t.match(/"PolarisProfilePostsTabRoot\.react"\},"props":\{"id":"(\d+)"/)?.[1]||t.match(/"profile_id"\s*:\s*"(\d+)"/)?.[1]||null;
  name=(og||title(t)).replace(/\s*\(@[^)]+\).*$/,'').replace(/\s*•\s*Instagram.*$/i,'');const canonical=meta(t,'og:url');if(canonical&&/instagram\.com\/[^/]+\/?$/.test(canonical))url=canonical;
  if(id){const owner=t.match(new RegExp('"user"\\s*:\\s*\\{\\s*"pk"\\s*:\\s*"'+id+'","username":"([^"\\\\]+)"'));if(owner){url='https://www.instagram.com/'+owner[1]+'/';if(/ on Instagram:/i.test(name))name=name.split(' on Instagram:')[0];}identityEvidence='Instagram profile/owner metadata';}
 }else if(s.channel==='Threads'){
  id=t.match(/"Barcelon[a-zA-Z]*ProfileThreadsRoot\.react"\}[\s\S]{0,1000}?"user_id"\s*:\s*"(\d+)"/)?.[1]||t.match(/"is_self_profile":(?:false|true),"user_id":"(\d+)"/)?.[1]||null;
  name=(og||title(t)).replace(/\s*\(@[^)]+\).*$/,'').replace(/\s*•\s*Threads.*$/i,'');const canonical=meta(t,'og:url');if(canonical&&/threads\.(?:com|net)\/@[^/]+\/?$/.test(canonical))url=canonical.replace('threads.net','threads.com');if(id)identityEvidence='Threads profile root user_id';
 }else if(s.channel==='LinkedIn'){
  id=t.match(/data-semaphore-content-urn="urn:li:organization:(\d+)"/)?.[1]||t.match(/data-entity-id="urn:li:organization:(\d+)"/)?.[1]||t.match(/"organizationId"\s*:\s*"?(\d+)/)?.[1]||null;
  name=(og||title(t)).replace(/\s*\|\s*LinkedIn.*$/,'');if(id){url='https://www.linkedin.com/company/'+id+'/';identityEvidence='LinkedIn organization URN';}
  else{for(const m of t.matchAll(/<a\b[^>]*>/gi))if(/data-tracking-control-name="public_post_feed-actor-name"/.test(m[0])){const a=m[0].match(/href="([^"<]+)"/)?.[1];if(a){url=decode(a).split('?')[0];break;}}}
 }else if(s.channel==='TikTok'){
  id=t.match(/"userInfo"\s*:\s*\{\s*"user"\s*:\s*\{\s*"id"\s*:\s*"(\d+)"/)?.[1]||t.match(/"author"\s*:\s*\{\s*"id"\s*:\s*"(\d+)"/)?.[1]||null;
  name=cleanJson(t.match(/"userInfo"\s*:\s*\{\s*"user"\s*:\s*\{[^}]*?"nickname"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1]||'')||og||title(t);const handle=t.match(/"userInfo"\s*:\s*\{\s*"user"\s*:\s*\{[^}]*?"uniqueId"\s*:\s*"([^"\\]+)"/)?.[1];if(handle)url='https://www.tiktok.com/@'+handle;if(id)identityEvidence='TikTok userInfo.user.id';
 }else if(s.channel==='GG Reviews'){
  const decoded=decodeURIComponent(p.url);cid=u.searchParams.get('cid')||decoded.match(/(?:[?&]cid=)(\d+)/)?.[1]||null;
  // Maps can include a contextual address before the selected business.
  const feature=[...decoded.matchAll(/(?:!1s|ftid=)(0x[\da-f]+):(0x[\da-f]+)/gi)].at(-1);if(!cid&&feature)cid=BigInt(feature[2]).toString();
  if(!cid){const m=t.match(/(?:[?&]cid=|\\u003dcid%3D|"ludocid"\s*:\s*"?)(\d{8,})/);if(m)cid=m[1];}
  placeId=u.searchParams.get('query_place_id')||u.searchParams.get('place_id')||decoded.match(/(?:place_id:|!1s)(ChI[\w-]+)/)?.[1]||t.match(/"placeId"\s*:\s*"(ChI[\w-]+)"/)?.[1]||t.match(/"place_id"\s*:\s*"(ChI[\w-]+)"/)?.[1]||null;
  name=(og||title(t)).replace(/\s*[-–]\s*Google Maps.*$/i,'');id=cid;if(cid){url='https://www.google.com/maps?cid='+cid;identityEvidence='Google Maps CID from destination URL/metadata';}if(/^Google Maps$/i.test(name))name='';
 }else{name=og||title(t)||s.id||'';identityEvidence='Domain chuẩn hóa từ URL';}
 if(p.status===200){
  if(['News','Forum','Website'].includes(s.channel))status='live';
  else if(id&&identityEvidence&&name&&!/sign in|log in|login|security|captcha|challenge|not found|unavailable|page not found/i.test(name))status='live';
 }
 const gate=/\/accounts\/login|\/login(?:[/?]|$)|\/authwall|\/checkpoint|\/challenge/i.test(p.url)||/"require_login"\s*:\s*true|<title[^>]*>\s*(?:Login|Log in|Sign in)/i.test(t);
 if(gate){status='chưa xác định';note='Cần đăng nhập hoặc xác minh quyền xem; chưa kết luận source die';}
 else if(p.status===429||p.status===403||p.status===999){status='chưa xác định';note='Bị giới hạn/chặn truy cập công khai (HTTP '+p.status+'); cần kiểm tra bằng phiên đăng nhập';}
 else if(p.status===410){status='die';note='HTTP 410 Gone';}
 else if(p.status===404){status=['News','Forum','Website'].includes(s.channel)?'die':'chưa xác định';note=status==='die'?'HTTP 404 tại URL source':'HTTP 404 công khai; cần kiểm tra bằng phiên đăng nhập trước khi kết luận die';}
 else if(status!=='live')note='HTTP '+p.status+'; chưa lấy đủ metadata xác minh source/ID';
 if(!name||/^(Instagram|Threads|TikTok|YouTube|LinkedIn|Google Maps|Facebook)$/i.test(name))name='';
 if(s.channel==='GG Reviews'&&!name){status='chưa xác định';note='Đã lấy CID; trang Google Maps chưa trả tên/Place ID để xác minh địa điểm';}
 if(/SlardarWAF|_wafchallengeid/.test(t)){status='chưa xác định';note='Website yêu cầu xác minh trình duyệt; cần kiểm tra bằng phiên đăng nhập';}
 return {id:id?String(id):null,name,url,type,status,note,cid,placeId,identityEvidence,httpStatus:p.status,checkedAt:new Date().toISOString()};
}
