// Offline, read-only extraction: one person per record, with every underlying profile embedded.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {isSubjectPlatformLink} from './report_nguoinoitieng.mjs';

const out=path.resolve('outputs/nguoinoitieng-2026-11-18');
const target=path.join(out,'vietnamese-with-platforms.full.json');
const tmp=target+'.tmp';
const summary=JSON.parse(fs.readFileSync(path.join(out,'summary-final.json'),'utf8'));
const reviewedEvidence=JSON.parse(fs.readFileSync('config/nguoinoitieng-reviewed-evidence.json','utf8'));
const identityReviews=JSON.parse(fs.readFileSync('config/nguoinoitieng-reviewed-identities.json','utf8'));
const selected=[],expectedIds=new Set();
for await(const line of readline.createInterface({input:fs.createReadStream(path.join(out,'vietnamese-people.jsonl')),crlfDelay:Infinity})){
 const p=JSON.parse(line);
 if(!p.has_subject_platform_link)continue;
 assert.ok(p.platform_links.length&&p.platform_links.every(isSubjectPlatformLink));
 for(const id of p.source_ids){assert.ok(!expectedIds.has(id));expectedIds.add(id);}
 selected.push(p);
}
assert.equal(selected.length,summary.people_with_subject_platform_link);
const strong=selected.filter(p=>p.classification_strength==='explicit_or_external_evidence').length;
assert.equal(strong,summary.people_with_explicit_or_external_origin_evidence_and_platform_link);
const metadata={
 schema_version:1,created_at:new Date().toISOString(),source_website:'https://nguoinoitieng.tv',archive:'nguoinoitieng-2026-11-18',
 counts:{people:selected.length,underlying_source_profiles:expectedIds.size,explicit_or_external_evidence:strong,inferred_from_vietnam_birthplace:selected.length-strong},
 selection:'Vietnamese/inferred Vietnamese people with at least one source-attributed platform account link, using the identical selection and conservative grouping of summary-final.json.',
 filter_fields:['classification_strength','classification_statuses','platforms','birth_years','birth_countries','living_or_working_locations','occupation_slugs','vietnam_classification.confidences','vietnam_classification.evidence','source_profiles[].vietnam_classification'],
 classification_legend:{explicit_or_external_evidence:'Nguồn mô tả Việt/gốc Việt hoặc có căn cứ đối chiếu được lưu; không đồng nghĩa đã xác minh quốc tịch.',inferred_from_vietnam_birthplace:'Suy luận từ nơi sinh tại Việt Nam; chưa xác minh quốc tịch.'},
 content_notes:[
  'people[] là các người đã nhóm; source_profiles[] giữ đầy đủ mọi trường JSON của từng hồ sơ nguồn, bao gồm tiểu sử, HTML phần nội dung, hình ảnh, quê/nơi sinh, nơi sống/làm việc, liên hệ công khai, nguồn và chất lượng dữ liệu.',
  'platform_links ở cấp người chỉ chứa các link tài khoản được dùng để chọn tập này. source_profiles[].platform_links vẫn giữ mọi link đã trích xuất, bao gồm link trong tiểu sử và link không đủ điều kiện đếm.',
  'source_profiles[].reviewed_origin_evidence giữ căn cứ đối chiếu bổ sung; classification_history giữ các thay đổi phân loại. identity_reviews ghi các quyết định gộp hoặc giữ riêng.',
  'Link chưa được xác minh chính chủ hoặc còn hoạt động. Nơi sống/làm việc và ngày sinh là thông tin do nguồn ghi tại lúc crawl, có thể cũ hoặc sai; không ghi đè dữ liệu gốc.',
  'Không đếm nút chia sẻ, tìm kiếm, nhóm, ảnh/album, bài đăng hay website thông thường. Việc gộp vẫn có giới hạn với nghệ danh khác hoặc dữ liệu mâu thuẫn.'
 ]
};
const unique=values=>[...new Set(values.filter(v=>v!==undefined&&v!==null&&v!==''))];
const db=new DatabaseSync(path.join(out,'celebrities.sqlite'),{readOnly:true});
try{
 db.exec('BEGIN');
 const lookup=db.prepare('SELECT included_vietnamese,profile_json FROM profiles WHERE source_id=?');
 const history=db.prepare('SELECT reviewed_at,before_json,after_json FROM classification_review_log WHERE source_id=? ORDER BY reviewed_at');
 const fd=fs.openSync(tmp,'w');
 try{
  fs.writeSync(fd,'{"metadata":'+JSON.stringify(metadata)+',"people":[\n');
  for(let i=0;i<selected.length;i++){
   const group=selected[i];
   const profiles=group.source_ids.map(id=>{
    const row=lookup.get(id);assert.equal(row?.included_vietnamese,1);
    const p=JSON.parse(row.profile_json);
    return {...p,reviewed_origin_evidence:reviewedEvidence[id]??null,classification_history:history.all(id).map(h=>({reviewed_at:h.reviewed_at,before:JSON.parse(h.before_json),after:JSON.parse(h.after_json)}))};
   });
   const p={...group,
    platforms:unique(group.platform_links.map(l=>l.platform)),
    source_profile_count:profiles.length,
    birth_years:unique(profiles.map(p=>p.birth_date?.year)),
    birth_countries:unique(profiles.map(p=>p.birthplace?.country)),
    living_or_working_locations:profiles.map(p=>({source_id:p.source_id,...p.residence})),
    occupation_slugs:unique(profiles.map(p=>p.occupation_slug)),
    vietnam_classification:{strength:group.classification_strength,statuses:group.classification_statuses,confidences:unique(profiles.map(p=>p.vietnam_classification.confidence)),evidence:profiles.flatMap(p=>p.vietnam_classification.evidence.map(e=>({source_id:p.source_id,...e}))),review_reasons:unique(profiles.flatMap(p=>p.vietnam_classification.review_reasons))},
    identity_reviews:identityReviews.filter(r=>r.members.some(m=>group.source_ids.includes(m.source_id))),
    full_information_location:'source_profiles[] in this JSON file',source_profiles:profiles
   };
   fs.writeSync(fd,JSON.stringify(p)+(i<selected.length-1?',':'')+'\n');
  }
  fs.writeSync(fd,']}\n');
 }finally{fs.closeSync(fd);}

 // Stream-validate the complete JSON and compare every original profile back to SQLite.
 let lineNumber=0,count=0,withStrongEvidence=0,state='header';const seenIds=new Set(),seenPeople=new Set(),hash=createHash('sha256');
 for await(const line of readline.createInterface({input:fs.createReadStream(tmp),crlfDelay:Infinity})){
  lineNumber++;hash.update(line+'\n');
  if(state==='header'){
   assert.equal(line,'{"metadata":'+JSON.stringify(metadata)+',"people":[');state='records';continue;
  }
  if(line===']}'){assert.equal(count,selected.length);state='closed';continue;}
  assert.equal(state,'records');assert.equal(line.endsWith(','),count<selected.length-1);
  const p=JSON.parse(line.endsWith(',')?line.slice(0,-1):line);
  assert.equal(p.person_id,selected[count].person_id);assert.ok(!seenPeople.has(p.person_id));seenPeople.add(p.person_id);
  assert.equal(p.has_subject_platform_link,true);assert.ok(p.platform_links.length&&p.platform_links.every(isSubjectPlatformLink));
  assert.deepEqual(p.source_ids,selected[count].source_ids);
  assert.equal(p.source_profiles.length,p.source_ids.length);
  for(const enriched of p.source_profiles){
   const {reviewed_origin_evidence,classification_history,...original}=enriched;
   assert.ok(expectedIds.has(original.source_id));assert.ok(!seenIds.has(original.source_id));seenIds.add(original.source_id);
   assert.deepEqual(original,JSON.parse(lookup.get(original.source_id).profile_json));
   assert.deepEqual(reviewed_origin_evidence,reviewedEvidence[original.source_id]??null);
   assert.equal(original.vietnam_classification.included,true);
  }
  if(p.classification_strength==='explicit_or_external_evidence')withStrongEvidence++;
  count++;
 }
 assert.equal(state,'closed');assert.equal(count,selected.length);assert.equal(withStrongEvidence,strong);assert.equal(seenIds.size,expectedIds.size);
 db.exec('COMMIT');
 fs.renameSync(tmp,target);
 console.log(JSON.stringify({file:target,verification:'passed: streamed JSON structure, exact selected people and full source profiles match SQLite',people:count,underlying_source_profiles:seenIds.size,explicit_or_external_evidence:strong,inferred_from_vietnam_birthplace:count-strong,bytes:fs.statSync(target).size,sha256:hash.digest('hex')},null,2));
}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
