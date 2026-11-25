// Interleave first reads, unfinished page scans and incremental polls. An
// unbounded list of next_at=0 URLs must not starve an existing scan cursor.
export function selectReadyForumUrls(db,site,limit,cursors,now=Date.now()){
 if(!Number.isSafeInteger(limit)||limit<0)throw Error('FORUM_INVALID_READY_LIMIT');
 if(!limit)return [];
 const groups=[
  db.prepare('SELECT * FROM forum_urls WHERE site=? AND processed=0 AND next_at=0 AND resume_url IS NULL ORDER BY seen,native_id LIMIT ?').all(site,limit),
  db.prepare('SELECT * FROM forum_urls WHERE site=? AND processed=0 AND next_at<=? AND resume_url IS NOT NULL ORDER BY next_at,seen,native_id LIMIT ?').all(site,now,limit),
  db.prepare('SELECT * FROM forum_urls WHERE site=? AND processed=0 AND next_at<=? AND next_at!=0 AND resume_url IS NULL ORDER BY next_at,seen,native_id LIMIT ?').all(site,now,limit)
 ];
 const positions=[0,0,0],selected=[];let cursor=cursors.get(site)||0,empty=0;
 while(selected.length<limit&&empty<3){const group=cursor;cursor=(cursor+1)%3;if(positions[group]<groups[group].length){selected.push(groups[group][positions[group]++]);empty=0;}else empty++;}
 cursors.set(site,cursor);return selected;
}
export function hasUnscheduledForumUrl(db,site){return !!db.prepare('SELECT 1 FROM forum_urls WHERE site=? AND processed=0 AND next_at=0 AND resume_url IS NULL LIMIT 1').get(site);}
