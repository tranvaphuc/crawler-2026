import fs from 'node:fs/promises';import {MongoClient} from 'mongodb';import ES from 'elasticsearch';import {setTimeout as sleep} from 'node:timers/promises';
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI),es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:45000,maxRetries:0});await mongo.connect();const db=mongo.db(),dir=process.env.CRAWL_DATA_DIR||'/var/lib/crawler-v8';let stop=false;process.on('SIGTERM',()=>stop=true);
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function once(){
 const identities=await db.collection('facebook_author_identities').find({nativeId:/^\d+$/}).toArray(),mappings=Object.fromEntries(identities.map(x=>[x._id,{id:x.nativeId,evidence:x.evidence}]));let repaired=0,conflicts=0;
 const cache=dir+'/facebook-author-uid-cache.json';await fs.writeFile(cache+'.tmp',JSON.stringify({updatedAt:new Date().toISOString(),mappings}),{mode:0o640});await fs.chmod(cache+'.tmp',0o640);await fs.rename(cache+'.tmp',cache);
 for(const identity of identities){
  for await(const d of db.collection('documents').find({'document._type':{$in:['fbPageComment','fbGroupComment','fbUserComment']},$or:[{'document._source.authorId':identity._id},{'raw.author.opaqueId':identity._id,'document._source.authorId':null}]})){
   if(d.document._source.authorId===identity.nativeId)continue;
   const beforeId=d.document._source.authorId,meta=d.document;let esWritten=false;
   try{
    if(['indexed','existing','indexed_author_review'].includes(d.state)){
     const before=await es.get({index:meta._index,type:meta._type,id:meta._id}),author=before._source.authorId;
     if(author!==identity._id&&author!==identity.nativeId)throw Object.assign(Error(),{code:'ES5_AUTHOR_IDENTITY_CONFLICT'});
     if(author!==identity.nativeId){const a={...before._source};delete a.authorId;
      await es.update({index:meta._index,type:meta._type,id:meta._id,version:before._version,body:{doc:{authorId:identity.nativeId}}});
      const after=await es.get({index:meta._index,type:meta._type,id:meta._id}),b={...after._source};delete b.authorId;
      if(after._source.authorId!==identity.nativeId||stable(a)!==stable(b))throw Object.assign(Error(),{code:'ES5_AUTHOR_REPAIR_VERIFICATION_FAILED'});esWritten=true;
     }
    }
    await db.collection('author_identity_repairs').updateOne({_id:d._id},{$setOnInsert:{index:meta._index,type:meta._type,id:meta._id,beforeAuthorId:beforeId,afterAuthorId:identity.nativeId,evidence:identity.evidence,createdAt:new Date()},$set:{verifiedAt:new Date(),esWritten}},{upsert:true});
    await db.collection('documents').updateOne({_id:d._id,'document._source.authorId':beforeId},{$set:{'document._source.authorId':identity.nativeId,'raw.author.id':identity.nativeId,'raw.author.opaqueId':identity._id,'raw.author.idEvidence':identity.evidence,authorIdentityStatus:'verified',authorIdentityRepairedAt:new Date(),...(d.state==='held_author_identity'?{state:'pending',nextAt:new Date()}:d.state==='indexed_author_review'?{state:'indexed'}:{})},$unset:{error:''}});repaired++;
   }catch(e){conflicts++;await db.collection('documents').updateOne({_id:d._id},{$set:{authorIdentityStatus:'repair_failed',authorRepairError:e.code||e.name}});}
  }
 }
 const unresolved=await db.collection('documents').aggregate([{$match:{'document._type':{$in:['fbPageComment','fbGroupComment','fbUserComment']},'document._source.authorId':{$not:/^\d+$/}}},{$group:{_id:'$state',count:{$sum:1}}}]).toArray();
 const report={at:new Date().toISOString(),knownIdentities:identities.length,repairedThisPass:repaired,conflictsThisPass:conflicts,unresolved};await fs.writeFile(dir+'/author-uid-repair-status.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}
try{do{await once();if(!process.argv.includes('--watch'))break;await sleep(30000);}while(!stop);}finally{await mongo.close();es.close();}
