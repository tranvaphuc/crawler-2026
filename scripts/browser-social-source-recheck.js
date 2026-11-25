/* Read-only source metadata in the user's existing Threads/Instagram/YouTube tab.
 * Select only the corresponding local JSON queue. No cookie/token reads or HTML exports.
 */
(()=>{
 'use strict';
 const origin=location.origin,host=location.hostname;
 const channel=/(^|\.)instagram\.com$/.test(host)?'Instagram':/(^|\.)(threads\.com|threads\.net)$/.test(host)?'Threads':/(^|\.)youtube\.com$/.test(host)?'YouTube':null;
 const state={records:[],total:0,next:0,active:0,running:false,stopped:false,reason:''},controllers=new Set();
 function walk(v,fn,encodedDepth=0){if(typeof v==='string'&&encodedDepth<3&&v.length<10000000&&/^\s*[\[{]/.test(v)){try{walk(JSON.parse(v),fn,encodedDepth+1);}catch{}return;}if(!v||typeof v!=='object')return;fn(v);for(const c of Object.values(v))if(c&&(['object','string'].includes(typeof c)))walk(c,fn,encodedDepth);}
 function jsonAssignment(text,name){
  const marker=new RegExp('(?:var\\s+)?'+name+'\\s*=\\s*').exec(text);if(!marker)return null;
  let begin=marker.index+marker[0].length;if(text[begin]!=='{')return null;
  let depth=0,quote=false,escape=false;
  for(let i=begin;i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;continue;}if(c==='"')quote=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{return JSON.parse(text.slice(begin,i+1));}catch{return null;}}}return null;
 }
 function canonical(input){const u=new URL(input,origin);const allowed=channel==='Instagram'?/(^|\.)instagram\.com$/:channel==='Threads'?/(^|\.)(threads\.com|threads\.net)$/:/(^|\.)(youtube\.com|youtu\.be)$/;if(!allowed.test(u.hostname))throw Error('OUTSIDE_SOURCE_CHANNEL');u.protocol='https:';u.host=new URL(origin).host;u.hash='';return u.href;}
 function extract(html,url){
  const path=new URL(url).pathname,segments=path.split('/').filter(Boolean);
  if(channel==='YouTube'){
   const initial=jsonAssignment(html,'ytInitialData'),player=jsonAssignment(html,'ytInitialPlayerResponse');
   const meta=initial?.metadata?.channelMetadataRenderer;
   if(meta?.externalId&&/^UC[A-Za-z0-9_-]{22}$/.test(meta.externalId))return{name:meta.title||'',id:meta.externalId,url:origin+'/channel/'+meta.externalId,type:'channel',status:'live',note:'Đã xác minh channelMetadataRenderer trong phiên Chrome.'};
   const video=player?.videoDetails;
   if(video?.channelId&&/^UC[A-Za-z0-9_-]{22}$/.test(video.channelId))return{kind:'owner',ownerUrl:origin+'/channel/'+video.channelId};
   return null;
  }
  const doc=new DOMParser().parseFromString(html,'text/html');
  const handle=(segments[0]||'').replace(/^@/,'').toLowerCase(),threadPost=channel==='Threads'&&segments[1]==='post',content=threadPost||['p','reel','tv','stories'].includes(segments[0]),contentCode=threadPost?segments[2]:segments[1];
  const matches=[],owners=[];
  for(const script of doc.querySelectorAll('script[type="application/json"]')){
   let payload;try{payload=JSON.parse(script.textContent);}catch{continue;}
   walk(payload,v=>{
    if(!content && typeof v.username==='string'&&v.username.toLowerCase()===handle && (v.pk||v.id)){
     const id=String(v.pk||v.id);if(/^\d+$/.test(id))matches.push({id,name:v.full_name||v.name||v.username,private:v.is_private===true});
    }
    if(content && contentCode && (v.shortcode===contentCode||v.code===contentCode) && (v.owner?.username||v.user?.username))owners.push(v.owner?.username||v.user.username);
   });
  }
  if(content && owners.length && new Set(owners).size===1)return{kind:'owner',ownerUrl:origin+'/'+(channel==='Threads'?'@':'')+owners[0]+'/'};
  if(threadPost){const canonical=doc.querySelector('meta[property="og:url"]')?.content;try{const p=new URL(canonical).pathname.split('/').filter(Boolean);if(p[0]?.startsWith('@')&&p[1]==='post'&&p[2]===contentCode)return{kind:'owner',ownerUrl:origin+'/'+p[0]+'/'};}catch{}}
  const ids=[...new Set(matches.map(m=>m.id))];
  if(ids.length===1){const m=matches.find(m=>m.id===ids[0]);return{name:m.name,id:ids[0],url:origin+'/'+(channel==='Threads'?'@':'')+handle+'/',type:'profile',status:'live',note:'Đã xác minh metadata đúng username trong Chrome đăng nhập.'+(m.private?' Tài khoản private; định danh profile vẫn xác minh được.':'')};}
  if(ids.length>1)return{status:'chưa xác định',note:'Metadata có nhiều numeric ID cùng username; chưa đủ bằng chứng chọn ID nguồn.'};
  const ogTitle=doc.querySelector('meta[property="og:title"]')?.content||'',ogUrl=doc.querySelector('meta[property="og:url"]')?.content||'';
  let canonicalHandle='';try{canonicalHandle=new URL(ogUrl).pathname.split('/').filter(Boolean)[0]?.replace(/^@/,'').toLowerCase()||'';}catch{}
  if(!content && handle && canonicalHandle===handle && ogTitle.toLowerCase().includes('(@'+handle+')')){
   const profileIds=channel==='Instagram'?[...new Set([...html.matchAll(/profilePage_(\d+)/g)].map(m=>m[1]))]:[];
   return{name:ogTitle.split('(@')[0].trim(),id:profileIds.length===1?profileIds[0]:null,url:ogUrl,type:'profile',status:'live',note:profileIds.length===1?'Đã xác minh canonical profile, username và numeric ID profilePage trong HTML Instagram.':'Đã xác minh tên và canonical profile trong Chrome; numeric ID chưa được xác minh.'};
  }
  return null;
 }
 function stop(reason='Stopped by user'){state.stopped=true;state.reason=reason;for(const c of controllers)c.abort();}
 async function read(url){
  const c=new AbortController();controllers.add(c);const timer=setTimeout(()=>c.abort(),20000);
  try{const r=await fetch(canonical(url),{credentials:'same-origin',headers:{Accept:'text/html'},signal:c.signal}),u=new URL(r.url);
   if([401,403,429].includes(r.status)||/\/(?:accounts\/login|challenge|checkpoint|login)(?:\/|\.php|$)/i.test(u.pathname)){stop(r.status===429?'RATE_LIMITED':'AUTH_OR_SECURITY_REQUIRED');throw Error(state.reason);}
   if(!r.ok)throw Error('HTTP_'+r.status);
   return extract(await r.text(),r.url);
  }finally{clearTimeout(timer);controllers.delete(c);}
 }
 async function resolve(row){let result;const target=row.url||row.originalLink;try{result=await read(target);}catch(e){if(e.message!=='HTTP_404')throw e;}if(!result&&row.originalLink!==target&&/\/(?:post|p|reel)\//.test(row.originalLink))result=await read(row.originalLink);if(result?.kind==='owner')result=await read(result.ownerUrl);return result?.status?result:{status:'chưa xác định',note:'Chrome chưa trả metadata đủ để xác minh source; không kết luận die.'};}
 function summary(){return{channel,total:state.total,checked:state.records.length,active:state.active,unstarted:state.total-state.next,running:state.running,stopped:state.stopped,reason:state.reason};}
 function download(){const blob=new Blob([state.records.map(r=>JSON.stringify(r)).join('\n')+'\n'],{type:'application/x-ndjson'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='source-followup-'+channel.toLowerCase()+'.jsonl';a.click();setTimeout(()=>URL.revokeObjectURL(href),10000);}
 async function run(queue){if(!channel)throw Error('Use a supported social source tab');if(state.running)throw Error('Already running');if(queue.some(r=>r.channel!==channel))throw Error('Queue does not match this channel');Object.assign(state,{total:queue.length,next:0,records:[],running:true,stopped:false,reason:''});
  try{await Promise.all(Array.from({length:2},async()=>{while(!state.stopped&&state.next<queue.length){const row=queue[state.next++];state.active++;try{state.records.push({index:row.index,keys:row.keys,channel,originalLink:row.originalLink,...await resolve(row),checkedAt:new Date().toISOString()});}catch(e){state.records.push({index:row.index,keys:row.keys,channel,originalLink:row.originalLink,status:'chưa xác định',note:'Browser read: '+e.message,checkedAt:new Date().toISOString()});}finally{state.active--;if(state.records.length&&state.records.length%25===0)download();}}}));}finally{state.running=false;download();console.log('SOURCE_FOLLOWUP_FINISHED',JSON.stringify(summary()));}return summary();
 }
 function chooseAndRun(){const i=document.createElement('input');i.type='file';i.accept='.json';i.onchange=async()=>{if(i.files?.[0])await run(JSON.parse(await i.files[0].text()));};i.click();}
 globalThis.KompaSocialAudit={run,chooseAndRun,summary,download,stop,_extract:extract};
 console.log('SOCIAL_AUDIT_READY',channel);
})();
