import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {parentPort} from 'node:worker_threads';import {performance} from 'node:perf_hooks';import {discoverNewsLinks} from '../web/configurableNewsParser.mjs';
import {classifyNewsDocument} from '../web/newsDocumentKind.mjs';
import {pageIssue} from '../web/configurableNewsParser.mjs';import * as cheerio from 'cheerio';
import {articlePublicationPreflight,linkPublicationHint,urlPublicationHint} from './freshness.mjs';
parentPort.on('message',message=>{
 const input=message.input??message,id=message.input?message.id:undefined,startedAt=Date.now(),started=performance.now();let result;
 try{
  const $=cheerio.load(input.html);
  const issue=['validate','prepare'].includes(input.mode)?pageIssue(input.html,$):null;
  if(input.mode==='validate'||issue)result={issue};
  else{
   const kind=input.article?classifyNewsDocument(input.html,input.url,input.domain,$):null;
   const found=kind?.skip||input.discoverArticles===false?{articles:[]}:discoverNewsLinks(input.html,input.url,{domain:input.domain,allowedHosts:input.config?.allowedHosts,knownArticleUrls:input.config?.validation?.sampleUrls,knownCategoryUrls:input.seeds,legacy:input.legacy},{dom:$,maxCategories:10000});
   if(input.freshness&&input.discoverArticles!==false){const anchors=new Map();$('a[href]').each((i,e)=>{try{const u=new URL($(e).attr('href'),input.url);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|fbclid|gclid/.test(k))u.searchParams.delete(k);anchors.set(u.href,e);}catch{}});for(const link of found.articles){const a=anchors.get(link.url),hint=(a&&linkPublicationHint($,a,link.url,input.config?.timezone))||urlPublicationHint(link.url,input.config?.timezone);if(hint)Object.assign(link,hint);}}
   const publication=input.article&&input.config?articlePublicationPreflight($,input.html,input.url,input.config,{maxAgeHours:input.maxAgeHours}):null;
   result={articles:found.articles,...(!input.article?{categories:found.categories||[]}:{}),...(kind?{kind}:{}),...(publication?{publication}:{}),...(['validate','prepare'].includes(input.mode)?{issue:null}:{})};
  }
  if(input.mode==='prepare'&&input.retainReviewSample!==false&&!result.issue&&!result.error&&input.html.length<=2000000)result.reviewSample={htmlHash:createHash('sha256').update(input.html).digest('hex'),compressed:gzipSync(input.html)};
  result.elapsedMs=performance.now()-started;
 }
 catch{result={error:'NEWS_SEED_LINK_EXTRACTION_FAILED'};}
 parentPort.postMessage({...result,startedAt,completedAt:Date.now(),...(id===undefined?{}:{id})});
});
