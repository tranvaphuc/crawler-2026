import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {ForumState} from '../src/forumFlow/state.mjs';
import {ForumRuntime} from '../src/forumFlow/runtime.mjs';
import {parsePage} from '../src/forumFlow/adapters.mjs';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';
import {selectProvenParent} from './forum_parent_selection_20261118.mjs';
import {observedOriginalParentTarget} from './forum_original_parent_canonical_20261119.mjs';

const directory=process.env.FORUM_REPAIR_DIRECTORY||'/var/lib/forum-flow/writer-repair-20261119',audit=JSON.parse(await fs.readFile(directory+'/parent-plan.json'));
if(!audit.finishedAt)throw Error('AUDIT_NOT_FINISHED');
const sites=JSON.parse(await fs.readFile('config/forum-flow/sites.json')),map=new Map(sites.map(s=>[s.domain,s])),legacy=JSON.parse(await fs.readFile(directory+'/legacy-formats.json'));
const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite',{readOnly:true}),state=await ForumState.open(':memory:'),runtime=new ForumRuntime({state,sites,evidenceDirectory:directory+'/original-evidence'});
const env=dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env')),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',connectionClass:ForumBoundedEsConnection,log:[],maxRetries:0,requestTimeout:120000});
const plan={at:new Date().toISOString(),selected:[],held:[]},hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const save=async()=>fs.writeFile(directory+'/original-plan.json',JSON.stringify(plan,null,2));
const rootUrl=url=>{const u=new URL(url);return !/\/(?:page-\d+|post-\d+|posts\/\d+)\/?$/.test(u.pathname)&&!u.hash;};
try{
 await save();
 for(const entry of [...audit.selected,...audit.held].filter(p=>p.blocked>0)){
  const {site:domain,threadId}=entry,site=map.get(domain);
  try{
   const row=db.prepare("SELECT * FROM forum_documents WHERE site=? AND role='forumTopic' AND thread_id=?").get(domain,threadId),doc=JSON.parse(row.doc),proof=JSON.parse(row.proof),previous=proof.evidence;
   if(row.export_state!=='held')throw Error('PARENT_STATE_CHANGED');
   const bytes=await fs.readFile(previous.evidenceFile),html=previous.evidenceFile.endsWith('.gz')?gunzipSync(bytes).toString():bytes.toString();
   if(createHash('sha256').update(html).digest('hex')!==previous.contentHash)throw Error('EVIDENCE_HASH_MISMATCH');
   const validate=page=>{const first=page.posts.find(p=>p.role==='forumTopic');if(!page.complete||String(page.nativeThreadId)!==String(threadId)||String(first?.nativePostId)!==String(row.native_id)||first.publishedDate!==doc._source.publishedDate)throw Error('ORIGINAL_ROOT_EVIDENCE_MISMATCH');return page;};
   let page=validate(parsePage(html,previous.finalUrl||doc._source.url,site)),evidenceFile=previous.evidenceFile,evidenceOrigin='captured_verified_page';
   let hits=entry.candidates;
   if(!hits){const h=await es.get({index:entry.esIndex,type:'forumTopic',id:entry.esId});hits=[h];}
   let choice=selectProvenParent({hits,doc,proof,site,legacy:legacy[domain]?.config,freshCanonicalUrl:page.threadUrl});
   let selected=choice.selected,selection=choice.selection;
   if(!selected&&choice.valid.length>1){
    const candidates=choice.valid.filter(h=>rootUrl(h._source.url));
    if(candidates.length===1){selected=candidates[0];selection='unique_verified_root_url';}
    else if(candidates.length>1){
     const counts=await es.search({index:'master*',type:'forumComment',filterPath:'timed_out,_shards.failed,aggregations',body:{size:0,timeout:'90s',query:{bool:{filter:[{terms:{siteName:site.allowedHosts}},{terms:{parentId:candidates.map(c=>c._id)}}]}},aggs:{parents:{terms:{field:'parentId',size:candidates.length}}}}});
     if(counts.timed_out||counts._shards?.failed)throw Error('PARENT_REFERENCE_SEARCH_INCOMPLETE');
     const buckets=counts.aggregations?.parents?.buckets||[],ranked=candidates.map(h=>({hit:h,count:buckets.find(b=>b.key===h._id)?.doc_count||0})).sort((a,b)=>b.count-a.count);
     if(ranked[0].count>0&&ranked[0].count>ranked[1].count){selected=ranked[0].hit;selection='verified_clock_root_with_most_existing_replies';}
    }
   }
   const record={site:domain,nativeId:row.native_id,threadId,blocked:entry.blocked,expectedSourceId:doc._id,forumPublished:doc._source.publishedDate,evidenceFile,evidenceOrigin};
   if(selected){
    const full=await es.get({index:selected._index,type:'forumTopic',id:selected._id});
    plan.selected.push({...record,action:'bind',esPublished:full._source.publishedDate,esIndex:full._index,esId:full._id,esVersion:full._version,esSourceHash:hash(full._source),precision:Date.parse(full._source.publishedDate)===Date.parse(doc._source.publishedDate)?'second':'minute',selection});
   }else if(!choice.valid.length){
    // Historical page-head pseudo-topics have no match for the original clock.
    // Require a fresh independent read before proposing a missing original root.
    const fresh=await runtime.fetch(site,doc._source.url);page=validate(parsePage(fresh.html,fresh.finalUrl,site));
    evidenceFile=fresh.evidenceFile;evidenceOrigin='fresh_and_captured_verified_original';
    const rootCandidates=choice.hits.filter(h=>rootUrl(h._source.url));
    const originals=[];
    for(const h of rootCandidates){const full=await es.get({index:h._index,type:'forumTopic',id:h._id});originals.push({index:full._index,id:full._id,version:full._version,sourceHash:hash(full._source),published:full._source.publishedDate,url:full._source.url,sameAuthor:full._source.author===doc._source.author,sameContent:full._source.content===doc._source.content});}
    // Conflicting originals need human review; missing originals can be restored.
    if(originals.some(h=>h.sameAuthor&&h.sameContent))throw Error('HISTORICAL_ORIGINAL_CLOCK_CONFLICT');
    let targetUrl=doc._source.url,targetId=doc._id;
    const collision=originals.find(h=>h.id===targetId&&h.index===doc._index);
    if(collision){
     const target=observedOriginalParentTarget({doc,site,html:fresh.html,observedUrl:fresh.finalUrl});targetUrl=target.url;targetId=target.id;
    }
    plan.selected.push({...record,evidenceFile,evidenceOrigin,action:'create_original',esPublished:doc._source.publishedDate,esIndex:doc._index,esId:targetId,targetUrl,precision:'second',selection:'missing_original_clock_with_fresh_native_first_post_proof',conflictingHistoricalRoots:originals,historicalCandidateCount:choice.hits.length});
   }else{
    plan.held.push({site:domain,threadId,blocked:entry.blocked,reason:'AMBIGUOUS_VERIFIED_ORIGINALS',valid:choice.valid.map(h=>({index:h._index,id:h._id,url:h._source.url,published:h._source.publishedDate}))});
   }
  }catch(e){plan.held.push({site:domain,threadId,blocked:entry.blocked,reason:/^[A-Z_]+$/.test(e.message)?e.message:'ORIGINAL_REVIEW_UNAVAILABLE'});}
  await save();console.log(JSON.stringify({checked:plan.selected.length+plan.held.length,selected:plan.selected.length,held:plan.held.length}));
 }
 plan.finishedAt=new Date().toISOString();await save();
}finally{db.close();await runtime.transport.close();es.close();state.close();}
