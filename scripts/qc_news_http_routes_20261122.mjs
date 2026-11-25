// Probe supported HTTP routes for transport/TLS failures without disabling TLS.
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
const base='/opt/news-flow/current',root='/var/lib/news-flow/qc-20261122';
const {loadNewsRegistry}=await import('file://'+base+'/src/newsFlow/registry.mjs');
const {registerOriginalSources}=await import('file://'+base+'/src/newsFlow/baomoiOriginalBranch.mjs');
const {NewsHttpDriver,NewsProxyPool}=await import('file://'+base+'/src/newsFlow/transport.mjs');
const {NewsNetworkPool}=await import('file://'+base+'/src/newsFlow/networkPool.mjs');
const {createNewsResearchTransport}=await import('file://'+base+'/src/web/newsResearchTransport.mjs');
const {discoverNewsLinks}=await import('file://'+base+'/src/web/configurableNewsParser.mjs');
const {NewsRepairPool}=await import('file://'+base+'/src/web/newsRepairPool.mjs');
const {toEs5News}=await import('file://'+base+'/src/newsFlow/identity.mjs');
const registry=await loadNewsRegistry(),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});registerOriginalSources(db,registry);
const audit=JSON.parse(fs.readFileSync(root+'/news-audit.json')),targets=audit.sites.filter(s=>s.seeds.length&&s.seeds.every(r=>/request_deadline_exceeded|CERT_HAS_EXPIRED|EPROTO|ECONNRESET/.test(r.error||'')));
const network=new NewsNetworkPool({workers:2,maxPerWorker:4}),pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'}),parsers=new NewsRepairPool(2,new URL('file://'+base+'/src/web/newsDeepAuditWorker.mjs'));
const driver=new NewsHttpDriver({state:{cacheResponses:false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},network,pool,allowedDomains:registry.allowedDomains,profiles:JSON.parse(fs.readFileSync(base+'/config/web-sources/news-http-profiles.json')),siteCooldown:false,maxWireRequests:160});
const result={at:new Date().toISOString(),sites:[]};let cursor=0;
const save=()=>fs.writeFileSync(root+'/http-routes.json',JSON.stringify(result,null,2));
async function lane(){while(cursor<targets.length){const target=targets[cursor++],source=registry.sources.get(target.site),row={site:target.site,probes:[],articles:[]};
 for(const mode of ['http','https']){
  const config={...source.config,httpTransportScheme:mode==='http'?'http':undefined},url=source.seeds[0],cycle='qc-route-'+mode+'-'+source.domain;
  const transport=createNewsResearchTransport({...config,taskRole:'seed',persistEvidence:false,baseTransport:driver.forCycle(cycle,config,{reviewFailed:true,taskRole:'seed'})});
  const p=await transport.get(url,null,'route').catch(e=>({error:e.code||'QC_ROUTE_FAILED'}));let found=[];
  if(!p.error&&p.html&&registry.byUrl(p.finalUrl||url)?.domain===source.domain)found=discoverNewsLinks(p.html,p.finalUrl||url,{domain:source.domain,allowedHosts:config.allowedHosts,knownCategoryUrls:source.seeds,legacy:{legacyArticlePattern:config.discovery?.legacyArticlePattern}}).articles;
  const probe={mode,url,statusCode:p.statusCode,error:p.error||null,links:found.length};row.probes.push(probe);
  if(!p.error&&found.length){const sha=createHash('sha256').update(p.html).digest('hex');probe.evidence=root+'/evidence/'+sha+'.html.gz';fs.writeFileSync(probe.evidence,gzipSync(p.html));row.config=config;
   for(const a of found.slice(0,3)){await new Promise(r=>setTimeout(r,3000));const t=createNewsResearchTransport({...config,taskRole:'article',persistEvidence:false,baseTransport:driver.forCycle(cycle+'-article',config,{reviewFailed:true,taskRole:'article'})}),page=await t.get(a.url,null,'article').catch(e=>({error:e.code||'QC_REQUEST_FAILED'}));const checked={url:a.url,error:page.error||null};
    if(!page.error&&page.html){const sha=createHash('sha256').update(page.html).digest('hex');checked.evidence=root+'/evidence/'+sha+'.html.gz';fs.writeFileSync(checked.evidence,gzipSync(page.html));const out=await parsers.run({sample:{domain:source.domain,url:page.finalUrl||a.url,html:page.html,kind:'article'},config,context:{},learn:false});try{if(out.error||out.quality?.length||out.fields?.issues?.length||out.policyConflict)throw Error(out.error||'QC_FIELD_ISSUES');checked.doc=toEs5News(out.parsed,config);}catch(e){checked.error=e.code||e.message;}}
    row.articles.push(checked);if([403,429].includes(page.statusCode))break;
   }
   row.approved=row.articles.filter(a=>a.doc).length>=2;break;
  }
  if([403,429].includes(p.statusCode))break;await new Promise(r=>setTimeout(r,3000));
 }
 result.sites.push(row);save();console.log(JSON.stringify({site:row.site,probes:row.probes.map(p=>({mode:p.mode,error:p.error,links:p.links})),approved:row.approved,articles:row.articles.map(a=>a.error||'ok')}));
}}
try{await Promise.all(Array.from({length:4},lane));result.finishedAt=new Date().toISOString();save();}finally{db.close();await network.close();await parsers.close();}
