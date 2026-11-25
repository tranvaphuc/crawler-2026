import fs from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {Client} from '@opensearch-project/opensearch';
import {loadMigrationContext,requireSuccess} from './lib/master_migration_lib.mjs';
const {env,es7,es8Request:req}=await loadMigrationContext();
const src=new Client({node:env.ES7_11_HOST,requestTimeout:180000,maxRetries:2});
const dir='output/reindex-profile-author-es711', file=`${dir}/remote-state.json`;
const unwrap=r=>r.body??r;
const api=async(m,p,b)=>requireSuccess(p,await req(m,p,b));
const save=async s=>{await fs.writeFile(`${file}.tmp`,JSON.stringify(s,null,2));await fs.rename(`${file}.tmp`,file);};
try {
 if(process.argv[2]==='start'){
  try{await fs.access(file);throw new Error('State exists; use status/watch, do not launch duplicate jobs');}catch(e){if(e.code!=='ENOENT')throw e;}
  const u=new URL(env.ES7_11_HOST),remote={host:u.origin,connect_timeout:'30s',socket_timeout:'180s'};
  if(u.username){remote.username=decodeURIComponent(u.username);remote.password=decodeURIComponent(u.password);}
  await api('POST','/_reindex?wait_for_completion=true',{source:{remote,index:'author2020',query:{match_none:{}}},dest:{index:'author2020',op_type:'create'}});
  console.log('Remote connectivity verified');
  const s={startedAt:new Date().toISOString(),indices:{}};
  for(const index of ['profile2021','author2020']){
   const target=await req('GET',`/${index}`);
   if(target.status!==404)throw new Error(`${index}: destination must be absent, got ${target.status}`);
   const metadata=unwrap(await src.indices.get({index}))[index];
   await fs.writeFile(`${dir}/${index}-source.json`,JSON.stringify(metadata,null,2));
   if(metadata.mappings._source?.enabled===false)throw new Error(`${index}: _source disabled`);
   const settings=structuredClone(metadata.settings.index);
   for(const key of ['uuid','version','creation_date','provided_name','history','blocks','routing','allocation'])delete settings[key];
   const refresh=settings.refresh_interval??'1s';
   settings.refresh_interval='-1';settings.number_of_replicas='0';
   await api('PUT',`/${index}`,{settings:{index:settings},mappings:metadata.mappings});
   const sample=unwrap(await src.search({index,body:{size:20,sort:['_doc']}})).hits.hits;
   await fs.writeFile(`${dir}/${index}-verification-samples.json`,JSON.stringify(sample),{mode:0o600});
   s.indices[index]={status:'created',sourceCount:unwrap(await src.count({index})).count,refresh,replicas:metadata.settings.index.number_of_replicas??'0'};
   await save(s);
   const task=await api('POST','/_reindex?wait_for_completion=false&requests_per_second=-1&scroll=30m',{source:{remote,index,size:2000},dest:{index,op_type:'create'}});
   s.indices[index].task=task.task;s.indices[index].status='running';await save(s);
   console.log(JSON.stringify({index,...s.indices[index]}));
  }
 }else{
  do{
   const s=JSON.parse(await fs.readFile(file,'utf8'));
   for(const [index,state]of Object.entries(s.indices)){
    if(state.status!=='running')continue;
    const t=await api('GET',`/_tasks/${encodeURIComponent(state.task)}`);
    state.progress=t.task?.status??state.progress;state.checkedAt=new Date().toISOString();
    if(t.completed){
     state.result=t.response??t.error;
     await api('PUT',`/${index}/_settings`,{index:{refresh_interval:state.refresh,number_of_replicas:state.replicas}});
     await api('POST',`/${index}/_refresh`);
     state.destinationCount=(await api('GET',`/${index}/_count`)).count;
     state.sourceCountAfter=unwrap(await src.count({index})).count;
     state.status=t.error||t.response?.failures?.length||t.response?.version_conflicts?'failed':'copied';
     if(state.status==='copied'){
      const samples=JSON.parse(await fs.readFile(`${dir}/${index}-verification-samples.json`,'utf8'));
      const docs=(await api('POST',`/${index}/_mget`,{docs:samples.map(h=>({_id:h._id,...(h._routing?{routing:h._routing}:{})}))})).docs;
      state.samplesMatched=docs.filter((d,i)=>d.found&&isDeepStrictEqual(d._source,samples[i]._source)).length;
      state.status=state.destinationCount===t.response.total&&state.samplesMatched===samples.length?'verified':'needs_review';
     }
    }
    await save(s);
   }
   console.log(JSON.stringify(s));
   if(process.argv[2]!=='watch'||!Object.values(s.indices).some(x=>x.status==='running'))break;
   await new Promise(r=>setTimeout(r,30000));
  }while(true);
 }
}catch(e){console.error(e.message);process.exitCode=1;}finally{await src.close();await es7.close();}
