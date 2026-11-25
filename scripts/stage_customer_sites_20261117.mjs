import fs from 'node:fs/promises';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
const root='outputs/customer-sites-20261117',request=JSON.parse(await fs.readFile('config/web-sources/customer-news-sites-20261117.json','utf8'));
if(request.expectedCount!==39||request.sources.length!==39||new Set(request.sources.map(s=>s.domain)).size!==39)throw Error('CUSTOMER_REQUEST_INCOMPLETE');
const registry=await loadNewsRegistry(),rows=[],configs=[];
await fs.mkdir(root+'/staged-configs',{recursive:true});
for(const item of request.sources){
 if(new URL(item.requestedUrl).hostname!==item.domain)throw Error('CUSTOMER_URL_MISMATCH');
 const audit=JSON.parse(await fs.readFile(root+'/audit/'+item.domain+'/result.json','utf8'));
 if(!audit.complete||audit.domain!==item.domain)throw Error('CUSTOMER_AUDIT_INCOMPLETE');
 const existing=registry.byHost(item.domain);
 const redirect=audit.alias||audit.pages.find(p=>p.location&&new URL(p.location,p.url).hostname.replace(/^www\./,'')!==item.domain)?.location||null;
 let sampleApproved=audit.approved;
 if(['e.vnexpress.net','en.vietnamplus.vn'].includes(item.domain)){const replay=JSON.parse(await fs.readFile(root+'/repaired-results.json'));sampleApproved=!!replay.find(r=>r.domain===item.domain)?.qualification.approved;}
 const row={...item,previouslyRegistered:!!existing,registeredSource:existing?.domain||item.domain,httpSamplesApproved:sampleApproved,redirect,evidence:root+'/audit/'+item.domain+'/result.json',reasons:audit.reasons,articleSamples:audit.articles.length,workingSeeds:audit.workingSeeds.map(s=>s.url),status:existing?'existing_registered':sampleApproved?'new_verified':'new_pending_qualification'};
 if(!existing){
  let config;
  if(sampleApproved)config=JSON.parse(await fs.readFile(root+'/audit/'+item.domain+'/approved-config.json'));
  else config={schemaVersion:1,siteName:item.domain,siteId:item.domain,registrableDomain:item.domain,homepage:item.requestedUrl,allowedHosts:[item.domain,'www.'+item.domain],timezone:'Asia/Ho_Chi_Minh',identityEncoding:'latin1',enabled:false,stage:'customer_requested_pending_qualification',requiresTimezoneReviewBeforeWrite:true,publicationValidationPolicy:'strict_native_publication_v1',publicationTimePolicy:'original_clock_required',publicationDatePolicy:'original_only',originalPublicationBlockedReason:'customer_source_not_yet_qualified_20261117',discovery:{homepage:item.requestedUrl,categories:[]},validation:{checkedAt:new Date().toISOString(),sampleUrls:[],fullSiteCycleVerified:false,qualificationApproved:false},customerRequest:{requestedAt:request.requestedAt,requestedDomain:item.domain,requestedUrl:item.requestedUrl,redirectObserved:redirect,evidence:row.evidence,reasons:audit.reasons,paidAiCalls:0}};
  const file=root+'/staged-configs/'+item.domain+'.json';await fs.writeFile(file,JSON.stringify(config,null,2)+'\n');configs.push({domain:item.domain,file,qualified:sampleApproved});
 }
 rows.push(row);
}
const report={checkedAt:new Date().toISOString(),requested:39,audited:rows.length,alreadyRegistered:rows.filter(r=>r.previouslyRegistered).length,newSources:configs.length,newVerified:configs.filter(r=>r.qualified).length,newPending:configs.filter(r=>!r.qualified).length,httpSamplesApproved:rows.filter(r=>r.httpSamplesApproved).length,missingRequestedDomains:[],paidAiCalls:0,rows};
await fs.writeFile(root+'/coverage.json',JSON.stringify(report,null,2)+'\n');await fs.writeFile(root+'/staged-configs.json',JSON.stringify(configs,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined}));
