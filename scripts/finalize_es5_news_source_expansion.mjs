import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {classifyNewsSourceHit} from '../src/newsFlow/sourceInventory.mjs';
import {isDeclaredForumHtml,qualifyNewsSourceSamples} from '../src/newsFlow/sourceQualification.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {currentAuditGate} from './news_current_audit_gate.mjs';

const root=path.resolve('outputs/news-es5-source-expansion-2026-11-16'),read=async n=>JSON.parse(await fs.readFile(path.join(root,n))),save=async(n,v)=>fs.writeFile(path.join(root,n),JSON.stringify(v,null,2));
const sites=await read('candidates.json'),manifest=await read('approved-configs.json'),registry=await loadNewsRegistry(),forums=new Set(await read('known-forums.json'));
const pool=new NewsRepairPool(8,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const final=[],accepted=[];let checked=0;
try{
 for(const site of sites){
  const record=await read('audit/'+site.domain+'/result.json');
  if(!record.complete)throw Error('INCOMPLETE_SITE_AUDIT:'+site.domain);
  let forum=false;
  for(const page of record.pages||[]){if(!page.htmlPath)continue;const html=gunzipSync(await fs.readFile(page.htmlPath)).toString();if(isDeclaredForumHtml(html)){forum=true;break;}}
  if(forum){record.approved=false;record.state='excluded_forum';record.reasons.user_excluded_forum_detected=1;}
  if(record.approved){
   const row=manifest.find(m=>m.domain===site.domain);if(!row)throw Error('APPROVED_CONFIG_MISSING:'+site.domain);
   const config=JSON.parse(await fs.readFile(row.approvedFile));
   if(config.registrableDomain!==site.domain||!config.requiresTimezoneReviewBeforeWrite)throw Error('NEW_SOURCE_PUBLICATION_POLICY_INVALID');
   const checkRegistry={sources:new Map([...registry.sources,[site.domain,{config,quality:{}}]]),byHost:h=>(config.allowedHosts||[]).some(a=>a.replace(/^www\./,'')===h.replace(/^www\./,''))?{config}:registry.byHost(h)};
   const samples=[];
   for(const a of record.articles.filter(a=>a.state==='parsed')){
    const audit=currentAuditGate(await pool.run({sample:{domain:site.domain,url:a.url,htmlPath:a.htmlPath,kind:'article'},config,learn:false}),config,checkRegistry,site.domain);
    const success=!audit.error&&!audit.quality?.length;
    samples.push({...a,state:success?'parsed':'final_recheck_failed',error:audit.error,issues:audit.quality,contentHash:audit.parsed?.extracted?.contentSha256,description:audit.parsed?._source?.description});
   }
   const qualification=qualifyNewsSourceSamples(samples,{listingLinks:record.qualification?.approved?record.workingSeeds.reduce((n,s)=>n+s.articleLinks,0):0});
   if(samples.some(a=>a.state!=='parsed')||!qualification.approved){record.approved=false;record.state='final_recheck_failed';record.reasons.final_independent_sample_recheck_failed=1;}
   else{
    const exclusion=classifyNewsSourceHit({_type:'newsTopic',_source:{siteName:site.domain,url:record.homepage}},registry,forums);
    if(exclusion.state!=='candidate'){record.approved=false;record.state=exclusion.state;record.reasons[exclusion.reason||'already_configured']=1;}
    else accepted.push({...row,config});
   }
  }
  final.push({...record,pages:undefined,articles:undefined});checked++;
  if(checked%50===0)console.log(JSON.stringify({phase:'final_source_checks',checked,total:sites.length,accepted:accepted.length}));
 }
}finally{await pool.close();}
if(final.length!==sites.length)throw Error('SITE_COVERAGE_INCOMPLETE');
await save('final-site-summary.json',final);
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
const aiBefore=db.prepare('SELECT * FROM ai_usage ORDER BY day').all();db.close();
const installed=[];let activated=false;
try{
 for(const source of accepted){
  const target=path.resolve(source.file),directory=path.resolve('config/web-sources/news');
  if(path.dirname(target)!==directory||path.basename(target)!==source.domain+'.json')throw Error('INVALID_NEW_SOURCE_CONFIG_PATH');
  const bytes=await fs.readFile(source.approvedFile);
  await fs.copyFile(source.approvedFile,target,fs.constants.COPYFILE_EXCL);installed.push({domain:source.domain,file:source.file,bytes});
 }
 const expanded=await loadNewsRegistry();if(expanded.sources.size!==registry.sources.size+installed.length)throw Error('REGISTRY_COUNT_MISMATCH');
 const tests=(await fs.readdir('test')).filter(f=>/^news-.*\.test\.mjs$/.test(f)).map(f=>'test/'+f);tests.push('test/public-article-bodies.test.mjs');
 const result=execFileSync(process.execPath,['--test',...tests],{encoding:'utf8',maxBuffer:16000000,timeout:180000});await fs.writeFile(path.join(root,'deployment-tests.tap'),result);
 if(installed.length){
  execFileSync('systemctl',['stop','news-flow-seed.service','news-flow-parse.service'],{stdio:'pipe'});
  try{execFileSync('systemctl',['start','news-flow-seed.service','news-flow-parse.service'],{stdio:'pipe'});}catch(error){execFileSync('systemctl',['start','news-flow-seed.service','news-flow-parse.service'],{stdio:'pipe'});throw error;}
 }
 activated=true;
 const after=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),aiAfter=after.prepare('SELECT * FROM ai_usage ORDER BY day').all();after.close();
 if(aiBefore.some(b=>!aiAfter.some(a=>a.day===b.day&&a.calls>=b.calls&&a.usd+1e-9>=b.usd)))throw Error('AI_USAGE_NOT_PRESERVED');
 const activation={activatedAt:new Date().toISOString(),sourceInventory:'crawler-v7-news-topic-2',registeredBefore:registry.sources.size,registeredAfter:expanded.sources.size,added:installed.map(({bytes,...s})=>s),checkedSites:sites.length,excludedForumSites:final.filter(r=>r.state==='excluded_forum').length,paidAiCalls:0,aiUsagePreserved:true,aiUsageBefore:aiBefore,aiUsageAfter:aiAfter,queueReset:false,esDirectWrites:false,workers:{seed:148,article:148,import:1}};
 await save('activation.json',activation);console.log(JSON.stringify({complete:true,registeredSources:expanded.sources.size,added:installed.length,aiUsagePreserved:true,paidAiCalls:0}));
}catch(error){
 if(!activated){for(const source of installed){const target=path.resolve(source.file);const bytes=await fs.readFile(target).catch(()=>null);if(bytes?.equals(source.bytes))await fs.unlink(target);}}
 if(error.stdout)await fs.writeFile(path.join(root,'deployment-tests-failed.tap'),error.stdout);
 throw error;
}
