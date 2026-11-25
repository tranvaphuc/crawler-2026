import fs from 'node:fs';
import {MongoClient} from 'mongodb';
import {uidLookupUrl} from '../src/services/facebookFindUid.js';
import {authorLookupKeys} from '../src/services/facebookAuthorResolution.js';
import {facebookAuthorProfileKey} from '../src/services/facebookAuthorIdentity.js';
const dir=process.env.LOCAL_UID_DIR||'outputs/local-uid-worker-2026-10-29',op=JSON.parse(fs.readFileSync(dir+'/latest-failed-retry.json'));
const manifest=JSON.parse(fs.readFileSync(op.manifest)),tickets=JSON.parse(fs.readFileSync(op.root+'/tickets.credentials.json')),results=new Map();
for(const line of fs.readFileSync(op.root+'/profile-results.jsonl','utf8').trim().split('\n').filter(Boolean)){const row=JSON.parse(line);results.set(row.key,row);}
const groups=new Map();for(const ticket of tickets){const url=uidLookupUrl(ticket.data.item),key=url&&(facebookAuthorProfileKey(url)||url);if(!groups.has(key))groups.set(key,{key,url,jobIds:[],keys:new Set()});const group=groups.get(key);group.jobIds.push(ticket.id);for(const k of authorLookupKeys({authorOpaqueId:ticket.data.item?.author?.opaqueId,authorUrl:ticket.data.item?.author?.profileUrl}))group.keys.add(k);if(key)group.keys.add(key);}
const resolved=[...groups.values()].filter(g=>/^[1-9]\d*$/.test(results.get(g.key)?.uid||''));
const c=JSON.parse(fs.readFileSync(dir+'/local-connection.credentials.json')),m=new MongoClient(c.mongo,{serverSelectionTimeoutMS:15000,socketTimeoutMS:45000,maxPoolSize:2});await m.connect();
try{
 const facts=new Map(),keys=[...new Set(resolved.flatMap(g=>[...g.keys]))];let offset=0;
 await Promise.all(Array.from({length:2},async()=>{while(offset<keys.length){const i=offset;offset+=1000;for(const row of await m.db().collection('flow_author_identities').find({_id:{$in:keys.slice(i,i+1000)}},{projection:{id:1,evidence:1,checkedAt:1,conflict:1}}).toArray())facts.set(row._id,row);}}));
 const cacheMatches=[],cacheExceptions=[];for(const group of resolved){const proof=results.get(group.key),hits=[...group.keys].map(k=>facts.get(k)).filter(f=>f&&f.conflict!==true&&+new Date(f.checkedAt)>=Date.now()-86400000&&!/^user_confirmed(?:\.|$)/.test(f.evidence||'')),ids=new Set(hits.map(f=>f.id));if(ids.size===1&&ids.has(proof.uid))cacheMatches.push(group);else cacheExceptions.push({key:group.key,uid:proof.uid,validCandidates:hits.length,conflict:ids.size>1});}
 const resolvedKeys=new Set(resolved.map(g=>g.key)),unresolved=[...groups.values()].filter(g=>!resolvedKeys.has(g.key)),reasons={};for(const group of unresolved){const reason=results.get(group.key)?.reason||'PENDING';reasons[reason]=(reasons[reason]||0)+group.jobIds.length;}
 const report={at:new Date(),operationId:op.operationId,snapshotAt:manifest.at,extendedAt:manifest.extendedAt||null,snapshot:manifest.count,uniqueJobIds:new Set(tickets.map(t=>t.id)).size,profiles:groups.size,resolvedProfiles:resolved.length,uniqueUids:new Set(resolved.map(g=>results.get(g.key).uid)).size,resolvedJobs:resolved.reduce((n,g)=>n+g.jobIds.length,0),unresolvedJobs:unresolved.reduce((n,g)=>n+g.jobIds.length,0),unresolvedProfiles:unresolved.length,cacheVerifiedProfiles:cacheMatches.length,cacheVerifiedJobs:cacheMatches.reduce((n,g)=>n+g.jobIds.length,0),cacheExceptions,collection:'flow_author_identities',cacheMaxAgeMs:86400000,reasons};
 fs.writeFileSync(op.root+'/final-audit.json',JSON.stringify(report,null,2),{mode:0o600});
 fs.writeFileSync(op.root+'/unresolved-jobs.csv',['jobId,profileUrl,reason',...unresolved.flatMap(g=>g.jobIds.map(id=>[id,g.url,results.get(g.key)?.reason||'PENDING'].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')))].join('\n')+'\n',{mode:0o600});
 console.log(JSON.stringify({...report,cacheExceptions:cacheExceptions.length}));
}finally{await m.close();}
