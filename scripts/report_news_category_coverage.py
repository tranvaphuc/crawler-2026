"""Read-only category/backfill report; never changes live state or accounting."""
import csv,json,sqlite3,os
from pathlib import Path
from datetime import datetime,timezone
root=Path(os.environ.get('NEWS_CATEGORY_AUDIT_ROOT','/var/lib/news-flow/category-coverage-20261123'))
def connection(path):
 d=sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True);d.row_factory=sqlite3.Row;return d
audit=connection(root/'audit.sqlite');apps=connection(root/'applications.sqlite');live=connection('/var/lib/news-flow/news-flow-runtime/write.sqlite')
snapshot=json.loads((root/'source-snapshot.json').read_text());sources=set(snapshot)
def rows(db,sql):return [dict(x) for x in db.execute(sql)]
page_stats={x['site']:x for x in rows(audit,"SELECT site,count(*) checked_or_queued,sum(state='done') checked,sum(state!='done') unfinished,sum(error IS NOT NULL) http_unconfirmed FROM pages GROUP BY site")}
sections={x['site']:x['n'] for x in rows(live,'SELECT site,count(*) n FROM news_category_sections GROUP BY site')}
articles={x['site']:x for x in rows(live,"SELECT c.site,count(*) backfill_urls,sum(a.parse_status='done') parsed,sum(a.parse_status='fail') held,sum(a.parse_status IN ('pending','queued','running')) waiting,sum(a.parse_status='skipped') excluded,sum(r.status='created') es_created,sum(r.status='existing') es_existing,sum(a.parse_status='done' AND r.id IS NULL) parsed_without_receipt FROM news_category_backfill c LEFT JOIN article_links a ON a.parse_key=c.parse_key LEFT JOIN import_receipts r ON r.id=c.es_id AND r.es_index=c.es_index GROUP BY c.site")}
held=rows(live,"SELECT c.site,c.url,c.found_on,a.error FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.parse_status='fail' ORDER BY c.site,c.url")
branch_errors=rows(audit,"SELECT site,url,parent,final_url,error,status,checked_at,evidence FROM pages WHERE error IS NOT NULL ORDER BY site,url")
qualification=rows(apps,'SELECT site,url,listing,reason,primary_count,checked_at FROM candidate_qualifications WHERE listing=0 ORDER BY site,url')
out=[]
for site in sorted(sources|set(articles)):
 p=page_stats.get(site,{});a=articles.get(site,{})
 out.append({'site':site,'traversal_status':'in_progress' if p.get('unfinished',0) else 'attempted_with_http_gaps' if p.get('http_unconfirmed',0) else 'traversal_finished','pages_checked':p.get('checked',0),'pages_unfinished':p.get('unfinished',0),'http_unconfirmed':p.get('http_unconfirmed',0),'verified_sections_registered':sections.get(site,0),**{k:a.get(k,0) or 0 for k in ['backfill_urls','parsed','held','waiting','excluded','es_created','es_existing','parsed_without_receipt']},'publication_quarantine':bool(snapshot.get(site,{}).get('config',{}).get('originalPublicationBlockedReason'))})
def write_csv(name,data,fields=None):
 with (root/name).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields or (list(data[0]) if data else []));w.writeheader();w.writerows(data)
write_csv('site-coverage.csv',out);write_csv('unconfirmed-branches.csv',branch_errors,['site','url','parent','final_url','error','status','checked_at','evidence']);write_csv('held-backfill.csv',held,['site','url','found_on','error']);write_csv('rejected-or-unconfirmed-sections.csv',qualification,['site','url','listing','reason','primary_count','checked_at'])
manifest=rows(live,'SELECT site,url,verified_at,evidence,found_on FROM news_category_sections ORDER BY site,url');(root/'verified-sections.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
summary={'at':datetime.now(timezone.utc).isoformat(),'sources':len(sources),'traversal_complete':not any(x['pages_unfinished'] for x in out),'sites_with_http_gaps':sum(x['http_unconfirmed']>0 for x in out),'verified_sections_registered':len(manifest),'qualified_candidates':rows(apps,'SELECT listing,reason,count(*) n FROM candidate_qualifications GROUP BY listing,reason'),'page_states':rows(audit,'SELECT state,origin,count(*) n FROM pages GROUP BY state,origin'),'totals':{k:sum(x[k] for x in out) for k in ['pages_checked','pages_unfinished','http_unconfirmed','backfill_urls','parsed','held','waiting','excluded','es_created','es_existing','parsed_without_receipt']},'backfill_failures':rows(live,"SELECT a.error,count(*) n FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.parse_status='fail' GROUP BY a.error ORDER BY n DESC"),'ai_usage':rows(live,'SELECT * FROM ai_usage ORDER BY day DESC LIMIT 2'),'paid_manual_ai_calls':0,'es_readback':json.loads((root/'es-readback.json').read_text()) if (root/'es-readback.json').exists() else None,'scope':'Configured publishers and their publicly exposed navigation/breadcrumb section graph; no claim of access behind blocked branches or complete historical pagination.'}
summary['es_readback']={k:v for k,v in (summary['es_readback'] or {}).items() if k!='rows'}
summary['backfill_processing_complete']=summary['totals']['waiting']==0
summary['import_confirmation_complete']=summary['totals']['parsed_without_receipt']==0
for table,name in [('seed_restorations','restored_configured_seeds'),('removed_sections','rejected_own_section_additions')]:
 if apps.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",[table]).fetchone():summary[name]=apps.execute('SELECT count(*) FROM '+table).fetchone()[0]
if apps.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='seed_additions'").fetchone():
 additions={(r['site'],r['key']) for r in rows(apps,'SELECT site,key FROM seed_additions')}
 summary['verified_new_seed_additions']=sum((r['site'],r['key']) in additions for r in rows(live,'SELECT site,key FROM news_category_sections'))
if (root/'transient-review-report.json').exists():summary['transient_review']=json.loads((root/'transient-review-report.json').read_text())
summary['unique_es_receipts']=rows(live,'SELECT r.status,count(DISTINCT r.id) n FROM news_category_backfill c JOIN import_receipts r ON r.id=c.es_id AND r.es_index=c.es_index GROUP BY r.status')
held_imports=rows(live,"SELECT c.site,c.url,o.id,o.reason,json_extract(o.doc,'$._index') es_index FROM news_category_backfill c JOIN outbox o ON o.id=c.es_id WHERE o.state='held' ORDER BY c.site,c.url")
write_csv('held-imports.csv',held_imports,['site','url','id','reason','es_index']);summary['held_import_urls']=len(held_imports)
if apps.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='import_reconciliations'").fetchone():
 reconciliations=rows(apps,'SELECT * FROM import_reconciliations ORDER BY checked_at,id');write_csv('import-reconciliations.csv',reconciliations,['id','doc_sha','decision','checked_at','evidence']);summary['import_reconciliations']=rows(apps,'SELECT decision,count(*) n FROM import_reconciliations GROUP BY decision')
if audit.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='hint_expansions'").fetchone():
 expansions=rows(audit,'SELECT * FROM hint_expansions ORDER BY site,url');write_csv('hint-expansions.csv',expansions,['site','key','url','parent','at']);summary['branches_observed_during_backfill']=len(expansions)
if (root/'hint-expansion-status.json').exists():summary['hint_frontier']=json.loads((root/'hint-expansion-status.json').read_text())
(root/'coverage-report.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(summary,ensure_ascii=False))
