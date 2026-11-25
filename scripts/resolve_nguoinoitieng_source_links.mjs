import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const root='outputs/nguoinoitieng-2026-11-18';
const apply=process.argv.includes('--apply');
const db=new DatabaseSync(root+'/celebrities.sqlite',{readOnly:!apply});
const profiles=db.prepare('SELECT source_id,source_url,name FROM profiles').all();
const byId=new Map(profiles.map(p=>[p.source_id,p]));const bySlug=new Map();
for(const p of profiles){const slug=new URL(p.source_url).pathname.split('/').at(-2);if(!bySlug.has(slug))bySlug.set(slug,[]);bySlug.get(slug).push(p);}
const failures=db.prepare("SELECT * FROM crawl_queue WHERE status='failed'").all();
const resolutions=failures.map(row=>{
  const u=new URL(row.url),parts=u.pathname.split('/'),tail=decodeURIComponent(parts.at(-1));
  let matches=bySlug.get(parts.at(-2))??[];
  if(matches.length>1){const same=matches.filter(p=>new URL(p.source_url).pathname.split('/')[2]===parts[2]);if(same.length===1)matches=same;}
  const reason=tail.includes('@')?'Email public sans mailto was incorrectly resolved as a profile path':'Source href contains appended HTML/editor text or an incorrect profile code; correct profile was already collected';
  if(tail.includes('@')){const parentId=new URL(row.discovered_from).pathname.split('/').at(-1);matches=byId.has(parentId)?[byId.get(parentId)]:[];}
  if(matches.length!==1){const prefix=tail.match(/^[a-z0-9-]{1,8}/)?.[0];if(prefix&&byId.has(prefix))matches=[byId.get(prefix)];}
  const corrected=matches.length===1?matches[0]:null;
  const collected=corrected&&db.prepare('SELECT 1 ok FROM pages WHERE url=? AND http_status=200').get(corrected.source_url);
  return {original:row,corrected:collected?corrected:null,reason};
});
fs.writeFileSync(root+'/source-link-resolutions.json',JSON.stringify(resolutions,null,2));
const unresolved=resolutions.filter(r=>!r.corrected);
if(apply){
  if(unresolved.length)throw new Error('Unresolved reference(s): '+unresolved.length);
  db.exec('CREATE TABLE IF NOT EXISTS source_link_resolutions(original_url TEXT PRIMARY KEY,corrected_url TEXT NOT NULL,reason TEXT NOT NULL,original_queue_json TEXT NOT NULL,resolved_at TEXT NOT NULL)');
  db.exec('BEGIN');
  try{
    const save=db.prepare('INSERT OR IGNORE INTO source_link_resolutions VALUES(?,?,?,?,?)');
    const update=db.prepare("UPDATE crawl_queue SET status='resolved_source_reference',finished_at=? WHERE url=? AND status='failed'");
    for(const r of resolutions){const now=new Date().toISOString();save.run(r.original.url,r.corrected.source_url,r.reason,JSON.stringify(r.original),now);update.run(now,r.original.url);}
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
console.log(JSON.stringify({applied:apply,resolved:resolutions.length-unresolved.length,unresolved:unresolved.map(r=>r.original.url.slice(0,160)),queue:db.prepare('SELECT kind,status,count(*) n FROM crawl_queue GROUP BY kind,status').all()},null,2));
db.close();
