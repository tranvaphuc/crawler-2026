import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {isSubjectPlatformLink} from './report_nguoinoitieng.mjs';
const out=path.resolve('outputs/nguoinoitieng-2026-11-18');
const db=new DatabaseSync(path.join(out,'celebrities.sqlite'),{readOnly:true});
try{
 const summary=JSON.parse(fs.readFileSync(path.join(out,'summary-final.json'),'utf8'));
 assert.equal(summary.final,true);
 assert.equal(db.prepare("SELECT count(*) n FROM crawl_queue WHERE status IN ('pending','running','failed')").get().n,0);
 assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
 assert.equal(db.prepare('SELECT count(*) n FROM profiles WHERE NOT json_valid(profile_json)').get().n,0);
 const rows=db.prepare('SELECT source_id FROM profiles WHERE included_vietnamese=1').all();
 const expected=new Set(rows.map(r=>r.source_id));
 const expectedProfiles=expected.size;
 const arrayHash=createHash('sha256'),jsonlHash=createHash('sha256');
 const invalidDates=[],seen=new Set();let arrayCount=0,state='start',previousHadComma=false;
 for await(const line of readline.createInterface({input:fs.createReadStream(path.join(out,'vietnamese.json')),crlfDelay:Infinity})){
   if(state==='start'){assert.equal(line,'[');state='records';continue;}
   if(line===']'){assert.equal(state,'records');assert.equal(previousHadComma,false);state='closed';continue;}
   assert.equal(state,'records');
   if(arrayCount)assert.equal(previousHadComma,true);
   previousHadComma=line.endsWith(',');
   const record=previousHadComma?line.slice(0,-1):line;const p=JSON.parse(record);
   assert.equal(expected.has(p.source_id),true);assert.equal(seen.has(p.source_id),false);seen.add(p.source_id);
   assert.equal(p.entity_type,'person');assert.equal(p.vietnam_classification.included,true);
   const date=p.birth_date?.iso;
   if(date&&(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))invalidDates.push({source_id:p.source_id,name:p.name,source_date:date,source_url:p.source_url});
   arrayHash.update(record+'\n');arrayCount++;
 }
 assert.equal(state,'closed');assert.equal(arrayCount,expectedProfiles);
 let jsonlCount=0;
 for await(const line of readline.createInterface({input:fs.createReadStream(path.join(out,'vietnamese.jsonl')),crlfDelay:Infinity})){
   JSON.parse(line);jsonlHash.update(line+'\n');jsonlCount++;
 }
 assert.equal(jsonlCount,expectedProfiles);
 const digest=arrayHash.digest('hex');assert.equal(jsonlHash.digest('hex'),digest);
 let people=0,withLinks=0,strong=0;const groupedIds=new Set();
 for await(const line of readline.createInterface({input:fs.createReadStream(path.join(out,'vietnamese-people.jsonl')),crlfDelay:Infinity})){
   const p=JSON.parse(line);people++;
   for(const id of p.source_ids){assert.equal(expected.has(id),true);assert.equal(groupedIds.has(id),false);groupedIds.add(id);}
   assert.equal(p.platform_links.every(isSubjectPlatformLink),true);
   assert.equal(p.has_subject_platform_link,p.platform_links.length>0);
   if(p.has_subject_platform_link)withLinks++;
   if(p.classification_strength==='explicit_or_external_evidence')strong++;
 }
 assert.equal(groupedIds.size,expectedProfiles);
 assert.equal(summary.vietnamese_source_profiles,expectedProfiles);
 assert.equal(summary.vietnamese_people_conservative_count,people);
 assert.equal(summary.people_with_subject_platform_link,withLinks);
 assert.equal(summary.people_with_explicit_or_external_origin_evidence,strong);
 assert.equal(summary.people_without_subject_platform_link,people-withLinks);
 const coverage=JSON.parse(fs.readFileSync(path.join(out,'coverage-verification.json'),'utf8'));
 assert.deepEqual(coverage.missing_references,[]);assert.deepEqual(coverage.career_pagination_gaps,[]);
 const remaining=db.prepare("SELECT source_id,name,source_url,birth_country,vietnam_status FROM profiles WHERE vietnam_status='needs_review'").all();
 const result={checked_at:new Date().toISOString(),result:'passed',sqlite_quick_check:'ok',all_profile_json_valid:true,queue_unfinished_or_failed:0,total_source_profiles:summary.total_source_profiles,vietnamese_array_records:arrayCount,vietnamese_jsonl_records:jsonlCount,record_content_sha256:digest,grouped_people:people,people_with_subject_platform_link:withLinks,people_without_subject_platform_link:people-withLinks,source_date_anomalies:invalidDates,remaining_origin_uncertainties:remaining,uncertainty_note:'Đã giữ riêng các trường hợp nguồn chưa đủ căn cứ hoặc mâu thuẫn; không suy đoán theo tên. Nhóm unresolved_origin lớn gồm hồ sơ quốc tế chưa có bằng chứng Việt/gốc Việt. Dữ liệu gốc được giữ để bổ sung/đối chiếu về sau.',files:Object.fromEntries(['celebrities.sqlite','vietnamese.json','vietnamese.jsonl','vietnamese-people.jsonl'].map(f=>[f,{bytes:fs.statSync(path.join(out,f)).size}]))};
 fs.writeFileSync(path.join(out,'verification-final.json'),JSON.stringify(result,null,2)+'\n');
 summary.verification={checked_at:result.checked_at,result:result.result,sqlite_quick_check:'ok',matching_json_and_jsonl:true,source_date_anomalies:invalidDates.length,focused_origin_cases_without_sufficient_evidence:remaining.length};
 summary.files.verification='verification-final.json';
 fs.writeFileSync(path.join(out,'summary-final.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({result:result.result,source_profiles:result.total_source_profiles,vietnamese_source_profiles:arrayCount,people,withLinks,withoutLinks:people-withLinks,invalid_source_dates:invalidDates.length,remaining_origin_uncertainties:remaining.length}));
}finally{db.close();}
