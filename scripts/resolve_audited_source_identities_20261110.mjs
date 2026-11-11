import fs from 'node:fs/promises';import {fetchPage,parseMetadata,decode} from './source_audit_metadata.mjs';
const root='outputs/project-refresh-2026-11-10',dir=root+'/completion';
const rows=JSON.parse(await fs.readFile(root+'/sources-to-add.json','utf8')).filter(x=>!x.eligible),checks=new Map((await fs.readFile(dir+'/source-checks.jsonl','utf8')).split('\n').filter(Boolean).map(l=>{const r=JSON.parse(l);return [r._id,r];})),results=[];
for(const s of rows.filter(x=>x.platform==='facebook')){
 const check=checks.get(s._id);if(!check?.responseFile)continue;
 const html=await fs.readFile(check.responseFile,'utf8'),groupId=new URL(s.url).pathname.match(/^\/groups\/(\d+)/)?.[1];
 if(groupId&&new RegExp('"(?:groupID|group_id)"\\s*:\\s*"'+groupId+'"').test(html)&&check.responseTitle&&!/log in|not found|unavailable|content isn.t available/i.test(check.responseTitle)){
  results.push({_id:s._id,platform:'facebook',nativeId:groupId,type:'group',name:check.responseTitle,url:'https://www.facebook.com/groups/'+groupId,decision:'IDENTITY_CONFIRMED',evidence:'Facebook groupID/group_id in returned public page matches URL; source title present',checkedAt:check.checkedAt});
 }
}
await fs.writeFile(dir+'/resolved-source-identities.json',JSON.stringify(results,null,2));console.log(JSON.stringify({facebookVerified:results.length}));
const maps=rows.filter(x=>x.platform==='gg reviews'),mapDone=new Map();try{for(const l of(await fs.readFile(dir+'/maps-checks.jsonl','utf8')).split('\n').filter(Boolean)){const r=JSON.parse(l);mapDone.set(r._id,r);}}catch(e){if(e.code!=='ENOENT')throw e;}
const queue=maps.filter(s=>!mapDone.has(s._id));
async function worker(){while(queue.length){const s=queue.shift();let result={_id:s._id,platform:s.platform,decision:'PLACE_IDENTITY_UNCONFIRMED',checkedAt:new Date().toISOString()};try{
 const page=await fetchPage(s.url,{timeout:10000,maxBytes:2500000});let meta=parseMetadata({channel:'GG Reviews',url:s.url,type:'place',id:s.nativeId},page);
 const preview=page.body.match(/<link href="([^"<]*\/maps\/preview\/place\?[^"<]*)"/);
 if(preview){const target=new URL(decode(preview[1]),'https://www.google.com');if(target.hostname==='www.google.com'){const p=await fetchPage(target.href,{timeout:10000,maxBytes:1500000});const data=JSON.parse(p.body.replace(/^\)\]\}'\s*/,'')),place=data?.[6];if(typeof place?.[11]==='string'&&/^ChI[\w-]+$/.test(place?.[78]??'')&&meta.cid)result={...result,decision:'IDENTITY_CONFIRMED',nativeId:meta.cid,cid:meta.cid,placeId:place[78],name:place[11],url:'https://www.google.com/maps?cid='+meta.cid,evidence:'Public Google Maps place preview: CID + business name + Place ID'};}}
 if(result.decision!=='IDENTITY_CONFIRMED')result={...result,title:meta.name,cid:meta.cid,placeId:meta.placeId,httpStatus:page.status,note:meta.note};
 }catch(e){result.error=e.code||e.name;}
 mapDone.set(s._id,result);await fs.appendFile(dir+'/maps-checks.jsonl',JSON.stringify(result)+'\n');if(mapDone.size%100===0)console.log(JSON.stringify({mapsChecked:mapDone.size,verified:[...mapDone.values()].filter(x=>x.decision==='IDENTITY_CONFIRMED').length}));}}
await Promise.all(Array.from({length:6},worker));await fs.writeFile(dir+'/maps-checks.json',JSON.stringify([...mapDone.values()],null,2));console.log(JSON.stringify({mapsChecked:mapDone.size,mapsVerified:[...mapDone.values()].filter(x=>x.decision==='IDENTITY_CONFIRMED').length}));
