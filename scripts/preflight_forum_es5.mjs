import fs from 'node:fs/promises';import path from 'node:path';import dotenv from 'dotenv';import ES from 'elasticsearch';import {createHash} from 'node:crypto';
import {legacyForumTopicId,legacyForumCommentId,weeklyIndex} from '../src/web/newsParser.mjs';
const env={...dotenv.parse(await fs.readFile('.env')),...process.env};if(!env.ES5_HOST)throw Error('ES5_HOST_MISSING');
const es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:30000});
const target=process.argv[2]||'outputs/forum-flow-es5-preflight-2026-11-17.json';
try{const info=await es.info();const samples=[];
 for(const type of ['forumTopic','forumComment']){const r=await es.search({index:'master*',type,ignoreUnavailable:true,body:{size:3,query:{exists:{field:'url'}},sort:[{publishedDate:{order:'desc',unmapped_type:'date'}}],_source:['url','publishedDate','parentDate','parentId','siteName']}});if(r.timed_out||r._shards.failed||!r.hits.hits.length)throw Error('FORUM_ES5_SAMPLE_INCOMPLETE');
  for(const h of r.hits.hits){const date=h._source.publishedDate;const id=type==='forumTopic'?legacyForumTopicId(h._source.url):legacyForumCommentId(h._source.url);samples.push({type,index:h._index,id:h._id,url:h._source.url,idMatches:id===h._id,indexMatches:weeklyIndex(date)===h._index});}
 }
 const verified=String(info.version.number).startsWith('5.6.')&&samples.every(x=>x.idMatches&&x.indexMatches);
 const proof={checkedAt:new Date().toISOString(),readOnly:true,verified,esVersion:info.version.number,clusterFingerprint:createHash('sha256').update(info.cluster_uuid).digest('hex'),samples};await fs.mkdir(path.dirname(path.resolve(target)),{recursive:true});await fs.writeFile(target,JSON.stringify(proof,null,2));console.log(JSON.stringify({verified,samples:samples.length,idMatches:samples.filter(s=>s.idMatches).length,indexMatches:samples.filter(s=>s.indexMatches).length}));if(!verified)process.exitCode=1;
}catch(e){console.error(JSON.stringify({error:e.body?.error?.type||e.code||'FORUM_PREFLIGHT_FAILED'}));process.exitCode=1;}finally{es.close();}
