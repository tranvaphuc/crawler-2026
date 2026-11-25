import fs from 'node:fs/promises';
import {fetchPage,parseMetadata,decode} from './source_audit_metadata.mjs';
const root='outputs/source-audit-2026-10-22',targets=JSON.parse(await fs.readFile(root+'/targets.json','utf8'));
const results=new Map();for(const l of(await fs.readFile(root+'/checked.jsonl','utf8')).split('\n').filter(Boolean)){const r=JSON.parse(l);results.set(r.key,r);}
try{for(const l of(await fs.readFile(root+'/repairs.jsonl','utf8')).split('\n').filter(Boolean)){const r=JSON.parse(l);results.set(r.key,r);}}catch(e){if(e.code!=='ENOENT')throw e;}
const queue=targets.filter(s=>{const r=results.get(s.key);return r&&(s.channel==='GG Reviews'&&!r.placeId||s.channel==='Instagram'&&!r.id&&/\/(?:p|reel)\//.test(s.url)||s.channel==='LinkedIn'&&!r.id&&/\/(?:posts|feed)\//.test(s.url));});
console.log('Repair targets '+queue.length);let done=0;
async function worker(){while(queue.length){const s=queue.shift();try{const p=await fetchPage(s.url);let r=parseMetadata(s,p);
 if(s.channel==='GG Reviews'&&p.status===200){const preview=p.body.match(/<link href="([^"<]*\/maps\/preview\/place\?[^"<]*)"/);if(preview){const v=await fetchPage(new URL(decode(preview[1]),'https://www.google.com').href);const a=JSON.parse(v.body.replace(/^\)\]\}'\s*/,'')),place=a?.[6];const feature=place?.[10]?.match(/^0x[\da-f]+:(0x[\da-f]+)$/i);if(typeof place?.[11]==='string'&&/^ChI[\w-]+$/.test(place?.[78]??'')&&feature){const cid=BigInt(feature[1]).toString();r={...r,id:cid,cid,name:place[11],placeId:place[78],url:'https://www.google.com/maps?cid='+cid,status:'live',note:'',identityEvidence:'Google Maps primary place preview feature ID + name + Place ID'};}}}
 if(s.channel==='LinkedIn'&&!r.id&&r.url!==s.url&&/linkedin\.com\/(?:company|school)\//.test(r.url)){const p2=await fetchPage(r.url);r=parseMetadata({...s,url:r.url,type:'company'},p2);}
 const prev=results.get(s.key);if(r.id||r.placeId||r.status==='live')await fs.appendFile(root+'/repairs.jsonl',JSON.stringify({key:s.key,channel:s.channel,...prev,...r,checkedAt:new Date().toISOString()})+'\n');
 }catch{}done++;if(done%20===0)console.log('Repaired/checked '+done);}}
await Promise.all(Array.from({length:5},worker));console.log('FINISHED '+done);
