import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {classifyProfile} from './crawl_nguoinoitieng.mjs';

const out=path.resolve('outputs/nguoinoitieng-2026-11-18');
const db=new DatabaseSync(path.join(out,'celebrities.sqlite'),{readOnly:true});
const candidates=[],ruleChanges=[],metadata=[];
const origin=/(?:gốc Việt|Việt kiều|người Việt(?: Nam)?|quốc tịch Việt Nam|dòng máu[^.\n]{0,60}Việt)/iu;
const select=db.prepare('SELECT source_id,profile_json FROM profiles INDEXED BY sqlite_autoindex_profiles_1 WHERE source_id>? ORDER BY source_id LIMIT 100');
let cursor='';
while(true){
  const rows=select.all(cursor);if(!rows.length)break;
  for(const row of rows){
    const p=JSON.parse(row.profile_json),next=classifyProfile(p);
    metadata.push({source_id:p.source_id,source_url:p.source_url,name:p.name});
    if(next.status!==p.vietnam_classification.status)ruleChanges.push({source_id:p.source_id,name:p.name,before:p.vietnam_classification.status,after:next.status,evidence:next.evidence});
    if(p.entity_type==='person'&&!next.included&&(p.vietnam_classification.status==='needs_review'||origin.test(p.biography_text))){
      const evidence=p.sections.flatMap(s=>s.text.split(/\n|(?<=[.!?])\s+/).filter(t=>origin.test(t)).map(text=>({section:s.title,text})));
      candidates.push({source_id:p.source_id,name:p.name,source_url:p.source_url,birth_country:p.birthplace.country,current_status:p.vietnam_classification.status,next_status:next.status,origin_mentions:evidence,intro:p.sections[0]?.text??'',family:p.sections.find(s=>/Cuộc sống gia đình/.test(s.title))?.text??''});
    }
  }
  cursor=rows.at(-1).source_id;
}
const byId=new Map(metadata.map(r=>[r.source_id,r]));const bySlug=new Map();
for(const p of metadata){const slug=new URL(p.source_url).pathname.split('/').at(-2);if(!bySlug.has(slug))bySlug.set(slug,[]);bySlug.get(slug).push(p);}
const failures=db.prepare("SELECT url,discovered_from,error,attempts,http_status FROM crawl_queue WHERE status='failed'").all();
const linkResolutions=failures.map(r=>{
  const u=new URL(r.url),tail=decodeURIComponent(u.pathname.split('/').at(-1)),slug=u.pathname.split('/').at(-2);
  let matches=bySlug.get(slug)??[];let reason=tail.includes('@')?'email_href_resolved_as_relative_profile_url':'malformed_or_wrong_profile_reference';
  if(matches.length>1){const sameCategory=matches.filter(p=>new URL(p.source_url).pathname.split('/')[2]===u.pathname.split('/')[2]);if(sameCategory.length===1)matches=sameCategory;}
  if(tail.includes('@')){const parentId=new URL(r.discovered_from).pathname.split('/').at(-1);matches=byId.has(parentId)?[byId.get(parentId)]:[];}
  const prefix=tail.match(/^[a-z0-9-]{1,8}/)?.[0];
  if(matches.length!==1&&prefix&&byId.has(prefix))matches=[byId.get(prefix)];
  return {...r,corrected:matches.length===1?matches[0]:null,resolution:matches.length===1?'source_reference_already_collected':'needs_investigation',reason};
});
const report={generated_at:new Date().toISOString(),profiles:metadata.length,origin_candidates:candidates.length,rule_changes:ruleChanges.length,failed_links:failures.length,unresolved_failed_links:linkResolutions.filter(r=>!r.corrected).length};
for(const [file,data] of [['classification-origin-candidates.json',candidates],['classification-rule-change-preview.json',ruleChanges],['source-link-resolution-preview.json',linkResolutions],['postcrawl-audit-progress.json',report]])fs.writeFileSync(path.join(out,file),JSON.stringify(data,null,2));
console.log(JSON.stringify(report,null,2));
console.log(JSON.stringify(candidates.map(r=>({id:r.source_id,name:r.name,birth:r.birth_country,mentions:r.origin_mentions.map(e=>e.text.slice(0,230))})),null,2));
console.log('unresolved links',linkResolutions.filter(r=>!r.corrected).map(r=>({url:r.url.slice(0,160),reason:r.reason})));
db.close();
