import fs from 'node:fs/promises';import net from 'node:net';
import iconv from 'iconv-lite';import {gzipSync,gunzipSync} from 'node:zlib';
import {requestNewsHttp,createNewsProxyAgent,NEWS_HTTP_MAX_TIMEOUT_MS} from './httpRequest.mjs';
import {sha,requestKey} from './identity.mjs';
import {ResearchHttpCookies,publicLiteralCookie} from '../web/researchHttpCookies.mjs';
import {pageIssue} from '../web/configurableNewsParser.mjs';
import {isExcludedSource} from '../web/sourceExclusions.mjs';
const fail=code=>Object.assign(new Error(code),{code});
export {NEWS_HTTP_MAX_TIMEOUT_MS};
export class NewsProxyPool{
 static async load(file,options){return new NewsProxyPool(JSON.parse(await fs.readFile(file,'utf8')),options);}
 constructor(values,{rotation='site'}={}){if(!Array.isArray(values)||!values.length)throw fail('NEWS_PROXY_LIST_EMPTY');if(!['site','request'].includes(rotation))throw fail('NEWS_PROXY_ROTATION_INVALID');this.rotation=rotation;this.cursor=0;this.lastSiteProxy=new Map();this.proxies=values.map((p,i)=>{if(!p.host||!Number.isInteger(p.port)||p.port<1||p.port>65535||!p.username||!p.password)throw fail('NEWS_PROXY_CONFIG_INVALID');return {...p,id:p.id||'news-p'+String(i+1).padStart(2,'0')};});if(new Set(this.proxies.map(p=>p.id)).size!==values.length)throw fail('NEWS_PROXY_ID_DUPLICATE');this.bad=new Map();this.bindings=new Map();}
 choose(scope,{proxyIds}={}){
  if(proxyIds!==undefined){
   const allowed=new Set(proxyIds);if(!Array.isArray(proxyIds)||!allowed.size)throw fail('NEWS_PROXY_CONFIG_SCOPE_EMPTY');
   const now=Date.now(),site=String(scope||'').split('|').at(-1),last=this.lastSiteProxy.get(site),available=this.proxies.filter(p=>allowed.has(p.id)&&(this.bad.get(p.id)||0)<=now);
   if(!available.length)throw fail('NEWS_PROXY_POOL_UNAVAILABLE');
   const candidates=available.filter(p=>p.id!==last),choices=candidates.length?candidates:available,p=choices[this.cursor%choices.length];
   this.cursor=(this.cursor+1)%this.proxies.length;this.lastSiteProxy.set(site,p.id);return p;
  }
  if(this.rotation==='request'){
   const now=Date.now(),site=String(scope||'').split('|').at(-1),last=this.lastSiteProxy.get(site);let fallback;
   for(let i=0;i<this.proxies.length;i++){const p=this.proxies[this.cursor];this.cursor=(this.cursor+1)%this.proxies.length;if((this.bad.get(p.id)||0)>now)continue;if(p.id===last){fallback=p;continue;}this.lastSiteProxy.set(site,p.id);return p;}
   if(fallback)return fallback;
   throw fail('NEWS_PROXY_POOL_UNAVAILABLE');
  }
  const bound=this.bindings.get(scope);if(bound)return bound;const available=this.proxies.filter(p=>(this.bad.get(p.id)||0)<=Date.now());if(!available.length)throw fail('NEWS_PROXY_POOL_UNAVAILABLE');const p=available[parseInt(sha(scope.split('|').at(-1)).slice(0,8),16)%available.length];this.bindings.set(scope,p);return p;
 }
 alternate(scope,previousId,{proxyIds}={}){
  const now=Date.now();
  for(let i=0;i<this.proxies.length;i++){
   const proxy=this.proxies[this.cursor];
   this.cursor=(this.cursor+1)%this.proxies.length;
   if(proxy.id===previousId||(this.bad.get(proxy.id)||0)>now||proxyIds!==undefined&&!proxyIds.includes(proxy.id))continue;
   if(this.rotation==='request')this.lastSiteProxy.set(scope.split('|').at(-1),proxy.id);
   return proxy;
  }
 }
 quarantine(id,ms=60000){this.bad.set(id,Date.now()+ms);}
 agent(p,signal,target='https://example.com/',timeoutMs=NEWS_HTTP_MAX_TIMEOUT_MS){return createNewsProxyAgent(p,signal,target,timeoutMs);}
}
export class NewsHttpDriver{
 constructor({state,pool,allowedDomains,profiles={},network=null,pageValidator=null,spacingMs=3000,siteCooldown=true,timeoutMs=NEWS_HTTP_MAX_TIMEOUT_MS,maxBytes=4000000,maxWireRequests=0,retryArticleTimeout=false,onWire=()=>{}}){if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw fail('NEWS_INVALID_HTTP_TIMEOUT');timeoutMs=Math.min(timeoutMs,NEWS_HTTP_MAX_TIMEOUT_MS);Object.assign(this,{state,pool,profiles,network,pageValidator,spacingMs,siteCooldown,timeoutMs,maxBytes,maxWireRequests,retryArticleTimeout,onWire});this.wireRequests=0;this.allowed=new Set(allowedDomains.map(d=>d.toLowerCase().replace(/^www\./,'')));this.hosts=new Map();this.pending=new Map();this.dependencyCache=new Map();this.redirects=new Map();this.cookies=new ResearchHttpCookies();}
 validate(raw){const u=new URL(raw);if(!/^https?:$/.test(u.protocol)||u.username||u.password||net.isIP(u.hostname)||u.port&&!['80','443'].includes(u.port))throw fail('NEWS_UNSAFE_TARGET_URL');const h=u.hostname.toLowerCase().replace(/^www\./,'');if(isExcludedSource(h)||![...this.allowed].some(d=>h===d||h.endsWith('.'+d)))throw fail('NEWS_UNCONFIGURED_TARGET_HOST');return u;}
 forCycle(cycle,site,defaults={}){return {get:(url,dir,label,opts)=>this.get(cycle,url,site,[],{...defaults,...opts}),close:async()=>{}};}
 async pace(host,fn){if(!this.siteCooldown)return fn();const state=this.hosts.get(host)||{tail:Promise.resolve(),last:0};this.hosts.set(host,state);const prev=state.tail;let release;state.tail=new Promise(r=>release=r);await prev;try{const until=Math.max(state.last+this.spacingMs,this.state.hostWait(host));if(until-Date.now()>30000)throw fail('NEWS_ORIGIN_COOLDOWN');if(until>Date.now())await new Promise(r=>setTimeout(r,until-Date.now()));state.last=Date.now();this.state.hostPause(host,state.last+this.spacingMs,'pacing');return await fn();}finally{release();}}
 async get(cycle,raw,site,chain=[],options={}){
  const url=this.validate(raw).href,key=cycle+'|'+requestKey(url);if(chain.includes(requestKey(url))||chain.length>5)return {requestedUrl:url,error:'redirect_loop'};
  const dependency=['publisher_dependency','publication_feed'].includes(options.taskRole);if(dependency&&this.dependencyCache.has(key))return this.dependencyCache.get(key);
  if(this.pending.has(key))return this.pending.get(key);
  const pending=this.read(cycle,url,site,chain,options);this.pending.set(key,pending);try{const result=await pending;if(dependency&&typeof result.html==='string'&&Buffer.byteLength(result.html)<=512000){this.dependencyCache.set(key,result);while(this.dependencyCache.size>64)this.dependencyCache.delete(this.dependencyCache.keys().next().value);}return result;}finally{this.pending.delete(key);this.redirects.delete(key);}
 }
 async read(cycle,url,site,chain,options){
  if(!options.reviewFailed&&this.state.failedUrl(requestKey(url),{role:options.taskRole,cycle}))return {requestedUrl:url,error:'URL_AWAITING_SEPARATE_REVIEW'};
  const prior=this.state.request(cycle,url);if(prior){if(prior.state==='fetching')return {requestedUrl:url,error:'request_in_progress'};const body=this.state.body(prior.response);return {...JSON.parse(prior.metadata||'{}'),html:body?gunzipSync(body).toString():null,reusedCycleResponse:true};}
  const host=new URL(url).hostname.replace(/^www\./,''),scope=cycle+'|'+(site.registrableDomain||site.siteName),profile=this.profiles[host]||{};
  let proxy=this.pool.choose(scope,{proxyIds:site.http?.proxyIds});
  let prepared=null,result=await this.pace(host,async()=>{
   const again=this.state.request(cycle,url);if(again){const body=this.state.body(again.response);return {...JSON.parse(again.metadata||'{}'),html:body?gunzipSync(body).toString():null,reusedCycleResponse:true};}
   if(this.maxWireRequests&&this.wireRequests>=this.maxWireRequests)throw fail('NEWS_HTTP_REQUEST_BUDGET');
   this.wireRequests++;
   try{if(!(this.state.reserveRequest?await this.state.reserveRequest(cycle,url):this.state.reserve(cycle,url)))throw fail('NEWS_HTTP_RESERVATION_CONFLICT');}catch(error){this.wireRequests--;throw error;}
   if(this.siteCooldown)this.state.hostPause(site.siteName,Date.now()+this.spacingMs,'pacing');
   const started=Date.now();let connectStatus=null,raw;
   const cached=this.state.cache(url),cacheMeta=cached?JSON.parse(cached.metadata):null;
   let page,networkElapsedMs,htmlPreparationMs=0,htmlWorkerMs=0,articleTimeoutRetried=false;
   try{
    const wire=new URL(url);if(site.httpTransportScheme==='http'&&(site.allowedHosts||[site.siteName]).some(h=>h.replace(/^www\./,'')===wire.hostname.replace(/^www\./,'')))wire.protocol='http:';const transportUrl=wire.href;this.onWire({url:transportUrl,proxyId:proxy.id});const input={url:transportUrl,proxy,method:options.method||'GET',data:options.data,timeoutMs:this.timeoutMs,maxBytes:this.maxBytes,headers:{'User-Agent':profile.userAgent||'Mozilla/5.0 (compatible; NewsParserResearch/1.0)',Accept:'text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8','Accept-Encoding':profile.acceptEncoding||'gzip, deflate, br',Connection:'close',...(this.cookies.header(transportUrl)?{Cookie:this.cookies.header(transportUrl)}:{}),...(cacheMeta?.etag?{'If-None-Match':cacheMeta.etag}:{}),...(cacheMeta?.lastModified?{'If-Modified-Since':cacheMeta.lastModified}:{}),...(options.headers||{})}};
    const send=request=>this.network?this.network.request(request):requestNewsHttp(request);
    raw=await send(input);
    const timedOut=raw.error==='request_deadline_exceeded'||!raw.error&&raw.networkElapsedMs>=this.timeoutMs;
    if(timedOut&&this.retryArticleTimeout&&options.taskRole==='article'&&input.method==='GET'&&!options.articleTimeoutRetried&&(!this.maxWireRequests||this.wireRequests<this.maxWireRequests)){
     const alternate=this.pool.alternate(scope,proxy.id,{proxyIds:site.http?.proxyIds});
     if(alternate){
      options.articleTimeoutRetried=articleTimeoutRetried=true;
      proxy=alternate;
      this.wireRequests++;
      this.onWire({url:transportUrl,proxyId:proxy.id});
      raw=await send({...input,proxy});
     }
    }
    networkElapsedMs=raw.networkElapsedMs;connectStatus=raw.connectStatus;
    if(raw.error)throw fail(raw.error);
    // Measure the deadline on the network worker, independently of main-thread response delivery.
    if(networkElapsedMs>=this.timeoutMs)throw fail('request_deadline_exceeded');
    this.cookies.store(transportUrl,raw.headers['set-cookie']);
    const statusCode=raw.statusCode,contentType=raw.headers['content-type']||(statusCode===304?cacheMeta?.contentType:'')||'',bytes=Buffer.from(raw.data);
    const encoding=contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||bytes.subarray(0,4000).toString('ascii').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf8';
    const html=statusCode===304&&cached?gunzipSync(this.state.body(cached.response)).toString():iconv.decode(bytes,iconv.encodingExists(encoding)?encoding:'utf8');
    let issue=null;
    if((statusCode<300||statusCode===304)&&!/json|xml|rss|atom/i.test(contentType)){
     if(this.pageValidator){const prepareStarted=Date.now();const input=options.pagePreparation?{...options.pagePreparation,mode:'prepare',html,url}:{mode:'validate',html};const validation=await this.pageValidator.run(input);htmlPreparationMs=Date.now()-prepareStarted;htmlWorkerMs=validation.elapsedMs||0;if(validation.error)throw fail('NEWS_PAGE_VALIDATION_FAILED');issue=validation.issue;if(options.pagePreparation&&!issue)prepared={html,url,domain:input.domain,article:!!input.article,result:validation};}
     else issue=pageIssue(html);
    }
    page={requestedUrl:url,finalUrl:url,transportUrl,statusCode,contentType,encoding,html,etag:raw.headers.etag||cacheMeta?.etag,lastModified:raw.headers['last-modified']||cacheMeta?.lastModified,location:raw.headers.location||null,retryAfter:raw.headers['retry-after']||null,proxyId:proxy.id,checkedAt:new Date(raw.completedAt).toISOString(),method:'HTTP/axios/proxy',error:statusCode===407?'proxy_auth_required':statusCode===429?'rate_limited':[401,403].includes(statusCode)?'access_blocked':[404,410].includes(statusCode)?'not_found':statusCode>=400?'http_'+statusCode:statusCode===304&&!cached?'cache_body_missing':statusCode<300||statusCode===304?issue:null};
    const bootstrap=statusCode===200&&publicLiteralCookie(html,url);if(bootstrap){this.cookies.store(url,bootstrap);page.error='public_cookie_bootstrap_pending_next_round';}
    if(connectStatus&&connectStatus!==200)page.error='proxy_connect_'+connectStatus;
    if(page.error==='proxy_auth_required'||connectStatus===407)this.pool.quarantine(proxy.id,900000);
    if(this.siteCooldown&&(statusCode===429||statusCode===403)&&(!connectStatus||connectStatus===200)){const retry=String(page.retryAfter||'');const wait=/^\d+$/.test(retry)?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now())||900000;this.state.hostPause(host,Date.now()+wait,page.error);this.state.hostPause(site.siteName,Date.now()+wait,page.error);}
    if(this.siteCooldown&&site.publisherCrawlPolicy?.crawlDelaySeconds)this.state.hostPause(host,Date.now()+site.publisherCrawlPolicy.crawlDelaySeconds*1000,'publisher_crawl_delay');
    if(this.state.cacheResponses!==false&&!page.error&&(statusCode===200||statusCode===304))this.state.saveCache(url,gzipSync(html),{...page,html:undefined});
   }catch(e){const code=String(e.code||'NETWORK_ERROR'),deadline=code==='request_deadline_exceeded';page={requestedUrl:url,finalUrl:url,error:deadline?'request_deadline_exceeded':/^[A-Za-z0-9_]+$/.test(code)?code:'upstream_network_error',proxyId:proxy.id,checkedAt:new Date(raw?.completedAt||Date.now()).toISOString(),method:'HTTP/axios/proxy'};if(connectStatus===null&&!deadline&&!code.startsWith('NEWS_'))this.pool.quarantine(proxy.id);}
   if(articleTimeoutRetried)page.articleTimeoutRetried=true;
   page.htmlPreparationMs=htmlPreparationMs;page.htmlWorkerMs=htmlWorkerMs;page.elapsedMs=Date.now()-started;page.networkElapsedMs=networkElapsedMs??page.elapsedMs;page.timeoutMs=this.timeoutMs;page.transportMode=this.network?'axios_workers':'axios_inline';page.networkQueueMs=raw?.networkQueueMs||0;page.mainThreadDelayMs=raw?.mainThreadDelayMs||0;
   return page;
  });
  if(result.location&&[301,302,303,307,308].includes(result.statusCode)){
   try{const next=this.validate(new URL(result.location,url).href),key=cycle+'|'+requestKey(url);let target=cycle+'|'+requestKey(next.href);this.redirects.set(key,target);const visited=new Set([key]);while(target){if(visited.has(target))throw fail('NEWS_REDIRECT_LOOP');visited.add(target);target=this.redirects.get(target);}const redirected=await this.get(cycle,next.href,site,[...chain,requestKey(url)],options);prepared=redirected.prepared||null;result={...redirected,...(options.articleTimeoutRetried?{articleTimeoutRetried:true}:{}),requestedUrl:url,redirectedVia:result.location};}catch(e){result.error=e.code||'redirect_rejected';}
  }
  if(this.state.completeHttpResponse)await this.state.completeHttpResponse(cycle,url,{...result,site:site.siteName||host,role:options.taskRole||'request'});
  else{if(result.error)this.state.failUrl({url,site:site.siteName||host,role:options.taskRole||'request'},result.error);if(this.state.responseText)this.state.responseText(cycle,url,result.html||null,{...result,html:undefined});else this.state.response(cycle,url,result.html?gzipSync(result.html):null,{...result,html:undefined});}
  if(prepared?.result?.reviewSample)this.state.prepareReviewSample?.({cycle,url_key:requestKey(url)},prepared.result.reviewSample);if(prepared&&!result.error)Object.defineProperty(result,'prepared',{value:prepared,enumerable:false});return result;
 }
}
