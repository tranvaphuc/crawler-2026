import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {articleKey,urlAliases} from '../src/newsFlow/identity.mjs';

const root=process.argv[2];
if(!root)throw Error('Coverage workspace required');
const rows=(await fs.readFile(root+'/verify-missing.jsonl','utf8')).trim().split('\n').filter(Boolean).map(JSON.parse).filter(row=>row.status==='done');
const env=dotenv.parse(await fs.readFile('/etc/news-flow/news.env'));
const es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:90000});
const results=[];
try{
 for(let at=0;at<rows.length;at+=10){
  const batch=rows.slice(at,at+10);
  const aliases=[...new Set(batch.flatMap(row=>urlAliases(row.url)))];
  const response=await es.search({index:'master*',type:'newsTopic',body:{size:aliases.length*3,sort:['_doc'],_source:['url','publishedDate'],query:{constant_score:{filter:{terms:{url:aliases}}}}}});
  if(response.timed_out||response._shards.failed||response.hits.total>response.hits.hits.length)throw Error('ES_HISTORICAL_GAP_QUERY_INCOMPLETE');
  const found=new Map(response.hits.hits.map(doc=>[articleKey(doc._source.url),{index:doc._index,id:doc._id,publishedDate:doc._source.publishedDate}]));
  for(const row of batch)results.push({...row,hit:found.get(articleKey(row.url))||null});
 }
 await fs.writeFile(root+'/historical-gap-check.json',JSON.stringify(results,null,2),{mode:0o600});
 console.log(JSON.stringify({checked:results.length,indexed:results.filter(row=>row.hit).length,missing:results.filter(row=>!row.hit).length}));
}catch(error){console.log(JSON.stringify({error:error.code||error.displayName||error.message,checked:results.length}));process.exitCode=1;}
finally{es.close();}
