import json,sqlite3,subprocess
from pathlib import Path
root=Path('/var/lib/forum-flow/stability-20261123');db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
rows=[dict(r) for r in db.execute("SELECT site,native_id,url,reason FROM forum_urls WHERE reason LIKE '%NOT NULL%' OR reason LIKE '%ORIGINAL_%_TIME_CHANGED' OR (site IN ('phunuvietkhoinghiep.vn','bovagau.vn','offb.vn','vnreview.vn') AND reason IN ('original_publication_missing','topic_required_fields_missing','ROOT_PARSE_required_fields_missing')) ORDER BY site,reason,seen DESC")]
selected=[];seen=set()
for row in rows:
 key=(row['site'],row['reason'])
 if key not in seen:selected.append(row);seen.add(key)
db.close()
code=r'''
import fs from 'node:fs';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import * as ch from 'cheerio';import {parsePage,nativeThreadId} from './src/forumFlow/adapters.mjs';import {createResearchTransport} from './src/web/researchTransport.mjs';
const root='/var/lib/forum-flow/stability-20261123',sites=JSON.parse(fs.readFileSync('config/forum-flow/sites.json')),transport=createResearchTransport({timeoutMs:15000,maxSockets:2,persistEvidence:false}),r={at:new Date().toISOString(),rows:[]};fs.mkdirSync(root+'/error-evidence',{recursive:true});
try{for(const row of ROWS){const site=sites.find(s=>s.domain===row.site),p=await transport.get(row.url,null,'stability'),o={...row,statusCode:p.statusCode,error:p.error,finalUrl:p.finalUrl};if(p.html&&!p.error){o.file=root+'/error-evidence/'+createHash('sha256').update(p.html).digest('hex')+'.gz';fs.writeFileSync(o.file,gzipSync(p.html));const $=ch.load(p.html);o.title=$('title').text().slice(0,180);o.canonical=$('link[rel=canonical]').attr('href');o.urlThreadId=nativeThreadId(p.finalUrl||row.url);try{const a=parsePage(p.html,p.finalUrl||row.url,site);o.parsed={complete:a.complete,nativeThreadId:a.nativeThreadId,threadUrl:a.threadUrl,rejected:a.rejected,posts:a.posts.slice(0,2).map(p=>({role:p.role,nativePostId:p.nativePostId,publishedDate:p.publishedDate})),coverage:a.coverage};}catch(e){o.parseError=e.code||e.name;}o.publicationHints=p.html.match(/.{0,30}(?:datePublished|article:published_time|post_create_date|publishedAt|datetime=).{0,150}/g)?.slice(0,5);}r.rows.push(o);}fs.writeFileSync(root+'/forum-error-probe.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));}finally{await transport.close();}
'''.replace('ROWS',json.dumps(selected))
proc=subprocess.run(['/opt/forum-flow/node/bin/node','--input-type=module','-e',code],cwd='/opt/forum-flow/current',capture_output=True,text=True,timeout=230);print(proc.stdout)
if proc.returncode:raise RuntimeError('FORUM_ERROR_PROBE_FAILED')
