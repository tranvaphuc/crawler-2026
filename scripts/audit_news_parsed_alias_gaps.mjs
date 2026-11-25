import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {ThreeFlowProcessor} from '../src/newsFlow/threeFlowProcessor.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {articleKey,requestKey} from '../src/newsFlow/identity.mjs';

const root=process.argv[2];
if(!root)throw Error('Coverage workspace required');
const registry=await loadNewsRegistry(),memory=await ThreeFlowState.open(':memory:');
const live=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
for(const row of live.prepare('select * from parser_overlays').all())memory.db.prepare('insert into parser_overlays values(?,?,?,?)').run(row.site,row.config,row.revision,row.verified_at);
memory.loadOverlays(registry);
const entries=(await fs.readFile(root+'/admitted.jsonl','utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const rows=[...new Map(entries.map(row=>[articleKey(row.url),row])).values()].slice(24104).filter(row=>row.kind==='publisher_listing');
const receipts=new Set(live.prepare('select url from import_receipts where imported_at>=?').all(Date.now()-86400000).map(row=>articleKey(row.url)));
const status=live.prepare('select parse_status from article_links where parse_key=?');
const jobs=rows.filter(row=>{const key=articleKey(row.url);return !receipts.has(key)&&status.get(key)?.parse_status==='done';});
live.close();
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8'));
const network=new NewsNetworkPool({workers:2}),pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const parsers=new NewsRepairPool(2,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const driver=new NewsHttpDriver({state:memory,network,pool,profiles,allowedDomains:registry.allowedDomains,siteCooldown:false,retryArticleTimeout:true});
const env=dotenv.parse(await fs.readFile('/etc/news-flow/news.env')),es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:0,requestTimeout:30000});
const docs=new Map(),results=[];
const processor=new ThreeFlowProcessor({state:memory,driver,registry,parsers,maxAgeHours:Infinity,expand:true,admitRelated:false,onArticle:({doc,metric})=>docs.set(metric.cycle,doc)});
let cursor=0;
try{
 await Promise.all(Array.from({length:4},async()=>{
  while(cursor<jobs.length){
   const row=jobs[cursor++],cycle='receipt-alias-'+requestKey(row.url);memory.cycle(cycle);
   const insert=memory.db.prepare("insert into tasks(cycle,url,url_key,site,role,priority,state,reason,created) values(?,?,?,?,'article',100,'running','manual_refresh',?)");
   const id=insert.run(cycle,row.url,requestKey(row.url),row.site,Date.now()).lastInsertRowid;
   const task=memory.db.prepare('select * from tasks where id=?').get(id);
   try{await processor.process(task);}catch(error){await processor.hold(task,error.code||error.name);}
   const doc=docs.get(cycle);docs.delete(cycle);
   results.push({...row,original:doc?._source.url||null,expected:doc?{id:doc._id,index:doc._index,publishedDate:doc._source.publishedDate}:null,terminal:memory.db.prepare('select reason from tasks where id=?').get(id)?.reason});
  }
 }));
 const identified=results.filter(row=>row.expected);
 for(let i=0;i<identified.length;i+=100){
  const batch=identified.slice(i,i+100);
  const result=await es.mget({body:{docs:batch.map(row=>({_index:row.expected.index,_id:row.expected.id,_type:'newsTopic',_source:['url','publishedDate']}))}});
  for(const [n,esDoc] of result.docs.entries()){
   const row=batch[n];
   if(esDoc.found&&articleKey(esDoc._source.url)===articleKey(row.original))row.hit={id:esDoc._id,index:esDoc._index,url:esDoc._source.url,publishedDate:esDoc._source.publishedDate};
  }
 }
 await fs.writeFile(root+'/canonical-gap-check-routes.json',JSON.stringify(results,null,2),{mode:0o600});
 console.log(JSON.stringify({checked:results.length,identified:identified.length,indexed:results.filter(r=>r.hit).length,unconfirmed:results.filter(r=>!r.hit).length}));
}finally{es.close();await parsers.close();await network.close();memory.close();}
