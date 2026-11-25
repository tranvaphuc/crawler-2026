import {MongoClient} from 'mongodb';
import ES from 'elasticsearch';
const runId=process.env.CRAWL_RUN_ID||'october-2026-v8',backupId=`${runId}:held-es5-siteid-20261027`;
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});
const es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:45000,maxRetries:0});
await mongo.connect();
try{
 const db=mongo.db(),backup=await db.collection('crawler_v8_es5_siteid_identity_backups').findOne({_id:backupId});if(!backup)throw Error('BACKUP_MISSING');
 const keys=backup.documents.map(d=>d._id),docs=await db.collection('documents').find({_id:{$in:keys}}).toArray(),current=new Map(docs.map(d=>[d._id,d]));
 const status={};let verified=0,invalid=0,notVisible=0,newlyIndexed=0,existing=0;
 for(const original of backup.documents){const d=current.get(original._id);if(!d){invalid++;continue;}status[d.state]=(status[d.state]||0)+1;
  if(!['indexed','existing'].includes(d.state))continue;
  const index=d.state==='existing'?d.existingIndices?.[0]:d.document?._index;
  if(!index){invalid++;continue;}
  try{const hit=await es.get({index,type:d.document._type,id:d.document._id});if(!hit.found){notVisible++;continue;}
   const own=d.state==='indexed',s=hit._source||{},expected=d.document._source;
   const ok=String(s.siteId)===String(expected.siteId)&&(!own||s.publishedDate===expected.publishedDate&&s.url===expected.url&&s.ds?.source===expected.ds?.source&&s.ds?.ip===expected.ds?.ip);
   if(ok){verified++;if(own)newlyIndexed++;else existing++;}else invalid++;
  }catch(e){if(e.status===404)notVisible++;else throw e;}
 }
 const sources=await db.collection('sources').find({_id:{$in:backup.sources.map(s=>s._id)}},{projection:{_id:1,identityStatus:1,identityVerificationSource:1,type:1}}).toArray();
 const indices=(await es.cat.indices({index:'master2026*',format:'json',h:'index,status'})).filter(x=>x.status==='open'&&/^master2026\d{2}$/.test(x.index)).map(x=>x.index);
 const all=await es.search({index:indices.join(','),ignoreUnavailable:true,size:100,body:{_source:false,timeout:'25s',query:{ids:{values:backup.documents.map(d=>d.document._id)}}}});
 const unique=new Set(all.hits.hits.map(h=>h._type+':'+h._id));
 const uniqueAcrossMaster=all.hits.total===29&&all.hits.hits.length===29&&unique.size===29&&!all.timed_out&&!all._shards?.failed;
 console.log(JSON.stringify({at:new Date().toISOString(),total:backup.documents.length,status,verified,newlyIndexed,existing,invalid,notVisible,uniqueAcrossMaster,sources:sources.map(s=>({type:s.type,status:s.identityStatus,evidence:s.identityVerificationSource||null})),pass:verified===backup.documents.length&&invalid===0&&notVisible===0&&uniqueAcrossMaster}));
}finally{await mongo.close();es.close();}
