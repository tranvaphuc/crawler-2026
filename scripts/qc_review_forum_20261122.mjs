// Read-only audit: native first-post clocks, captured evidence, and all ES aliases.
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {DatabaseSync} from 'node:sqlite';
const base='/opt/forum-flow/current',root='/var/lib/forum-flow/qc-20261122',require=createRequire(base+'/package.json'),dotenv=require('dotenv'),ES=require('elasticsearch');
const {ForumState}=await import('file://'+base+'/src/forumFlow/state.mjs');
const {ForumRuntime}=await import('file://'+base+'/src/forumFlow/runtime.mjs');
const {parsePage}=await import('file://'+base+'/src/forumFlow/adapters.mjs');
const {forumIdentity,forumAliases}=await import('file://'+base+'/src/forumFlow/es5.mjs');
const {forumBatchIdentityQuery}=await import('file://'+base+'/src/forumFlow/bulkEs5.mjs');
const {legacyForumTopicId}=await import('file://'+base+'/src/web/newsParser.mjs');
const sites=JSON.parse(fs.readFileSync(base+'/config/forum-flow/sites.json')),map=new Map(sites.map(s=>[s.domain,s]));
const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite',{readOnly:true}),memory=await ForumState.open(':memory:'),runtime=new ForumRuntime({state:memory,sites,evidenceDirectory:root+'/evidence'});
const env=dotenv.parse(fs.readFileSync('/etc/forum-flow/forum.env')),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:120000});
const legacy=JSON.parse(fs.readFileSync('/var/lib/forum-flow/writer-repair-20261119/legacy-formats.json'));
const rows=db.prepare("SELECT p.*,(SELECT count(*) FROM forum_documents c WHERE c.site=p.site AND c.thread_id=p.thread_id AND c.export_reason='FORUM_PARENT_NOT_RECONCILED') blocked FROM forum_documents p WHERE p.role='forumTopic' AND p.export_state='held' ORDER BY blocked DESC").all();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const plan={at:new Date().toISOString(),rows:[]},save=()=>fs.writeFileSync(root+'/forum-plan.json',JSON.stringify(plan,null,2));
const rootUrl=raw=>{const u=new URL(raw);return !u.hash&&!/\/(?:page-\d+|post-\d+|posts\/\d+)\/?$/.test(u.pathname);};
try{
 for(let offset=0;offset<rows.length;offset+=5){
  const items=rows.slice(offset,offset+5).map(row=>({row,doc:JSON.parse(row.doc),proof:JSON.parse(row.proof)}));
  const literal=s=>s.replace(/[.\\?+*|{}\[\]()"#@&<>~]/g,'\\$&');
  const rootFilters=items.map(({row})=>{const site=map.get(row.site);if(site.adapter!=='xenforo'||!/^\d+$/.test(row.thread_id))return forumBatchIdentityQuery(items,map);return {bool:{filter:[{terms:{siteName:site.allowedHosts}},{regexp:{url:{value:'https?://('+site.allowedHosts.map(literal).join('|')+')/(threads|t)/.*\\.'+row.thread_id+'/?',rewrite:'constant_score',max_determinized_states:10000}}}]}};});
  const response=await es.search({index:'master*',type:'forumTopic',body:{size:2000,timeout:'90s',query:{constant_score:{filter:{bool:{should:rootFilters,minimum_should_match:1}}}},_source:['url','siteName','publishedDate','title','author']}});
  if(response.timed_out||response._shards?.failed||!response.hits?.hits||response.hits.total>response.hits.hits.length)throw Error('QC_SEARCH_INCOMPLETE');
  for(const {row,doc,proof} of items){
   const site=map.get(row.site),entry={site:row.site,nativeId:row.native_id,threadId:row.thread_id,blocked:row.blocked,oldReason:row.export_reason,expectedDocHash:hash(doc),expectedProofHash:hash(proof),originalDate:doc._source.publishedDate,originalId:doc._id};
   try{
    const identity=forumIdentity(doc._source.url,'forumTopic',site),hits=response.hits.hits.filter(h=>site.allowedHosts.includes(h._source.siteName)&&forumIdentity(h._source.url,'forumTopic',site)===identity);
    entry.candidates=hits;
    const bytes=fs.readFileSync(proof.evidence.evidenceFile),html=proof.evidence.evidenceFile.endsWith('.gz')?gunzipSync(bytes).toString():bytes.toString();
    if(createHash('sha256').update(html).digest('hex')!==proof.evidence.contentHash)throw Error('QC_CAPTURE_HASH_MISMATCH');
    const validate=(page)=>{const p=page.posts.find(p=>p.role==='forumTopic');if(!page.complete||String(page.nativeThreadId)!==row.thread_id||p?.nativePostId!==row.native_id||p.publishedDate!==doc._source.publishedDate)throw Error('QC_NATIVE_FIRST_POST_MISMATCH');return p;};
    validate(parsePage(html,proof.evidence.finalUrl||doc._source.url,site));entry.capturedVerified=true;entry.evidenceFile=proof.evidence.evidenceFile;
    const f=legacy[row.site]?.config?.comment_processor?.created_time;
    const minuteLegacy=legacy[row.site]?.config?.site_name===site.domain&&f?.format?.includes(':mm')&&!f.format.includes('ss')&&[undefined,'title','datetime'].includes(f.attribute);
    const clock=Date.parse(doc._source.publishedDate),valid=hits.filter(h=>{const t=Date.parse(h._source.publishedDate);return t===clock||(proof.time.precision==='minute'||minuteLegacy&&t%60000===0)&&Math.floor(t/60000)===Math.floor(clock/60000);});
    entry.valid=valid.map(h=>({index:h._index,id:h._id,url:h._source.url,date:h._source.publishedDate}));
    let fresh=null;try{fresh=await runtime.fetch(site,doc._source.url);validate(parsePage(fresh.html,fresh.finalUrl,site));entry.freshVerified=true;entry.evidenceFile=fresh.evidenceFile;entry.freshUrl=fresh.finalUrl;const $=require('cheerio').load(fresh.html);entry.canonical=$('link[rel=canonical]').attr('href');}catch(e){entry.freshError=/^[A-Z0-9_]+$/.test(e.message)?e.message:'QC_FRESH_UNAVAILABLE';}
    let selected=valid.find(h=>h._id===doc._id&&h._index===doc._index);
    if(!selected&&valid.length===1)selected=valid[0];
    if(!selected&&entry.canonical){const aliases=new Set(forumAliases(entry.canonical,site)),canonical=valid.filter(h=>aliases.has(h._source.url));if(canonical.length===1)selected=canonical[0];}
    if(!selected){const roots=valid.filter(h=>rootUrl(h._source.url));if(roots.length===1)selected=roots[0];else if(roots.length>1){const c=await es.search({index:'master*',type:'forumComment',body:{size:0,timeout:'90s',query:{bool:{filter:[{terms:{siteName:site.allowedHosts}},{terms:{parentId:roots.map(h=>h._id)}}]}},aggs:{parents:{terms:{field:'parentId',size:roots.length}}}}});if(c.timed_out||c._shards?.failed)throw Error('QC_REFERENCES_INCOMPLETE');const ranked=roots.map(h=>({h,n:c.aggregations.parents.buckets.find(b=>b.key===h._id)?.doc_count||0})).sort((a,b)=>b.n-a.n);if(ranked[0].n>0&&ranked[0].n>ranked[1].n){selected=ranked[0].h;entry.selection='proven_clock_root_most_existing_replies';}}}
    if(selected){const full=await es.get({index:selected._index,type:'forumTopic',id:selected._id});entry.action='bind';entry.target={index:full._index,id:full._id,version:full._version,sourceHash:hash(full._source),date:full._source.publishedDate,url:full._source.url};}
    else if(!valid.length&&entry.freshVerified){
     entry.roots=[];for(const h of hits.filter(h=>rootUrl(h._source.url))){const full=await es.get({index:h._index,type:'forumTopic',id:h._id});entry.roots.push({index:full._index,id:full._id,version:full._version,sourceHash:hash(full._source),url:full._source.url,date:full._source.publishedDate,sameAuthor:full._source.author===doc._source.author,sameContent:full._source.content===doc._source.content});}
     if(entry.roots.some(h=>h.sameAuthor&&h.sameContent)){entry.action='clock_conflict';}
     else{let targetUrl=doc._source.url,targetId=doc._id;const collision=hits.some(h=>h._id===targetId&&h._index===doc._index);if(collision){if(!entry.canonical)throw Error('QC_CANONICAL_REQUIRED');const u=new URL(entry.canonical,entry.freshUrl);if(!site.allowedHosts.includes(u.hostname)||u.search||u.hash||forumIdentity(u.href,'forumTopic',site)!==identity)throw Error('QC_CANONICAL_IDENTITY_MISMATCH');targetUrl=u.href;targetId=legacyForumTopicId(targetUrl);if(targetId===doc._id)throw Error('QC_CANONICAL_ID_COLLISION');}entry.action='create_original';entry.target={index:doc._index,id:targetId,url:targetUrl,date:doc._source.publishedDate};}
    }else entry.action='held';
   }catch(e){entry.action='held';entry.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.code||'QC_AUDIT_FAILED';}
   plan.rows.push(entry);save();console.log(JSON.stringify({checked:plan.rows.length,thread:entry.threadId,action:entry.action,candidates:entry.candidates?.length,valid:entry.valid?.length,error:entry.error}));
  }
 }
 plan.finishedAt=new Date().toISOString();save();
}finally{db.close();es.close();memory.close();await runtime.transport.close();}
