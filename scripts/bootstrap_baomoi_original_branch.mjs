import fs from 'node:fs/promises';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {initializeOriginalBranch,recordOriginalLink} from '../src/newsFlow/baomoiOriginalBranch.mjs';
import {articleKey} from '../src/newsFlow/identity.mjs';
const root='/var/lib/news-flow/baomoi-original-branch-20261120',state=await ThreeFlowState.open('/var/lib/news-flow/news-flow-runtime/write.sqlite');
try{initializeOriginalBranch(state.db);const before=state.db.prepare('SELECT * FROM ai_usage ORDER BY day').all(),input=JSON.parse(await fs.readFile('/var/lib/news-flow/baomoi-original-links-20261119/report.json')),preflight=JSON.parse(await fs.readFile(root+'/preflight.json'));
 await fs.writeFile(root+'/bootstrap-ledger-before.json',JSON.stringify(before));
 const result=state.tx(()=>{
  let refs=0;for(const row of input.rows)if(recordOriginalLink(state,row)){refs++;state.db.prepare('INSERT OR IGNORE INTO baomoi_original_scans VALUES(?,?,?,?)').run(articleKey(row.baomoiUrl),'captured','verified_extraction_audit',Date.now());}
  for(const row of preflight.results){if(!row.report||row.report.paidAiCalls!==0)throw Error('ORIGINAL_PREFLIGHT_EVIDENCE_INVALID');if(row.approved&&(!row.config||!row.report.qualification?.approved||row.report.qualification.holdouts.length<2))throw Error('ORIGINAL_PREFLIGHT_QUALIFICATION_INVALID');state.db.prepare("UPDATE baomoi_original_sources SET status=?,config=?,report=?,at=? WHERE host=? AND status='pending'").run(row.approved?'active':'held',row.config?JSON.stringify(row.config):null,JSON.stringify(row.report),Date.now(),row.host);}
  const marker={at:new Date().toISOString(),refs,sourceResults:preflight.results.map(r=>({host:r.host,approved:r.approved})),paidAiCalls:0,oneOffAuthorizedAiCeilingUsd:10,oneOffScope:'this_implementation_only',recurringDailyBudgetUsd:2,dailyMaxCallsUnchanged:200};
  state.db.prepare('INSERT OR IGNORE INTO flow_meta VALUES(?,?)').run('baomoi_original_branch_20261120',JSON.stringify(marker));return marker;
 });
 const after=state.db.prepare('SELECT * FROM ai_usage ORDER BY day').all();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('AI_LEDGER_CHANGED_BY_BOOTSTRAP');await fs.writeFile(root+'/bootstrap.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{state.close();}
