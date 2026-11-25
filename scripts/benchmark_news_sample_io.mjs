import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {DatabaseSync} from 'node:sqlite';
const [controlRoot,candidateRoot]=process.argv.slice(2);if(!controlRoot||!candidateRoot)throw Error('TWO_RELEASE_ROOTS_REQUIRED');
const oldModule=await import(pathToFileURL(path.resolve(controlRoot,'src/newsFlow/threeFlowState.mjs'))),newModule=await import(pathToFileURL(path.resolve(candidateRoot,'src/newsFlow/threeFlowState.mjs')));
const live=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});const samples=live.prepare('SELECT html FROM review_samples ORDER BY at DESC LIMIT 32').all().map(r=>Buffer.from(r.html));live.close();if(samples.length<10)throw Error('INSUFFICIENT_SAMPLES');
const root='/var/lib/news-flow/diagnostics/sample-io-20261115';
const io=()=>Object.fromEntries(fs.readFileSync('/proc/self/io','utf8').trim().split('\n').map(l=>{const[k,v]=l.split(':');return[k,Number(v.trim())];}));
const results=[];
for(const [label,Module,options] of [['before',oldModule,{}],['after',newModule,{goodSampleIntervalMs:60000,skipSeedReviewSamples:true}]]){
 const file=path.join(root,'replay-'+label+'-'+Date.now()+'.sqlite');if(fs.existsSync(file))throw Error('REPLAY_FILE_EXISTS');const state=new Module.ThreeFlowState(new DatabaseSync(file));state.enableWriteBatching(options);const prior=io(),at=performance.now();
 try{for(let offset=0;offset<1600;offset+=16)state.tx(()=>{for(let i=offset;i<Math.min(1600,offset+16);i++){const site='site-'+i%31+'.test',kind=i%10===0?'fail':'good';state.storePreparedSample(site,'https://'+site+'/story-'+i,samples[i%samples.length],kind,kind==='fail'?'missing_body':'verified_outbox');}});const elapsedMs=performance.now()-at,current=io(),counts=state.db.prepare('SELECT kind,count(*) n FROM review_samples GROUP BY kind').all();results.push({label,elapsedMs,writeBytes:current.write_bytes-prior.write_bytes,writeSyscalls:current.syscw-prior.syscw,counts,sampleStats:state.sampleWriteStats});}finally{await state.writeBatch?.close();state.close();}
}
if(JSON.stringify(results[0].counts)!==JSON.stringify(results[1].counts))throw Error('CONTROL_COVERAGE_CHANGED');
const result={samples:samples.length,operations:1600,results,speedup:results[0].elapsedMs/results[1].elapsedMs,writeReductionPercent:100*(1-results[1].writeBytes/results[0].writeBytes)};fs.writeFileSync(path.join(root,'sample-replay.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
