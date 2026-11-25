import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {ForumState} from '../src/forumFlow/state.mjs';
import {ForumBulkEs5Sink} from '../src/forumFlow/bulkEs5.mjs';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';
import {claimForumWriterLease,renewForumWriterLease} from '../src/forumFlow/writerLease.mjs';
import {forumTime} from '../src/forumFlow/time.mjs';
import {forumIdentity} from '../src/forumFlow/es5.mjs';
import {parsePage} from '../src/forumFlow/adapters.mjs';
import {provenLegacyForumMinute} from './forum_parent_selection_20261118.mjs';

const directory='/var/lib/forum-flow/writer-repair-20261119',state=await ForumState.open('/var/lib/forum-flow/runtime/state.sqlite'),sites=JSON.parse(await fs.readFile('config/forum-flow/sites.json')),map=new Map(sites.map(s=>[s.domain,s]));
const legacy=JSON.parse(await fs.readFile(directory+'/legacy-formats.json')),env=dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env')),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',connectionClass:ForumBoundedEsConnection,log:[],maxRetries:0,requestTimeout:120000});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),owner=randomUUID(),result={at:new Date().toISOString(),reconciled:[],held:[],esWrites:0};let locked=false,timer,expiry=0;
const guard=()=>{const r=state.db.prepare('SELECT * FROM forum_writer_lease WHERE id=1').get();if(!locked||r?.owner!==owner||r.expires<=Date.now())throw Error('LEASE_LOST');};
const save=async()=>fs.writeFile(directory+'/legacy-comment-reconciliation.json',JSON.stringify(result,null,2));
try{
 if(execFileSync('systemctl',['show','forum-flow-writer','-p','ActiveState','--value']).toString().trim()!=='inactive')throw Error('WRITER_MUST_BE_STOPPED');
 locked=claimForumWriterLease(state,owner);if(!locked)throw Error('LEASE_BUSY');expiry=state.db.prepare('SELECT expires FROM forum_writer_lease').get().expires;
 timer=setInterval(()=>{try{expiry=renewForumWriterLease(state,owner,expiry).expires;}catch{locked=false;}},20000);
 const sink=new ForumBulkEs5Sink({es,state,sites,write:true,beforeWrite:guard,proof:JSON.parse(await fs.readFile('/etc/forum-flow/identity-proof.json'))});await sink.initialize();
 const items=state.db.prepare("SELECT * FROM forum_documents WHERE role='forumComment' AND export_state='held' AND export_reason='FORUM_EXISTING_PUBLICATION_TIME_DIFFERS'").all().filter(row=>provenLegacyForumMinute(map.get(row.site),legacy[row.site]?.config)).map(row=>({row,doc:JSON.parse(row.doc),proof:JSON.parse(row.proof)}));
 const matches=items.length?await sink.lookupBatch(items):new Map();await save();
 state.db.exec('CREATE TABLE IF NOT EXISTS forum_comment_reconciliations(site TEXT,native_id TEXT,es_index TEXT,es_id TEXT,forum_published TEXT,es_published TEXT,precision TEXT,evidence_file TEXT,es_version INTEGER,es_source_hash TEXT,legacy_config_hash TEXT,PRIMARY KEY(site,native_id))');
 for(const item of items){
  const {row,doc,proof}=item;
  try{
   guard();const site=map.get(row.site),match=matches.get(row.site+'|'+row.native_id);
   if(match.reason||!match.hit)throw Error(match.reason||'EXISTING_COMMENT_NOT_FOUND');
   const time=forumTime(proof.time.raw,{kind:proof.time.kind,source:proof.time.source}),published=Date.parse(match.hit._source.publishedDate);
   if(time.publishedDate!==doc._source.publishedDate||published%60000!==0||Math.floor(published/60000)!==Math.floor(Date.parse(time.publishedDate)/60000))throw Error('COMMENT_CLOCK_NOT_LEGACY_MINUTE');
   const evidence=proof.evidence,bytes=await fs.readFile(evidence.evidenceFile),html=evidence.evidenceFile.endsWith('.gz')?gunzipSync(bytes).toString():bytes.toString();
   if(createHash('sha256').update(html).digest('hex')!==evidence.contentHash)throw Error('COMMENT_EVIDENCE_HASH_MISMATCH');
   const parsed=parsePage(html,evidence.finalUrl||doc._source.url,site),post=parsed.posts.find(p=>p.role==='forumComment'&&String(p.nativePostId)===row.native_id);
   if(!post||post.publishedDate!==time.publishedDate||forumIdentity(post.url,'forumComment',site)!==forumIdentity(doc._source.url,'forumComment',site))throw Error('COMMENT_EVIDENCE_IDENTITY_MISMATCH');
   const parent=state.db.prepare("SELECT * FROM forum_es_bindings WHERE site=? AND role='forumTopic' AND native_id=?").get(row.site,row.thread_id);
   if(!parent||match.hit._source.parentId!==parent.es_id||Date.parse(match.hit._source.parentDate)!==Date.parse(parent.published))throw Error('EXISTING_COMMENT_PARENT_MISMATCH');
   const root=await es.get({index:parent.es_index,type:'forumTopic',id:parent.es_id});
   if(root._source.publishedDate!==parent.published||forumIdentity(root._source.url,'forumTopic',site)!=='topic:'+row.thread_id)throw Error('PARENT_BINDING_MISMATCH');
   const full=await es.get({index:match.hit._index,type:'forumComment',id:match.hit._id}),fingerprint=hash(full._source);
   if(full._source.publishedDate!==match.hit._source.publishedDate||full._source.parentId!==parent.es_id||Date.parse(full._source.parentDate)!==Date.parse(parent.published)||!site.allowedHosts.includes(full._source.siteName)||forumIdentity(full._source.url,'forumComment',site)!==forumIdentity(doc._source.url,'forumComment',site))throw Error('ES_COMMENT_CHANGED');
   guard();state.tx(()=>{
    sink.bind(row,full);
    state.db.prepare('INSERT OR REPLACE INTO forum_comment_reconciliations VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(row.site,row.native_id,full._index,full._id,doc._source.publishedDate,full._source.publishedDate,'minute',evidence.evidenceFile,full._version,fingerprint,legacy[row.site].sha256);
    const n=state.db.prepare("UPDATE forum_documents SET export_state='existing',export_reason='FORUM_LEGACY_MINUTE_AUDITED' WHERE site=? AND role='forumComment' AND native_id=? AND export_state='held' AND export_reason='FORUM_EXISTING_PUBLICATION_TIME_DIFFERS'").run(row.site,row.native_id).changes;if(n!==1)throw Error('LOCAL_COMMENT_CHANGED');
   });
   const after=await es.get({index:full._index,type:'forumComment',id:full._id});if(after._version!==full._version||hash(after._source)!==fingerprint)throw Error('HISTORICAL_COMMENT_CHANGED');
   result.reconciled.push({site:row.site,nativeId:row.native_id,threadId:row.thread_id,index:full._index,id:full._id,esVersion:full._version,esSourceHash:fingerprint,forumPublished:doc._source.publishedDate,esPublished:full._source.publishedDate,evidenceFile:evidence.evidenceFile});
  }catch(e){result.held.push({site:row.site,nativeId:row.native_id,reason:/^[A-Z_]+$/.test(e.message)?e.message:e.code||'COMMENT_RECONCILIATION_FAILED'});}
  await save();
 }
 result.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({reconciled:result.reconciled.length,held:result.held,esWrites:0}));
}catch(e){console.log(JSON.stringify({error:/^[A-Z_]+$/.test(e.message)?e.message:e.code||'COMMENT_RECONCILIATION_FAILED'}));process.exitCode=1;}
finally{clearInterval(timer);state.db.prepare('DELETE FROM forum_writer_lease WHERE owner=?').run(owner);state.close();es.close();}
