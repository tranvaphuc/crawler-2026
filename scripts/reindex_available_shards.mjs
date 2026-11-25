import fs from 'node:fs/promises';
import {Client} from '@opensearch-project/opensearch';
import {isDeepStrictEqual} from 'node:util';
import {loadMigrationContext,requireSuccess} from './lib/master_migration_lib.mjs';
const {env,es7,es8Request:req}=await loadMigrationContext();
const src=new Client({node:env.ES7_11_HOST,requestTimeout:180000,maxRetries:2});
const dir='output/reindex-profile-author-es711',file=`${dir}/available-state.json`;
const api=async(m,p,b)=>requireSuccess(p,await req(m,p,b));
const save=async s=>{await fs.writeFile(`${file}.tmp`,JSON.stringify(s,null,2));await fs.rename(`${file}.tmp`,file);};
const u=new URL(env.ES7_11_HOST),remote={host:u.origin,connect_timeout:'30s',socket_timeout:'180s'};
if(u.username){remote.username=decodeURIComponent(u.username);remote.password=decodeURIComponent(u.password);}
try{
 if(process.argv[2]==='start'){
  try{await fs.access(file);throw new Error('State exists; refusing duplicate launch');}catch(e){if(e.code!=='ENOENT')throw e;}
  const s={startedAt:new Date().toISOString(),scope:'Only available source shards; missing shards excluded with user approval',indices:{}};
  await save(s);
  for(const [index,shards]of [['profile2021',[0,1]],['author2020',[2]]]){
   const meta=(await src.indices.get({index})).body[index];
   const state=s.indices[index]={status:'preparing',refresh:meta.settings.index.refresh_interval??'1s',jobs:[]};await save(s);
   const settings=structuredClone(meta.settings.index);
   for(const k of ['uuid','version','creation_date','provided_name','history','blocks','routing','allocation'])delete settings[k];
   settings.refresh_interval='-1';settings.number_of_replicas='0';
   const check=await req('GET',`/${index}`);if(check.status!==404)throw new Error(`${index}: destination exists or inaccessible (${check.status})`);
   // Resolve routing keys to exactly one active shard before creating aliases.
   for(const shard of shards){
    let routing;
    for(let n=0;n<100;n++){
     const key=`migration-${n}`;
     const found=(await src.searchShards({index,routing:key})).body.shards;
     if(found.length===1&&found[0]?.[0]?.shard===shard){routing=key;break;}
    }
    if(!routing)throw new Error(`Could not select ${index}/${shard}`);
    const alias=`migration_es8_${index}_s${shard}_20260922`;
    const exists=(await src.indices.existsAlias({name:alias})).body;
    if(exists)throw new Error(`Alias already exists: ${alias}`);
    await src.indices.updateAliases({body:{actions:[{add:{index,alias,search_routing:routing}}]}});
    const count=(await src.count({index:alias})).body;
    if(count._shards.failed||count._shards.total!==1||count._shards.successful!==1)throw new Error(`Alias ${alias} shard check failed`);
    const job={shard,alias,routing,count:count.count,status:'prepared'};state.jobs.push(job);await save(s);
    const probe=await api('POST','/_reindex?wait_for_completion=true',{source:{remote,index:alias,query:{match_none:{}}},dest:{index,op_type:'create'}});
    if(probe.failures?.length)throw new Error('Remote alias probe failed');
   }
   await api('PUT',`/${index}`,{settings:{index:settings},mappings:meta.mappings});
   const samples=[];
   for(const job of state.jobs){samples.push(...(await src.search({index:job.alias,body:{size:10,sort:['_doc']}})).body.hits.hits);}
   await fs.writeFile(`${dir}/${index}-available-samples.json`,JSON.stringify(samples),{mode:0o600});
   for(const job of state.jobs){
    const task=await api('POST','/_reindex?wait_for_completion=false&requests_per_second=-1&scroll=30m',{source:{remote,index:job.alias,size:2000},dest:{index,op_type:'create'}});
    job.task=task.task;job.status='running';await save(s);
    console.log(JSON.stringify({index,...job}));
   }
   state.status='running';await save(s);
  }
 }else{
  do{
   const s=JSON.parse(await fs.readFile(file,'utf8'));
   for(const [index,state]of Object.entries(s.indices)){
    if(state.status!=='running')continue;
    for(const job of state.jobs){
     if(job.status!=='running')continue;
     const t=await api('GET',`/_tasks/${encodeURIComponent(job.task)}`);
     job.progress=t.task?.status??job.progress;
     if(t.completed){job.result=t.response??t.error;job.status=t.error||t.response?.failures?.length||t.response?.version_conflicts?'failed':'copied';}
    }
    if(state.jobs.every(j=>j.status!=='running')){
     await api('PUT',`/${index}/_settings`,{index:{refresh_interval:state.refresh}});await api('POST',`/${index}/_refresh`);
     state.destinationCount=(await api('GET',`/${index}/_count`)).count;
     const samples=JSON.parse(await fs.readFile(`${dir}/${index}-available-samples.json`,'utf8'));
     const docs=(await api('POST',`/${index}/_mget`,{docs:samples.map(h=>({_id:h._id,...(h._routing?{routing:h._routing}:{})}))})).docs;
     state.samplesMatched=docs.filter((d,i)=>d.found&&isDeepStrictEqual(d._source,samples[i]._source)).length;
     state.status=state.jobs.every(j=>j.status==='copied')&&state.destinationCount===state.jobs.reduce((n,j)=>n+j.result.total,0)&&state.samplesMatched===samples.length?'verified_available_data':'needs_review';
     await src.indices.updateAliases({body:{actions:state.jobs.map(j=>({remove:{index,alias:j.alias}}))}});
     state.aliasesRemoved=true;
    }
   }
   s.checkedAt=new Date().toISOString();await save(s);
   console.log(JSON.stringify(s));
   if(process.argv[2]!=='watch'||!Object.values(s.indices).some(x=>x.status==='running'))break;
   await new Promise(r=>setTimeout(r,30000));
  }while(true);
 }
}catch(e){console.error(e.message);process.exitCode=1;}finally{await src.close();await es7.close();}
