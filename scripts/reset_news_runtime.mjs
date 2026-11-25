import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
export async function prepareFreshNewsRuntime({sourceFile,targetFile,registry}){
 if(!fs.existsSync(sourceFile)||path.resolve(sourceFile)===path.resolve(targetFile)||fs.existsSync(targetFile))throw Error('RESET_TARGET_MUST_BE_NEW');
 const state=await ThreeFlowState.open(targetFile),kept=['ai_usage','identities','import_receipts','parser_overlays'];
 try{
  state.db.exec('PRAGMA cache_size=-65536; PRAGMA temp_store=FILE');state.db.prepare('ATTACH DATABASE ? AS previous').run(path.resolve(sourceFile));
  const counts={};state.tx(()=>{
   for(const table of kept){state.db.exec('INSERT INTO main.'+table+' SELECT * FROM previous.'+table);const before=state.db.prepare('SELECT count(*) n FROM previous.'+table).get().n,after=state.db.prepare('SELECT count(*) n FROM main.'+table).get().n;if(before!==after)throw Error('RESET_PRESERVED_COUNT_MISMATCH_'+table);counts[table]=after;}
   state.db.exec("INSERT INTO main.flow_meta SELECT * FROM previous.flow_meta WHERE key IN ('article_catalog_v1','parse_queue_admissions_v1','three_flows_v1','url_failures_v1')");
   if(JSON.stringify(state.db.prepare('SELECT * FROM main.ai_usage ORDER BY day').all())!==JSON.stringify(state.db.prepare('SELECT * FROM previous.ai_usage ORDER BY day').all()))throw Error('RESET_AI_USAGE_CHANGED');
  });
  state.db.exec('DETACH DATABASE previous');state.migrateThreeFlows(registry);state.syncSeeds(registry);
  const empty=['article_links','tasks','article_catalog','parse_admissions','url_failures','requests','outbox','cycles','events','review_samples','ai_reviews'];
  for(const table of empty)if(state.db.prepare('SELECT count(*) n FROM '+table).get().n)throw Error('RESET_TABLE_NOT_EMPTY_'+table);
  const result={kept:counts,empty,seedSources:state.db.prepare('SELECT count(*) n FROM seed_sources').get().n,checkedAt:new Date().toISOString()};
  if(state.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('RESET_QUICK_CHECK_FAILED');
  state.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');return result;
 }finally{state.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [sourceFile,targetFile,reportFile]=process.argv.slice(2);if(!sourceFile||!targetFile||!reportFile)throw Error('SOURCE_TARGET_REPORT_REQUIRED');
 const result=await prepareFreshNewsRuntime({sourceFile,targetFile,registry:await loadNewsRegistry()});fs.writeFileSync(reportFile,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}
