// Queue-only recovery. Original documents, proofs, timestamps and ES are untouched.
export function recoverForumWriterParents(state,beforeWrite){
 beforeWrite();return state.tx(()=>{
  const promoted=Number(state.db.prepare("UPDATE forum_documents AS p SET export_state='pending',export_reason=NULL WHERE p.role='forumTopic' AND p.export_state='context_only' AND EXISTS (SELECT 1 FROM forum_documents c WHERE c.site=p.site AND c.role='forumComment' AND c.thread_id=p.thread_id)").run().changes);
  const requeued=Number(state.db.prepare("UPDATE forum_documents AS c SET export_state='pending',export_reason=NULL WHERE c.role='forumComment' AND c.export_state='held' AND c.export_reason='FORUM_PARENT_NOT_RECONCILED' AND EXISTS (SELECT 1 FROM forum_es_bindings b JOIN forum_documents p ON p.site=b.site AND p.role='forumTopic' AND p.thread_id=b.native_id WHERE b.site=c.site AND b.role='forumTopic' AND b.native_id=c.thread_id AND p.export_state IN ('created','existing'))").run().changes);
  return {promotedParents:promoted,requeuedComments:requeued};
 });
}
