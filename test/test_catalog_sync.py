"""Offline catalog migration and restore checks; no API calls."""
import copy
from contextlib import closing
import gzip
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import sync_source_keyword_catalog as sync
from build_source_keyword_catalog import SCHEMA


class CatalogSyncTest(unittest.TestCase):
    def setUp(self):
        self.payload = json.loads(sync.UPDATE.read_text(encoding='utf-8'))
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.executescript(SCHEMA + '''
        CREATE TABLE keyword_quality_audit (
          audit_id,project_name,keyword,previous_status,current_status,previous_level,current_level,replacement,reason,
          PRIMARY KEY(audit_id,project_name,keyword));
        CREATE TABLE keyword_query_keys (keyword PRIMARY KEY,query_key);
        CREATE TABLE keyword_platform_audit (
          project_name,keyword,platform,status,canonical_keyword,reason,search_url,sample_status,checked_at,samples_json,
          PRIMARY KEY(project_name,keyword,platform),
          FOREIGN KEY(project_name,keyword) REFERENCES keywords(project_name,keyword));
        ''')
        for project in ['Shopee','ShopeeFood','Panasonic','BIDV','HDBank','Other']:
            self.db.execute('INSERT INTO projects VALUES (?,?,?,?)', (project,'running',None,'[]'))
        self.old = self.payload['source_updates'][0]['old_url']
        self.add_source('mb-old', 'youtube', self.old, ['BIDV','HDBank'])
        self.spam = self.payload['source_exclusions'][0]
        self.add_source(sync.source_key('facebook',self.spam['url']), 'facebook',self.spam['url'],['Panasonic','Other'])
        self.db.commit()

    def add_source(self, key, channel, url, projects):
        self.db.execute('''INSERT INTO sources
          (source_key,channel,type,name,link,id_status,source_status,identity_evidence_json,original_links_json,evidence_json)
          VALUES (?,?,?,'fixture',?,'UNRESOLVED','NEEDS_RESOLVE','[]','[]','{}')''',
          (key,channel,'channel' if channel=='youtube' else 'page',url))
        for project in projects:
            self.db.execute('INSERT INTO source_projects VALUES (?,?,?)',(key,project,'[]'))

    def test_apply_idempotency_and_project_scope(self):
        result = sync.apply_update(self.db,self.payload)
        self.assertEqual((result['keyword_rows_added'],result['canonical_keyword_groups'],result['keyword_aliases']), (17,16,1))
        self.assertEqual(self.db.execute("SELECT count(*) FROM keywords WHERE status='READY'").fetchone()[0],16)
        self.assertEqual(self.db.execute("SELECT count(*) FROM keyword_platform_audit WHERE status='READY'").fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM source_exclusions').fetchone()[0],21)
        self.assertEqual(result['source_exclusion_plan_rows'],22)
        proofs=self.db.execute("SELECT evidence_json FROM source_exclusions WHERE url LIKE '%839079210275453%'").fetchone()[0]
        self.assertEqual({r['cell'] for r in json.loads(proofs)},{'D4','D7'})
        self.assertEqual(self.db.execute('SELECT count(*) FROM keyword_exclusions').fetchone()[0],36)
        key=sync.source_key('facebook',self.spam['url'])
        self.assertEqual([r[0] for r in self.db.execute('SELECT ProjectName FROM monitoring_source_catalog WHERE source_key=?',(key,))],['Other'])
        mb=self.db.execute("SELECT * FROM sources WHERE source_key='mb-old'").fetchone()
        self.assertEqual(mb['id'],self.payload['source_updates'][0]['native_id'])
        self.assertIn(self.old,json.loads(mb['original_links_json']))
        self.assertEqual(sync.apply_update(self.db,self.payload)['state'],'already_applied')
        changed=copy.deepcopy(self.payload);changed['keywords'].pop()
        with self.assertRaisesRegex(ValueError,'MIGRATION_PAYLOAD_CHANGED'):
            sync.apply_update(self.db,changed)

    def test_unknown_project_rolls_back_everything(self):
        broken=copy.deepcopy(self.payload)
        broken['keyword_exclusions'][-1]['project']='missing'
        with self.assertRaises(sqlite3.IntegrityError):
            sync.apply_update(self.db,broken)
        self.assertEqual(self.db.execute('SELECT count(*) FROM keywords').fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT link FROM sources WHERE source_key='mb-old'").fetchone()[0],self.old)
        self.assertFalse(sync.has_table(self.db,'catalog_migrations'))

    def test_existing_mac_source_merges_memberships_and_people(self):
        self.add_source('mb-new','youtube',self.payload['source_updates'][0]['url'],['Other'])
        self.db.execute("INSERT INTO people VALUES ('p','person',NULL,'[]','fixture','[]','[]','{}')")
        self.db.execute("INSERT INTO source_people VALUES ('mb-new','p','VERIFIED','[]')")
        self.db.commit()
        sync.apply_update(self.db,self.payload)
        self.assertEqual({r[0] for r in self.db.execute("SELECT project_name FROM source_projects WHERE source_key='mb-old'")},{'BIDV','HDBank','Other'})
        self.assertEqual(self.db.execute("SELECT source_key FROM source_people WHERE person_id='p'").fetchone()[0],'mb-old')
        self.assertIsNone(self.db.execute("SELECT 1 FROM sources WHERE source_key='mb-new'").fetchone())
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_snapshot_checks_and_existing_database_protection(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);raw=root/'raw.sqlite'
            with closing(sqlite3.connect(raw)) as db: self.db.backup(db)
            archive=root/'catalog.sqlite.gz'
            with gzip.open(archive,'wb') as out:out.write(raw.read_bytes())
            manifest={'archive':archive.name,'archive_sha256':sync.digest(archive),
                      'database_sha256':sync.digest(raw),'database_bytes':raw.stat().st_size}
            target=root/'restored.sqlite'
            with patch.object(sync,'DATA',root):
                sync.restore_snapshot(target,manifest)
                self.assertEqual(sync.digest(target),sync.digest(raw))
                with self.assertRaises(FileExistsError):sync.restore_snapshot(target,manifest)
                bad={**manifest,'database_bytes':1}
                with self.assertRaisesRegex(ValueError,'SIZE_MISMATCH'):
                    sync.restore_snapshot(root/'bad.sqlite',bad)
                self.assertFalse((root/'bad.sqlite').exists())
                archive.write_bytes(b'corrupted')
                with self.assertRaisesRegex(ValueError,'ARCHIVE_HASH_MISMATCH'):
                    sync.restore_snapshot(root/'bad.sqlite',manifest)


if __name__ == '__main__':
    unittest.main()
