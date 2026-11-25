import {readFile} from 'node:fs/promises';import tls from 'node:tls';import net from 'node:net';import {readFileSync} from 'node:fs';
import axios from 'axios';import iconv from 'iconv-lite';import * as proxyModule from 'https-proxy-agent';import {createRequire} from 'node:module';
import {createResearchTransport} from '../web/researchTransport.mjs';import {ResearchHttpCookies} from '../web/researchHttpCookies.mjs';import {pageIssue} from '../web/configurableNewsParser.mjs';import {isExcludedSource} from '../web/sourceExclusions.mjs';
const cas=[...tls.rootCertificates,...['sectigo-dv-r36.pem','globalsign-ov-2018.pem','rapidssl-g1.pem'].map(f=>readFileSync(new URL('../../config/web-sources/tls/'+f,import.meta.url),'utf8'))];
createRequire(import.meta.resolve('https-proxy-agent'))('debug').disable();
const HttpsProxyAgent=proxyModule.HttpsProxyAgent||proxyModule.default?.HttpsProxyAgent||proxyModule.default,legacyProxyAgent=!proxyModule.HttpsProxyAgent&&!proxyModule.default?.HttpsProxyAgent;
const createAgent=(p,target,signal,timeout)=>{const u=new URL('http://'+p.host+':'+p.port);u.username=p.username;u.password=p.password;const options={signal,timeout,keepAlive:false},a=legacyProxyAgent?new HttpsProxyAgent({host:p.host,port:p.port,protocol:'http:',auth:p.username+':'+p.password,...options}):new HttpsProxyAgent(u,options);a.options={...a.options,ca:cas,rejectUnauthorized:true};return a;};
const safeCode=e=>/^[A-Z0-9_]+$/.test(e?.code||'')?e.code:'upstream_network_error';

// An explicit route changes transport only. The normal native parser, clocks,
// parent checks, writer lease and create-only ES reconciliation still apply.
export async function createForumHttpTransport({sites,state,proxyFile=null,proxySites=[],proxyValues,request=axios.request,agentFactory=createAgent,directTransport,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),spacingMs=1000}={}){
 const direct=directTransport||createResearchTransport({timeoutMs:15000,maxSockets:4,persistEvidence:false,onNetworkRequest:({url})=>{if(isExcludedSource(url))throw Error('REQUEST_HOST_NOT_ALLOWED');}});
 if(!proxySites.length)return direct;
 const selected=proxySites.map(domain=>{const s=sites.find(s=>s.domain===domain);if(!s||[s.domain,s.homepage,...s.allowedHosts||[]].some(isExcludedSource))throw Error('FORUM_PROXY_SITE_NOT_CONFIGURED');return s;});
 let proxies=proxyValues;try{if(!proxies)proxies=JSON.parse(await readFile(proxyFile,'utf8'));}catch{throw Error('FORUM_PROXY_CONFIGURATION_INVALID');}
 if(!Array.isArray(proxies)||!proxies.length||proxies.some(p=>!p.host||!Number.isInteger(p.port)||p.port<1||p.port>65535||typeof p.username!=='string'||!p.username||typeof p.password!=='string'||!p.password))throw Error('FORUM_PROXY_CONFIGURATION_INVALID');
 let cursor=0,closed=false;const queues=new Map(),cooldowns=new Map(),last=new Map(),cookies=new ResearchHttpCookies();
 const denied=()=>Object.assign(Error('REQUEST_HOST_NOT_ALLOWED'),{code:'REQUEST_HOST_NOT_ALLOWED'});
 const validate=(raw,site)=>{let u;try{u=new URL(raw);}catch{throw denied();}if(u.protocol!=='https:'||u.username||u.password||net.isIP(u.hostname)||u.port&&u.port!=='443'||isExcludedSource(u.href)||!site.allowedHosts.includes(u.hostname))throw denied();return u.href;};
 async function routed(url,site){
  const requestedUrl=validate(url,site),started=now(),base={requestedUrl,finalUrl:requestedUrl,checkedAt:new Date(started).toISOString(),method:'HTTP/axios/project-proxy',tlsVerification:'strict',proxyRoute:'project_http_proxy'};
  const cooldownKey='http_source_cooldown:'+site.domain,persisted=Number(state?.db.prepare('SELECT value FROM forum_meta WHERE key=?').get(cooldownKey)?.value||0);
  if(Math.max(cooldowns.get(site.domain)||0,persisted)>now())return {...base,error:'origin_cooldown',html:null};
  const wait=(last.get(site.domain)||0)+spacingMs-now();if(wait>0)await sleep(wait);last.set(site.domain,now());
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let current=requestedUrl;
  try{for(let redirect=0;redirect<=6;redirect++){
   const p=proxies[cursor++%proxies.length],agent=agentFactory(p,current,controller.signal,15000);let response;
   try{response=await request({url:current,method:'GET',proxy:false,httpAgent:agent,httpsAgent:agent,maxRedirects:0,signal:controller.signal,timeout:15000,maxContentLength:4000000,responseType:'arraybuffer',validateStatus:()=>true,headers:{'User-Agent':'Mozilla/5.0 (compatible; NewsParserResearch/1.0)',Accept:'text/html,application/xhtml+xml,*/*;q=0.8','Accept-Language':'vi,en;q=0.9',...(cookies.header(current)?{Cookie:cookies.header(current)}:{})}});}finally{agent.destroy();}
   const statusCode=response.status,headers=response.headers||{};cookies.store(current,headers['set-cookie']);
   if([301,302,303,307,308].includes(statusCode)&&headers.location){if(redirect===6)throw Object.assign(Error(),{code:'REDIRECT_LIMIT'});current=validate(new URL(headers.location,current).href,site);continue;}
   const contentType=String(headers['content-type']||''),encoding=contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf8',html=iconv.decode(Buffer.from(response.data),iconv.encodingExists(encoding)?encoding:'utf8'),retryAfter=headers['retry-after']||null;
   let error=statusCode===401||statusCode===403?'access_blocked':statusCode===429?'rate_limited':statusCode===404||statusCode===410?'not_found':statusCode>=400?'http_'+statusCode:pageIssue(html);
   if(statusCode===403||statusCode===429){const seconds=/^\d+$/.test(String(retryAfter))?Number(retryAfter)*1000:Math.max(0,Date.parse(retryAfter)-now())||900000,until=now()+seconds;cooldowns.set(site.domain,until);state?.db.prepare('INSERT OR REPLACE INTO forum_meta VALUES(?,?)').run(cooldownKey,String(until));}
   return {...base,finalUrl:current,statusCode,contentType,encoding,retryAfter,error:error||null,html,elapsedMs:now()-started};
  }}catch(e){return {...base,finalUrl:current,error:controller.signal.aborted||['ECONNABORTED','ETIMEDOUT'].includes(e.code)?'request_deadline_exceeded':safeCode(e),html:null,elapsedMs:now()-started};}finally{clearTimeout(timer);}
 }
 return {async get(url,...args){if(closed)throw Error('FORUM_TRANSPORT_CLOSED');if(isExcludedSource(url))throw Error('REQUEST_HOST_NOT_ALLOWED');const u=new URL(url),site=selected.find(s=>s.allowedHosts.includes(u.hostname));if(!site||u.protocol!=='https:')return direct.get(url,...args);const previous=queues.get(site.domain)||Promise.resolve(),promise=previous.catch(()=>{}).then(()=>routed(url,site));queues.set(site.domain,promise);return promise;},async close(){closed=true;await Promise.allSettled([...queues.values()]);await direct.close();}};
}
