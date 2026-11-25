import fs from 'node:fs/promises';import path from 'node:path';import {gunzipSync} from 'node:zlib';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
const root=path.resolve(process.argv[2]||'outputs/news-time-repair-391-2026-11-16'),file=path.join(root,'rollout-manifest.json'),manifest=JSON.parse(await fs.readFile(file,'utf8')),accepted=[],held=[],evidence=[],proposals=new Map();
for(const name of ['repair-summary.json','native-source-summary.json']){const s=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));for(const r of s.results.filter(r=>r.approved))proposals.set(r.domain,r);}
for(const row of manifest.accepted){const config=JSON.parse(await fs.readFile(row.file,'utf8'));if(config.publishedDate.strategy!=='public_feed'){accepted.push(row);continue;}
 const proposal=proposals.get(row.domain),result=JSON.parse(await fs.readFile(path.join(path.dirname(proposal.configFile),'result.json'),'utf8')),report={domain:row.domain,feedUrl:config.publishedDate.feedUrl,checks:[],futureItems:[]};
 for(const p of result.pages||[]){if(![p.url,p.finalUrl].includes(report.feedUrl))continue;const htmlPath=p.htmlPath||p.file;if(!htmlPath)continue;const context=parsePublicPublicationFeed(gunzipSync(await fs.readFile(htmlPath)).toString(),report.feedUrl),at=(await fs.stat(htmlPath)).mtimeMs;report.futureItems.push(...context.items.filter(i=>Date.parse(i.iso)>at+300000).map(i=>({url:i.url,publication:i.iso,raw:i.raw,fetchedAt:new Date(at).toISOString()})));}
 let baseFile='/opt/news-flow/time-repair391-candidate-20261116/config/web-sources/news/'+row.domain+'.json';try{await fs.access(baseFile);}catch{baseFile=baseFile.replace('.json','.validated.json');}const baseline=JSON.parse(await fs.readFile(baseFile,'utf8'));
 // Diagnostic only: an unverified local clock cannot approve a publication,
 // but a conflict with it must prevent accepting a feed as unquestioned truth.
 for(const sample of [...config.strictTimeRepairEvidence.training,...config.strictTimeRepairEvidence.independentHoldouts]){
  const saved=result.checks.find(c=>c.url===sample.url&&c.pass&&c.htmlPath),htmlPath=sample.htmlPath||saved?.htmlPath;if(!htmlPath)continue;
  const html=gunzipSync(await fs.readFile(htmlPath)).toString(),p=parseConfiguredArticle(html,sample.url,{...baseline,publicationValidationPolicy:undefined});if(/publication_selector_points_/.test(p.error||''))continue;
  const original=p.extracted?{iso:p._source.publishedDate,precision:p.extracted.datePrecision,raw:p.extracted.dateEvidence}:p.partial?.date;
  if(!original||!['minute','second'].includes(original.precision))continue;
  const expectedTitle=sample.title||saved?.title,nativeTitle=p._source?.title||p.partial?.title;if(expectedTitle&&nativeTitle!==expectedTitle)continue;
  const sameMinute=Math.floor(Date.parse(original.iso)/60000)===Math.floor(Date.parse(sample.date)/60000);report.checks.push({url:sample.url,nativeRaw:original.raw,nativeDiagnosticDate:original.iso,feedDate:sample.date,sameMinute});
 }
 report.conflicts=report.checks.filter(c=>!c.sameMinute);evidence.push(report);
 if(report.futureItems.length||report.conflicts.length)held.push({domain:row.domain,reason:report.futureItems.length?'FEED_PUBLICATION_IN_FUTURE_REQUIRES_REVIEW':'FEED_CONFLICTS_WITH_ORIGINAL_ARTICLE_CLOCK',evidence:report});else accepted.push(row);
}
manifest.accepted=accepted;manifest.held.push(...held);manifest.feedAgreementRequired=true;await fs.writeFile(file,JSON.stringify(manifest,null,2));await fs.writeFile(path.join(root,'feed-agreement-review.json'),JSON.stringify({at:new Date().toISOString(),feeds:evidence.length,held:held.length,accepted:accepted.length,evidence},null,2));console.log(JSON.stringify({accepted:accepted.length,held:held.map(r=>({domain:r.domain,reason:r.reason}))}));
