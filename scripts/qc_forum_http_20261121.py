import sqlite3,json,subprocess
db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
sites=['voz.vn','otofun.net','forum.gamevn.com','bovagau.vn','phunuvietkhoinghiep.vn','tctd.vn']
rows=[]
for site in sites:
 r=db.execute("SELECT site,native_id,url,reason FROM forum_urls WHERE site=? AND (reason LIKE '%PARSE%' OR reason IN ('topic_required_fields_missing','original_publication_missing')) ORDER BY next_at DESC LIMIT 1",(site,)).fetchone()
 if r:rows.append(dict(r))
code=r'''
import fs from 'node:fs';import * as cheerio from 'cheerio';
import {parsePage} from './src/forumFlow/adapters.mjs';import {createResearchTransport} from './src/web/researchTransport.mjs';
const rows=ROWS,sites=JSON.parse(fs.readFileSync('config/forum-flow/sites.json')),transport=createResearchTransport({timeoutMs:15000,maxSockets:2,persistEvidence:false});
try{for(const row of rows){const site=sites.find(s=>s.domain===row.site);const r=await transport.get(row.url,null,'qc');let p;try{p=r.html?parsePage(r.html,r.finalUrl||row.url,site):null;}catch(e){p={error:e.message};}const $=cheerio.load(r.html||'');console.log(JSON.stringify({...row,httpError:r.error,status:r.statusCode,title:p?.title,error:p?.error,rejected:p?.rejected,validPosts:p?.posts?.length,posts:$('article.message--post,li.message[id],div.message[id]').toArray().filter(e=>(p?.rejected||[]).some(x=>$(e).attr('id')?.endsWith(x.nativePostId))).slice(0,5).map(e=>{const n=$(e);return{id:n.attr('id'),author:n.find('a.username').first().text(),body:n.find('.message-body,.messageContent').first().text().slice(0,100),bodyHtml:n.find('.message-body,.messageContent').first().html()?.slice(0,1600)}})}));}}finally{await transport.close();}
'''.replace('ROWS',json.dumps(rows))
r=subprocess.run(['/opt/forum-flow/node/bin/node','--input-type=module','-e',code],cwd='/opt/forum-flow/current',capture_output=True,text=True,timeout=120)
print(r.stdout)
if r.returncode:print(r.stderr[:1000])
print('ATTEMPTS',json.dumps([dict(r) for r in db.execute("SELECT site,url,count(*) n FROM forum_events WHERE kind IN ('topic_page','topic_failed') AND at>(strftime('%s','now')-3600)*1000 GROUP BY site,url ORDER BY n DESC LIMIT 8")]))
