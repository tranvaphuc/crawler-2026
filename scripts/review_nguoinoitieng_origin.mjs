// Explicit adjudications after reading the archived origin-candidate excerpts.
// This is not a name-based ethnicity classifier and makes no network/API calls.
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const root='outputs/nguoinoitieng-2026-11-18';
const candidates=JSON.parse(fs.readFileSync(root+'/classification-origin-candidates.json','utf8'));
const byId=new Map(candidates.map(p=>[p.source_id,p]));
const configPath='config/nguoinoitieng-reviewed-evidence.json';
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const db=new DatabaseSync(root+'/celebrities.sqlite',{readOnly:true});
const lookup=db.prepare('SELECT source_id,name,source_url FROM profiles WHERE source_id=?');
const positive=`6e5 6i 77 792 a0uh a225 a9hr a9sh a9sr ab9 abr aekh apei aqtk bab0 baq4 baqm bara bayq bazm bb20 bbcm bbcp bbcq bbdu bbe2 bbhv bbqx bbty bby8 bbzn bc1m bc40 bcz5 bd47 bdkj bdsz bdzw be6u bea7 bec5 beht belt bemz bfa0 bfjm bfqm bfsc bgfu bgwc bh7a bhi7 bhtv bhu1 biez bjws bldx bled blfy blj7 bls8 bltp blzg bmmd bmn5 bmnb bmng bmo9 bmoj ey j9t jv6 meg n72 p1g qc r1k so4 sy t0h`.split(/\s+/);
const birthSupported=`bhoe bdwf bb31 bdkr bhut bc5r bdf4 bika bist bg5l bckx bbe4 bbnd js`.split(/\s+/);
for(const id of positive){
  const p=byId.get(id);if(!p||!p.origin_mentions.length)throw new Error('Missing reviewed origin evidence for '+id);
  let excerpts=p.origin_mentions.slice(0,3);
  if(id==='bbcq'||id==='bbcm')excerpts=p.origin_mentions.filter(e=>/bố|mẹ|cha|hai dòng máu/.test(e.text));
  config[id]={expected_name:p.name,decision:'vietnamese_descent',source_url:p.source_url,source_title:'Hồ sơ '+p.name,source_type:'archived_profile_manual_review',finding:'Đã đọc ngữ cảnh hồ sơ: nguồn mô tả chủ thể có gốc Việt, cha/mẹ Việt, mang dòng máu Việt, là Việt kiều hoặc đã nhận quốc tịch Việt Nam.',source_excerpts:excerpts,reviewed_at:new Date().toISOString(),review_method:'manual_archived_source_context_review'};
}
for(const id of birthSupported){
  const p=byId.get(id);if(!p||p.birth_country!=='Việt Nam')throw new Error('Missing Vietnam birthplace evidence '+id);
  config[id]={expected_name:p.name,decision:'vietnamese_birth_supported',source_url:p.source_url,source_type:'archived_profile_manual_review',finding:'Nguồn ghi sinh tại Việt Nam. Đã đọc ngữ cảnh: mô tả người nước ngoài/quan hệ hoặc từ ngữ như người anh không chứng minh chủ thể là người nước ngoài. Giữ ở nhóm suy luận từ nơi sinh, không xác minh quốc tịch.',reviewed_at:new Date().toISOString(),review_method:'manual_archived_source_context_review'};
}
for(const [id,finding] of [['bbog','Phần tiểu sử xác định Dan Hauer là giáo viên người Mỹ; vợ là người Việt. Trường nơi sinh Việt Nam mâu thuẫn và không đủ để kết luận chủ thể là người Việt.'],['bks3','Phần tiểu sử xác định Red Bacon là người Philippines, sinh và lớn lên tại Baguio. Trường nơi sinh Việt Nam mâu thuẫn với nội dung.']]){
  const p=lookup.get(id);config[id]={expected_name:p.name,decision:'foreign_identity_reported',source_url:p.source_url,source_type:'archived_profile_manual_review',finding,reviewed_at:new Date().toISOString(),review_method:'manual_archived_source_context_review'};
}
const spiritual=lookup.get('bi2s');
config.bi2s={expected_name:spiritual.name,decision:'exclude_entity',source_url:spiritual.source_url,source_type:'archived_profile_manual_review',finding:'Hồ sơ về Phật Dược Sư không đưa ra bằng chứng đây là một cá nhân lịch sử sinh tại Việt Nam; không đưa vào thống kê người Việt chỉ vì trường nơi sinh mẫu của site.',reviewed_at:new Date().toISOString(),review_method:'manual_entity_scope_review'};
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
fs.writeFileSync(root+'/manual-origin-review-status.json',JSON.stringify({reviewed_at:new Date().toISOString(),source_positive:positive.length,birth_supported:birthSupported.length,contradictory_foreign:2,excluded_entity:1,config_records:Object.keys(config).length},null,2));
console.log({positive:positive.length,birthSupported:birthSupported.length,records:Object.keys(config).length});
db.close();
