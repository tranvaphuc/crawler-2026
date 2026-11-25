import {parseSkydoorWithPublisher} from '../src/web/newsPublisherDispatch.mjs';
import fs from 'node:fs/promises';import path from 'node:path';
import {createNewsResearchTransport as createResearchTransport} from '../src/web/newsResearchTransport.mjs';import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
const arg=k=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:null,domain=arg('--site');if(!domain||!/^[a-z0-9.-]+$/.test(domain))throw Error('--site must be a configured domain');
const file=path.resolve('config/web-sources/news',domain+(domain==='antt.vn'?'.validated':'')+'.json'),config=JSON.parse(await fs.readFile(file,'utf8'));
const out=path.resolve('outputs/news-parser-rollout-2026-11-09/round11-http/runtime',domain,Date.now().toString(36));await fs.mkdir(out,{recursive:true});
const transport=createResearchTransport(config.http||{});try{let context={};const feed=[config.publishedDate,...(config.variants||[]).map(v=>v.publishedDate)].find(d=>d?.strategy==='public_feed')?.feedUrl;
 if(feed){const p=await transport.get(feed,out,'publication-feed',{});if(p.html)context=parsePublicPublicationFeed(p.html,p.finalUrl||feed);await fs.writeFile(path.join(out,'publication-context.json'),JSON.stringify(context,null,2));}
 const url=arg('--url')||context.items?.[0]?.url||config.validation?.sampleUrls?.[0];if(!url)throw Error('No article URL available; supply --url');
 const page=await transport.get(url,out,'article',{});let result;if(config.parserType==='publisher_dispatch'){const dispatched=await parseSkydoorWithPublisher({page,url,transport,directory:out,label:'article'});result=dispatched.parsed||{error:dispatched.error};}else result=page.html&&!page.error?parseConfiguredArticle(page.html,url,config,context):{error:page.error||'missing_html'};
 await fs.writeFile(path.join(out,'parsed.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({domain,url,error:result.error||null,title:result._source?.title,publishedDate:result._source?.publishedDate,dateEvidenceSource:result.extracted?.dateEvidenceSource,dateTimezone:result.extracted?.dateTimezone,dateTimezoneProvenance:result.extracted?.dateTimezoneProvenance,sourceDataQuality:config.sourceDataQuality||null,bodyLength:result.extracted?.bodyLength,media:result.extracted?.media.length,outputDirectory:out,transport:'HTTP/axios',browserUsed:false,es5Written:false,queueCreated:false}));if(result.error)process.exitCode=1;
}finally{await transport.close();}
