// Development discovery: native Chrome, fresh temporary incognito context, proxied before navigation.
import 'dotenv/config';import puppeteer from 'puppeteer';import fs from 'node:fs/promises';
import {createConfiguredProxyProvider,normalizeBrowserProxy} from '../src/services/socialProxyConfig.js';
import {parseChunks} from './paginate_facebook_group_capture.js';
const out=process.env.CAPTURE_OUTPUT||'outputs/facebook-request-refresh-2026-10-24';await fs.mkdir(out,{recursive:true,mode:0o700});
const report={startedAt:new Date().toISOString(),incognito:true,proxyUsed:true,target:'https://www.facebook.com/100201629178552/posts/1131594819369667',stages:[],requests:[],responses:[],gate:null};const entries=[];let lease,browser;const pending=new Set();
async function save(){await fs.writeFile(out+'/capture-report.json',JSON.stringify(report,null,2));if(entries.length)await fs.writeFile(out+'/anonymous-requests.json',JSON.stringify({log:{entries}},null,2),{mode:0o600});}
async function stage(name,data={}){const r={stage:name,at:new Date().toISOString(),...data};report.stages.push(r);console.log(JSON.stringify(r));await save();}
try{
 lease=await createConfiguredProxyProvider()({platform:'facebook',pool:'facebook_page_posts'});const proxy=normalizeBrowserProxy(lease);await stage('proxy_configured');
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,args:[`--proxy-server=${proxy.server}`,'--proxy-bypass-list=<-loopback>','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--lang=en-US'],timeout:20000});
 const ctx=await browser.createIncognitoBrowserContext(),page=await ctx.newPage();await page.setExtraHTTPHeaders({'accept-language':'en-US,en;q=0.9'});const cdp=await page.target().createCDPSession(),challenged=new Set();
 const wireRequests=new Map(),wireExtras=new Map(),wireByQuery=new Map();
 const cleanWireHeaders=headers=>Object.entries(headers||{}).filter(([k])=>!['cookie','set-cookie','authorization','proxy-authorization','content-length','host','accept-encoding','x-fb-lsd','x-fb-navigation-chain'].includes(k.toLowerCase())&&!k.startsWith(':')).map(([name,value])=>({name:name.toLowerCase(),value:String(value)}));
 const bindWire=id=>{const q=wireRequests.get(id),h=wireExtras.get(id);if(q&&h)wireByQuery.set(q,h);};
 cdp.on('Network.requestWillBeSent',e=>{if(e.request.url!=='https://www.facebook.com/api/graphql/'||!e.request.postData)return;const f=Object.fromEntries(new URLSearchParams(e.request.postData));wireRequests.set(e.requestId,f.fb_api_req_friendly_name);bindWire(e.requestId);});
 cdp.on('Network.requestWillBeSentExtraInfo',e=>{wireExtras.set(e.requestId,cleanWireHeaders(e.headers));bindWire(e.requestId);});await cdp.send('Network.enable');
 cdp.on('Fetch.authRequired',e=>{const ok=e.authChallenge.source==='Proxy'&&!challenged.has(e.requestId);challenged.add(e.requestId);cdp.send('Fetch.continueWithAuth',{requestId:e.requestId,authChallengeResponse:ok?{response:'ProvideCredentials',username:proxy.username||'',password:proxy.password||''}:{response:'CancelAuth'}}).catch(()=>{});});
 cdp.on('Fetch.requestPaused',e=>cdp.send(['Image','Media','Font'].includes(e.resourceType)?'Fetch.failRequest':'Fetch.continueRequest',{requestId:e.requestId,...(['Image','Media','Font'].includes(e.resourceType)?{errorReason:'BlockedByClient'}:{})}).catch(()=>{}));await cdp.send('Fetch.enable',{handleAuthRequests:true,patterns:[{urlPattern:'*'}]});
 page.on('request',r=>{if(r.url()!=='https://www.facebook.com/api/graphql/'||!r.postData())return;const form=Object.fromEntries(new URLSearchParams(r.postData()));let vars;try{vars=JSON.parse(form.variables);}catch{};
 const shape={name:form.fb_api_req_friendly_name||null,docId:form.doc_id||null,anonymous:form.__user==='0'&&form.av==='0',variableKeys:Object.keys(vars||{}),intent:vars?.commentsIntentToken||null};report.requests.push(shape);
 if(shape.anonymous&&/Comment|Replies|UFI|SinglePost/.test(shape.name||'')){for(const k of ['lsd','fb_dtsg','access_token','jazoest','__s'])delete form[k];form.lsd='ANONYMOUS_BOOTSTRAP_REQUIRED';
 const headers=Object.entries(r.headers()).filter(([k])=>!['cookie','authorization','content-length','host','accept-encoding','x-fb-lsd','x-fb-navigation-chain'].includes(k)&&!k.startsWith(':')).map(([name,value])=>({name,value}));entries.push({request:{url:r.url(),method:'POST',headers,postData:{mimeType:'application/x-www-form-urlencoded',text:new URLSearchParams(form).toString()}}});}
 const p=save().catch(()=>{});pending.add(p);p.finally(()=>pending.delete(p));});
 page.on('response',r=>{if(r.url()!=='https://www.facebook.com/api/graphql/')return;const p=(async()=>{let chunks=[];try{chunks=parseChunks(await r.text());}catch{}const errors=chunks.flatMap(x=>[...(x.errors||[]),...(x.error?[{code:x.error,message:x.errorSummary}]:[])]).map(e=>({code:e.code||e.extensions?.code||null,message:String(e.message||'').replace(/<[^>]+>/g,'').slice(0,160)}));
 const f=Object.fromEntries(new URLSearchParams(r.request().postData()||''));const intents=[];function walk(v,n=0){if(!v||typeof v!=='object'||n>65)return;if(v.selected_intent?.intent_token)intents.push(v.selected_intent.intent_token);for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,n+1);}for(const chunk of chunks)walk(chunk.data);
 report.responses.push({name:f.fb_api_req_friendly_name||null,http:r.status(),errors,hasData:chunks.some(x=>!!x.data),selectedIntents:[...new Set(intents)]});if([401,403,429].includes(r.status())||errors.some(e=>/rate.?limit|checkpoint|login required|authentication required/i.test(e.message)))report.gate='UPSTREAM_GATE';await save();})();pending.add(p);p.finally(()=>pending.delete(p)).catch(()=>{});});
 await stage('incognito_browser_ready');let nav;try{nav=await page.goto(report.target,{waitUntil:'domcontentloaded',timeout:45000});}catch(e){await stage('navigation_incomplete',{reason:e.message?.match(/net::[A-Z_]+/)?.[0]||e.name});}
 if(nav){report.navigationStatus=nav.status();if([401,403,429].includes(nav.status()))report.gate='HTTP_'+nav.status();}if(/\/(login|checkpoint|challenge)(?:[/.?]|$)/.test(new URL(page.url()).pathname))report.gate='AUTH_OR_SECURITY_REQUIRED';
 await new Promise(r=>setTimeout(r,5000));
 const ui=await page.evaluate(()=>({title:document.title,buttons:[...document.querySelectorAll('[role="button"],[role="menuitem"],button')].map(x=>({text:(x.innerText||'').trim().slice(0,90),label:x.getAttribute('aria-label')})).filter(x=>x.text||x.label).slice(0,60)})).catch(()=>({}));await stage('document_observed',{status:report.navigationStatus||null,gate:report.gate,ui});
 await page.screenshot({path:out+'/incognito-page.png',fullPage:false}).catch(()=>{});
 if(!report.gate){
  // Use only visible public comment controls; never enter a login/checkpoint flow.
  const close=await page.$$('[role="button"][aria-label="Close"]');const loginPromptVisible=await page.evaluate(()=>[...document.querySelectorAll('input[type="password"]')].some(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}));if(loginPromptVisible&&close.length){await close.at(-1).click();await new Promise(r=>setTimeout(r,1200));await stage('public_login_prompt_dismissed');}
  const filter=await page.$x("//*[@role='button' and (contains(.,'Most relevant') or contains(.,'Newest') or contains(.,'Phù hợp nhất') or contains(.,'Mới nhất'))]");
  if(filter.length){await filter.at(-1).click();await new Promise(r=>setTimeout(r,1500));await stage('comment_menu_observed',{options:await page.evaluate(()=>[...document.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="option"],[role="button"]')].map(x=>({role:x.getAttribute('role'),text:(x.innerText||'').trim().slice(0,160)})).filter(x=>/comments|relevant|newest/i.test(x.text)).slice(-20))});
   const options=await page.$$('[role="menuitem"],[role="menuitemradio"],[role="option"],[role="button"]');for(const option of options){const text=await option.evaluate(e=>(e.innerText||'').trim());if(/^(All comments|Tất cả bình luận)(?:\s|$)/.test(text)&&text.length<300){await option.click();await stage('all_comments_selected');await new Promise(r=>setTimeout(r,4500));break;}}
  }
  if(!report.gate&&process.env.CAPTURE_PAGINATION==='1'){
   const labels=await page.evaluate(()=>[...document.querySelectorAll('[role="button"]')].map(e=>(e.innerText||'').trim()).filter(x=>/comment|bình luận/i.test(x)).slice(-25));await stage('pagination_controls_observed',{labels});
   let clicked=false;const controls=await page.$$('[role="button"]');for(const el of controls){const text=await el.evaluate(e=>(e.innerText||'').trim());if(/^(View|See|Load).*(more|previous).*comments/i.test(text)&&text.length<100){await el.click();clicked=true;await stage('native_comment_pagination_clicked',{label:text});await new Promise(r=>setTimeout(r,4000));break;}}
   if(!clicked){await page.evaluate(()=>{const nodes=[...document.querySelectorAll('[role="dialog"], [role="dialog"] div')];const scroller=nodes.find(e=>e.scrollHeight>e.clientHeight+150&&/auto|scroll/.test(getComputedStyle(e).overflowY));if(scroller)scroller.scrollBy(0,scroller.scrollHeight);});await new Promise(r=>setTimeout(r,2500));
    const more=await page.$$('[role="button"]');for(const el of more){const text=await el.evaluate(e=>(e.innerText||'').trim());if(/^(View|See|Load).*(more|previous).*comments/i.test(text)&&text.length<100){await el.click();await stage('native_comment_pagination_clicked',{label:text});await new Promise(r=>setTimeout(r,4000));break;}}
   }
  }
  if(!report.gate){const reply=await page.$x("//*[@role='button' and contains(.,'1 reply')]");if(reply[0]){await reply[0].click();await stage('one_public_reply_expanded');await new Promise(r=>setTimeout(r,3000));}}
  await page.screenshot({path:out+'/after-comment-controls.png',fullPage:false}).catch(()=>{});
  if(!report.gate){await page.evaluate(()=>window.scrollBy(0,700));await new Promise(r=>setTimeout(r,2500));}
 }
 await Promise.allSettled([...pending]);for(const entry of entries){const f=Object.fromEntries(new URLSearchParams(entry.request.postData.text));const headers=wireByQuery.get(f.fb_api_req_friendly_name);if(headers)entry.request.headers=headers;}
 report.wireHeaderNames=Object.fromEntries([...wireByQuery].map(([name,headers])=>[name,headers.map(h=>h.name)]));await save();await stage('capture_finished',{captured:entries.length,queries:report.requests.map(x=>({name:x.name,docId:x.docId})),gate:report.gate});
 if(process.env.CAPTURE_HTTP_REPLAY==='1'&&entries.length&&!report.gate){
  const {createProxiedSession}=await import('../src/services/socialHttpTransport.js'),{createAnonymousFacebookGraphqlRequest}=await import('../src/services/facebookAnonymousGraphql.js'),{createFacebookCommentFetcher}=await import('./facebook_comments.js');const session=createProxiedSession({proxy:lease,platform:'facebook',deadline:Date.now()+45000});report.httpReplay={responses:[]};
  const wrapped={request:async(...args)=>{const r=await session.request(...args);let chunks=[];try{chunks=parseChunks(r.html);}catch{}report.httpReplay.responses.push({http:r.httpStatus,graphql:new URL(r.finalUrl).pathname==='/api/graphql/',errors:chunks.flatMap(x=>x.errors||[]).map(e=>({code:e.code||null,message:String(e.message||'').slice(0,160)}))});return r;}};
  try{const request=createAnonymousFacebookGraphqlRequest(wrapped,{bootstrapUrl:report.target}),fetch=createFacebookCommentFetcher({harPath:out+'/anonymous-requests.json',request,pageSize:20});const r=await fetch({idPost:'1131594819369667'});report.httpReplay.result={status:r.status,commentCount:r.comments.length,ordering:r.ordering,hasNextPage:r.hasNextPage};
   if(process.env.CAPTURE_HTTP_REPLAY_CONTINUE==='1'){
    let next;if(r.cursor){next=await fetch({idPost:'1131594819369667',cursor:r.cursor});report.httpReplay.pagination={status:next.status,commentCount:next.comments.length,ordering:next.ordering,hasNextPage:next.hasNextPage};}
    const parent=[...r.comments,...(next?.comments||[])].find(x=>x.replyCursor);if(parent){const reply=await fetch({idPost:'1131594819369667',idGetComment:parent._id,cursor:parent.replyCursor});report.httpReplay.reply={status:reply.status,commentCount:reply.comments.length,hasNextPage:reply.hasNextPage};}
   }
}
  catch(e){report.httpReplay.result={code:e.code||e.name,message:e.message};if(e.code==='FACEBOOK_RATE_LIMITED'){const {deferPlatform}=await import('../src/services/socialCooldown.js');deferPlatform('facebook',e.retryAfterMs||900000);}}
  finally{session.close();await stage('http_replay_finished',{result:report.httpReplay.result});}
 }

}catch(e){report.error={code:/^PROXY_/.test(e.code||'')?e.code:e.message?.match(/net::[A-Z_]+/)?.[0]||e.name};await stage('capture_failed',{error:report.error});}
finally{try{await browser?.close();}finally{await lease?.release?.();report.finishedAt=new Date().toISOString();await save();}}
