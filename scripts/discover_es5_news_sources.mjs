import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {weeklyIndex} from '../src/web/newsParser.mjs';

const root=path.resolve('outputs/news-es5-source-expansion-2026-11-16');
await fs.mkdir(root,{recursive:true});
const env=dotenv.parse(await fs.readFile('/etc/news-flow/news.env'));
const es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:120000});
const save=async(name,value)=>fs.writeFile(path.join(root,name),JSON.stringify(value,null,2));
const hostname=value=>{try{const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value),h=u.hostname.toLowerCase().replace(/^www\./,'');return !net.isIP(h)&&h.includes('.')?h:null;}catch{return null;}};
try{
 const startedAt=new Date().toISOString(),since='2026-10-01T00:00:00+07:00',registry=await loadNewsRegistry();
 const knownForums=new Set(JSON.parse(await fs.readFile(path.join(root,'known-forums.json'))));
 const excludedHost=host=>host&&(host==='fireant.vn'||host.endsWith('.fireant.vn')||[...knownForums].some(f=>host===f||host.endsWith('.'+f)));
 const all=await es.cat.indices({index:'master*',format:'json',h:'index,status'});
 const indices=all.filter(i=>i.status==='open'&&/^master\d{6}$/.test(i.index)&&i.index>=weeklyIndex(since)&&i.index<=weeklyIndex(startedAt)).map(i=>i.index).sort();
 if(!indices.length)throw Error('MASTER_DATE_RANGE_INDICES_MISSING');
 const filter=[{term:{'ds.source':'crawler-v7-news-topic-2'}},{range:{publishedDate:{gte:since,lte:startedAt}}}];
 const body={size:0,query:{bool:{filter}},aggs:{types:{terms:{field:'_type',size:50}},missing_site:{missing:{field:'siteName'}},sites:{terms:{field:'siteName',size:20000,shard_size:20000},aggs:{types:{terms:{field:'_type',size:20}},example:{top_hits:{size:1,sort:[{publishedDate:{order:'desc',unmapped_type:'date'}}],_source:['siteName','siteId','url','title','publishedDate','insertedDate','ds.source']}}}}}};
 await save('query.json',{indices,since,asOf:startedAt,body,dateField:'publishedDate',timezone:'Asia/Ho_Chi_Minh'});
 const response=await es.search({index:indices.join(','),body,requestTimeout:120000});
 if(response.timed_out||response._shards.failed)throw Error('INCOMPLETE_ES_SEARCH');
 if(response.aggregations.sites.sum_other_doc_count||response.aggregations.sites.doc_count_error_upper_bound)throw Error('SITE_AGGREGATION_TRUNCATED');
 await save('aggregation.json',response);
 const entries=[],candidates=new Map(),excluded=[],covered=[];
 function owner(host){return registry.byHost(host)||[...registry.sources.values()].find(s=>host===s.config.registrableDomain||host.endsWith('.'+s.config.registrableDomain));}
 for(const bucket of response.aggregations.sites.buckets){
  const hit=bucket.example.hits.hits[0],doc=hit?._source||{},urlHost=hostname(doc.url||''),nameHost=hostname(bucket.key),host=urlHost||nameHost;
  const row={siteName:bucket.key,domain:host,urlHost,nameHost,documentCount:bucket.doc_count,types:bucket.types.buckets.map(t=>t.key),example:hit};entries.push(row);
  if(!host){excluded.push({...row,reason:'invalid_site_and_url_host'});continue;}
  if(excludedHost(host)||excludedHost(nameHost)||row.types.some(t=>/^forum/i.test(t))){excluded.push({...row,reason:host==='fireant.vn'||host.endsWith('.fireant.vn')?'user_excluded_fireant':'user_excluded_forum'});continue;}
  const existing=owner(host);
  if(existing){covered.push({...row,source:existing.domain});continue;}
  const candidate=candidates.get(host)||{domain:host,url:'https://'+host+'/',latestBrowserStatus:'new_from_es5_crawler_v7_news_topic_2',latestBrowserReason:'Not present in running news registry',siteNames:[],documentCount:0,sampleUrls:[],masterExamples:[]};
  candidate.documentCount+=row.documentCount;candidate.siteNames.push(row.siteName);if(doc.url&&!candidate.sampleUrls.includes(doc.url))candidate.sampleUrls.push(doc.url);candidate.masterExamples.push(hit);candidates.set(host,candidate);
 }
 const missingCount=response.aggregations.missing_site.doc_count;
 if(missingCount)throw Error('MISSING_SITE_NAME_REQUIRES_URL_INVENTORY:'+missingCount);
 const list=[...candidates.values()].sort((a,b)=>b.documentCount-a.documentCount);
 await save('inventory.json',entries);await save('candidates.json',list);await save('excluded.json',excluded);await save('already-configured.json',covered);
 const summary={checkedAt:new Date().toISOString(),since,asOf:startedAt,dateField:'publishedDate',indices,source:'crawler-v7-news-topic-2',matchedDocuments:response.hits.total,siteBuckets:entries.length,alreadyConfiguredBuckets:covered.length,newCandidateSites:list.length,excluded:excluded.reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),missingSiteName:missingCount,paidAiCalls:0,esWrites:0};
 await save('inventory-summary.json',summary);console.log(JSON.stringify(summary));
}catch(error){console.log(JSON.stringify({error:error.code||error.name,reason:String(error.body?.error?.reason||error.message).replace(/https?:\/\/[^\s]+/g,'[endpoint]')}));process.exitCode=1;}finally{es.close();}
