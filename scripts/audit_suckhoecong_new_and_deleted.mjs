import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import ES from 'elasticsearch';
import {Client} from '@opensearch-project/opensearch';
import axios from 'axios';
import * as cheerio from 'cheerio';

const root='outputs/suckhoecong-live-recheck';
const manifests={};
const hashes={ES5:'a5bde31cc086a864a57dc9d4abe9d7f69612644d47ed92cb116f28f8841cd365',ES7:'97c836ba53cf64bb9f0a5a5827a274971ed7bccc2ccc26403bd7b44ce4c06165'};
for(const cluster of ['ES5','ES7']){
 const raw=await fs.readFile(`outputs/suckhoecong-delete-20261116/${cluster}-manifest.json`,'utf8');
 if(crypto.createHash('sha256').update(raw).digest('hex')!==hashes[cluster])throw Error('MANIFEST_CHANGED');
 manifests[cluster]=JSON.parse(raw).records;
}
const oldIds=new Set(Object.values(manifests).flat().map(r=>r.id));
const oldUrls=new Set(Object.values(manifests).flat().map(r=>r.source.url));
const query={bool:{filter:[{term:{siteName:'suckhoecong.vn'}},{term:{'ds.source':'news-flow-http'}}]}};
const unwrap=r=>r.body||r;
const results=await Promise.all(['ES5','ES7'].map(async cluster=>{
 const es=cluster==='ES5'?new ES.Client({host:process.env.ES5_HOST,apiVersion:'5.6',log:[],requestTimeout:60000,maxRetries:0}):new Client({node:process.env.ES7_HOST,requestTimeout:60000,maxRetries:0});
 let scrollId;
 try{
  const body={size:1000,query,sort:['_doc'],_source:['title','url','publishedDate','insertedDate','siteName','ds.source']};
  if(cluster==='ES7')body.track_total_hits=true;
  let response=await es.search({index:'master*,topic*',scroll:'2m',body}),total;
  const articles=[];
  while(true){
   const page=unwrap(response);scrollId=page._scroll_id;
   if(page.timed_out||page._shards.failed)throw Error('INCOMPLETE_SEARCH');
   total??=typeof page.hits.total==='number'?page.hits.total:page.hits.total.value;
   if(!page.hits.hits.length)break;
   articles.push(...page.hits.hits.map(h=>({index:h._index,type:h._type,id:h._id,...h._source})));
   response=await es.scroll(cluster==='ES5'?{scrollId,scroll:'2m'}:{body:{scroll_id:scrollId,scroll:'2m'}});
  }
  if(articles.length!==total)throw Error('COUNT_MISMATCH');
  console.log(JSON.stringify({phase:'current_articles_scanned',cluster,total}));
  let originalIdsFound=0,checked=0;
  for(let offset=0;offset<manifests[cluster].length;offset+=1000){
   const batch=manifests[cluster].slice(offset,offset+1000);
   const r=unwrap(await es.mget({body:{docs:batch.map(d=>({_index:d.index,_type:d.type,_id:d.id,_source:false}))}}));
   if(r.docs.length!==batch.length)throw Error('INCOMPLETE_MGET');
   for(const d of r.docs){if(d.error&&d.error.type!=='index_not_found_exception')throw Error('DELETED_ID_LOOKUP_FAILED');if(d.found)originalIdsFound++;checked++;}
  }
  const returnedOld=articles.filter(a=>oldIds.has(a.id)||oldUrls.has(a.url));
  const result={cluster,total,uniqueUrls:new Set(articles.map(a=>a.url)).size,originalDeletedIdsChecked:checked,originalDeletedIdsFound:originalIdsFound,returnedOld,articles};
  console.log(JSON.stringify({phase:'cluster_checked',cluster,total,originalDeletedIdsChecked:checked,originalDeletedIdsFound:originalIdsFound,returnedOld:returnedOld.length}));
  return result;
 }finally{
  if(scrollId)try{await es.clearScroll(cluster==='ES5'?{scrollId}:{body:{scroll_id:[scrollId]}});}catch{}
  await es.close();
 }
}));
const urls=[...new Set(results.flatMap(r=>r.articles.map(a=>a.url)))];
const originals=[];
for(const url of urls){
 try{
  const {data:html}=await axios.get(url,{timeout:25000});const $=cheerio.load(html);
  const clock=$('section.box-author .info-author > ul > li:first-child').text().trim();
  const m=clock.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  const expectedUtc=m?new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+07:00`).toISOString():null;
  originals.push({url,title:$('h1').first().text().trim(),clock,expectedUtc,checkedAt:new Date().toISOString()});
  const id=new URL(url).pathname.match(/[dv](\d+)\.html$/)?.[1]||String(originals.length);
  await fs.writeFile(`${root}/original-${id}.html`,html);
 }catch(e){originals.push({url,error:e.code||'FETCH_FAILED'});}
}
for(const result of results)for(const article of result.articles){
 const original=originals.find(o=>o.url===article.url);
 article.publishedUtc=new Date(article.publishedDate).toISOString();
 article.timeMatchesOriginal=!!original.expectedUtc&&original.expectedUtc===article.publishedUtc;
 article.wasDeleted=oldIds.has(article.id)||oldUrls.has(article.url);
}
const report={at:new Date().toISOString(),timezone:'UTC+7 explicitly confirmed by user',originals,results};
await fs.writeFile(`${root}/new-and-deleted-audit.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
