"""Consolidate spelling variants while preserving project mappings and evidence."""
from collections import defaultdict
from contextlib import closing
from functools import lru_cache
import json
import re
import sqlite3
import unicodedata

from audit_catalog_search_keywords import DB, ROOT, encode
from collect_catalog_platform_audit import OUT, write_json

AUDIT_ID = 'keyword-case-and-diacritics'
QUEUES = ('search', 'facebook_search', 'youtube_search', 'news_search')


@lru_cache(maxsize=65536)
def query_key(text):
    normalized = unicodedata.normalize('NFD', text.casefold().replace('đ', 'd'))
    characters = []
    latin = False
    for character in normalized:
        if not unicodedata.combining(character):
            latin = 'LATIN' in unicodedata.name(character, '')
        elif latin:
            continue
        if not character.isspace() and unicodedata.category(character) != 'Cf':
            characters.append(character)
    plain = unicodedata.normalize('NFC', ''.join(characters))
    # Keep numeric punctuation in versions, decimal numbers and ranges.
    plain = re.sub(r'(?<!\d)[.\-‐‑‒–—―−·]+|[.\-‐‑‒–—―−·]+(?!\d)', '', plain)
    return plain


def merge_project_variants(db):
    groups = defaultdict(list)
    for project, word, level, project_status, subjects, reasons in db.execute('''
        SELECT project_name,keyword,level,project_status,subjects_json,reasons_json
        FROM keywords WHERE status='READY'
    '''):
        groups[project, query_key(word)].append((word, level, project_status, subjects, reasons))
    platform = defaultdict(list)
    for project, word, channel, status, sample in db.execute('''
        SELECT project_name,keyword,platform,status,sample_status FROM keyword_platform_audit
    '''):
        platform[project, word].append((channel, status, sample))
    merged, review = [], []
    for (project, _), variants in sorted(groups.items()):
        if len(variants) < 2:
            continue
        words = [row[0] for row in variants]
        contexts = {(level, project_status, frozenset(query_key(subject) for subject in json.loads(subjects)))
                    for _, level, project_status, subjects, _ in variants}
        ready = {word: {channel for channel, state, _ in platform[project, word] if state == 'READY'} for word in words}
        all_channels = set().union(*ready.values())
        eligible = [word for word in words if ready[word] == all_channels]
        if len(contexts) != 1 or not eligible:
            review.append({'project': project, 'variants': words})
            continue
        canonical = min(eligible, key=lambda word: (
            -sum(sample in {'OK','SCOPE_CHECKED','MANUAL_SCOPE_CHECK'} for _, _, sample in platform[project, word]),
            query_key(word) == word.casefold(), word.casefold(), word,
        ))
        for word, level, _, _, reasons in variants:
            if word == canonical:
                continue
            reason = f'Cùng project, chủ thể và level. Gộp khác biệt về cách viết, khoảng trắng hoặc dấu câu vào {canonical}.'
            db.execute('UPDATE keywords SET status=?,reasons_json=? WHERE project_name=? AND keyword=?',
                       ('ALIAS',encode([*json.loads(reasons),reason]),project,word))
            db.execute('''UPDATE keyword_platform_audit SET status='ALIAS', canonical_keyword=?, reason=? || ' ' || reason
                          WHERE project_name=? AND keyword=? AND status <> 'OUT_OF_SCOPE' ''',
                       (canonical,reason,project,word))
            db.execute('''INSERT INTO keyword_quality_audit VALUES (?,?,?,'READY','ALIAS',?,?,?,?)
                          ON CONFLICT(audit_id,project_name,keyword) DO UPDATE SET replacement=excluded.replacement,
                          reason=excluded.reason''', (AUDIT_ID,project,word,level,level,canonical,reason))
            merged.append({'project':project,'alias':word,'canonical':canonical,'level':level})
    return merged, review


def refresh_term_views(db):
    # Materialize the normalized key so these views also work in plain SQLite clients.
    db.execute('CREATE TABLE IF NOT EXISTS keyword_query_keys (keyword TEXT PRIMARY KEY, query_key TEXT NOT NULL)')
    db.executemany('INSERT INTO keyword_query_keys VALUES (?,?) ON CONFLICT(keyword) DO UPDATE SET query_key=excluded.query_key',
                   [(word,query_key(word)) for word, in db.execute('SELECT DISTINCT keyword FROM keywords')])
    for name in QUEUES:
        db.execute(f'DROP VIEW IF EXISTS {name}_terms')
        db.execute(f'''CREATE VIEW {name}_terms AS
            WITH mapped AS (
              SELECT q.Keyword,q.ProjectName,q.Level,COALESCE(n.query_key,lower(q.Keyword)) AS query_key
              FROM {name}_queue q LEFT JOIN keyword_query_keys n ON n.keyword=q.Keyword
            ), ranked AS (
              SELECT *,row_number() OVER (PARTITION BY query_key ORDER BY Level,Keyword COLLATE BINARY,ProjectName) AS rank
              FROM mapped
            )
            SELECT max(CASE WHEN rank=1 THEN Keyword END) AS Keyword,
              json_group_array(json_object('ProjectName',ProjectName,'Level',Level)) AS Projects
            FROM ranked GROUP BY query_key''')


def reconcile(db):
    result = merge_project_variants(db)
    refresh_term_views(db)
    return result


def update_summaries(db):
    general = dict(db.execute('SELECT Level,count(*) FROM search_queue GROUP BY Level'))
    terms = {name: db.execute(f'SELECT count(*) FROM {name}_terms').fetchone()[0] for name in QUEUES}
    paths = [(ROOT/'plan-refresh/catalog-keyword-audit-final.json','manifest'),
             (OUT/'keyword-platform-summary.json','platform'), (OUT/'cross-platform-summary.json','cross')]
    for path, kind in paths:
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding='utf-8'))
        if kind == 'manifest':
            data['summary'].update(ready_total=sum(general.values()),ready_by_level=general,
                distinct_search_terms=terms['search'],
                ready_hashtags=db.execute("SELECT count(*) FROM search_queue WHERE Keyword LIKE '#%'").fetchone()[0])
            by_project = defaultdict(dict)
            for project,level,count in db.execute('SELECT ProjectName,Level,count(*) FROM search_queue GROUP BY 1,2'):
                by_project[project][level] = count
            for project in data['projects']:
                project['ready_levels'] = by_project[project['project']]
        elif kind == 'platform':
            data['general_queue_by_level'] = general
            states = defaultdict(dict)
            for channel,status,count in db.execute('SELECT platform,status,count(*) FROM keyword_platform_audit GROUP BY 1,2'):
                states[channel][status] = count
            data['platform_statuses'] = states
        else:
            data['legacy_queue_by_level'] = general
        write_json(path,data)
    return general,terms


def main():
    with closing(sqlite3.connect(DB.resolve().as_uri() + '?mode=rw',uri=True)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        with db:
            db.execute('BEGIN IMMEDIATE')
            merged, review = reconcile(db)
            if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchall():
                raise RuntimeError('Keyword catalog integrity check failed')
        general,terms = update_summaries(db)
    print(json.dumps({'merged':merged,'review':review,'ready_by_level':general,'distinct_terms':terms},ensure_ascii=False))


if __name__ == '__main__':
    main()
