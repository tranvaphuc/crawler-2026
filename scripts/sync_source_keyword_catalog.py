"""Apply versioned catalog changes, or restore the shared snapshot on a new checkout."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
from urllib.parse import urlencode, urlsplit

from build_source_keyword_catalog import url_key
from deduplicate_catalog_keywords import query_key

REPO=Path(__file__).resolve().parents[1]
DATA=REPO/'data/source-keyword-catalog'
DEFAULT_DB=REPO/'outputs/source-keyword-catalog-2026-11-19/source-keyword-catalog.sqlite'
UPDATE=DATA/'updates/2026-11-25.json'

def encode(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def utc():return datetime.now(timezone.utc).isoformat()
def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def unique(values):return list({encode(v):v for v in values}.values())
def source_key(channel,url):
 key=url_key(channel,url)
 if not key:raise ValueError('INVALID_SOURCE_URL')
 host=(urlsplit(url).hostname or '').lower()
 if host=='fireant.vn' or host.endswith('.fireant.vn'):raise ValueError('FORBIDDEN_SOURCE')
 return hashlib.sha256(encode(key).encode()).hexdigest()[:24]
def has_table(db,name):return bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(name,)).fetchone())

DDL=[
 '''CREATE TABLE IF NOT EXISTS catalog_migrations (
 migration_id TEXT PRIMARY KEY,payload_sha256 TEXT NOT NULL,applied_at TEXT NOT NULL,summary_json TEXT NOT NULL)''',
 '''CREATE TABLE IF NOT EXISTS source_exclusions (
 project_name TEXT NOT NULL REFERENCES projects,channel TEXT NOT NULL,normalized_url TEXT NOT NULL,
 source_key TEXT NOT NULL,name TEXT,url TEXT NOT NULL,reason TEXT NOT NULL,plan_url TEXT NOT NULL,
 sheet TEXT NOT NULL,cell TEXT NOT NULL,evidence_json TEXT NOT NULL,checked_at TEXT NOT NULL,
 PRIMARY KEY(project_name,channel,normalized_url))''',
 'CREATE INDEX IF NOT EXISTS source_exclusions_key ON source_exclusions(project_name,source_key)',
 '''CREATE TABLE IF NOT EXISTS keyword_exclusions (
 project_name TEXT NOT NULL REFERENCES projects,keyword TEXT NOT NULL,scope TEXT NOT NULL,
 plan_url TEXT NOT NULL,sheet TEXT NOT NULL,cell TEXT NOT NULL,evidence_json TEXT NOT NULL,
 checked_at TEXT NOT NULL,PRIMARY KEY(project_name,scope,keyword))''',
 '''CREATE VIEW IF NOT EXISTS monitoring_source_catalog AS
 SELECT s.* FROM source_catalog s
 WHERE s.ProjectName IS NOT NULL AND s.source_status NOT IN ('BLOCKED_BY_PROJECT','REPLACED')
 AND NOT EXISTS(SELECT 1 FROM source_exclusions e
 WHERE e.project_name=s.ProjectName AND e.source_key=s.source_key)''',
 '''CREATE VIEW IF NOT EXISTS source_exclusion_catalog AS
 SELECT project_name AS ProjectName,channel AS Channel,name AS Name,url AS Link,source_key,reason,
 plan_url,sheet,cell,checked_at FROM source_exclusions''',
 '''CREATE VIEW IF NOT EXISTS keyword_exclusion_catalog AS
 SELECT project_name AS ProjectName,keyword AS Keyword,scope AS Scope,plan_url,sheet,cell,checked_at
 FROM keyword_exclusions'''
]

def search_url(platform,word):
 if platform=='facebook':return 'https://www.facebook.com/search/posts/?'+urlencode({'q':word})
 if platform=='youtube':return 'https://www.youtube.com/results?'+urlencode({'search_query':word})
 return 'https://news.google.com/search?'+urlencode({'q':word,'hl':'vi','gl':'VN','ceid':'VN:vi'})

def merge_source(db,target,other):
 """Merge only proven aliases of the updated channel, retaining all memberships."""
 for project,origins in db.execute('SELECT project_name,origins_json FROM source_projects WHERE source_key=?',(other,)).fetchall():
  prior=db.execute('SELECT origins_json FROM source_projects WHERE source_key=? AND project_name=?',(target,project)).fetchone()
  merged=unique([*(json.loads(prior[0]) if prior else []),*json.loads(origins)])
  db.execute('INSERT OR REPLACE INTO source_projects VALUES (?,?,?)',(target,project,encode(merged)))
 for person,status,links in db.execute('SELECT person_id,attribution_status,links_json FROM source_people WHERE source_key=?',(other,)).fetchall():
  prior=db.execute('SELECT attribution_status,links_json FROM source_people WHERE source_key=? AND person_id=?',(target,person)).fetchone()
  merged=unique([*(json.loads(prior[1]) if prior else []),*json.loads(links)])
  db.execute('INSERT OR REPLACE INTO source_people VALUES (?,?,?,?)',(target,person,prior[0] if prior else status,encode(merged)))
 db.execute('UPDATE source_exclusions SET source_key=? WHERE source_key=?',(target,other))
 db.execute('DELETE FROM source_projects WHERE source_key=?',(other,))
 db.execute('DELETE FROM source_people WHERE source_key=?',(other,))
 db.execute('DELETE FROM sources WHERE source_key=?',(other,))

def apply_update(db,payload):
 """One atomic, idempotent migration. No network requests or paid APIs."""
 db.row_factory=sqlite3.Row
 required={'projects','sources','source_projects','source_people','keywords','catalog_metadata',
           'keyword_quality_audit','keyword_platform_audit','keyword_query_keys','es_keyword_cells'}
 tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
 if not required<=tables:raise ValueError('NOT_A_SOURCE_KEYWORD_CATALOG')
 fingerprint=hashlib.sha256(encode(payload).encode()).hexdigest()
 if has_table(db,'catalog_migrations'):
  prior=db.execute('SELECT payload_sha256,summary_json FROM catalog_migrations WHERE migration_id=?',(payload['migration_id'],)).fetchone()
  if prior:
   if prior[0]!=fingerprint:raise ValueError('MIGRATION_PAYLOAD_CHANGED')
   return {**json.loads(prior[1]),'state':'already_applied'}
 now=utc();counts=Counter()
 db.execute('PRAGMA foreign_keys=ON')
 try:
  db.execute('BEGIN IMMEDIATE')
  for statement in DDL:db.execute(statement)
  groups=defaultdict(list)
  for row in payload['keywords']:groups[row['project'],query_key(row['keyword'])].append(row)
  canonical={}
  for (project,key),rows in groups.items():
   existing=db.execute("SELECT keyword FROM keywords WHERE project_name=? AND status <> 'ALIAS'",(project,)).fetchall()
   prior=[r[0] for r in existing if query_key(r[0])==key]
   if len(prior)>1:raise ValueError('EXISTING_KEYWORD_VARIANT_CONFLICT')
   canonical[project,key]=prior[0] if prior else rows[0]['keyword']
  for row in payload['keywords']:
   project,word=row['project'],row['keyword'];primary=canonical[project,query_key(word)]
   status='READY' if word==primary else 'ALIAS'
   project_status=db.execute('SELECT plan_status FROM projects WHERE project_name=?',(project,)).fetchone()
   if not project_status:raise ValueError('UNKNOWN_PROJECT')
   original={**row,'method':payload['migration_id'],'raw_value':word}
   proof=f"{row['sheet']}!{row['cell']} · {row['plan_url']}"
   reason='Người dùng chấp thuận bổ sung keyword từ plan; kết quả tìm kiếm từng nền tảng có trạng thái riêng.'
   previous=db.execute('SELECT * FROM keywords WHERE project_name=? AND keyword=?',(project,word)).fetchone()
   if not previous:
    db.execute('INSERT INTO keywords VALUES (?,?,?,?,?,?,?,?,?)',(word,project,row['level'],status,project_status[0],encode([row['subject']]),encode([proof]),encode([original]),encode([reason])))
    counts['keyword_rows_added']+=1
    db.execute('INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',(payload['migration_id'],project,word,None,status,None,row['level'],None if status=='READY' else primary,reason))
   else:
    db.execute('UPDATE keywords SET evidence_json=?,originals_json=? WHERE project_name=? AND keyword=?',(encode(unique([*json.loads(previous['evidence_json']),proof])),encode(unique([*json.loads(previous['originals_json']),original])),project,word))
   db.execute('INSERT OR IGNORE INTO keyword_query_keys VALUES (?,?)',(word,query_key(word)))
   for platform in ['facebook','youtube','news']:
    platform_status='ALIAS' if status=='ALIAS' else 'OUT_OF_SCOPE' if platform=='news' and word.startswith('#') else 'NOT_CHECKED'
    db.execute('INSERT OR IGNORE INTO keyword_platform_audit VALUES (?,?,?,?,?,?,?,?,?,?)',(project,word,platform,platform_status,primary if status=='ALIAS' else None,'Đã xác nhận ô trong plan; chưa kiểm tra riêng kết quả tìm kiếm trên nền tảng.',search_url(platform,word),'PLAN_SCOPE',None,'[]'))
   db.execute('INSERT INTO es_keyword_cells SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM es_keyword_cells WHERE project_name=? AND sheet=? AND cell=? AND raw_value=?)',(project,row['kind'],word,row['plan_url'],row['sheet'],row['cell'],encode(original),project,row['sheet'],row['cell'],word))
  counts['canonical_keyword_groups']=len(groups)
  counts['keyword_aliases']=len(payload['keywords'])-len(groups)

  # Resolve URL aliases to current keys before recording project-specific blocks.
  source_index={}
  for r in db.execute('SELECT source_key,channel,link,original_links_json FROM sources'):
   for u in [r['link'],*json.loads(r['original_links_json'])]:
    try:key=url_key(r['channel'],u)
    except ValueError:continue
    if key:source_index.setdefault(key,r['source_key'])
  for row in payload['source_updates']:
   old_key=source_index.get(url_key(row['channel'],row['old_url']))
   new_key=source_index.get(url_key(row['channel'],row['url']))
   by_id=db.execute('SELECT source_key FROM sources WHERE channel=? AND id=?',(row['channel'],row['native_id'])).fetchall()
   candidates=list(dict.fromkeys([k for k in [old_key,new_key,*[r[0] for r in by_id]] if k]))
   if not candidates:raise ValueError('UPDATED_SOURCE_NOT_IN_CATALOG')
   key=candidates[0]
   previous=[dict(db.execute('SELECT * FROM sources WHERE source_key=?',(k,)).fetchone()) for k in candidates]
   if any(r['id'] and r['id']!=row['native_id'] and r['id_status'] in {'ARCHIVE_VERIFIED','PLATFORM_VERIFIED'} for r in previous):raise ValueError('VERIFIED_SOURCE_ID_CONFLICT')
   original_urls=unique([u for r in previous for u in [r['link'],*json.loads(r['original_links_json'])]]+[row['old_url'],row['url']])
   identities=unique([v for r in previous for v in json.loads(r['identity_evidence_json'])]+[{'method':payload['migration_id'],'id':row['native_id'],'type':'channel','name':row['name'],'url':row['url'],'checked_at':row['verification']['checked_at'],'evidence':'Matched YouTube primary channelMetadataRenderer.externalId and canonical channel URL','response_sha256':row['verification']['response_sha256']}])
   for other in candidates[1:]:merge_source(db,key,other)
   evidence=json.loads(previous[0]['evidence_json']);evidence[payload['migration_id']]={'old_url':row['old_url'],'old_http_status':404,'new_url':row['url'],'plan_url':row['plan_url'],'sheet':row['sheet'],'cell':row['cell'],
       'merged_source_evidence':[{'source_key':r['source_key'],'evidence':json.loads(r['evidence_json'])} for r in previous[1:]]}
   db.execute("UPDATE sources SET link=?,name=?,id=?,type='channel',id_status='PLATFORM_VERIFIED',source_status='LIVE_VERIFIED',identity_evidence_json=?,original_links_json=?,evidence_json=? WHERE source_key=?",(row['url'],row['name'],row['native_id'],encode(identities),encode(original_urls),encode(evidence),key))
   source_index[url_key(row['channel'],row['url'])]=key
   counts['source_urls_updated']+=1

  for row in payload['source_exclusions']:
   identity=url_key(row['channel'],row['url']);key=source_index.get(identity) or source_key(row['channel'],row['url'])
   prior=db.execute('SELECT evidence_json FROM source_exclusions WHERE project_name=? AND channel=? AND normalized_url=?',(row['project'],row['channel'],identity[1])).fetchone()
   proofs=unique([*(json.loads(prior[0]) if prior else []),row])
   db.execute('INSERT OR REPLACE INTO source_exclusions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',(row['project'],row['channel'],identity[1],key,row['name'],row['url'],row['reason'],row['plan_url'],row['sheet'],row['cell'],encode(proofs),now))
   counts['source_exclusion_plan_rows']+=1
  counts['source_exclusions']=len({(r['project'],r['channel'],url_key(r['channel'],r['url'])) for r in payload['source_exclusions']})
  for row in payload['keyword_exclusions']:
   db.execute('INSERT OR REPLACE INTO keyword_exclusions VALUES (?,?,?,?,?,?,?,?)',(row['project'],row['keyword'],row['scope'],row['plan_url'],row['sheet'],row['cell'],encode(row),now))
   counts['keyword_exclusion_scopes']+=1
   original={**row,'kind':'exclude','method':payload['migration_id']}
   db.execute('INSERT INTO es_keyword_cells SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM es_keyword_cells WHERE project_name=? AND sheet=? AND cell=? AND raw_value=?)',(row['project'],'exclude',row['keyword'],row['plan_url'],row['sheet'],row['cell'],encode(original),row['project'],row['sheet'],row['cell'],row['keyword']))
  if db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('CATALOG_FOREIGN_KEY_CHECK_FAILED')
  summary={'migration_id':payload['migration_id'],'applied_at':now,**dict(counts),'platform_searches_performed':0,'state':'applied'}
  db.execute('INSERT INTO catalog_migrations VALUES (?,?,?,?)',(payload['migration_id'],fingerprint,now,encode(summary)))
  db.execute('INSERT OR REPLACE INTO catalog_metadata VALUES (?,?)',(payload['migration_id'],encode(summary)))
  db.commit();return summary
 except BaseException:
  db.rollback();raise

def apply_file(path,payload,backup_dir=None):
 path=Path(path).resolve()
 if not path.is_file():raise FileNotFoundError(path)
 with closing(sqlite3.connect(path,timeout=20)) as db:
  if backup_dir:
   backup_dir=Path(backup_dir);backup_dir.mkdir(parents=True,exist_ok=True)
   backup=backup_dir/('catalog-before-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'.sqlite')
   with closing(sqlite3.connect(backup)) as copy:db.backup(copy)
  return apply_update(db,payload)

def package(path):
 DATA.mkdir(parents=True,exist_ok=True)
 work=REPO/'.cache/catalog-package';work.mkdir(parents=True,exist_ok=True)
 snapshot=work/'catalog.sqlite'
 with closing(sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True)) as source,closing(sqlite3.connect(snapshot)) as target:source.backup(target)
 with closing(sqlite3.connect(snapshot)) as db:
  if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('INVALID_CATALOG_SNAPSHOT')
  counts={name:db.execute('SELECT count(*) FROM '+name).fetchone()[0] for name in ['projects','sources','source_projects','people','keywords','source_exclusions','keyword_exclusions']}
 archive=DATA/'catalog.sqlite.gz';temporary=archive.with_suffix('.gz.partial')
 with snapshot.open('rb') as source,temporary.open('wb') as raw,gzip.GzipFile(filename='catalog.sqlite',mode='wb',fileobj=raw,compresslevel=6,mtime=0) as compressed:shutil.copyfileobj(source,compressed,1024*1024)
 temporary.replace(archive)
 manifest={'format':1,'database_relative_path':str(DEFAULT_DB.relative_to(REPO)).replace('\\','/'),'archive':'catalog.sqlite.gz','archive_sha256':digest(archive),'archive_bytes':archive.stat().st_size,'database_sha256':digest(snapshot),'database_bytes':snapshot.stat().st_size,'counts':counts,'updates':['updates/2026-11-25.json'],'created_at':utc()}
 (DATA/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 return manifest

def restore_snapshot(destination,manifest):
 destination=Path(destination).resolve();archive=DATA/manifest['archive']
 if digest(archive)!=manifest['archive_sha256']:raise ValueError('SNAPSHOT_ARCHIVE_HASH_MISMATCH')
 if destination.exists():raise FileExistsError('RESTORE_WOULD_OVERWRITE_EXISTING_CATALOG')
 destination.parent.mkdir(parents=True,exist_ok=True)
 fd,name=tempfile.mkstemp(prefix='catalog-restore-',suffix='.sqlite',dir=destination.parent);os.close(fd);temp=Path(name)
 try:
  with gzip.open(archive,'rb') as source,temp.open('wb') as target:
   remaining=manifest['database_bytes']
   while block:=source.read(min(1024*1024,remaining+1)):
    remaining-=len(block)
    if remaining<0:raise ValueError('SNAPSHOT_EXPANDED_SIZE_MISMATCH')
    target.write(block)
  if temp.stat().st_size!=manifest['database_bytes'] or digest(temp)!=manifest['database_sha256']:raise ValueError('SNAPSHOT_DATABASE_HASH_MISMATCH')
  with closing(sqlite3.connect(temp)) as db:
   if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('INVALID_RESTORED_CATALOG')
  # Windows rename and POSIX link both fail if the destination already exists.
  if os.name=='nt':os.rename(temp,destination)
  else:os.link(temp,destination)
 finally:temp.unlink(missing_ok=True)

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--db',type=Path,default=DEFAULT_DB);parser.add_argument('--package',action='store_true');args=parser.parse_args()
 db=args.db.resolve();payload=json.loads(UPDATE.read_text(encoding='utf-8'))
 if args.package:
  print(json.dumps(package(db),ensure_ascii=False));return
 if not db.exists():
  manifest=json.loads((DATA/'manifest.json').read_text(encoding='utf-8'));restore_snapshot(db,manifest)
  restored=True
 else:restored=False
 result=apply_file(db,payload,REPO/'.cache/catalog-backups')
 print(json.dumps({**result,'database':str(db),'snapshot_restored':restored},ensure_ascii=False))

if __name__=='__main__':main()
