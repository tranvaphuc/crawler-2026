import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
const root='outputs/customer-layout-repair-20261118';
const main=JSON.parse(await fs.readFile(root+'/pipeline-results.json'));
const alias=JSON.parse(await fs.readFile(root+'/vov-alias-proof/pipeline-results.json'));
const docs=[...main.docs,...alias.docs];
const env=dotenv.parse(await fs.readFile('/etc/news-flow/news.env'));
const es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:30000});
const rows=[];
try{
 for(const d of docs){
  try{
   const hit=await es.get({index:d.index,type:'newsTopic',id:d.id});
   const s=hit._source, fields=['url','siteName','title','publishedDate'];
   const mismatches=fields.filter(k=>s[k]!==d[k]);
   rows.push({site:d.siteName,url:d.url,index:d.index,id:d.id,found:true,version:hit._version,mismatches,contentLength:s.content?.length||0,publishedDate:s.publishedDate});
  }catch(e){if(e.status===404||e.statusCode===404)rows.push({site:d.siteName,url:d.url,index:d.index,id:d.id,found:false});else throw e;}
 }
 const repairs=JSON.parse(await fs.readFile(root+'/two-es-repair.json'));
 for(const r of repairs.results){
  const hit=await es.get({index:r.index,type:'newsTopic',id:r.id});
  r.readbackVerified=r.field==='content'?hit._source.content.length===r.after.length:hit._source.publishedDate===r.after;
  r.readbackVersion=hit._version;
 }
 const result={checkedAt:new Date().toISOString(),rows,repairs:repairs.results,paidAiCalls:0};
 await fs.writeFile(root+'/es-final-verification.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({documents:rows.length,found:rows.filter(r=>r.found).length,mismatches:rows.filter(r=>r.mismatches?.length),repairs:result.repairs}));
}finally{es.close();}
