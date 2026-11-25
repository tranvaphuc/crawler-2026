import {createHash} from 'node:crypto';
export const THREAD_CONTEXT_POLICY='native_thread_ancestor_receipt_v1';
const hash=x=>createHash('sha256').update(String(x||'').normalize('NFC').replace(/\r\n/g,'\n').trim()).digest('hex');
const numeric=x=>typeof x==='string'&&/^\d+$/.test(x);
function validPath(path,id,root){return Array.isArray(path)&&path.length>0&&path.length<=64&&path.every(numeric)&&new Set(path).size===path.length&&!path.includes(id)&&path.at(-1)===root;}
export function makeThreadContextProof({item,candidate,existing,parent,canonicalParent,sourceId,runId}){
 const context=item.nativeThreadContext,d=existing?.document,p=canonicalParent?.document,s=d?._source,c=candidate?._source,post=p?._source;
 if(!context||context.policy!=='native_reply_ancestry_v1'||context.rootId!==parent.nativeId||!validPath(context.ancestors,item.id,parent.nativeId)||!Number.isFinite(Date.parse(context.observedAt))||Date.parse(context.observedAt)>Date.now()+5000)return null;
 if(!d||!p||d._type!=='threadsComment'||p._type!=='threadsTopic'||candidate._id!==d._id||candidate._type!==d._type||candidate.nativeId!==item.id||d.nativeId!==item.id||existing.sourceId!==sourceId||canonicalParent.sourceId!==sourceId||!['indexed','existing'].includes(canonicalParent.state))return null;
 if(c.parentId!==parent.systemId||s.parentId!==p._id||s.parentId===parent.systemId||!numeric(p.nativeId)||!context.ancestors.includes(p.nativeId)||s.authorId!==c.authorId||s.siteId!==c.siteId||hash(s.content)!==hash(c.content)||Date.parse(s.publishedDate)!==Date.parse(c.publishedDate)||Date.parse(s.parentDate)!==Date.parse(post.publishedDate)||Date.parse(post.publishedDate)>Date.parse(s.publishedDate)||Date.parse(parent.createdAt)>Date.parse(s.publishedDate))return null;
 return{policy:THREAD_CONTEXT_POLICY,runId,sourceId,commentId:item.id,documentKey:d._type+':'+d._id,rootNativeId:parent.nativeId,rootSystemId:parent.systemId,canonicalParentNativeId:p.nativeId,canonicalParentSystemId:p._id,canonicalParentDocumentKey:p._type+':'+p._id,canonicalParentDate:post.publishedDate,publishedDate:s.publishedDate,authorId:s.authorId,contentHash:hash(s.content),ancestorNativeIds:context.ancestors,observedAt:context.observedAt};
}
export function verifyThreadContextProof(proof,job,d,parent){
 const doc=d?.document,p=parent?.document,s=doc?._source,post=p?._source,id=doc?.nativeId;if(!doc||!p)return false;
 return proof?.policy===THREAD_CONTEXT_POLICY&&job.platform==='threads'&&proof.runId===job.runId&&proof.sourceId===job.sourceId&&d.sourceId===job.sourceId&&parent?.sourceId===job.sourceId&&['indexed','existing'].includes(parent.state)&&doc._type==='threadsComment'&&p._type==='threadsTopic'&&proof.commentId===id&&proof.documentKey===d._id&&proof.rootNativeId===job.parent.nativeId&&proof.rootSystemId===job.parent.systemId&&proof.canonicalParentNativeId===p.nativeId&&proof.canonicalParentSystemId===p._id&&proof.canonicalParentDocumentKey===parent._id&&s.parentId===p._id&&Date.parse(s.parentDate)===Date.parse(post.publishedDate)&&proof.canonicalParentDate===post.publishedDate&&proof.publishedDate===s.publishedDate&&proof.authorId===s.authorId&&proof.contentHash===hash(s.content)&&validPath(proof.ancestorNativeIds,id,job.parent.nativeId)&&proof.ancestorNativeIds.includes(p.nativeId)&&Number.isFinite(Date.parse(proof.observedAt))&&Date.parse(proof.observedAt)<=Date.now()+5000;
}
export function verifyThreadAncestorPosts(documents,hits){
 for(const d of documents){const e=d.document,hs=hits.filter(h=>h._type===e._type&&h._id===e._id);if(hs.length!==1)return{pass:false,reason:hs.length?'COMMENT_ANCESTOR_ES5_NOT_UNIQUE':'COMMENT_ANCESTOR_ES5_NOT_VISIBLE'};const h=hs[0],a=h._source,s=e._source;if(h._index!==e._index||['authorId','siteId','url'].some(k=>a[k]!==s[k])||Date.parse(a.publishedDate)!==Date.parse(s.publishedDate)||hash(a.content)!==hash(s.content))return{pass:false,reason:'COMMENT_ANCESTOR_ES5_IDENTITY_CONFLICT'};}
 return{pass:true};
}
