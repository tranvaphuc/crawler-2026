import 'dotenv/config';
import fs from 'node:fs/promises';
import ES from 'elasticsearch';
import {Client} from '@opensearch-project/opensearch';
import axios from 'axios';
import * as cheerio from 'cheerio';
const url='https://suckhoecong.vn/nguyen-nhan-viem-hong-keo-dai-va-cach-khac-phuc-trieu-chung-viem-hong-d104794.html';
const clusters=await Promise.all(['ES5','ES7'].map(async cluster=>{
 const es=cluster==='ES5'?new ES.Client({host:process.env.ES5_HOST,apiVersion:'5.6',log:[],requestTimeout:60000,maxRetries:0}):new Client({node:process.env.ES7_HOST,requestTimeout:60000,maxRetries:0});
 try{
  const body={size:100,query:{bool:{filter:[{term:{siteName:'suckhoecong.vn'}},{term:{'ds.source':'news-flow-http'}}]}},_source:['title','url','publishedDate','insertedDate','siteName','ds.source']};
  if(cluster==='ES7')body.track_total_hits=true;
  const response=await es.search({index:'master*,topic*',body}),r=response.body||response;
  if(r.timed_out||r._shards.failed)throw Error('Incomplete search');
  return {cluster,total:r.hits.total,articles:r.hits.hits.map(h=>({index:h._index,id:h._id,...h._source})),targetCopies:r.hits.hits.filter(h=>h._source.url===url).length};
 }finally{await es.close();}
}));
const {data:html}=await axios.get(url,{timeout:20000});const $=cheerio.load(html);
const clock=$('section.box-author .info-author > ul > li:first-child').text().trim();
const result={at:new Date().toISOString(),original:{url,clock,timezone:'UTC+7 (user confirmed)',expectedUtc:'2026-11-16T02:49:00.000Z'},clusters};
for(const cluster of clusters)cluster.targetTimeMatches=cluster.articles.filter(a=>a.url===url).every(a=>(typeof a.publishedDate==='number'?new Date(a.publishedDate).toISOString():a.publishedDate)===result.original.expectedUtc)&&cluster.targetCopies>0;
await fs.writeFile('outputs/suckhoecong-live-recheck/104794-final.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
