import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import axios from 'axios';
import http from 'node:http';
import https from 'node:https';
import {parseListing,parseNewsArticle,allowedUrl} from '../src/web/newsParser.mjs';
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
const config=JSON.parse(await fs.readFile(arg('--config','config/web-sources/news/antt.vn.json'),'utf8'));
const root=path.resolve(arg('--output','outputs/news-forum-research-2026-11-09/pilot-antt'));
await fs.mkdir(path.join(root,'raw'),{recursive:true});
const started=Date.now(),deadline=started+config.cycleDeadlineMs;
const client=axios.create({proxy:false,timeout:config.requestTimeoutMs,maxRedirects:5,maxContentLength:15000000,httpAgent:new http.Agent({keepAlive:true,maxSockets:config.originConcurrency}),httpsAgent:new https.Agent({keepAlive:true,maxSockets:config.originConcurrency}),headers:{'User-Agent':'Mozilla/5.0 (compatible; NewsParserResearch/1.0)','Accept-Language':'vi,en;q=0.9','Accept':'text/html,application/xhtml+xml'}});
let nextStart=0,requestCount=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fetches=[],failures=[],listingResults=[],articles=new Map(),documents=[],unavailable=[];
async function get(url,kind){
 let last;
 for(let attempt=1;attempt<=config.maxAttempts;attempt++){
  const start=Math.max(Date.now(),nextStart);nextStart=start+config.minRequestIntervalMs;await sleep(Math.max(0,start-Date.now()));
  if(Date.now()>=deadline)throw Error('cycle_deadline_exceeded');
  requestCount++;const t=Date.now();
  try{const r=await client.get(url,{timeout:Math.min(config.requestTimeoutMs,deadline-Date.now())});const final=r.request.res.responseUrl||url;if(!allowedUrl(final,url,config))throw Error('Unexpected cross-origin redirect');if(typeof r.data!=='string'||r.data.length<200)throw Error('Empty/non-HTML response');const key=crypto.createHash('sha256').update(url).digest('hex');await fs.writeFile(path.join(root,'raw',key+'.html'),r.data);fetches.push({url,kind,attempt,status:r.status,elapsedMs:Date.now()-t,finalUrl:final,rawFile:'raw/'+key+'.html'});return {html:r.data,finalUrl:final};}
  catch(e){last=e;fetches.push({url,kind,attempt,status:e.response?.status||null,elapsedMs:Date.now()-t,error:e.code||e.message});if([401,403,404,410,429].includes(e.response?.status))break;if(attempt<config.maxAttempts)await sleep(500*attempt);}
 }
 throw Error(last?.code||last?.message||'request_failed');
}
async function pool(items,handler){let cursor=0;await Promise.all(Array.from({length:config.originConcurrency},async()=>{while(cursor<items.length){const x=items[cursor++];try{await handler(x);}catch(e){failures.push({url:typeof x==='string'?x:x.url,stage:typeof x==='string'?'article':'listing',error:e.message});}}}));}
function remember(url,listing){if(!articles.has(url))articles.set(url,new Set());articles.get(url).add(listing);}
let fatalError=null;
try{
 const home=await get(config.homepage,'homepage'),first=parseListing(home.html,home.finalUrl,config);
 first.articles.forEach(u=>remember(u,config.homepage));listingResults.push({url:config.homepage,articleCount:first.articles.length,pagination:first.pagination,status:'ok'});
 const seeds=[...new Set([...first.categories,...config.extraSeeds])],queue=seeds.map(url=>({url,seed:url,page:1})),visited=new Set([config.homepage]);
 await fs.writeFile(path.join(root,'discovered-seeds.json'),JSON.stringify(seeds,null,2));
 await pool(queue,async task=>{
  if(visited.has(task.url))return;visited.add(task.url);
  const r=await get(task.url,'listing'),list=parseListing(r.html,r.finalUrl,config);list.articles.forEach(u=>remember(u,task.url));
  let capped=false;
  for(const url of list.pagination){if(task.page<config.maxPaginationDepth&&!visited.has(url)&&!queue.some(x=>x.url===url))queue.push({url,seed:task.seed,page:task.page+1});else if(task.page>=config.maxPaginationDepth&&!visited.has(url))capped=true;}
  listingResults.push({url:task.url,seed:task.seed,page:task.page,articleCount:list.articles.length,pagination:list.pagination,paginationCapped:capped,status:list.articles.length?'ok':'empty_listing'});
 });
 await fs.writeFile(path.join(root,'article-links.json'),JSON.stringify([...articles].map(([url,foundOn])=>({url,foundOn:[...foundOn]})),null,2));
 console.log(JSON.stringify({phase:'discovery',seeds:seeds.length,listings:listingResults.length,uniqueArticleUrls:articles.size,elapsedMs:Date.now()-started}));
 await pool([...articles.keys()],async url=>{const r=await get(url,'article');if(new URL(r.finalUrl).pathname==='/'&&new URL(url).pathname!=='/'){unavailable.push({url,finalUrl:r.finalUrl,status:'redirect_to_homepage',reason:'Bài chuyển về trang chủ, không còn nội dung bài tại URL đã phát hiện'});return;}const doc=parseNewsArticle(r.html,url,config);doc.extracted.foundOn=[...articles.get(url)];documents.push(doc);if(documents.length%25===0)console.log(JSON.stringify({phase:'parse',parsed:documents.length,total:articles.size,elapsedMs:Date.now()-started}));});
}catch(e){fatalError=e.message;}
finally{
 const elapsedMs=Date.now()-started,parserFailed=articles.size-documents.length-unavailable.length;
 const summary={checkedAt:new Date().toISOString(),site:config.siteName,mode:'READ_ONLY_ES5_DRY_RUN',homepage:config.homepage,elapsedMs,deadlineMs:config.cycleDeadlineMs,within15Minutes:elapsedMs<=config.cycleDeadlineMs,listings:listingResults.length,emptyListings:listingResults.filter(l=>l.status==='empty_listing').length,paginationCapped:listingResults.some(l=>l.paginationCapped),discoveredUniqueArticles:articles.size,parsed:documents.length,unavailableArticles:unavailable.length,parserFailed,requests:requestCount,failedTasks:failures.length,fatalError,completedAllDiscovered:!fatalError&&parserFailed===0&&!failures.length,resolvedAllDiscovered:!fatalError&&documents.length+unavailable.length===articles.size&&!failures.length,coverage:'homepage + navigation categories + configured extra seeds + exposed pagination, bounded by maxPaginationDepth; no guarantee for undiscoverable/unlinked/deleted articles',minPublishedDate:documents.map(d=>d._source.publishedDate).sort()[0]||null,maxPublishedDate:documents.map(d=>d._source.publishedDate).sort().slice(-1)[0]||null,authorsFallback:documents.filter(d=>d.extracted.authorWasFallback).length};
 documents.sort((a,b)=>a._source.url.localeCompare(b._source.url));
 const bulk=documents.flatMap(d=>[JSON.stringify({create:{_index:d._index,_type:d._type,_id:d._id}}),JSON.stringify(d._source)]).join('\n')+'\n';
 await Promise.all([['summary.json',summary],['documents.json',documents],['listings.json',listingResults],['requests.json',fetches],['failures.json',failures],['unavailable.json',unavailable]].map(([name,value])=>fs.writeFile(path.join(root,name),JSON.stringify(value,null,2))));
 await fs.writeFile(path.join(root,'es5-bulk-preview.ndjson'),documents.length?bulk:'');
 console.log(JSON.stringify(summary,null,2));client.defaults.httpAgent.destroy();client.defaults.httpsAgent.destroy();
 if(!summary.completedAllDiscovered)process.exitCode=2;
}
