import fs from 'node:fs/promises';
import { Client } from '@opensearch-project/opensearch';
import { loadMigrationContext, requireSuccess } from './lib/master_migration_lib.mjs';
const {env,es7:unused,es8Request:req}=await loadMigrationContext();
const src=new Client({node:env.ES7_11_HOST,maxRetries:2,requestTimeout:180000});
const indices=['profile2021','author2020'];
const dir='output/reindex-profile-author-es711';
await fs.mkdir(dir,{recursive:true});
const unwrap=r=>r.body??r;
try {
 const info=unwrap(await src.info());
 const dest=requireSuccess('destination info',await req('GET','/'));
 console.log(JSON.stringify({sourceVersion:info.version.number,destinationVersion:dest.version.number}));
 for(const index of indices){
  const [meta,count,stats,target]=await Promise.all([src.indices.get({index}).then(unwrap),src.count({index}).then(unwrap),src.indices.stats({index,metric:['docs','store']}).then(unwrap),req('GET',`/${index}`)]);
  await fs.writeFile(`${dir}/${index}-source.json`,JSON.stringify(meta[index],null,2));
  await fs.writeFile(`${dir}/${index}-destination.json`,JSON.stringify(target,null,2));
  console.log(JSON.stringify({index,count:count.count,bytes:stats.indices[index].primaries.store.size_in_bytes,mapping:meta[index].mappings,settings:meta[index].settings,destinationStatus:target.status}));
  if(target.status===200)console.log(JSON.stringify({index,destinationCount:await req('GET',`/${index}/_count`)}));
 }
 console.log(JSON.stringify({allocation:await req('GET','/_cat/allocation?format=json&bytes=gb&h=node,shards,disk.avail,disk.percent'),tasks:await req('GET','/_tasks?actions=*reindex&detailed=false')}));
} catch(e){console.error(e.message);process.exitCode=1;} finally {await src.close();await unused.close();}
