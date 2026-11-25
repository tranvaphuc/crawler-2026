import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const PLATFORMS=new Set(['facebook','instagram','tiktok','youtube','threads','twitter','linkedin','zalo']);
const fold=s=>String(s??'').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function isSubjectPlatformLink(link){
  if(link.attribution!=='subject_profile_link'||!PLATFORMS.has(link.platform)||!['account_or_page','account','channel'].includes(link.link_kind))return false;
  let u;try{u=new URL(link.url);}catch{return false;}
  const parts=u.pathname.split('/').filter(Boolean);
  if(!parts.length||/^(?:search|intent|share|sharer(?:\.php)?|dialog|login|hashtag|explore|watch|groups|reel|story\.php|photo\.php|permalink\.php)$/i.test(parts[0]))return false;
  if(parts.some(p=>/^(?:posts|videos|photos|photos_albums|status|stories)$/i.test(p)))return false;
  return true;
}

// Conservative grouping: identical source names (punctuation ignored) AND full birth dates.
// A shared institutional account or a name alone is never enough to merge two people.
export function groupProfiles(profiles,reviewedIdentities=[]){
  const groups=new Map();
  const reviewedById=new Map();
  const keepSeparate=new Set();
  for(const identity of reviewedIdentities){
    const members=identity.members.map(m=>profiles.find(p=>p.source_id===m.source_id&&p.name===m.expected_name&&p.birth_date===identity.birth_date));
    if(members.every(Boolean))for(const p of members){if(identity.decision==='keep_separate')keepSeparate.add(p.source_id);else reviewedById.set(p.source_id,identity.identity_id);}
  }
  for(const p of profiles){
    const name=fold(p.name),dob=p.birth_date;
    const dated=typeof dob==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(dob)&&Number.isFinite(Date.parse(dob))&&new Date(dob).toISOString().slice(0,10)===dob;
    const key=keepSeparate.has(p.source_id)?`source:${p.source_id}`:reviewedById.has(p.source_id)?`reviewed:${reviewedById.get(p.source_id)}`:dated&&name.length>=5?`name-dob:${name}:${dob}`:`source:${p.source_id}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  }
  return [...groups.values()];
}
function atomicJson(target,value){const tmp=target+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,target);}

export function generateReport(db,out,{final=false}={}){
  db.exec('BEGIN');
  try{
    const queue=db.prepare('SELECT kind,status,count(*) count FROM crawl_queue GROUP BY kind,status').all();
    const pending=queue.filter(r=>['pending','running'].includes(r.status)).reduce((n,r)=>n+r.count,0);
    const failed=queue.filter(r=>r.status==='failed').reduce((n,r)=>n+r.count,0);
    if(final&&(pending||failed))throw new Error(`COLLECTION_NOT_COMPLETE: pending=${pending}, failed=${failed}`);
    const included=db.prepare(`SELECT source_id,source_url,name,occupation,occupation_slug,vietnam_status,
      json_extract(profile_json,'$.birth_date.iso') birth_date,
      json_extract(profile_json,'$.real_name_raw') real_name
      FROM profiles WHERE included_vietnamese=1 ORDER BY source_id`).all();
    const linkRows=db.prepare('SELECT l.source_id,l.link_json FROM platform_links l JOIN profiles p USING(source_id) WHERE p.included_vietnamese=1').all();
    const byId=new Map();
    for(const r of linkRows){if(!byId.has(r.source_id))byId.set(r.source_id,[]);byId.get(r.source_id).push(JSON.parse(r.link_json));}
    const identities=JSON.parse(fs.readFileSync(new URL('../config/nguoinoitieng-reviewed-identities.json',import.meta.url),'utf8'));
    const groups=groupProfiles(included,identities);
    const duplicateGroups=groups.filter(g=>g.length>1);
    const filename=final?'vietnamese-people':'vietnamese-people-current';
    const target=path.join(out,filename+'.jsonl'),tmp=target+'.tmp';
    const fd=fs.openSync(tmp,'w');
    let withPlatform=0,explicit=0,inferred=0,explicitWithPlatform=0,inferredWithPlatform=0;
    const byPlatform={},reviewDuplicates=[];
    try{
      for(const group of groups){
        const links=new Map();
        for(const p of group)for(const l of byId.get(p.source_id)??[])if(isSubjectPlatformLink(l))links.set(l.platform+' '+l.url,l);
        const platforms=[...new Set([...links.values()].map(l=>l.platform))];
        if(platforms.length)withPlatform++;
        for(const platform of platforms)byPlatform[platform]=(byPlatform[platform]??0)+1;
        const statuses=[...new Set(group.map(p=>p.vietnam_status))];
        const strong=statuses.some(s=>['vietnamese_explicit','vietnamese_external_supported','vietnamese_source_reviewed'].includes(s));
        if(strong)explicit++;else inferred++;
        if(platforms.length){if(strong)explicitWithPlatform++;else inferredWithPlatform++;}
        const person={person_id:group[0].source_id,name:group[0].name,names:[...new Set(group.map(p=>p.name))],real_names:[...new Set(group.map(p=>p.real_name).filter(Boolean))],birth_date:group[0].birth_date,occupations:[...new Set(group.map(p=>p.occupation))],source_ids:group.map(p=>p.source_id),source_urls:group.map(p=>p.source_url),classification_statuses:statuses,classification_strength:strong?'explicit_or_external_evidence':'inferred_from_vietnam_birthplace',platform_links:[...links.values()],has_subject_platform_link:platforms.length>0,full_information_location:'celebrities.sqlite profiles.profile_json; vietnamese.json; vietnamese.jsonl',grouping_rule:group.length>1?'same_normalized_name_and_full_birthdate':'individual_source_profile'};
        if(group.length>1){
          const reviewed=identities.find(x=>group.every(p=>x.members.some(m=>m.source_id===p.source_id)));
          person.grouping_rule=reviewed?'manually_reviewed_identity':'same_normalized_name_and_valid_full_birthdate';
          reviewDuplicates.push({source_ids:person.source_ids,names:person.names,birth_date:person.birth_date,source_urls:person.source_urls,grouping_rule:person.grouping_rule,identity_evidence:reviewed??null});
        }
        fs.writeSync(fd,JSON.stringify(person)+'\n');
      }
    }finally{fs.closeSync(fd);}
    fs.renameSync(tmp,target);
    const statusCounts=db.prepare('SELECT vietnam_status,count(*) count FROM profiles GROUP BY vietnam_status').all();
    const summary={
      generated_at:new Date().toISOString(),final,collection_state:pending?'in_progress':failed?'frontier_exhausted_with_errors':'frontier_exhausted',pending_urls:pending,failed_urls:failed,queue,
      total_source_profiles:db.prepare('SELECT count(*) n FROM profiles').get().n,
      vietnamese_source_profiles:included.length,
      vietnamese_people_conservative_count:groups.length,
      people_with_explicit_or_external_origin_evidence:explicit,
      people_inferred_from_vietnam_birthplace:inferred,
      people_with_explicit_or_external_origin_evidence_and_platform_link:explicitWithPlatform,
      people_inferred_from_vietnam_birthplace_and_platform_link:inferredWithPlatform,
      people_with_subject_platform_link:withPlatform,
      people_without_subject_platform_link:groups.length-withPlatform,
      people_by_platform:byPlatform,
      duplicate_profile_groups_merged:duplicateGroups.length,
      duplicate_groups_kept_separate_after_review:identities.filter(x=>x.decision==='keep_separate'),
      extra_duplicate_profiles:included.length-groups.length,
      classification_counts:statusCounts,
      caveats:[
        'Người Việt gồm cả gốc Việt ở nước ngoài. Nhóm suy luận từ nơi sinh được đếm riêng, không phải xác minh quốc tịch.',
        'Khử trùng bảo thủ theo tên khớp sau chuẩn hóa dấu câu và ngày sinh đầy đủ hợp lệ hoặc cùng danh tính đã đối chiếu riêng; nghệ danh khác hoặc ngày sinh mâu thuẫn vẫn có thể trùng.',
        'Đếm người có link được nguồn đặt trong trường tài khoản chính, không đếm nút chia sẻ, link nhắc trong tiểu sử, nhóm, bài đăng hay website thông thường. Link chưa được xác minh chính chủ/khả dụng độc lập.',
        'Đã đối chiếu sitemap, liên kết danh mục và phân trang nghề nghiệp trong kho; không chứng minh không có hồ sơ ẩn, bị bỏ liên kết hoặc mới phát sinh.',
        'Các hồ sơ chưa rõ xuất thân vẫn giữ nguyên trong DB, không tự đoán nguồn gốc theo tên; số người Việt là kết quả phân loại có giới hạn theo bằng chứng công khai.'
      ],
      files:{database:'celebrities.sqlite',full_vietnamese_json:'vietnamese.json',full_vietnamese_jsonl:'vietnamese.jsonl',grouped_people:filename+'.jsonl',duplicate_review:final?'duplicate-review.json':'duplicate-review-current.json'}
    };
    const coverageFile=path.join(out,'coverage-verification.json');
    if(fs.existsSync(coverageFile)){summary.coverage_verification=JSON.parse(fs.readFileSync(coverageFile,'utf8'));summary.files.coverage='coverage-verification.json';}
    atomicJson(path.join(out,summary.files.duplicate_review),reviewDuplicates);
    atomicJson(path.join(out,final?'summary-final.json':'summary-current.json'),summary);
    db.exec('COMMIT');
    return summary;
  }catch(error){db.exec('ROLLBACK');throw error;}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const out=path.resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'outputs/nguoinoitieng-2026-11-18');
  const db=new DatabaseSync(path.join(out,'celebrities.sqlite'),{readOnly:true});
  try{console.log(JSON.stringify(generateReport(db,out,{final:process.argv.includes('--final')}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
  finally{db.close();}
}
