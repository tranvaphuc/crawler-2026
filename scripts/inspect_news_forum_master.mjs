import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {weeklyIndex} from '../src/web/newsParser.mjs';
dotenv.config({quiet:true});
const out=path.resolve('outputs/news-forum-research-2026-11-09');await fs.mkdir(out,{recursive:true});
const client=new ES.Client({host:process.env.ES5_HOST,log:[],requestTimeout:120000,maxRetries:0});
const save=async(name,v)=>fs.writeFile(path.join(out,name),JSON.stringify(v,null,2));
try{
 const info=await client.info();
 const all=await client.cat.indices({index:'master*',format:'json',h:'index,status,docs.count'});
 const indices=all.filter(x=>x.status==='open'&&/^master\d{6}$/.test(x.index)).map(x=>x.index).sort().reverse();
 if(!indices.length)throw Error('No open masterYYYYWW indices');
 const recentIndices=indices.filter(n=>{const y=Number(n.slice(6,10)),w=Number(n.slice(10));return y>=2000&&y<=new Date().getFullYear()&&w>=1&&w<=53&&n<=weeklyIndex(new Date().toISOString());}).slice(0,12);
 const mapping=await client.indices.getMapping({index:recentIndices[0]||indices[0]});
 await save('mapping-representative.json',mapping);
 const mappings=Object.values(mapping)[0].mappings;
 const typeNames=['newsTopic','forumTopic','forumComment'];
 const field=typeNames.map(t=>mappings[t]?.properties?.siteName).find(Boolean);
 let aggField=field?.type==='keyword'||field?.index==='not_analyzed'?'siteName':field?.fields?.keyword?'siteName.keyword':field?.fields?.raw?'siteName.raw':'siteName';
 await save('master-scope.json',{checkedAt:new Date().toISOString(),mode:'READ_ONLY',esVersion:info.version.number,indices,types:typeNames,aggregationField:aggField,siteNameMapping:field});
 console.log(JSON.stringify({phase:'scope',indices:indices.length,first:indices[0],last:indices[indices.length-1],aggregationField:aggField}));
 const body={size:0,query:{terms:{_type:typeNames}},aggs:{by_type:{terms:{field:'_type',size:3},aggs:{missing_site_name:{missing:{field:aggField}},sites:{terms:{field:aggField,size:20000,shard_size:20000},aggs:{example:{top_hits:{size:1,_source:['siteName','siteId','url','publishedDate','author','authorId','parentId','parentDate']}}}}}}}};
 await save('aggregation-query.json',body);
 const agg=process.argv.includes('--resume')?JSON.parse(await fs.readFile(path.join(out,'aggregation-results.json'),'utf8')):await client.search({index:indices.join(','),body,requestTimeout:120000});
 await save('aggregation-results.json',agg);
 const inventory=(agg.aggregations?.by_type?.buckets||[]).flatMap(t=>t.sites.buckets.map(s=>({type:t.key,siteName:s.key,docCount:s.doc_count,example:s.example.hits.hits[0]})));
 await save('master-site-inventory.json',inventory);
 console.log(JSON.stringify({phase:'aggregation',total:agg.hits.total,timedOut:agg.timed_out,shards:agg._shards,types:agg.aggregations.by_type.buckets.map(t=>({type:t.key,sites:t.sites.buckets.length,other:t.sites.sum_other_doc_count,errorBound:t.sites.doc_count_error_upper_bound,missing:t.missing_site_name.doc_count}))}));
 const samples={};
 for(const type of typeNames){const r=await client.search({index:type==='newsTopic'?recentIndices.join(','):indices.join(','),type,body:{size:8,query:{range:{publishedDate:{lte:'now'}}},sort:[{publishedDate:{order:'desc',unmapped_type:'date'}}]},requestTimeout:60000});samples[type]=r.hits.hits;console.log(JSON.stringify({phase:'sample',type,count:r.hits.hits.length,fields:Object.keys(r.hits.hits[0]?._source||{})}));}
 const focus={};
 for(const [type,site] of [['newsTopic','vnexpress.net'],['newsTopic','antt.vn'],['forumTopic','voz.vn'],['forumComment','voz.vn']]){const r=await client.search({index:indices.join(','),type,body:{size:4,query:{bool:{filter:[{term:{[aggField]:site}},{range:{publishedDate:{lte:'now'}}}]}},sort:[{publishedDate:{order:'desc',unmapped_type:'date'}}]},requestTimeout:60000});focus[type+'-'+site]=r.hits.hits;}
 await save('master-samples.json',samples);await save('master-focus-samples.json',focus);
 await save('inspection-summary.json',{checkedAt:new Date().toISOString(),mode:'READ_ONLY',indices:indices.length,sitesByType:inventory.reduce((o,r)=>(o[r.type]=(o[r.type]||0)+1,o),{}),timedOut:agg.timed_out,shards:agg._shards});
}catch(e){const error={error:e.body?.error?.type||e.name,reason:String(e.body?.error?.reason||e.message).replace(/https?:\/\/[^\s]+/g,'[endpoint]')};await save('inspection-error.json',error);console.log(JSON.stringify(error));process.exitCode=1;}finally{client.close();}
