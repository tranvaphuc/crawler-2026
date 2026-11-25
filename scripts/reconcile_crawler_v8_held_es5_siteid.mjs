import {MongoClient} from 'mongodb';
import ES from 'elasticsearch';
import {ownCandidate} from '../src/services/crawlerV8IndependentIngest.js';

const apply=process.argv.includes('--apply');
const runId=process.env.CRAWL_RUN_ID||'october-2026-v8';
const targets=[
 {id:'facebook:page:1654649574789989',nativeId:'1654649574789989',type:'page',held:6,mode:'exact_existing'},
 {id:'facebook:user:100000266370644',nativeId:'100000266370644',type:'user',held:17,mode:'unambiguous_siteid'},
 {id:'facebook:user:100004033515778',nativeId:'100004033515778',type:'user',held:6,mode:'unambiguous_siteid'}
];
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});
const es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:45000,maxRetries:0});
await mongo.connect();
try{
 const db=mongo.db(),run=await db.collection('runs').findOne({_id:runId});
 if(!run?.since||!run?.until)throw Error('RUN_WINDOW_MISSING');
 const indices=(await es.cat.indices({index:'master2026*',format:'json',h:'index,status'})).filter(x=>x.status==='open'&&/^master2026\d{2}$/.test(x.index)).map(x=>x.index);
 if(!indices.length)throw Error('MASTER2026_INDICES_MISSING');
 const prepared=[];
 for(const target of targets){
  const source=await db.collection('sources').findOne({_id:target.id});
  if(!source||source.platform!=='facebook'||source.type!==target.type||source.nativeId!==target.nativeId||source.identityStatus!=='unverified'||source.canonicalSourceId)throw Error('SOURCE_STATE_CHANGED');
  const documents=await db.collection('documents').find({runId,kind:'post',sourceId:target.id,state:'held_identity'}).toArray();
  if(documents.length!==target.held||documents.some(d=>d.document?._source?.siteId!==target.nativeId||d.document?._type!==(target.type==='page'?'fbPageTopic':'fbUserTopic')))throw Error('HELD_DOCUMENT_SET_CHANGED');
  const site=await es.search({index:indices.join(','),ignoreUnavailable:true,size:0,body:{timeout:'30s',query:{term:{siteId:target.nativeId}},aggs:{byType:{terms:{field:'_type',size:30}}}}});
  if(site.timed_out||site._shards?.failed)throw Error('ES5_SITEID_READ_INCOMPLETE');
  const counts=Object.fromEntries((site.aggregations?.byType?.buckets||[]).map(x=>[x.key,x.doc_count]));
  if(Object.values(counts).reduce((a,b)=>a+b,0)!==site.hits.total)throw Error('ES5_SITEID_AGG_INCOMPLETE');
  const ids=documents.map(d=>d.document._id),hits=await es.search({index:indices.join(','),ignoreUnavailable:true,size:ids.length*4,body:{_source:['siteId','publishedDate'],timeout:'30s',query:{ids:{values:ids}}}});
  if(hits.timed_out||hits._shards?.failed||hits.hits.total!==hits.hits.hits.length)throw Error('ES5_ID_READ_INCOMPLETE');
  const byId=new Map();for(const hit of hits.hits.hits){const list=byId.get(hit._id)||[];list.push(hit);byId.set(hit._id,list);}
  for(const [id,list] of byId)if(list.length!==1||!ids.includes(id)||String(list[0]._source?.siteId)!==target.nativeId)throw Error('ES5_ID_NOT_UNIQUE_OR_WRONG_SITEID');
  let proof=null;
  if(target.mode==='exact_existing'){
   if(documents.some(d=>byId.get(d.document._id)?.[0]?._type!=='fbPageTopic'))throw Error('PAGE_HELD_ID_TYPE_NOT_PROVEN');
  }else{
   const conflictingPostTypes=(counts.fbPageTopic||0)+(counts.fbGroupTopic||0);
   if((counts.fbUserTopic||0)<2||conflictingPostTypes!==0||documents.some(d=>byId.has(d.document._id)&&byId.get(d.document._id)[0]._type!=='fbUserTopic'))throw Error('USER_SITEID_TYPE_NOT_UNAMBIGUOUS');
   proof={nativeId:target.nativeId,type:target.type,evidence:'es5_siteid_unambiguous_v1',checkedAt:new Date().toISOString(),es5SiteId:{siteId:target.nativeId,matchedType:'fbUserTopic',matchedCount:counts.fbUserTopic,conflictingPostTypes,timedOut:false,failedShards:0,indexPattern:'master2026*'}};
   for(const d of documents.filter(x=>!byId.has(x.document._id)))ownCandidate(d,{...source,identityStatus:'verified',identityProof:proof},null,{since:run.since,until:run.until});
  }
  prepared.push({target,source,documents,counts,hits:byId,proof});
 }
 const summary={at:new Date().toISOString(),mode:apply?'apply':'dry_run',indices:indices.length,sources:prepared.map(x=>({sourceId:x.target.id,mode:x.target.mode,held:x.documents.length,existing:[...x.hits.values()].length,newCandidates:x.documents.length-x.hits.size,es5PostTypes:{page:x.counts.fbPageTopic||0,user:x.counts.fbUserTopic||0,group:x.counts.fbGroupTopic||0}}))};
 if(apply){
  const backup={_id:`${runId}:held-es5-siteid-20261027`,runId,preparedAt:new Date(),sources:prepared.map(x=>x.source),documents:prepared.flatMap(x=>x.documents),summary};
  await db.collection('crawler_v8_es5_siteid_identity_backups').insertOne(backup);
  for(const row of prepared){
   if(row.proof){const result=await db.collection('sources').updateOne({_id:row.target.id,identityStatus:'unverified',nativeId:row.target.nativeId,type:row.target.type},{$set:{identityStatus:'verified',identityProof:row.proof,identityVerificationSource:'es5_siteid_unambiguous_v1',identityVerifiedAt:new Date()}});if(result.modifiedCount!==1)throw Error('SOURCE_CAS_FAILED');}
   for(const d of row.documents){const hit=row.hits.get(d.document._id)?.[0],update=hit?{$set:{state:'existing',existingIndices:[hit._index],sinkReceipt:{policy:'own_fields_create_or_existing_v1',result:'existing',evidence:'es5_exact_typed_id_siteid',at:new Date()},checkedAt:new Date()},$unset:{error:''}}:{$set:{state:'pending',nextAt:new Date(),identityRecoveryEvidence:'es5_siteid_unambiguous_v1'},$unset:{error:''}};
    const result=await db.collection('documents').updateOne({_id:d._id,sourceId:row.target.id,state:'held_identity'},update);if(result.modifiedCount!==1)throw Error('DOCUMENT_CAS_FAILED');}
  }
 }
 console.log(JSON.stringify(summary));
}finally{await mongo.close();es.close();}
