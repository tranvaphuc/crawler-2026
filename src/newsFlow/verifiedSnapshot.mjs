import {ThreeFlowState} from './threeFlowState.mjs';
import {articleKey} from './identity.mjs';

// A one-off recovery may finish a historical held task, never a live claim.
export class VerifiedSnapshotState extends ThreeFlowState {
  applicable(task){const row=this.db.prepare('SELECT parse_status,error,task_id FROM article_links WHERE parse_key=?').get(articleKey(task.url));return row?.parse_status==='fail'&&row.task_id===task.id&&row.error===task.snapshotError;}
  completeVerified(task,...args){return this.tx(()=>this.applicable(task)?super.completeVerified(task,...args):{skipped:true});}
  completeHeld(task,...args){return this.tx(()=>this.applicable(task)?super.completeHeld(task,...args):{skipped:true});}
}

export function verifiedSnapshotMatches(audit,previous) {
  const parsed=audit?.parsed;
  return !!(parsed&&previous&&!audit.error&&!audit.quality?.length&&!audit.policyConflict
    &&parsed._id===previous._id
    &&parsed._source.title===previous._source?.title
    &&parsed._source.publishedDate===previous._source?.publishedDate
    &&parsed.extracted.contentSha256===previous.extracted?.contentSha256);
}
