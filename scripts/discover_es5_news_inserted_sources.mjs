import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
const root=path.resolve('outputs/news-es5-source-expansion-2026-11-16'),save=async(n,v)=>fs.writeFile(path.join(root,n),JSON.stringify(v,null,2));
const env=dotenv.parse(await fs.readFile('/etc/news-flow/news.env'));
const es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:120000});
try{
 const primary=JSON.parse(await fs.readFile(path.join(root,'query.json'))),filter=[{term:{'ds.source':'crawler-v7-news-topic-2'}},{range:{insertedDate:{gte:primary.since,lte:primary.asOf}}}];
 const indexResponse=await es.search({index:'master*',ignoreUnavailable:true,body:{size:0,query:{bool:{filter}},aggs:{indices:{terms:{field:'_index',size:10000,shard_size:10000}}}},requestTimeout:120000});
 if(indexResponse.timed_out||indexResponse._shards.failed||indexResponse.aggregations.indices.sum_other_doc_count)throw Error('INSERTED_INDEX_SCOPE_INCOMPLETE');
 await save('inserted-index-scope.json',indexResponse);
 const indices=indexResponse.aggregations.indices.buckets.map(i=>i.key),buckets=new Map();let missing=0;
 for(let offset=0;offset<indices.length;offset+=50){
  const body={
   size:0,query:{bool:{filter}},
   aggs:{
    missing:{missing:{field:'siteName'}},
    sites:{terms:{field:'siteName',size:20000,shard_size:20000},aggs:{
     types:{terms:{field:'_type',size:20}},
     example:{top_hits:{size:1,sort:[{publishedDate:{order:'desc',unmapped_type:'date'}}],_source:['siteName','siteId','url','title','publishedDate','insertedDate','ds.source']}}
    }}
   }
  };
  const result=await es.search({index:indices.slice(offset,offset+50).join(','),body,requestTimeout:120000});
  if(result.timed_out||result._shards.failed||result.aggregations.sites.sum_other_doc_count||result.aggregations.sites.doc_count_error_upper_bound)throw Error('INSERTED_SITE_SCOPE_INCOMPLETE');
  missing+=result.aggregations.missing.doc_count;
  for(const b of result.aggregations.sites.buckets){const old=buckets.get(b.key);if(!old)buckets.set(b.key,b);else{old.doc_count+=b.doc_count;const types=new Map(old.types.buckets.map(t=>[t.key,t.doc_count]));for(const t of b.types.buckets)types.set(t.key,(types.get(t.key)||0)+t.doc_count);old.types.buckets=[...types].map(([key,doc_count])=>({key,doc_count}));const hit=b.example.hits.hits[0];if(Date.parse(hit?._source?.publishedDate)>Date.parse(old.example.hits.hits[0]?._source?.publishedDate))old.example=b.example;}}
  console.log(JSON.stringify({phase:'inserted_date',indicesChecked:Math.min(offset+50,indices.length),indices:indices.length,sites:buckets.size}));
 }
 const p=JSON.parse(await fs.readFile(path.join(root,'aggregation.json')));
 for(const b of p.aggregations.sites.buckets){const old=buckets.get(b.key);if(!old)buckets.set(b.key,b);else{const seen=new Set(old.types.buckets.map(t=>t.key));for(const t of b.types.buckets)if(!seen.has(t.key))old.types.buckets.push(t);}}
 await save('combined-site-buckets.json',[...buckets.values()]);
 await save('inserted-summary.json',{since:primary.since,asOf:primary.asOf,dateField:'insertedDate',indices,matchedDocuments:indexResponse.hits.total,siteBuckets:buckets.size,missingSiteName:missing,paidAiCalls:0,esWrites:0});
 if(missing)throw Error('MISSING_SITE_NAME_REQUIRES_REVIEW:'+missing);
 console.log(JSON.stringify({complete:true,indices:indices.length,sites:buckets.size,matchedDocuments:indexResponse.hits.total}));
}catch(e){console.log(JSON.stringify({error:e.code||e.name,reason:String(e.body?.error?.reason||e.message).replace(/https?:\/\/[^\s]+/g,'[endpoint]')}));process.exitCode=1;}finally{es.close();}
