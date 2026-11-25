import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {classifyNewsSourceHit} from '../src/newsFlow/sourceInventory.mjs';
const root=path.resolve('outputs/news-es5-source-expansion-2026-11-16'),read=async name=>JSON.parse(await fs.readFile(path.join(root,name))),save=async(n,v)=>fs.writeFile(path.join(root,n),JSON.stringify(v,null,2));
const env=dotenv.parse(await fs.readFile('/etc/news-flow/news.env')),es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:120000});
let scrollId;
try{
 const primary=await read('query.json'),inserted=await read('inserted-summary.json'),registry=await loadNewsRegistry(),forums=new Set(await read('known-forums.json'));
 const indices=[...new Set([...primary.indices,...inserted.indices])].sort();
 const dates={bool:{should:['publishedDate','insertedDate'].map(field=>({range:{[field]:{gte:primary.since,lte:primary.asOf}}})),minimum_should_match:1}};
 const filter=[{term:{'ds.source':'crawler-v7-news-topic-2'}},dates];
 const candidates=new Map(),covered=new Map(),excluded=new Map();let total=0,expected=0;
 for(let offset=0;offset<indices.length;offset+=40){
  let result=await es.search({index:indices.slice(offset,offset+40).join(','),scroll:'1m',body:{size:1000,sort:['_doc'],query:{bool:{filter}},_source:['siteName','siteId','url','title','publishedDate','insertedDate','ds.source']},requestTimeout:120000});
  expected+=result.hits.total;
  while(true){
   scrollId=result._scroll_id;
   if(result.timed_out||result._shards.failed)throw Error('ES_SOURCE_SCROLL_INCOMPLETE');
   if(!result.hits.hits.length)break;
   for(const hit of result.hits.hits){
    total++;const row=classifyNewsSourceHit(hit,registry,forums),key=row.domain||row.siteName;
    const target=row.state==='candidate'?candidates:row.state==='already_configured'?covered:excluded;
    const item=target.get(key)||{domain:row.domain,url:'https://'+row.domain+'/',state:row.state,source:row.source,reason:row.reason,latestBrowserStatus:'new_from_es5_crawler_v7_news_topic_2',latestBrowserReason:'Missing from current news registry',documentCount:0,siteNames:[],sampleUrls:[],masterExamples:[]};
    item.documentCount++;if(!item.siteNames.includes(row.siteName))item.siteNames.push(row.siteName);
    if(hit._source?.url&&!item.sampleUrls.includes(hit._source.url)&&item.sampleUrls.length<12){item.sampleUrls.push(hit._source.url);item.masterExamples.push(hit);}
    target.set(key,item);
   }
   result=await es.scroll({scrollId,scroll:'1m',requestTimeout:120000});
  }
  await es.clearScroll({scrollId});scrollId=null;
  console.log(JSON.stringify({phase:'collect_all_urls',indices:Math.min(offset+40,indices.length),totalIndices:indices.length,documents:total,candidateSites:candidates.size}));
 }
 if(total!==expected)throw Error('ES_SOURCE_DOCUMENT_COVERAGE_MISMATCH');
 const list=[...candidates.values()].sort((a,b)=>b.documentCount-a.documentCount);
 await save('candidates.json',list);await save('already-configured.json',[...covered.values()]);await save('excluded.json',[...excluded.values()]);
 const summary={checkedAt:new Date().toISOString(),since:primary.since,asOf:primary.asOf,dateFields:['publishedDate','insertedDate'],source:'crawler-v7-news-topic-2',matchedDocuments:total,indices:indices.length,candidateSites:list.length,existingSites:covered.size,excludedSites:excluded.size,excluded:[...excluded.values()].reduce((a,x)=>(a[x.reason]=(a[x.reason]||0)+1,a),{}),paidAiCalls:0,esWrites:0};
 await save('scope-summary.json',summary);console.log(JSON.stringify(summary));
}catch(error){console.log(JSON.stringify({error:error.code||error.name,reason:String(error.body?.error?.reason||error.message).replace(/https?:\/\/[^\s]+/g,'[endpoint]')}));process.exitCode=1;}finally{if(scrollId)await es.clearScroll({scrollId}).catch(()=>{});es.close();}
