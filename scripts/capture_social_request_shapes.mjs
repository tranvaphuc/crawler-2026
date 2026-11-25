// Development-only discovery: one temporary incognito tab at a time, through a proxy.
// Persist public endpoint/query identifiers and parameter names only; never session values.
import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import {createNamedProxyPoolProvider} from '../src/services/socialProxyPools.js';
import {normalizeBrowserProxy} from '../src/services/socialMetricsBrowser.js';
const getProxy=createNamedProxyPoolProvider('outputs/social-proxy-pools-2026-10-23/runtime.credentials.json');
const out='outputs/http-api-transport-2026-10-23';await fs.mkdir(out,{recursive:true});
const cases=[['youtube','comments','https://www.youtube.com/watch?v=wlQndvtII1M'],['threads','source','https://www.threads.com/@hapas.vn'],['threads','comments','https://www.threads.com/@dthh___n/post/DSl1YphAcpY'],['instagram','source','https://www.instagram.com/hapas.vn/'],['instagram','comments','https://www.instagram.com/p/CciJju6P5In/']];
const shapes=[];
for(const [platform,operation,url] of cases){
 let lease,browser;
 try{
  lease=await getProxy({platform});const proxy=normalizeBrowserProxy(lease);
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,args:[`--proxy-server=${proxy.server}`,'--proxy-bypass-list=<-loopback>','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--lang=en-US'],timeout:12000});
  const ctx=await browser.createIncognitoBrowserContext(),page=await ctx.newPage(),client=await page.target().createCDPSession();
  const challenged=new Set();client.on('Fetch.authRequired',e=>{const provide=e.authChallenge.source==='Proxy'&&!challenged.has(e.requestId);challenged.add(e.requestId);client.send('Fetch.continueWithAuth',{requestId:e.requestId,authChallengeResponse:provide?{response:'ProvideCredentials',username:proxy.username||'',password:proxy.password||''}:{response:'CancelAuth'}}).catch(()=>{});});
  client.on('Fetch.requestPaused',e=>client.send(['Image','Font','Media'].includes(e.resourceType)?'Fetch.failRequest':'Fetch.continueRequest',{requestId:e.requestId,...(['Image','Font','Media'].includes(e.resourceType)?{errorReason:'BlockedByClient'}:{})}).catch(()=>{}));
  await client.send('Fetch.enable',{handleAuthRequests:true,patterns:[{urlPattern:'*'}]});
  const captured=[];
  page.on('request',r=>{
   if(!/graphql|\/api\/v1\/|youtubei\/v1\/(?:next|browse|search)/.test(r.url()))return;
   const type=r.headers()['content-type']||'';if(!/json|x-www-form-urlencoded/i.test(type))return;
   const u=new URL(r.url()),raw=r.postData()||'';let body;
   try{body=JSON.parse(raw);}catch{body=Object.fromEntries(new URLSearchParams(raw));}
   let vars=body.variables;try{if(typeof vars==='string')vars=JSON.parse(vars);}catch{}
   const keys=(v,depth=0)=>v&&typeof v==='object'&&depth<7?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,x&&typeof x==='object'?keys(x,depth+1):typeof x])):typeof v;
   captured.push({platform,operation,endpoint:u.origin+u.pathname,method:r.method(),queryKeys:[...u.searchParams.keys()],bodyKeys:Object.keys(body),queryName:body.fb_api_req_friendly_name||null,docId:body.doc_id||null,variableShape:keys(vars),headerNames:Object.keys(r.headers()).filter(k=>!['cookie','authorization'].includes(k))});
  });
  let gate=false;page.on('response',r=>{if([401,403,429].includes(r.status())&&/graphql|\/api\/v1\/|youtubei\/v1\//.test(r.url()))gate=true;});
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  if(![401,403,429].includes(response.status())){
   await new Promise(r=>setTimeout(r,4500));
   for(let n=0;n<3&&!gate;n++){await page.evaluate(()=>window.scrollBy(0,1100));await new Promise(r=>setTimeout(r,1400));}
  }
  const unique=[...new Map(captured.map(x=>[JSON.stringify(x),x])).values()];shapes.push(...unique);
  console.log(JSON.stringify({platform,operation,status:response.status(),gate,requestShapes:unique.length}));
 }catch(e){console.log(JSON.stringify({platform,operation,status:'discovery_failed',code:/^PROXY_/.test(e.code||'')?e.code:'DISCOVERY_UNAVAILABLE'}));}
 finally{try{await browser?.close();}finally{lease?.release?.();}}
 await fs.writeFile(`${out}/request-shapes.json`,JSON.stringify(shapes,null,2));
}
