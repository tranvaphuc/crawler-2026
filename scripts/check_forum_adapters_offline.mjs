import fs from 'node:fs/promises';import {parsePage} from '../src/forumFlow/adapters.mjs';
const sites=JSON.parse(await fs.readFile('config/forum-flow/sites.json','utf8'));
for(const site of sites){const audit=JSON.parse(await fs.readFile(`outputs/forum-activity-2026-11-17/${site.domain}.audit.json`,'utf8'));let candidates=audit.pages.filter(x=>/thread|\/t\//.test(x.url)&&x.evidence&&!x.error).map(x=>({file:'outputs/forum-activity-2026-11-17/'+x.evidence,url:x.url}));
 try{const meta=JSON.parse(await fs.readFile(`outputs/forum-flow-evidence-2026-11-17/${site.domain}-detail.json`,'utf8'));candidates.unshift({file:`outputs/forum-flow-evidence-2026-11-17/${site.domain}-detail.html`,url:meta.finalUrl});}catch{}
 if(site.adapter==='wn'){const supplement=JSON.parse(await fs.readFile('outputs/forum-activity-2026-11-17/supplement.json','utf8'));candidates=supplement.filter(x=>x.domain===site.domain).map(x=>({file:'outputs/forum-activity-2026-11-17/'+x.evidence,url:x.url}));}
 for(const x of candidates.slice(0,2)){try{const r=parsePage(await fs.readFile(x.file,'utf8'),x.url,site);console.log(JSON.stringify({domain:site.domain,url:x.url,posts:r.posts.length,rejected:r.rejected.slice(0,3),topic:r.posts.find(p=>p.role==='forumTopic')?.publishedDate,coverage:r.coverage}));}catch(e){console.log(JSON.stringify({domain:site.domain,error:e.message}));}}
}
