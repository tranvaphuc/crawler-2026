import json,sqlite3,time,datetime
from pathlib import Path
root=Path('/var/lib/news-flow/recovery-all-20261123');audit=sqlite3.connect(root/'audit.sqlite',timeout=20);audit.row_factory=sqlite3.Row;live=sqlite3.connect('/var/lib/news-flow/news-flow-runtime/write.sqlite',timeout=20);live.row_factory=sqlite3.Row
rows=audit.execute("SELECT e.*,c.site,c.url,c.checked_at native_checked,s.id,s.checked_at staged_at FROM es_readbacks e JOIN cohort c USING(parse_key) JOIN stage_results s USING(parse_key) WHERE e.status IN ('created_field_mismatch','existing_retained_mismatch')").fetchall();out={'at':int(time.time()*1000),'classifiedHistorical':0,'heldOriginalTime':[],'concurrentChanges':[],'paidManualAiCalls':0}
def minute(value):
 if not isinstance(value,str) or 'T' not in value:return None
 try:return int(datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()//60)
 except (ValueError,TypeError):return None
for row in rows:
 details=json.loads(row['details']);receipt=live.execute('SELECT * FROM import_receipts WHERE id=?',(row['id'],)).fetchone();historical=receipt is not None and receipt['imported_at']<row['staged_at']-1000
 if row['status']=='created_field_mismatch' and historical:
  details['historicalReceipt']=True;details['receiptImportedAt']=receipt['imported_at'];details['stagedAt']=row['staged_at'];audit.execute("UPDATE es_readbacks SET status='existing_retained_mismatch',details=? WHERE parse_key=?",(json.dumps(details),row['parse_key']));out['classifiedHistorical']+=1
 a,b=minute(details.get('expectedPublishedDate')),minute(details.get('storedPublishedDate'))
 if a is None or b is None or a==b:continue
 if live.execute('SELECT 1 FROM outbox WHERE id=?',(row['id'],)).fetchone():continue
 now=int(time.time()*1000);reason='NEWS_EXISTING_ORIGINAL_TIME_CONFLICT';live.execute('BEGIN IMMEDIATE')
 try:
  current=live.execute('SELECT * FROM article_links WHERE parse_key=?',(row['parse_key'],)).fetchone()
  if current is None or current['parse_status']!='done' or current['reviewed_at']!=row['native_checked']:
   live.rollback();out['concurrentChanges'].append(row['url']);continue
  before={'article':dict(current),'failure':dict(f) if (f:=live.execute('SELECT * FROM url_failures WHERE url_key=?',(row['url'],)).fetchone()) else None,'catalog':dict(c) if (c:=live.execute('SELECT * FROM article_catalog WHERE url_key=?',(row['url'],)).fetchone()) else None,'nativeReadback':details};backup=root/('legacy-review-before-'+str(now)+'-'+str(len(out['heldOriginalTime']))+'.json');backup.write_text(json.dumps(before,ensure_ascii=False,indent=2))
  live.execute("UPDATE article_links SET parse_status='fail',error=?,reviewed_at=? WHERE parse_key=?",(reason,now,row['parse_key']))
  live.execute("INSERT INTO url_failures(url_key,site,role,reason,first_at,last_at,review_state) VALUES(?,?,'article',?,?,?,'pending') ON CONFLICT(url_key) DO UPDATE SET reason=excluded.reason,last_at=excluded.last_at,review_state='pending'",(row['url'],row['site'],reason,now,now))
  live.execute("UPDATE article_catalog SET status='held',reason=?,processed_at=? WHERE url_key=?",(reason,now,row['url']))
  live.execute('INSERT INTO events(at,url,site,kind,details) VALUES(?,?,?,?,?)',(now,row['url'],row['site'],'manual_existing_original_time_review',json.dumps(details)));live.commit()
  audit.execute("UPDATE stage_results SET status='legacy_time_conflict',reason=? WHERE parse_key=?",(reason,row['parse_key']));audit.execute("UPDATE es_readbacks SET status='existing_original_time_conflict' WHERE parse_key=?",(row['parse_key'],));out['heldOriginalTime'].append({'site':row['site'],'url':row['url'],'nativePublishedDate':details['expectedPublishedDate'],'existingPublishedDate':details['storedPublishedDate'],'esUnchanged':True})
 except:
  live.rollback();raise
audit.commit();(root/('legacy-review-'+str(out['at'])+'.json')).write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False));live.close();audit.close()
