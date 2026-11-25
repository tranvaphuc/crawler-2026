"""Add standalone keywords from the recovered SHB and hospital plan exports."""
import argparse
from collections import defaultdict
from contextlib import closing
from datetime import datetime, timezone
import json
import re
import sqlite3
import unicodedata

from reconcile_plan_keywords_deep import (
    DB, OUT, apply_updates, encode, field, header_kind, origin,
    query_key, read_book, read_json, ready_counts, reconcile, resolve,
    retain_variant_evidence, term_shape, tidy, update_summaries, write_json,
)

AUDIT = 'plan-missing-retry-2026-11-19'
SHB_ID = '1UkHerwFwAYW0JF7hHB5wBqEA5shOSAP69hLTBw-xHBQ'
HOSPITAL_ID = '1eW83SpLT6-8sZl1viAShZiyaSORV5pOa'
SHB_NAMES = {
    'SHB', 'Bầu Hiển', 'Đỗ Quang Hiển', 'SHBAMC', 'SHB FC', 'SHB Finance', 'Tài chính SHB',
    'TMCP Sài Gòn - Hà Nội', 'Tín dụng SHB', 'SHB Ebanking', 'SHB SAHA', 'SHB Mobile',
    'SHB SAHA APP', 'Ứng dụng SHB SAHA', 'Dịch vụ ngân hàng điện tử SHB', 'app SHB',
    'SHB online', 'SHB First Club Nội Bài', 'SHB Visa Platinum',
}
SHB_FORMS = {query_key(word): word for word in SHB_NAMES}
HOSPITAL_TYPOS = {
    'hoanmydanlatghospital': 'Hoan My Da Lat Hospital',
    'hoanmydannanghospital': 'Hoan My Da Nang Hospital',
    'hoanmytunhabinhduonghospital': 'Hoan My Tu Nhan Binh Duong Hospital',
    'bvhoanmydadang': 'BV Hoàn Mỹ Đà Nẵng',
    'bvhoanmyvnaphuc2': 'BV Hoàn Mỹ Vạn Phúc 2',
    'hoanmytuvanphuc2': 'Hoàn Mỹ Vạn Phúc 2',
}


def column_number(column):
    number = 0
    for letter in column:
        number = number * 26 + ord(letter) - ord('A') + 1
    return number


def hospital_subject(text):
    return 'Hanh Phuc Hospital' if 'hanhphuc' in query_key(text) else 'Hoan My Hospital'


def hospital_keyword(word, project):
    if word.startswith('#') and not re.fullmatch(r'#[\w]+', word):
        return False
    compact = query_key(word)
    if project == 'Hanh Phuc Hospital':
        return 'hanhphuc' in compact and compact not in {'hanhphuc', 'phongkhamhanhphuc', 'pkhanhphuc'}
    return (('hoanmy' in compact and compact not in {'hoanmy', 'hoanmy1'})
            or ('thuanmy' in compact and len(compact) > len('thuanmy'))
            or ('prima' in compact and compact != 'prima'))


def plan_matches(documents):
    matches = defaultdict(list)
    for doc in documents:
        url = doc['url']
        workbook = OUT / 'browser-plans' / f"{doc['id']}.xlsx"

        def add(project, sheet, cell, keyword, raw, subject, kind='main'):
            if term_shape(keyword):
                record = origin(url, sheet, cell, kind, subject)
                record.update(original=raw, keyword=keyword, decision='DIRECT', resolved_subject=subject, level=1)
                matches[project, query_key(keyword)].append(record)

        if doc['id'] == SHB_ID:
            for sheet in read_book(workbook, lambda name: name == 'phạm vi công việc'):
                for row in sheet['rows'].values():
                    for raw in field(row, 'G').split(','):
                        normalized = unicodedata.normalize('NFKC', tidy(raw))
                        if keyword := SHB_FORMS.get(query_key(normalized)):
                            add('SHB Bank', sheet['name'], row['G']['ref'], keyword, tidy(raw), 'SHB Bank')
            add('SHB Bank', 'Định nghĩ label', 'B64', 'Cocobay SHB', 'Dự án Cocobay (SHB)', 'Dự án Cocobay', 'note')
            add('SHB Bank', 'Định nghĩ label', 'E54', 'Chứng khoán SHS', 'SHS', 'Công ty thành viên SHB', 'note')
            add('SHB Bank', 'Định nghĩ label', 'E54', 'Tập đoàn T&T', 'T&T', 'Công ty thành viên SHB', 'note')
            add('SHB Bank', 'Case thường gặp của SHB', 'A9', 'Bảo hiểm BSH', 'Công ty bảo hiểm BSH', 'Bảo hiểm BSH', 'note')
            continue

        for sheet in read_book(workbook, lambda name: name in {'Keyword', 'Từ khóa', 'Từ khóa negative', 'Google Reviews'}):
            name, rows = sheet['name'], sheet['rows']
            if name == 'Google Reviews':
                for n, row in rows.items():
                    if n > 2 and (label := field(row, 'B')):
                        project = hospital_subject(label)
                        if hospital_keyword(label, project):
                            add(project, name, row['B']['ref'], label, label, label, 'note')
                continue
            if name == 'Keyword':
                headings = {column_number(c): cell['text'] for c, cell in rows[2].items() if cell['text'].strip()}
                groups = {c: headings[column_number(c)-1] for c, cell in rows[3].items()
                          if header_kind(cell['text']) == 'main' and column_number(c)-1 in headings}
            else:
                groups = {'B': 'Hoàn Mỹ', 'G': 'Hạnh Phúc'} if name == 'Từ khóa' else {'B': 'Hoàn Mỹ / Hạnh Phúc'}
            for n, row in rows.items():
                if n <= 3:
                    continue
                for col, heading in groups.items():
                    raw = field(row, col)
                    word = tidy(re.sub(r'\s*\(added [\d.]+\)$', '', raw, flags=re.I))
                    word = HOSPITAL_TYPOS.get(query_key(word), word)
                    project = hospital_subject(heading if name != 'Từ khóa negative' else raw)
                    if hospital_keyword(word, project):
                        add(project, name, row[col]['ref'], word, raw, heading)
    return matches


