import {flowId} from './crawlerQueueFlow.js';
export function handoffUidImport(enqueue,data,importJobId){
 return enqueue('find-uid',{item:data.item,source:data.source,parent:data.parent,originalImportJobId:importJobId},'uid:'+importJobId,flowId('find-uid',importJobId));
}
export async function migrateFailedUidImport({row,ticket,jobs,backups,enqueue}){
 if(row.uidLookupJobId||!ticket||await ticket.getState()!=='failed')return false;
 await backups.updateOne({_id:'uid-handoff:'+row._id},{$setOnInsert:{original:row,createdAt:new Date()}},{upsert:true});
 // Keep the failed import visible; hand off identity work only once.
 const lookupJobId=await handoffUidImport(enqueue,row.data,row._id);
 await jobs.updateOne({_id:row._id,state:'failed'},{$set:{uidLookupJobId:lookupJobId||flowId('find-uid',row._id),uidHandoffAt:new Date()}});return true;
}
export async function enqueueUidResolvedImport({enqueue,data,proof,lookupJobId}){
 if(!/^[1-9]\d*$/.test(proof.id||''))throw Error('FACEBOOK_UID_PROOF_REQUIRED');
 const {item,source,parent,originalImportJobId}=data,next=flowId('import-uid-resolved',originalImportJobId,proof.id);
 const repaired={...item,author:{...item.author,id:proof.id,idEvidence:proof.evidence}};
 // A distinct ID avoids racing the old import worker's completed/remove event.
 await enqueue('es5-import',{item:repaired,source,parent,uidLookupJobId:lookupJobId},'import:'+next,next);
 return next;
}
