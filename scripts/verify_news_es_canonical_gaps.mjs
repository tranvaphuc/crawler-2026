import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {originalSkydoorUrl} from '../src/web/newsPublisherDispatch.mjs';
import {articleKey,urlAliases} from '../src/newsFlow/identity.mjs';
const root=process.argv[2];
if(!root)throw Error('Coverage workspace required');
const registry=await loadNewsRegistry(),gaps=JSON.parse(await fs.readFile(root+'/historical-gap-check.json','utf8')).filter(row=>!row.hit);
const env=dotenv.parse(await fs.readFile('/etc/news-flow/news.env'));
const es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:90000});
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8')),network=new NewsNetworkPool({workers:2});
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const state={cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}};
const driver=new NewsHttpDriver({state,network,pool,profiles,allowedDomains:registry.allowedDomains,siteCooldown:false});
const results=[];
let cursor=0;
try{
 await Promise.all(Array.from({length:4},async()=>{
  while(cursor<gaps.length){
   const row=gaps[cursor++], source=registry.byUrl(row.url);
   if(!source)continue;
   const page=await driver.get('canonical-gap',row.url,source.config,[],{taskRole:'review',reviewFailed:true});
   if(!page.html||page.error){results.push({...row,error:page.error||'missing_html'});continue;}
   let original;
   if(source.config.parserType==='publisher_dispatch')original=originalSkydoorUrl(page.html,row.url,page.finalUrl);
   else{
    const canonical=cheerio.load(page.html)('link[rel=canonical]').attr('href');
    if(canonical)try{
     const candidate=new URL(canonical,row.url), requested=new URL(row.url);
     if(candidate.hostname===requested.hostname&&decodeURI(candidate.pathname).normalize('NFC')===decodeURI(requested.pathname).normalize('NFC'))original=candidate.href;
    }catch{}
   }
   results.push({...row,original:original&&registry.byUrl(original)?original:null});
  }
 }));
 const eligible=results.filter(row=>row.original);
 for(let offset=0;offset<eligible.length;offset+=10){
  const batch=eligible.slice(offset,offset+10),aliases=[...new Set(batch.flatMap(row=>urlAliases(row.original)))];
  const response=await es.search({index:'master*',type:'newsTopic',body:{size:aliases.length*3,sort:['_doc'],_source:['url','publishedDate'],query:{constant_score:{filter:{terms:{url:aliases}}}}}});
  if(response.timed_out||response._shards.failed||response.hits.total>response.hits.hits.length)throw Error('ES_CANONICAL_GAP_QUERY_INCOMPLETE');
  const hits=new Map(response.hits.hits.map(doc=>[articleKey(doc._source.url),{index:doc._index,id:doc._id,url:doc._source.url,publishedDate:doc._source.publishedDate}]));
  for(const row of batch)row.hit=hits.get(articleKey(row.original))||null;
 }
 await fs.writeFile(root+'/canonical-gap-check.json',JSON.stringify(results,null,2),{mode:0o600});
 console.log(JSON.stringify({checked:results.length,originalFound:eligible.length,indexed:results.filter(row=>row.hit).length,missing:results.filter(row=>!row.hit).length}));
}catch(error){console.log(JSON.stringify({error:error.code||error.displayName||error.message,checked:results.length}));process.exitCode=1;}
finally{await network.close();es.close();}
