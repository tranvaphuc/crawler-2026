import fs from 'node:fs/promises';
import path from 'node:path';
const dir=process.argv[2]||'outputs/interaction-cohort-2026-11-06';
const read=async name=>JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
const [input,baseline,whole,recheck,manifest]=await Promise.all(['input.json','baseline.json','post-deploy-a.json','final-recheck.json','manifest-final.json'].map(read));
if(whole.results.length!==input.length||recheck.results.length!==45)throw Error('COHORT_CHECK_NOT_FINISHED');
const byNumber=new Map(whole.results.map(r=>[r.number,{...r,release:'20261106-interaction-cohort-a'}]));
for(const r of recheck.results)byNumber.set(r.number,{...r,release:manifest.release});
const results=[...byNumber.values()].sort((a,b)=>a.number-b.number);
const successful=r=>['ok','partial'].includes(r.status)&&r.identityVerified&&r.available?.length>0;
const group=fn=>results.reduce((a,r)=>(a[fn(r)]=(a[fn(r)]||0)+1,a),{});
const regressions=baseline.results.filter(successful).flatMap(old=>{
 const current=byNumber.get(old.number),missing=old.available.filter(k=>!current.available?.includes(k));
 return !successful(current)||missing.length||old.nativeId!==current.nativeId?[{number:old.number,status:current.status,reason:current.reason,missing,identityChanged:old.nativeId!==current.nativeId}]:[];
});
const transportFailures=results.filter(r=>r.http>=500||['busy','error','proxy_error','client_error'].includes(r.status));
const invalidCounters=results.filter(r=>Object.values(r.metrics||{}).some(v=>v!==null&&(!Number.isSafeInteger(v)||v<0))||!r.identityVerified&&Object.values(r.metrics||{}).some(v=>v!==null));
const summary={at:new Date(),release:manifest.release,total:results.length,attempted:results.filter(r=>r.attempted).length,successful:results.filter(successful).length,platformStatus:group(r=>r.platform+':'+r.status),reasons:group(r=>r.reason||r.status),regressions,transportFailures:transportFailures.map(r=>r.number),invalidCounters:invalidCounters.map(r=>r.number),verification:{wholeCohortRelease:'20261106-interaction-cohort-a',wholeCohortChecked:whole.results.length,finalReleaseRechecked:recheck.results.length,finalReleaseScope:'All 43 previously successful Facebook posts and both album/photo ID mismatches; other availability responses checked in the whole-cohort run and final canary.'}};
await fs.writeFile(path.join(dir,'final.json'),JSON.stringify({summary,results},null,2)+'\n',{mode:0o600});
const columns=['number','platform','id','url','status','reason','identityVerified','nativeId','available','metrics','release'];
const cell=v=>(typeof v==='object'?JSON.stringify(v):String(v??'')).replace(/[\t\r\n]/g,' ');
await fs.writeFile(path.join(dir,'results.tsv'),[columns.join('\t'),...results.map(r=>columns.map(k=>cell(r[k])).join('\t'))].join('\n')+'\n',{mode:0o600});
const lines=[
 'INTERACTION API AUDIT — 2026-11-06',
 'Production release: '+manifest.release,
 'Input: 97 retry cases supplied by the user (89 Facebook, 8 other platforms).',
 'Existing video feedback fix had already been deployed before this cohort baseline. This report does not attribute all 43 successful cases to the latest release.',
 '',
 'Changes: reconstruct deferred primary video feedback; supplement only the same feedback ID; bind watch/video/reel metrics to the exact media; preserve canonical fallback after an initially mismatched projection; separate native comment populations; retain zero vs null; reject wrong-post and conflicting data; classify native access/identity failures.',
 '',
 'Observed results: '+JSON.stringify(summary.platformStatus),
 'Observed reasons: '+JSON.stringify(summary.reasons),
 'Previous successful posts losing fields or changing identity: '+JSON.stringify(regressions),
 'HTTP 5xx, busy, timeout/client, proxy/error cases in the merged final cohort: '+JSON.stringify(summary.transportFailures),
 'Invalid counters / counters without verified identity: '+JSON.stringify(summary.invalidCounters),
 '',
 'Validation: 320 API regression tests; 29 focused tests on production Node; 15 native canary cases. Full 97-case HTTPS check on release A; all 43 previously successful Facebook cases plus both album/photo mismatches checked again on the final release. Public watch/video/reel, post-info, known-public YouTube and Instagram were also checked.',
 '',
 'Limits: partial results contain only returned exact counters. Generic Facebook login bootstrap is not proof of deletion/privacy. No login sessions or private analytics are used. Photo IDs resolving to a different album post do not receive album counters. Null does not mean zero. No crawler jobs or database measurements were rewritten.',
 '',
 'Per-post results (all 97; the release column records which check supplied the latest observation):',
 ...results.map(r=>`${r.number}. ${r.platform} ${r.id} | ${r.status} | ${r.reason||'verified counters: '+r.available.join(', ')} | ${r.url}`),
 ];
await fs.writeFile(path.join(dir,'report.txt'),lines.join('\n')+'\n',{mode:0o600});
console.log(JSON.stringify(summary,null,2));
if(regressions.length||transportFailures.length||invalidCounters.length)process.exitCode=2;
