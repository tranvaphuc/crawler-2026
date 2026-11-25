import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {ForumState} from '../src/forumFlow/state.mjs';
import {ForumRuntime} from '../src/forumFlow/runtime.mjs';
import {parsePage} from '../src/forumFlow/adapters.mjs';
import {forumBatchIdentityQuery} from '../src/forumFlow/bulkEs5.mjs';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';
import {selectProvenParent} from './forum_parent_selection_20261118.mjs';

const directory=process.env.FORUM_REPAIR_DIRECTORY||'/var/lib/forum-flow/writer-repair-20261119';
const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite',{readOnly:true});
const rows=db.prepare("SELECT p.*,(SELECT COUNT(*) FROM forum_documents c WHERE c.site=p.site AND c.thread_id=p.thread_id AND c.export_state='held' AND c.export_reason='FORUM_PARENT_NOT_RECONCILED') blocked FROM forum_documents p WHERE p.role='forumTopic' AND p.export_state='held' AND EXISTS (SELECT 1 FROM forum_documents c WHERE c.site=p.site AND c.thread_id=p.thread_id AND c.export_state='held' AND c.export_reason='FORUM_PARENT_NOT_RECONCILED') ORDER BY blocked DESC").all();db.close();
const sites=JSON.parse(await fs.readFile('config/forum-flow/sites.json')),map=new Map(sites.map(s=>[s.domain,s]));
const legacy=JSON.parse(await fs.readFile(directory+'/legacy-formats.json'));
const state=await ForumState.open(':memory:'),runtime=new ForumRuntime({state,sites,evidenceDirectory:directory+'/parent-evidence'});
const env=dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env'));
const es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',connectionClass:ForumBoundedEsConnection,log:[],maxRetries:0,requestTimeout:120000});
const plan={at:new Date().toISOString(),selected:[],held:[]};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const save=async()=>fs.writeFile(directory+'/parent-plan.json',JSON.stringify(plan,null,2));
try{
 await save();
 for(let offset=0;offset<rows.length;offset+=10){
  const batch=rows.slice(offset,offset+10).map(row=>({row,doc:JSON.parse(row.doc),proof:JSON.parse(row.proof)}));
  const response=await es.search({index:'master*',type:'forumTopic',filterPath:'timed_out,_shards.failed,hits.total,hits.hits',body:{size:4000,timeout:'90s',query:{constant_score:{filter:forumBatchIdentityQuery(batch,map)}},_source:['url','siteName','publishedDate']}});
  if(response.timed_out||response._shards?.failed||!response.hits?.hits||response.hits.total>response.hits.hits.length)throw Error('PARENT_SEARCH_INCOMPLETE');
  for(const item of batch){
   const {row,doc,proof}=item,site=map.get(row.site);
   try{
    const input={hits:response.hits.hits,doc,proof,site,legacy:legacy[row.site]?.config};
    let choice=selectProvenParent(input),evidenceFile,evidenceOrigin,canonical;
    if(!choice.valid.length){plan.held.push({site:row.site,threadId:row.thread_id,blocked:row.blocked,reason:'NO_PROVEN_CLOCK_MATCH',forumPublished:doc._source.publishedDate,candidates:choice.hits});await save();continue;}
    // Reparse the original captured page even if the origin is now inaccessible.
    const previous=proof.evidence;
    if(previous?.evidenceFile){
     const bytes=await fs.readFile(previous.evidenceFile),html=previous.evidenceFile.endsWith('.gz')?gunzipSync(bytes).toString():bytes.toString();
     if(!previous.contentHash||createHash('sha256').update(html).digest('hex')!==previous.contentHash)throw Error('PARENT_EVIDENCE_HASH_MISMATCH');
     const page=parsePage(html,previous.finalUrl||doc._source.url,site),first=page.posts.find(p=>p.role==='forumTopic');
     if(!page.complete||String(page.nativeThreadId)!==String(row.thread_id)||String(first?.nativePostId)!==String(row.native_id)||first.publishedDate!==doc._source.publishedDate)throw Error('PARENT_EVIDENCE_CLOCK_IDENTITY_MISMATCH');
     evidenceFile=previous.evidenceFile;evidenceOrigin='captured_verified_page';canonical=page.threadUrl;
    }
    if(!evidenceFile)throw Error('PARENT_EVIDENCE_REQUIRED');
    choice=selectProvenParent({...input,freshCanonicalUrl:canonical});
    // A live canonical URL can resolve a historic slug that changed after capture.
    if(!choice.selected){
     try{const fetched=await runtime.fetch(site,doc._source.url),page=parsePage(fetched.html,fetched.finalUrl,site),first=page.posts.find(p=>p.role==='forumTopic');
      if(!page.complete||String(page.nativeThreadId)!==String(row.thread_id)||String(first?.nativePostId)!==String(row.native_id)||first.publishedDate!==doc._source.publishedDate)throw Error('FRESH_PARENT_MISMATCH');
      choice=selectProvenParent({...input,freshCanonicalUrl:page.threadUrl});evidenceFile=fetched.evidenceFile;evidenceOrigin='fresh_verified_page';
     }catch{}
    }
    const selected=choice.selected;
    if(!selected){plan.held.push({site:row.site,threadId:row.thread_id,blocked:row.blocked,reason:'AMBIGUOUS_VALID_PARENTS',candidates:choice.hits});await save();continue;}
    const full=await es.get({index:selected._index,type:'forumTopic',id:selected._id});
    plan.selected.push({site:row.site,nativeId:row.native_id,threadId:row.thread_id,blocked:row.blocked,expectedSourceId:doc._id,forumPublished:doc._source.publishedDate,esPublished:full._source.publishedDate,esIndex:full._index,esId:full._id,esVersion:full._version,esSourceHash:hash(full._source),precision:Date.parse(full._source.publishedDate)===Date.parse(doc._source.publishedDate)?'second':'minute',selection:choice.selection,duplicateCount:choice.hits.length,evidenceFile,evidenceOrigin});
   }catch(e){plan.held.push({site:row.site,threadId:row.thread_id,blocked:row.blocked,reason:/^[A-Z_]+$/.test(e.message)?e.message:'PARENT_AUDIT_UNAVAILABLE'});}
   await save();
  }
  console.log(JSON.stringify({checked:Math.min(offset+10,rows.length),selected:plan.selected.length,held:plan.held.length}));
 }
 plan.finishedAt=new Date().toISOString();await save();
}finally{await runtime.transport.close();es.close();state.close();}
