import {parentPort,workerData} from 'node:worker_threads';
import {discoverNewsLinks,parseConfiguredArticle,pageIssue} from './configurableNewsParser.mjs';
import {isNewsCategoryUrl} from './newsCategoryPolicy.mjs';
import {legacyNewsId,weeklyIndex} from './newsParser.mjs';
const sources=new Map(workerData.sources.map(s=>[s.domain,s]));
parentPort.on('message',({id,task})=>{
 try{
  let result;
  if(task.kind==='listing'){
   const site=sources.get(task.domain),issue=/json|xml|rss|atom|text\/plain/i.test(task.contentType||'')?null:pageIssue(task.html);
   if(issue)result={error:issue};
   else{const links=discoverNewsLinks(task.html,task.url,site.discoverySite,{maxCategories:Infinity});result={articles:links.articles,categories:links.categories.filter(c=>isNewsCategoryUrl(c.url,site.discoverySite)),sourceKind:links.sourceKind||'html'};}
  }else{
   result=task.domains.map(domain=>{
    const config=sources.get(domain).config,contexts=task.contexts?.[domain]||[{}];let parsed;
    for(const context of contexts){parsed=parseConfiguredArticle(task.html,task.url,config,context);if(!parsed.error)break;}
    if(!parsed.error&&parsed.extracted.publisherRestricted)parsed={error:'publisher_restricted_content_unverified'};
    if(!parsed.error){const d=parsed._source;if(parsed._id!==legacyNewsId({registrableDomain:config.registrableDomain,title:d.title,identityUrl:task.url})||parsed._index!==weeklyIndex(d.publishedDate))parsed={error:'legacy_identity_validation_failed'};}
    return {domain,parsed:parsed.error?null:parsed,error:parsed.error||null};
   });
  }
  parentPort.postMessage({id,result});
 }catch(e){parentPort.postMessage({id,error:e.message||String(e)});}
});
parentPort.postMessage({ready:true});
