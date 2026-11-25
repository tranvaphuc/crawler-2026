import fs from 'node:fs/promises';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {gunzip} from 'node:zlib';import {promisify} from 'node:util';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';import {NewsProcessor} from '../src/newsFlow/processor.mjs';import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';import {requestKey,articleKey} from '../src/newsFlow/identity.mjs';import {verifiedSnapshotMatches,VerifiedSnapshotState} from '../src/newsFlow/verifiedSnapshot.mjs';import {currentAuditGate} from './news_current_audit_gate.mjs';
const root=path.resolve('outputs/news-failed-recovery-2026-11-16'),unzip=promisify(gunzip),review=new DatabaseSync(path.join(root,'review.sqlite'),{readOnly:true});
class ReplayProcessor extends NewsProcessor {
 transport(task){return {get:async url=>url===task.url?{html:task.snapshotHtml,requestedUrl:task.url,finalUrl:task.url,statusCode:200,method:'HTTP/verified-recovery-snapshot',checkedAt:new Date(task.snapshotCheckedAt).toISOString()}:{error:'SNAPSHOT_DEPENDENCY_UNAVAILABLE'},close:async()=>{}};}
 async context(){return {};}
}
const state=new VerifiedSnapshotState(new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite')),marker='manual_verified_snapshot_replay_20261116';state.db.exec('PRAGMA busy_timeout=30000');
if(state.db.prepare('SELECT 1 FROM flow_meta WHERE key=?').get(marker)){console.log('SNAPSHOT_REPLAY_ALREADY_COMPLETE');state.close();review.close();process.exit(0);}
const registry=await loadNewsRegistry();state.loadOverlays(registry);state.enableWriteBatching({touchIntervalMs:60000,goodSampleIntervalMs:60000,skipSeedReviewSamples:true});
const pool=new NewsRepairPool(16,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url)),processor=new ReplayProcessor({state,registry,driver:{},parsers:pool,expand:false,admitRelated:false,maxAgeHours:Infinity});
const transportErrors=new Set(['request_deadline_exceeded','public_api_request_deadline_exceeded','http_502','http_503','public_api_missing_html','EMPTY_NEWS_HTML','URL_AWAITING_SEPARATE_REVIEW','public_api_URL_AWAITING_SEPARATE_REVIEW','service_interrupted_no_retry']);
const candidates=[];
for(const row of review.prepare("SELECT * FROM verdicts WHERE outcome='verified' AND html_path IS NOT NULL AND parsed IS NOT NULL").all()){
 const link=state.db.prepare('SELECT task_id,error,parse_status FROM article_links WHERE parse_key=?').get(row.parse_key);
 if(link?.parse_status==='fail'&&transportErrors.has(link.error))candidates.push({...row,task_id:link.task_id,currentError:link.error});
}
const result={startedAt:new Date().toISOString(),candidates:candidates.length,checked:0,replayed:0,notApplicable:0,qualityRejected:0,errors:0,paidAiCalls:0};let cursor=0;
async function lane(){while(cursor<candidates.length){const row=candidates[cursor++];try{
 const source=registry.sources.get(row.site);if(!source||source.config.sourceAlias||source.config.parserType==='publisher_dispatch'||registry.byHost(new URL(row.url).hostname)?.domain!==source.domain){result.notApplicable++;continue;}
 const file=path.resolve(row.html_path);if(!file.startsWith(path.join(root,'html')+path.sep))throw Error('INVALID_SNAPSHOT_PATH');
 const html=(await unzip(await fs.readFile(file))).toString();
 const audit=currentAuditGate(await pool.run({sample:{domain:source.domain,url:row.url,html,kind:'article'},config:source.config,context:{},learn:false}),source.config,registry,source.domain);
 if(!verifiedSnapshotMatches(audit,JSON.parse(row.parsed))){result.qualityRejected++;continue;}
 const original=state.db.prepare('SELECT * FROM tasks WHERE id=?').get(row.task_id);if(!original||original.role!=='article'||original.state!=='held'){result.notApplicable++;continue;}
 const task={...original,url:row.url,url_key:requestKey(row.url),reason:'manual_refresh',snapshotError:row.currentError,snapshotHtml:html,snapshotCheckedAt:row.checked_at};
 if(!state.applicable(task)){result.notApplicable++;continue;}
 await processor.process(task);
 const completed=state.db.prepare('SELECT parse_status FROM article_links WHERE parse_key=?').get(row.parse_key)?.parse_status==='done';
 if(completed){result.replayed++;await state.writeAsync(()=>state.event('verified_snapshot_replay',{site:row.site,url:row.url,capturedAt:row.checked_at,throughNormalProcessor:true}));}
 else result.qualityRejected++;
 }catch(error){result.errors++;if(error.code==='ERR_SQLITE_ERROR')throw error;}finally{result.checked++;}}}
const timer=setInterval(()=>console.log(JSON.stringify(result)),30000);
try{await Promise.all(Array.from({length:24},lane));}finally{clearInterval(timer);await pool.close();await state.writeBatch.close();}
result.finishedAt=new Date().toISOString();state.db.prepare('INSERT INTO flow_meta VALUES(?,?)').run(marker,JSON.stringify(result));await fs.writeFile(path.join(root,'snapshot-replay.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));state.close();review.close();
