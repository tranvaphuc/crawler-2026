import fs from 'node:fs/promises';import path from 'node:path';import dotenv from 'dotenv';import ES from 'elasticsearch';
import {legacyNewsId,legacyForumTopicId,legacyForumCommentId,weeklyIndex} from '../src/web/newsParser.mjs';
dotenv.config({quiet:true});const root=path.resolve('outputs/news-forum-research-2026-11-09');
const scope=JSON.parse(await fs.readFile(path.join(root,'master-scope.json'),'utf8'));
const docs=JSON.parse(await fs.readFile(path.join(root,'pilot-antt-round1/documents.json'),'utf8'));
const client=new ES.Client({host:process.env.ES5_HOST,log:[],requestTimeout:60000,maxRetries:0});
try{
 const r=process.argv.includes('--resume')?JSON.parse(await fs.readFile(path.join(root,'pilot-master-url-matches.json'),'utf8')):await client.search({index:scope.indices.join(','),type:'newsTopic',body:{size:10000,query:{bool:{filter:[{term:{siteName:'antt.vn'}},{terms:{url:docs.map(d=>d._source.url)}}]}},_source:['siteName','siteId','title','url','publishedDate','insertedDate','author','authorId','picture'],sort:['_doc']}});
 await fs.writeFile(path.join(root,'pilot-master-url-matches.json'),JSON.stringify(r,null,2));
 const groups=new Map();for(const h of r.hits.hits){if(!groups.has(h._source.url))groups.set(h._source.url,[]);groups.get(h._source.url).push(h);}
 const current=weeklyIndex(new Date().toISOString());const selectedIndex=scope.indices.includes(current)?current:scope.indices.filter(n=>/^master\d{6}$/.test(n)&&n<=current).sort().reverse()[0];
 const mapping=await client.indices.getMapping({index:selectedIndex});await fs.writeFile(path.join(root,'master-current-mapping.json'),JSON.stringify(mapping,null,2));
 const focus=JSON.parse(await fs.readFile(path.join(root,'master-focus-samples.json'),'utf8'));
 const sampleAudit=[];for(const [label,rows] of Object.entries(focus))for(const h of rows){const s=h._source,news=h._type==='newsTopic',id=news?legacyNewsId({registrableDomain:new URL(s.url).hostname.replace(/^www\./,''),title:s.title,identityUrl:s.url}):h._type==='forumTopic'?legacyForumTopicId(s.url):legacyForumCommentId(s.url);sampleAudit.push({label,index:h._index,type:h._type,id:h._id,idMatches:id===h._id,indexMatches:weeklyIndex(s.publishedDate)===h._index});}
 const summary={checkedAt:new Date().toISOString(),mode:'READ_ONLY',pilotDocuments:docs.length,totalExistingHits:r.hits.total,matchedUrls:groups.size,newUrls:docs.length-groups.size,duplicateMasterUrlGroups:[...groups].filter(([u,h])=>h.length>1).length,matchingLegacyIds:r.hits.hits.filter(h=>legacyNewsId({registrableDomain:'antt.vn',title:h._source.title,identityUrl:h._source.url})===h._id).length,timedOut:r.timed_out,shards:r._shards,currentMappingIndex:selectedIndex,sampleAudit};
 await fs.writeFile(path.join(root,'master-compatibility-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}catch(e){console.log(JSON.stringify({error:e.body?.error?.type||e.name,reason:String(e.body?.error?.reason||e.message).replace(/https?:\/\/[^\s]+/g,'[endpoint]')}));process.exitCode=1;}finally{client.close();}
