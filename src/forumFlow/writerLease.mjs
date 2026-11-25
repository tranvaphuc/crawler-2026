export function claimForumWriterLease(state,owner,now=Date.now(),ttl=120000){
 return state.tx(()=>{const row=state.db.prepare('SELECT * FROM forum_writer_lease WHERE id=1').get();if(row&&row.expires>now)return false;state.db.prepare('INSERT OR REPLACE INTO forum_writer_lease VALUES(1,?,?)').run(owner,now+ttl);return true;});
}

// A busy SQLite writer must not turn a healthy daemon into a successful exit.
// Retry only within the last confirmed lease; never revive an expired owner.
export function renewForumWriterLease(state,owner,confirmedExpiry,now=Date.now(),ttl=120000){
 if(confirmedExpiry<=now)throw Error('FORUM_WRITER_LEASE_LOST');
 try{
  const result=state.db.prepare('UPDATE forum_writer_lease SET expires=? WHERE id=1 AND owner=? AND expires>?').run(now+ttl,owner,now);
  if(!result.changes)throw Error('FORUM_WRITER_LEASE_LOST');
  return {expires:now+ttl,retry:false};
 }catch(error){
  if((error.errcode===5||error.errcode===6||['SQLITE_BUSY','SQLITE_LOCKED'].includes(error.code))&&Date.now()<confirmedExpiry)return {expires:confirmedExpiry,retry:true};
  throw error;
 }
}
