// Use only publisher-declared public post endpoints; freeze before holdouts.
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
const base='/opt/news-flow/current',root='/var/lib/news-flow/qc-20261122';
const {loadNewsRegistry}=await import('file://'+base+'/src/newsFlow/registry.mjs');
const {NewsHttpDriver,NewsProxyPool}=await import('file://'+base+'/src/newsFlow/transport.mjs');
const {createNewsResearchTransport}=await import('file://'+base+'/src/web/newsResearchTransport.mjs');
const {learnNewsConfig}=await import('file://'+base+'/src/web/configurableNewsParser.mjs');
const {NewsRepairPool}=await import('file://'+base+'/src/web/newsRepairPool.mjs');
const {toEs5News}=await import('file://'+base+'/src/newsFlow/identity.mjs');
const registry=await loadNewsRegistry(),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),prior=JSON.parse(fs.readFileSync(root+'/news-audit.json'));
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'}),driver=new NewsHttpDriver({state:{cacheResponses:false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},pool,allowedDomains:registry.allowedDomains,profiles:JSON.parse(fs.readFileSync(base+'/config/web-sources/news-http-profiles.json')),siteCooldown:false,maxWireRequests:40});
const parsers=new NewsRepairPool(1,new URL('file://'+base+'/src/web/newsDeepAuditWorker.mjs')),report={at:new Date().toISOString(),sites:[]};
try{
 for(const domain of ['nhansac.vn','dulichgiaitri.com']){
  const source=registry.sources.get(domain),old=prior.sites.find(s=>s.site===domain),urls=[...new Set([...old.articles.map(a=>a.url),...db.prepare("SELECT url FROM article_links WHERE site=? AND parse_status='fail' ORDER BY first_at DESC LIMIT 8").all(domain).map(r=>r.url)])];
  let config=null;const entry={site:domain,pages:[],approved:false};
  for(const url of urls.slice(0,5)){
   const transportConfig={...source.config,nativePublicationAdapter:'declared_wordpress_post'},transport=createNewsResearchTransport({...transportConfig,taskRole:'article',persistEvidence:false,baseTransport:driver.forCycle('qc-wp-'+domain,transportConfig,{reviewFailed:true,taskRole:'article'})}),page=await transport.get(url,null,'article');
   const p={url,error:page.error||null,statusCode:page.statusCode,independent:!!config};
   if(!page.error&&page.html){const sha=createHash('sha256').update(page.html).digest('hex');p.evidence=root+'/evidence/'+sha+'.html.gz';fs.writeFileSync(p.evidence,gzipSync(page.html));
    if(!config){const learned=learnNewsConfig(page.html,page.finalUrl||url,{domain,url:source.config.homepage,registrableDomain:domain,timezone:source.config.timezone,legacy:{}},{});if(learned.config){config={...source.config,...learned.config,siteName:source.config.siteName,siteId:source.config.siteId,registrableDomain:source.config.registrableDomain,allowedHosts:source.config.allowedHosts,discovery:source.config.discovery,publicationValidationPolicy:'strict_native_publication_v1',publicationTimePolicy:'original_clock_required',publicationDatePolicy:'original_only',requiresTimezoneReviewBeforeWrite:true,nativePublicationAdapter:'declared_wordpress_post',enabled:true,variants:[]};entry.frozenAt=new Date().toISOString();entry.config=config;}}
    if(config){const a=await parsers.run({sample:{domain,url:page.finalUrl||url,html:page.html,kind:'article'},config,context:{},learn:false});try{if(a.error||a.quality?.length||a.fields?.issues?.length||a.policyConflict)throw Error(a.error||'QC_FIELD_ISSUES');p.doc=toEs5News(a.parsed,config);p.contentHash=a.parsed.extracted.contentSha256;}catch(e){p.error=e.code||e.message;}}
   }
   entry.pages.push(p);console.log(JSON.stringify({site:domain,url,error:p.error,parsed:!!p.doc,independent:p.independent}));
   if([403,429].includes(page.statusCode))break;
   const good=entry.pages.filter(p=>p.doc);if(good.length>=3&&good.filter(p=>p.independent).length>=2&&new Set(good.map(p=>p.contentHash)).size===good.length){entry.approved=true;break;}
   await new Promise(r=>setTimeout(r,3000));
  }
  report.sites.push(entry);fs.writeFileSync(root+'/wordpress-holdouts.json',JSON.stringify(report,null,2));
 }
 report.finishedAt=new Date().toISOString();fs.writeFileSync(root+'/wordpress-holdouts.json',JSON.stringify(report,null,2));
}finally{db.close();await parsers.close();}
