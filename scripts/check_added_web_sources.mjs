import fs from 'node:fs/promises';
import {fetchPage,parseMetadata} from './source_audit_metadata.mjs';
const root='outputs/source-audit-additions-2026-10-22',follow='outputs/source-audit-followup-2026-10-22';
const queue=JSON.parse(await fs.readFile(root+'/browser-new.json','utf8')).filter(r=>['Website','News','Forum'].includes(r.channel));
const saved=[];
async function worker(){while(queue.length){const row=queue.shift();let result;try{result=parseMetadata(row,await fetchPage(row.url));if(/just a moment|access denied|attention required|checking your browser|bot verification|welcome to nginx|IIS Windows Server/i.test(result.name||''))result={...result,status:'chưa xác định',note:'Trang chặn/xác minh hoặc trang mặc định; chưa xác minh website nguồn hoạt động.'};}catch(e){result={status:'chưa xác định',note:'Lỗi kết nối '+(e.code||e.name)+'; chưa kết luận die.',checkedAt:new Date().toISOString()};}const record={...row,...result};saved.push(record);await fs.appendFile(follow+'/browser-updates.jsonl',JSON.stringify(record)+'\n');}}
await Promise.all(Array.from({length:3},worker));await fs.writeFile(root+'/web-results.json',JSON.stringify(saved,null,2));console.log(JSON.stringify({checked:saved.length,status:saved.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
