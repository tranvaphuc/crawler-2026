// Development discovery only: a separate anonymous browser, proxy required, one tab.
import 'dotenv/config';import puppeteer from 'puppeteer';import fs from 'node:fs/promises';
import {createConfiguredProxyProvider} from '../src/services/socialProxyConfig.js';
const out='outputs/production-api-fixes-2026-10-24';await fs.mkdir(out,{recursive:true,mode:0o700});
const getProxy=createConfiguredProxyProvider();let lease,browser,blocked=false;const templates=[],shapes=[];
try{
 lease=await getProxy({platform:'facebook',pool:'facebook_page_posts'});
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,args:[`--proxy-server=${lease.server}`,'--proxy-bypass-list=<-loopback>','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--lang=en-US'],timeout:15000});
 const context=await browser.createIncognitoBrowserContext(),page=await context.newPage();const client=await page.target().createCDPSession();
 client.on('Fetch.authRequired',e=>client.send('Fetch.continueWithAuth',{requestId:e.requestId,authChallengeResponse:e.authChallenge.source==='Proxy'?{response:'ProvideCredentials',username:lease.username||'',password:lease.password||''}:{response:'CancelAuth'}}).catch(()=>{}));
 client.on('Fetch.requestPaused',e=>client.send(['Image','Font','Media'].includes(e.resourceType)?'Fetch.failRequest':'Fetch.continueRequest',{requestId:e.requestId,...(['Image','Font','Media'].includes(e.resourceType)?{errorReason:'BlockedByClient'}:{})}).catch(()=>{}));
 await client.send('Fetch.enable',{handleAuthRequests:true,patterns:[{urlPattern:'*'}]});
 page.on('response',r=>{if([401,403,429].includes(r.status())&&(r.request().isNavigationRequest()||/\/api\/graphql\//.test(r.url())))blocked=true;});
 page.on('request',r=>{
  if(r.url()!=='https://www.facebook.com/api/graphql/'||!r.postData())return;
  const f=Object.fromEntries(new URLSearchParams(r.postData()));const name=f.fb_api_req_friendly_name||'';
  if(!/ProfileCometTimeline|GroupsCometFeed|CommentListComponents|CommentsListComponents|Depth1CommentsList|SinglePost/.test(name))return;
  shapes.push({queryName:name,docId:f.doc_id,formKeys:Object.keys(f),headerNames:Object.keys(r.headers()).filter(k=>!['cookie','authorization'].includes(k)),anonymous:f.__user==='0'&&f.av==='0'});
  if(f.__user!=='0'||f.av!=='0')return;
  for(const k of Object.keys(f))if(/^(fb_dtsg|access_token|__s|jazoest|lsd)$/i.test(k))delete f[k];f.lsd='ANONYMOUS_BOOTSTRAP_REQUIRED';
  const headers=Object.entries(r.headers()).filter(([k])=>!['cookie','authorization','content-length','host','accept-encoding','x-fb-navigation-chain','x-fb-lsd'].includes(k)&&!k.startsWith(':')).map(([name,value])=>({name,value}));
  templates.push({request:{url:r.url(),method:'POST',headers,postData:{text:new URLSearchParams(f).toString()}}});
 });
 for(const [purpose,url] of [['page','https://www.facebook.com/1794121197534939'],['comments','https://www.facebook.com/100201629178552/posts/1131594819369667']]){
  if(blocked)break;
  let status;try{status=(await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000}))?.status();}catch{}
  if(!blocked){await new Promise(r=>setTimeout(r,3500));for(let i=0;i<2&&!blocked;i++){await page.evaluate(()=>window.scrollBy(0,950));await new Promise(r=>setTimeout(r,1500));}}
  const location=new URL(page.url());if(/\/login|\/checkpoint|\/challenge/.test(location.pathname))blocked=true;
  console.log(JSON.stringify({purpose,navigationStatus:status||null,gate:blocked,requestShapes:shapes.length,incognito:true,proxyUsed:true}));
 }
 if(templates.length)await fs.writeFile(out+'/captured-anonymous-templates.json',JSON.stringify({log:{entries:templates}},null,2),{mode:0o600});
 await fs.writeFile(out+'/incognito-shapes.json',JSON.stringify({checkedAt:new Date().toISOString(),blocked,shapes},null,2));
 console.log(JSON.stringify({captured:templates.length,blocked,queries:shapes.map(x=>({name:x.queryName,docId:x.docId}))}));
}finally{try{await browser?.close();}finally{await lease?.release?.();}}
