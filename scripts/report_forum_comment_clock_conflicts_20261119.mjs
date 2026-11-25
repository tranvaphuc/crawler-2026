import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {forumIdentity} from '../src/forumFlow/es5.mjs';
import {forumBatchIdentityQuery} from '../src/forumFlow/bulkEs5.mjs';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';
const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite',{readOnly:true}),items=db.prepare("SELECT * FROM forum_documents WHERE role='forumComment' AND export_state='held' AND export_reason='FORUM_EXISTING_PUBLICATION_TIME_DIFFERS'").all().map(row=>({row,doc:JSON.parse(row.doc)})),sites=new Map(JSON.parse(await fs.readFile('config/forum-flow/sites.json')).map(s=>[s.domain,s])),env=dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env')),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',connectionClass:ForumBoundedEsConnection,log:[],maxRetries:0,requestTimeout:120000});
try{
 const result=await es.search({index:'master*',type:'forumComment',filterPath:'timed_out,_shards.failed,hits.total,hits.hits',body:{size:4000,timeout:'90s',query:{constant_score:{filter:forumBatchIdentityQuery(items,sites)}},_source:['url','siteName','publishedDate','parentId','parentDate']}});
 if(result.timed_out||result._shards?.failed||result.hits.total>result.hits.hits.length)throw Error('SEARCH_INCOMPLETE');
 const conflicts=items.map(({row,doc})=>({site:row.site,nativeId:row.native_id,threadId:row.thread_id,provenPublished:doc._source.publishedDate,existing:result.hits.hits.filter(h=>forumIdentity(h._source.url,'forumComment',sites.get(row.site))===forumIdentity(doc._source.url,'forumComment',sites.get(row.site))).map(h=>({index:h._index,id:h._id,published:h._source.publishedDate,differenceSeconds:(Date.parse(h._source.publishedDate)-Date.parse(doc._source.publishedDate))/1000,parentId:h._source.parentId,parentDate:h._source.parentDate}))}));
 console.log(JSON.stringify({at:new Date().toISOString(),conflicts}));
}catch(e){console.log(JSON.stringify({error:e.code||'CONFLICT_REPORT_FAILED'}));process.exitCode=1;}
finally{db.close();es.close();}