def fix_truncated_hashtag(db):
    project = 'Hoan My Hospital'
    truncated = '#benhvienhoanmyitodong'
    valid = '#bvhoanmyitodongnai'
    old = db.execute('SELECT reasons_json,level FROM keywords WHERE project_name=? AND keyword=? AND status=?',
                     (project, truncated, 'READY')).fetchone()
    if not old or not db.execute('SELECT 1 FROM search_queue WHERE ProjectName=? AND Keyword=?', (project, valid)).fetchone():
        return []
    if db.execute("SELECT 1 FROM keyword_platform_audit WHERE project_name=? AND keyword=? AND status='READY'", (project, truncated)).fetchone():
        raise RuntimeError('The truncated hashtag has existing channel evidence requiring review')
    reason = 'Plan Keyword có khoảng trắng trong hashtag ở nhóm Hoàn Mỹ ITO Đồng Nai. Dùng hashtag hoàn chỉnh ghi riêng trong cùng cột.'
    reasons, level = old
    db.execute('UPDATE keywords SET status=?,reasons_json=? WHERE project_name=? AND keyword=?',
               ('ALIAS', encode([*json.loads(reasons), reason]), project, truncated))
    db.execute("UPDATE keyword_platform_audit SET status='ALIAS',canonical_keyword=?,reason=? WHERE project_name=? AND keyword=? AND status<>'OUT_OF_SCOPE'",
               (valid, reason, project, truncated))
    db.execute('INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',
               (AUDIT, project, truncated, 'READY', 'ALIAS', level, level, valid, reason))
    return [{'project': project, 'alias': truncated, 'canonical': valid, 'reason': reason}]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    documents = [doc for doc in read_json(OUT / 'plan-document-coverage.json') if doc['id'] in {SHB_ID, HOSPITAL_ID}]
    if len(documents) != 2:
        raise RuntimeError('The two recovered plans must be present in the coverage records')
    matches = plan_matches(documents)
    with closing(sqlite3.connect(DB.resolve().as_uri() + ('?mode=rw' if args.apply else '?mode=ro'), uri=True)) as db:
        statuses = dict(db.execute('SELECT project_name,plan_status FROM projects'))
        scoped_projects = {p for doc in documents for p, status in doc['projects'] if status in {'running', 'running trial'}}
        if {p for p, _ in matches} - scoped_projects or any(statuses.get(p) not in {'running', 'running trial'} for p in scoped_projects):
            raise RuntimeError('Plan ownership does not match an active project')
        before = ready_counts(db)
        updates, _, variants, _ = resolve(db, matches)
        corrections = []
        if args.apply:
            db.execute('PRAGMA foreign_keys=ON')
            with db:
                db.execute('BEGIN IMMEDIATE')
                apply_updates(db, updates, statuses, AUDIT)
                retain_variant_evidence(db, variants, AUDIT)
                corrections = fix_truncated_hashtag(db)
                reconcile(db)
                for doc in documents:
                    db.execute('''INSERT INTO plan_refresh_documents VALUES (?,?,?,?,?,?)
                        ON CONFLICT(document_id) DO UPDATE SET comparison_status=excluded.comparison_status,
                        projects_json=excluded.projects_json,checked_at=excluded.checked_at''',
                        (doc['id'], doc['url'], 'NEWLY_ACCESSIBLE', encode(doc['projects']), '{}', datetime.now(timezone.utc).isoformat()))
                if db.execute('PRAGMA quick_check').fetchone() != ('ok',) or db.execute('PRAGMA foreign_key_check').fetchall():
                    raise RuntimeError('Catalog integrity check failed')
            update_summaries(db)
        after = ready_counts(db)
    project_counts = {p: {'before': before[p], 'after': after[p]} for p in sorted(scoped_projects)}
    result = {'projects': project_counts, 'added': updates, 'normalized_variants': variants, 'corrected': corrections}
    write_json(OUT / ('reopened-plan-keywords.json' if args.apply else 'reopened-plan-preview.json'), result)
    print(encode({'projects': project_counts, 'added': len(updates), 'normalized_variants': len(variants), 'corrected': len(corrections)}))


if __name__ == '__main__':
    main()
