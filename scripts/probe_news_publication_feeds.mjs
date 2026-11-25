import fs from 'node:fs/promises';import path from 'node:path';import * as cheerio from 'cheerio';
import {createNewsResearchTransport as createResearchTransport} from '../src/web/newsResearchTransport.mjs';import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
const root=path.resolve(process.argv.includes('--output-root')?process.argv[process.argv.indexOf('--output-root')+1]:'outputs/news-parser-rollout-2026-11-09'),read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const rows=await read(path.join(root,'results.json')),targets=await read(path.join(root,'targets.json'));
const only=process.argv.includes('--domains')?process.argv[process.argv.indexOf('--domains')+1].split(','):null;
const queue=rows.filter(r=>only?only.includes(r.domain):/published_date/.test(r.reason||''));
const transport=createResearchTransport(),run=Date.now().toString(36),log=[];let active=0;
const timer=setInterval(()=>console.log(JSON.stringify({phase:'publication-feeds',checked:log.length,active,remaining:queue.length})),30000);
try{await Promise.all(Array.from({length:3},async()=>{while(queue.length){const row=queue.shift(),site=targets.find(t=>t.domain===row.domain),dir=path.join(root,'sites',row.domain);active++;const report={domain:row.domain,attempts:[]};
 try{const html=await fs.readFile(path.join(dir,'home.html'),'utf8'),$=cheerio.load(html);const candidates=[];
  $('link[type*=rss],link[type*=atom],a[href]').each((i,e)=>{const href=$(e).attr('href');if(href&&(/feed|rss|atom/i.test(href)||e.tagName==='link'))try{const u=new URL(href,site.url);if(u.hostname.replace(/^www\./,'')===site.domain.replace(/^www\./,''))candidates.push(u.href);}catch{}});
  if(/wp-content|wp-includes/.test(html))candidates.push(new URL('/feed/',site.url).href);
  for(const [i,url] of [...new Set(candidates)].slice(0,2).entries()){
   const label=`r3-${run}-publication-feed-${i+1}`,page=await transport.get(url,dir,label,{});
   const context=page.html?parsePublicPublicationFeed(page.html,page.finalUrl||url):null;report.attempts.push({url,error:page.error,items:context?.items.length||0});
   if(!context?.items.length)continue;
   context.sourceMetadataFile=label+'.json';context.feedHtmlFile=page.htmlFile;context.transportMethod=page.method;
   await fs.writeFile(path.join(dir,'publication-context.json'),JSON.stringify(context,null,2));
   let discovery=await read(path.join(dir,'discovery.json')).catch(()=>({}));discovery.articles=[...new Map([...(discovery.articles||[]),...context.items.map(i=>({url:i.url,title:i.title,score:20,fromPublicationFeed:true}))].map(a=>[a.url,a])).values()];
   await fs.writeFile(path.join(dir,'discovery.json'),JSON.stringify(discovery,null,2));report.success={feedUrl:context.feedUrl,items:context.items.length};break;
  }
 }catch(e){report.error=e.message;}active--;log.push(report);await fs.writeFile(path.join(root,'publication-feeds.json'),JSON.stringify(log,null,2));console.log(JSON.stringify(report));
}}));}finally{clearInterval(timer);await transport.close();}
