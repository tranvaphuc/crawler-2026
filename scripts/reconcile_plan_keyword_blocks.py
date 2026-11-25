"""Reconcile standalone keyword blocks in active plans against the local catalog."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3
from zipfile import BadZipFile

from audit_full_plan_contents import ACTIVE, allow_keyword
from deduplicate_catalog_keywords import refresh_term_views
from finalize_catalog_cross_platform_audit import PLATFORMS, query_url
from reconcile_plan_keywords_deep import (
    DB, OUT, NON_PRODUCT, NOTE_INSTRUCTION, NOTE_PREFIX, TRACKING_ONLY, apply_updates,
    clean_terms, encode, field, fold, load_anchors, match_anchor, parts, query_key,
    read_book, read_json, term_shape, update_summaries,
    write_json, xlsx_inventory,
)
from review_active_plan_keyword_scope import active_documents, candidate

AUDIT = 'active-plan-keyword-blocks'
ACBS = {
    '12j3OepkcoKz3wOCvaLIIHseMvaySPIAT': 'ACBS',
    '1ytplju7gEwj_1xJa5Vj81ulhOVlJ2yG0': 'ACBS - Báo Cáo Năm 2025',
    '12w3k2BOW89Xr_EiV_Vaf-NK-laP-4mRJ': 'ACBS - Báo Cáo Năm 2026',
}
ACBS_2026 = 'ACBS - Báo Cáo Năm 2026'
ACBS_ALIASES = {
    'Fanpage ACBS': 'ACBS', 'SMART ACBS': 'ACBS SMART',
    'VPS SmartOneApp': 'VPS SmartOne', 'Kis chứng khoán': 'Chứng khoán KIS',
    'ứng dụng MBS': 'App MBS',
}
ACBS_REVIEW = re.compile(
    r'^#?(?:investing101|chamthongtin|tcx|gens2027|startboldgrowbeyond|gensopenday|'
    r'ssi|vps|vpss|vci|mbs|hsc|cts|shs|bsi|mas|kis|vnd|vcsc|fundmart|'
    r'nguyen duy hung|pham minh huong|nguyen hoang giang|digital securities|'
    r'co phieu|trai phieu|nha dau tu|phai sinh|chung si|etf|bluechip|vnxaf?ll|'
    r'hnx|hsx|chung khoan|vn daf|vndaf)$'
)
ACBS_TOPICS = {
    16: ('ACBS x Phố tài chính', 'ACBS đồng hành cùng VIF'),
    26: ('Trái phiếu smartBond',),
    31: ('ACBS Smart',),
    32: ('ACBS Smarty',),
    45: ('Học viện đào tạo Investing 101',),
}
NON_STANDALONE = re.compile(
    r'(?i)[:;=]|\b(?:keyword|từ khóa|thêm|phụ lục|xem thêm|ví dụ|spam|rule|nhãn|loại trừ|'
    r'điều kiện|bên dưới|định nghĩa|source list|link nguồn|để lọc|nói chung|'
    r'để check|bổ sung thêm|nhóm đối thủ|không lấy|phạm vi|cập nhật vào|đã update)\b'
)
PLACEHOLDER_SUBJECT = re.compile(r'(?i)^(?:brand|main brand|project|noi dung|topic|doi thu|thuong hieu|ten thuong hieu|label|level|note|stt|chi tiet|keywords?|hashtag\w*|tu khoa|nganh|main keywords?)$')
LEVEL2_SECTION = re.compile(r'\b(?:doi thu|competitor\w*|industry|tu khoa nganh)\b')
LEVEL1_SECTION = re.compile(r'\b(?:main ?brands?|thuong hieu chinh|chu the chinh)\b')
DISTINCTIVE_SHORT_BRAND = {'acb', 'bidv', 'kfc', 'mbs', 'pnj', 'scg', 'ssi', 'tcbs', 'vib', 'vps'}
CONTEXT_RULE = re.compile(r'\b(?:bat buoc|ket hop|query es|can them|dung kem|khi di cung)\b')
REVIEWED_TABS = {
    'Nghỉ dưỡng Alma': {'Từ Khoá', 'Từ khóa autosearch'},
    'Nha Khoa Kim': {'Trang tính1'},
    'HSC 2026': {'Keyword'},
    'Nam Á Bank 2026': {'Trang tính1'},
    'Novaland 2026': {'Trang tính1'},
    'ACB Bank': {'Từ khóa ACB(chung)', 'Keyword'},
    'VIB': {'Danh sách đối thủ', 'Từ khóa - set-up', 'Từ khóa - tag Alert (2026)'},
    'SCG': {'Keyword', 'Keyword + Hashtag '},
    'Be App': {'Keyword List'},
    'Bệnh Viện Quốc Tế Mỹ': {'Keyword'},
    'C.P Việt Nam (SmartCom)': {'Keywords'},
    'Tân Hiệp Phát': {'Từ khóa', 'Bộ Keywords'},
}
AMBIGUOUS_GLOSS = {
    'alma', 'alma tuan', 'alma can', 'csh alma', 'hsc', '#hsc', 'nab', 'nam a',
    'ngan hang quoc te', 'dang khac vy', 'tran hung huy', 'acbl', 'scg', 'scgp', 'vkpc',
    'be', '#be', 'cake', '#bennhautronduong', '#hailongmoinguoiviet', '#sieunhieuxe',
    '#datxesieunhanh', '#giaomonsieutoc', '#ungdungdadichvu', 'bia gold', 'olong', 'tea+',
    'cp', 'c p', 'cpv', 'cpvn', 'cipi', '#veancom', '#tutrangtraidenbepnha',
    'nhu cach me yeu thuong', '#nhucachmeyeuthuong', 'five star', 'nha nova',
}
AMBIGUOUS_KEYS = {query_key(word) for word in AMBIGUOUS_GLOSS}
AIH_AUTHORITY = 'https://aih.com.vn/contact'
TEA_AUTHORITY = 'https://www.suntorypepsico.vn/thuong-hieu-cua-chung-toi/tea-9'
VINGROUP_CONTEXT_TERMS = (
    'bieutinh', 'bds', 'cadat', 'canho', 'canhov', 'caogia', 'chamsodo', 'chonvon',
    'comb', 'cuandan', 'cuongche', 'cuopdat', 'datphong', 'dautu', 'denthu',
    'duan', 'gia', 'giaiphongmatbang', 'giamgia', 'gofl', 'huyhoaimoitruong',
    'khieunai', 'khongcocudan', 'khothanhkhoan', 'khunghiduong', 'lanbien',
    'lapday', 'lappbien', 'loiichnhom', 'luadao', 'nghiduong', 'nhaoxahoi',
    'noxh', 'ruiro', 'sodo', 'songdangcap', 'thamnhung', 'thanhkhoan',
    'tienich', 'tochuc', 'tour', 'vangve', 'voucher',
)
VINGROUP_WRONG_SCOPE = {'vincomshophousevinh', 'vincomicerink', 'theglobalcityvinhomes', 'vingroupvinhomes'}


def acbs_term(book, sheet, cell, subject, level, kind, word=None):
    raw = cell['text'].strip()
    word = word or raw
    word = next((canonical for spelling, canonical in ACBS_ALIASES.items()
                 if fold(word) == fold(spelling)), word)
    proof = candidate(book, sheet, cell['ref'], word, subject, level, kind, raw)
    proof['decision'] = 'REVIEW' if ACBS_REVIEW.fullmatch(fold(word.lstrip('#'))) else 'READY'
    return proof


def acbs_cells(book, sheet):
    project, = book['projects']
    name, rows = sheet['name'], sheet['rows']
    title = fold(name.strip())
    recent = project == ACBS_2026
    if title == 'tu khoa mainbrand' or title == 'tu khoa main brand':
        if fold(field(rows.get(5, {}), 'B')) != 'keywords':
            raise ValueError(f'Unexpected ACBS brand header: {project} / {name}')
        for number, row in sorted(rows.items()):
            if number <= 5:
                continue
            for col in ('BC' if recent else 'BH'):
                if not (word := field(row, col)):
                    continue
                if col == 'H':
                    if '+' not in word:
                        words = ('HOSE', 'HSX') if word == 'HOSE (HSX)' else (word,)
                        for term in words:
                            yield acbs_term(book, name, row[col], 'Ngành chứng khoán', 2, 'industry_keyword', term)
                else:
                    yield acbs_term(book, name, row[col], 'ACBS', 1, 'brand_keyword')
    elif title in {'tu khoa 6 doi thu', 'tu khoa doi thu'}:
        if recent:
            headings = {5: 'TCBS', 13: 'SSI', 28: 'VPS', 39: 'Vietcap', 45: 'MBS', 52: 'HSC'}
            if fold(field(rows.get(4, {}), 'B')) != 'main keywords':
                raise ValueError(f'Unexpected ACBS competitor header: {name}')
            for number, row in sorted(rows.items()):
                if number < 5:
                    continue
                block = max(start for start in headings if start <= number)
                subject = 'HSC' if number in {25, 26} else headings[block]
                for col in 'BC':
                    if field(row, col):
                        yield acbs_term(book, name, row[col], subject, 2, 'competitor_keyword')
        else:
            heading_rows = (5, 20, 33, 45, 59, 72, 84) if '2025' in project else (5, 20)
            for number, row in sorted(rows.items()):
                if number < heading_rows[0]:
                    continue
                head = rows.get(max(start for start in heading_rows if start <= number), {})
                for col in 'BEH':
                    word = field(row, col)
                    subject = field(head, col)
                    if not word or not subject or word == 'VCL':
                        continue
                    if word.startswith('TCBS '):
                        subject = 'TCBS'
                    yield acbs_term(book, name, row[col], 'Vietcap' if subject == 'VCL' else subject,
                                    2, 'competitor_keyword')
    elif recent and title == 'bo chu de':
        for number, terms in ACBS_TOPICS.items():
            row = rows[number]
            for term in terms:
                for col in ('C', 'E'):
                    if re.sub(r'\W+', '', fold(term)) in re.sub(r'\W+', '', fold(field(row, col))):
                        yield acbs_term(book, name, row[col], 'ACBS', 1, 'named_plan_topic', term)
                        break


def snapshot(db):
    index = defaultdict(list)
    for project, word, level, status, subjects in db.execute(
            'SELECT project_name,keyword,level,status,subjects_json FROM keywords'):
        index[project, query_key(word)].append((word, level, status, json.loads(subjects)))
    return index


def choose_updates(current, candidates):
    updates = []
    for (project, key), rows in sorted(candidates.items()):
        reviewed = [row for row in rows if row['kind'] == 'reviewed_plan_field']
        if reviewed:
            rows = reviewed
        if len({row['level'] for row in rows}) != 1:
            continue
        level = rows[0]['level']
        present = current.get((project, key), [])
        if present and (len(present) != 1 or present[0][1] != level
                        or present[0][2] not in {'READY', 'REVIEW', 'CHANNEL_ONLY'}):
            continue
        word = present[0][0] if present else rows[0]['keyword']
        decision = present[0][2] if present else ('READY' if any(r['decision'] == 'READY' for r in rows) else 'REVIEW')
        evidence = list({(r['plan_url'], r['sheet'], r['cell'], r['original']): r for r in rows}.values())
        updates.append({'project': project, 'keyword': word, 'level': level, 'decision': decision,
                        'previous_status': present[0][2] if present else None,
                        'subjects': sorted({r['resolved_subject'] for r in evidence}), 'evidence': evidence})
    return updates


def consolidate_acbs_aliases(db, statuses):
    count = 0
    for project in ACBS.values():
        if project not in statuses or statuses[project].strip().lower() not in ACTIVE:
            continue
        for alias, target in ACBS_ALIASES.items():
            old = db.execute('SELECT level,status,reasons_json FROM keywords WHERE project_name=? AND keyword=?',
                             (project, alias)).fetchone()
            if not old or old[1] != 'READY':
                continue
            level, prior, reasons = old
            target_row = db.execute('SELECT status,level FROM keywords WHERE project_name=? AND keyword=?',
                                    (project, target)).fetchone()
            if target_row != ('READY', level):
                continue
            missing_channels = db.execute('''
                SELECT platform FROM keyword_platform_audit WHERE project_name=? AND keyword=? AND status='READY'
                EXCEPT SELECT platform FROM keyword_platform_audit WHERE project_name=? AND keyword=? AND status='READY'
            ''', (project,alias,project,target)).fetchall()
            if missing_channels:
                continue
            reason = f'Dùng {target} làm keyword đại diện cho cùng chủ thể. Giữ nguyên cụm viết trong ô gốc để đối chiếu.'
            db.execute('UPDATE keywords SET status=?,reasons_json=? WHERE project_name=? AND keyword=?',
                       ('ALIAS',encode([*json.loads(reasons),reason]),project,alias))
            db.execute('''UPDATE keyword_platform_audit SET status='ALIAS',canonical_keyword=?,reason=? || ' ' || reason
                          WHERE project_name=? AND keyword=? AND status<>'OUT_OF_SCOPE' ''',
                       (target,reason,project,alias))
            db.execute('INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',
                       (AUDIT,project,alias,prior,'ALIAS',level,level,target,reason))
            count += 1
    return count


def apply(db, updates, statuses, audit_id=AUDIT, reviews=()):
    db.execute('PRAGMA foreign_keys=ON')
    changes = Counter()
    with db:
        db.execute('BEGIN IMMEDIATE')
        for item in reviews:
            project, word, reason = (item[k] for k in ('project','keyword','reason'))
            old = db.execute('SELECT status,level,reasons_json FROM keywords WHERE project_name=? AND keyword=?',
                             (project,word)).fetchone()
            if not old or old[0] != 'READY' or statuses[project].strip().lower() not in ACTIVE:
                raise ValueError(f'Keyword scope changed during review: {project} / {word}')
            state, level, prior_reasons = old
            db.execute('UPDATE keywords SET status=?,reasons_json=? WHERE project_name=? AND keyword=?',
                       ('REVIEW',encode([*json.loads(prior_reasons),reason]),project,word))
            db.execute('''UPDATE keyword_platform_audit SET status='REVIEW',reason=?
                          WHERE project_name=? AND keyword=? AND status='NOT_CHECKED' ''',(reason,project,word))
            db.execute('INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',
                       (audit_id,project,word,state,'REVIEW',level,level,None,reason))
            changes['RECHECK'] += 1
        for row in updates:
            project, word, level = (row[k] for k in ('project', 'keyword', 'level'))
            prior = db.execute('SELECT status,level,originals_json,evidence_json FROM keywords WHERE project_name=? AND keyword=?',
                               (project, word)).fetchone()
            current_status, = db.execute('SELECT plan_status FROM projects WHERE project_name=?', (project,)).fetchone()
            if current_status.strip().lower() not in ACTIVE or (prior[:2] if prior else None) != (
                    (row['previous_status'], level) if row['previous_status'] else None):
                raise ValueError(f'Catalog or project changed during review: {project} / {word}')
            if not prior and row['decision'] == 'READY':
                apply_updates(db, [row], statuses, audit_id=audit_id)
                changes['READY'] += 1
                continue
            records = [{'method': audit_id, 'plan_url': r['plan_url'], 'sheet': r['sheet'], 'cell': r['cell'],
                        'raw_value': r['original'], 'kind': r['kind'], 'subject': r['resolved_subject'],
                        **({'support_url': r['support_url']} if r.get('support_url') else {})}
                       for r in row['evidence']]
            provenance = [f"{r['sheet']}!{r['cell']} · {r['plan_url']}" for r in records]
            if prior:
                old = json.loads(prior[2])
                present = {encode(item) for item in old}
                added = [item for item in records if encode(item) not in present]
                if added:
                    origins = list(dict.fromkeys([*json.loads(prior[3]), *provenance]))
                    db.execute('UPDATE keywords SET originals_json=?,evidence_json=? WHERE project_name=? AND keyword=?',
                               (encode([*old, *added]), encode(origins), project, word))
                    changes['EXISTING_EVIDENCE'] += 1
                continue
            reason = 'Có trong plan. Cần đối chiếu kết quả tìm riêng vì từ viết tắt, tên người hoặc hashtag có thể trả về chủ thể khác.'
            db.execute('INSERT INTO keywords VALUES (?,?,?,?,?,?,?,?,?)', (word, project, level, 'REVIEW', statuses[project],
                       encode(row['subjects']), encode(list(dict.fromkeys(provenance))), encode(records), encode([reason])))
            db.execute('INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',
                       (audit_id, project, word, None, 'REVIEW', None, level, None, reason))
            for channel in PLATFORMS:
                out = channel == 'news' and word.startswith('#')
                db.execute('INSERT INTO keyword_platform_audit VALUES (?,?,?,?,?,?,?,?,?,?)',
                           (project, word, channel, 'OUT_OF_SCOPE' if out else 'REVIEW', None,
                            'Hashtag nằm ngoài phạm vi news.' if out else reason,
                            query_url(channel, word), 'PLAN_SCOPE', None, '[]'))
            changes['REVIEW'] += 1
        if aliases := consolidate_acbs_aliases(db, statuses):
            changes['ALIAS'] += aliases
        refresh_term_views(db)
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('Catalog integrity check failed')
    update_summaries(db)
    return dict(changes)


def collect_acbs(documents, candidates):
    coverage = {}
    for ident, project in ACBS.items():
        book = documents[ident]
        if book['projects'] != [project]:
            raise ValueError(f'Mismatched ACBS plan assignment: {book["projects"]}')
        coverage[project] = []
        for sheet in read_book(book['file']):
            coverage[project].append(sheet['name'])
            for item in acbs_cells(book, sheet):
                word = item['keyword']
                if term_shape(word) and allow_keyword({'project': project, 'keyword': word}):
                    candidates[project, query_key(word)].append(item)
    if set(coverage) != set(ACBS.values()) or any(not sheets for sheets in coverage.values()):
        raise ValueError('Missing ACBS workbook')
    return coverage


def standalone_terms(project, raw, kind):
    if CONTEXT_RULE.search(fold(raw)) or re.search(r'\s*\+\s*["“]|\s+\+\s+|\b(?:AND|OR|NOT)\b|&&|\|\|', raw):
        return []
    terms = clean_terms(raw, project, kind)
    if kind == 'hashtag':
        terms = [word for word in terms if word.startswith('#')]
    return list(dict.fromkeys(terms))


def generic_candidate(project, word, proof, anchors, doc):
    kind = proof['kind']
    title = proof['subject'].strip()
    raw = proof['original']
    base = word.lstrip('#')
    key = fold(base)
    if (not term_shape(word) or NON_PRODUCT.fullmatch(key) or TRACKING_ONLY.fullmatch(key)
            or NON_STANDALONE.search(word) or not allow_keyword({'project': project, 'keyword': word})):
        return None, 'INVALID_OR_TOO_GENERIC'
    if kind in {'note', 'cell_note'} and not NOTE_PREFIX.match(raw):
        return None, 'NOTE_REQUIRES_CONTEXT'
    if NOTE_INSTRUCTION.search(key) or len(doc['projects']) != 1:
        return None, 'WORKBOOK_OR_NOTE_REQUIRES_CONTEXT'
    anchor = match_anchor(project, word, anchors) or match_anchor(project, base, anchors)
    scoped = match_anchor(project, title, anchors) if title else None
    role = fold(proof['role'])
    sheet = fold(proof['sheet'])
    level = (int(role) if role in {'1', '2'} else
             2 if LEVEL2_SECTION.search(sheet) else 1 if LEVEL1_SECTION.search(sheet) else None)
    if anchor and scoped and anchor[1] != scoped[1]:
        return None, 'MISMATCHED_SUBJECT_LEVEL'
    if anchor and level and anchor[1] != level:
        return None, 'MISMATCHED_SUBJECT_LEVEL'
    # Qualified variants from explicitly labeled fields may extend a known
    # subject, with the workbook assignment and keyword origin kept in full.
    if proof['kind'] not in {'main', 'matrix', 'hashtag', 'note', 'cell_note'}:
        return None, 'WORKBOOK_OR_NOTE_REQUIRES_CONTEXT'
    compact = query_key(base)
    for identity in (anchor, scoped):
        if not identity or (level and level != identity[1]):
            continue
        subject, subject_level = identity
        tokens = {query_key(subject)}
        if scoped == identity:
            tokens.add(query_key(title))
        tokens.update(query_key(text) for text in re.findall(r'(?<!\w)[A-Z][A-Z0-9]{2,}(?!\w)', subject))
        for token in tokens:
            if len(token) >= 5 and (compact.startswith(token) or compact.endswith(token)):
                return {**proof, 'keyword': word, 'resolved_subject': subject, 'level': subject_level, 'decision': 'READY'}, ''
            if token in DISTINCTIVE_SHORT_BRAND and (compact.startswith(token) or compact.endswith(token)) and len(compact) > len(token)+2:
                return {**proof, 'keyword': word, 'resolved_subject': subject, 'level': subject_level, 'decision': 'READY'}, ''
    if title and not PLACEHOLDER_SUBJECT.fullmatch(fold(title)) and kind in {'main', 'matrix', 'hashtag'}:
        if level and compact == query_key(title) and len(compact) >= 5:
            return {**proof, 'keyword': word, 'resolved_subject': title, 'level': level, 'decision': 'REVIEW'}, ''
    return None, 'SUBJECT_REQUIRES_CONTEXT'


def reviewed_cells(project, book, sheet):
    """Extract the standalone fields from individually checked layouts."""
    name = sheet['name']
    for n, row in sheet['rows'].items():
        cells = []
        subject, level = project, 1
        if project == 'Nghỉ dưỡng Alma' and n >= (2 if name == 'Từ Khoá' else 3):
            cells = [('A', field(row, 'A'))] if 'alma' in fold(field(row, 'A')) else []
        elif project == 'Nha Khoa Kim' and 2 <= n <= 4:
            cells = [(col, field(row, col)) for col in 'BC']
        elif project == 'HSC 2026' and 2 <= n <= 12:
            cells = [(col, field(row, col)) for col in 'AB']
        elif project == 'Nam Á Bank 2026' and 2 <= n <= 14 and n != 11:
            cells = [('A', field(row, 'A'))]
        elif project == 'Novaland 2026' and 2 <= n <= 7:
            cells = [('A', field(row, 'A'))]
        elif project == 'ACB Bank':
            if name == 'Từ khóa ACB(chung)' and 6 <= n <= 26:
                cells = [('B', field(row, 'B'))]
            elif name == 'Keyword' and n in {7, 8, 26, 27}:
                cells = [('H', field(row, 'H'))]
        elif project == 'VIB':
            if name == 'Danh sách đối thủ' and 6 <= n <= 17:
                value = field(row, 'C')
                short, full = re.split(r'\s+[–-]\s+', value, maxsplit=1)
                if short == 'ACB':
                    short = 'ACB Bank'
                if short == 'MSB':
                    short = 'Ngân hàng MSB'
                subject, level = short, 2
                cells = [('C', short), ('C', full)]
            elif name == 'Từ khóa - set-up' and n in {8, 9, 10, 11, 12, 14, 29, 30}:
                cells = [('C', field(row, 'C'))]
            elif name == 'Từ khóa - tag Alert (2026)' and re.match(r'^VIB ', field(row, 'E'), re.I):
                cells = [('E', re.sub(r'\s*\(Thẻ ATM\)$', '', field(row, 'E')))]
        elif project == 'SCG' and ((name == 'Keyword' and 5 <= n <= 21)
                                   or (name == 'Keyword + Hashtag ' and (5 <= n <= 21 or n in {61, 71, 72}))):
            word = field(row, 'B').replace('SCG_Smartboard', 'SCG Smartboard')
            if re.search(r'\b(?:SCG\w*|Siam Cement Group|Bao bì AP|VKPC|Giấy Kraft Vina)\b', word, re.I):
                cells = [('B', word)]
        elif project == 'Be App' and (3 <= n <= 38 or 70 <= n <= 93):
            subject = 'Be' if n < 70 else 'Ngân hàng số Cake'
            for word in standalone_terms(project, field(row, 'C'), 'main'):
                text = fold(word.lstrip('#'))
                if re.match(r'^(?:be(?:$|bike|car|food|group|financial|giao|dich|da dich|dat|de|la|now|flight|express|delivery|di cho|ship|mua ho|\b)|ctcp be group)', text) or (
                        n >= 70 and re.search(r'cake|befinancial', text) and '|' not in word):
                    cells.append(('C', word))
                elif word in {'#Ungdungdadichvu','#Bennhautronduong','#hailongmoinguoiviet',
                              '#Sieunhieuxe','#Datxesieunhanh','#Giaomonsieutoc'}:
                    cells.append(('C', word))
        elif project == 'Bệnh Viện Quốc Tế Mỹ' and 2 <= n <= 8:
            subject, level = field(row, 'A'), 1 if n == 2 else 2
            for term in parts(field(row, 'B')):
                word = term.strip().strip('"“”')
                if '+' in word or query_key(word) in {'hocdivat', 'phuongphapheimlich'}:
                    continue
                if 'america international hospital' == fold(word) or query_key(word) == 'americainternationalhospital':
                    word = 'American International Hospital'
                cells.append(('B', word))
            if n in {7, 8}:
                cells.append(('A', 'Bệnh viện Phương Châu' if n == 8 else subject))
        elif project == 'C.P Việt Nam (SmartCom)' and n >= 3:
            for col in 'ABCDE':
                word = field(row, col)
                if re.search(r'\b(?:c[. ]?p\b|cpf(?:ood\w*|resh\w*)|cpv\w*|cpbrandvn|charoen pokphand|ga ran five star|five star|ga fivestar|cipi)', fold(word)):
                    cells.append((col, word))
            for col in 'FIK':
                word = field(row, col)
                if (n == 3 and col == 'F') or (n <= 6 and col in 'IK'):
                    cells.append((col, word))
        elif project == 'Tân Hiệp Phát':
            col = 'C' if name == 'Từ khóa' else 'D'
            if n >= 2:
                for word in standalone_terms(project, field(row, col), 'main'):
                    if re.search(r'\b(?:tan hiep phat|bia ben thanh|bia gold|khong do|dr[ .]?thanh|iku[nm]|'
                                 r'number\s*(?:1|one)|soya|active chanh|tea ?plus)\b', fold(word)):
                        cells.append((col, word))
        for col, word in cells:
            if not word or not term_shape(word) or '+' in word or not allow_keyword({'project':project,'keyword':word}):
                continue
            if NON_STANDALONE.search(word) or re.search(r'\s[|]\s|\n', word):
                continue
            decision = 'REVIEW' if query_key(word) in AMBIGUOUS_KEYS else 'READY'
            if project == 'Nghỉ dưỡng Alma':
                word = word.replace('alma_resort', 'Alma resort')
            if project == 'C.P Việt Nam (SmartCom)' and '/' in word:
                word = word.split('/', 1)[0].strip()
            if project == 'Bệnh Viện Quốc Tế Mỹ' and 'american international hospital' in fold(word):
                word = 'American International Hospital'
            local_subject, local_level = subject, level
            support = None
            if project == 'Tân Hiệp Phát':
                word = word.replace('Sữa đậy nành', 'Sữa đậu nành')
                if query_key(word) == 'teaplus':
                    local_subject, local_level, support = 'Trà Ô Long TEA+', 2, TEA_AUTHORITY
                if re.fullmatch(r'(?:chai|thung|uong|cong ty|cty|nuoc loc|nuoc suoi|nuoc tinh khiet|tap doan) number (?:1|one)',
                                fold(word)):
                    decision = 'REVIEW'
            if project == 'Bệnh Viện Quốc Tế Mỹ' and word == 'American International Hospital':
                support = AIH_AUTHORITY
            proof = candidate(book,name,row[col]['ref'],word,local_subject,local_level,
                              'reviewed_plan_field',field(row,col))
            if support:
                proof['support_url'] = support
            proof['decision'] = decision
            yield proof


def collect_reviewed(documents, candidates):
    for doc in documents.values():
        if len(doc['projects']) != 1 or not doc.get('file') or not Path(doc['file']).is_file():
            continue
        project, = doc['projects']
        if project not in REVIEWED_TABS:
            continue
        for sheet in read_book(doc['file'], lambda name: name in REVIEWED_TABS[project]):
            for proof in reviewed_cells(project, doc, sheet):
                candidates[project, query_key(proof['keyword'])].append(proof)


def screen_preview(report, current, candidates):
    reviewed = []
    for row in report['keywords']:
        project, word = row['project'], row['keyword']
        key = query_key(word)
        if project in ACBS.values() or row['previous_status'] or current.get((project,key)):
            continue
        if (project,key) in candidates:
            continue
        reason = ''
        status = row['decision']
        if project == 'Cake' and key == '#gojek':
            reason = 'C14 thuộc khối Be App trên cùng sheet. Phạm vi Cake bắt đầu tại A23.'
        elif project == 'ShopeePay' and key == 'gcashmayashopeepay':
            reason = 'Ô liệt kê ghép nhiều ví, có nội dung dịch vụ ngoài phạm vi riêng của ShopeePay.'
        elif project == 'Saint-gobain' and key == 'kingsmen':
            reason = 'Dùng cụm Keo chà ron Kingsmen đã có trong kho để phân biệt với các chủ thể cùng tên.'
        elif re.search(r'\.(?:com|vn|net)(?:\.vn)?$',word, re.I) or (project == 'Chance Kim' and word == 'chancekim.lips'):
            reason = 'Tên miền hoặc tên tài khoản là thông tin nhận diện nguồn. Kho đã có keyword tên thương hiệu.'
        elif project == 'Vingroup':
            if key in VINGROUP_WRONG_SCOPE:
                status = 'REVIEW'
                reason = 'Tên chồng nhiều nhãn hoặc khối cột ghi chủ thể khác. Cần đối chiếu độc lập.'
            for brand in ('vinhomes','vinpearl','vingroup'):
                for extra in VINGROUP_CONTEXT_TERMS:
                    if key in {brand+extra,extra+brand} or (
                            extra not in {'gia','duan','canho','bds'} and key.startswith(brand+extra)):
                        reason = 'Cụm gồm tên thương hiệu và ngữ cảnh mô tả. Keyword tên thương hiệu đã có cho cùng phạm vi.'
                        status = 'CONTEXT_ONLY'
                        break
                if status == 'CONTEXT_ONLY':
                    break
        if reason and status == row['decision']:
            status = 'CONTEXT_ONLY'
        if reason:
            reviewed.append({'project':project,'keyword':word,'decision':status,'reason':reason,
                             'evidence':row['evidence']})
        if status != 'CONTEXT_ONLY':
            if project == 'Central Retail' and key in {'lotte','aeonvietnam','centralgroup'}:
                word = {'lotte':'Lotte','aeonvietnam':'AEON Vietnam','centralgroup':'Central Group'}[key]
            for proof in row['evidence']:
                candidates[project,key].append({**proof,'keyword':word,'decision':status})
    return reviewed


def collect_other(db, documents, candidates, audit_path):
    _, anchors = load_anchors(db)
    current = snapshot(db)
    by_project = defaultdict(Counter)
    coverage = []
    gaps = []
    # Evaluate current workbook exports, including notes, with a row-by-row
    # reconciliation log for unresolved standalone terms.
    with audit_path.open('w', encoding='utf-8') as log:
        for ident, doc in sorted(documents.items()):
            if ident in ACBS:
                continue
            entries, books = xlsx_inventory({ident: doc})
            book, = books
            coverage.append(book)
            if book['status'] != 'READ':
                gaps.append({**book, 'access_status': doc.get('unreadable', 'NO_EXPORT')})
                continue
            blocked = set()
            for group, raw, proof in entries:
                if proof['kind'] == 'exclude' or proof.get('context') == 'exclude':
                    for project in group:
                        blocked.update((project, query_key(word)) for word in standalone_terms(project, raw, proof['kind']))
            recorded = set()
            for group, raw, proof in entries:
                kind = proof['kind']
                for project in group:
                    if kind in {'sub', 'exclude'} or proof.get('context') in {'sub', 'exclude'}:
                        by_project[project]['CONTEXT_OR_EXCLUSION_CELL'] += 1
                        continue
                    for word in standalone_terms(project, raw, kind):
                        key = query_key(word)
                        origin_key = project, proof['sheet'], proof['cell'], kind, key
                        if origin_key in recorded:
                            continue
                        recorded.add(origin_key)
                        existing = current.get((project, key))
                        if existing:
                            statuses = {row[2] for row in existing}
                            status = 'ALREADY_IN_CATALOG' if statuses & {'READY', 'REVIEW', 'CHANNEL_ONLY'} else 'EXISTING_DECISION'
                        elif (project, key) in blocked:
                            status = 'EXPLICITLY_EXCLUDED'
                        else:
                            item, status = generic_candidate(project, word, {**proof, 'original': raw}, anchors, doc)
                            if item:
                                candidates[project, key].append(item)
                                status = 'CANDIDATE'
                        by_project[project][status] += 1
                        if status in {'MISMATCHED_SUBJECT_LEVEL', 'SUBJECT_REQUIRES_CONTEXT', 'CANDIDATE'}:
                            log.write(encode({'project': project, 'keyword': word, 'decision': status,
                                              **proof, 'raw_value': raw}) + '\n')
    return coverage, gaps, by_project


def summary(db, active):
    by_project = {project: {} for project in active}
    for project, level, status, tag, count in db.execute('''
        SELECT project_name,level,status,substr(keyword,1,1)='#',count(*)
        FROM keywords WHERE status <> 'ALIAS' GROUP BY 1,2,3,4
    '''):
        if project in by_project:
            by_project[project][f'{level}:{status}:{"hashtag" if tag else "phrase"}'] = count
    return by_project


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--all', action='store_true', help='Rà thêm toàn bộ workbook của các project đang chạy')
    parser.add_argument('--reviewed', action='store_true', help='Rà thêm những bảng đã xác định rõ cột và chủ thể')
    args = parser.parse_args()
    with closing(sqlite3.connect(DB.resolve().as_uri() + ('?mode=rw' if args.apply else '?mode=ro'),
                                 uri=True, timeout=30)) as db:
        statuses = dict(db.execute('SELECT project_name,plan_status FROM projects'))
        active = {project for project, value in statuses.items() if value.strip().lower() in ACTIVE}
        documents = active_documents(active)
        candidates = defaultdict(list)
        coverage = collect_acbs(documents, candidates)
        if args.reviewed or (args.all and args.apply):
            collect_reviewed(documents, candidates)
        report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'acbs_coverage': coverage}
        if args.all and args.apply:
            preview = read_json(OUT / 'active-plan-keyword-blocks-preview.json')
            if not preview or preview['active_projects'] != len(active):
                raise ValueError('Recheck active workbook coverage before applying')
            report.update({k:v for k,v in preview.items() if k not in {
                'acbs_coverage','keywords','planned','catalog_counts'}})
            report['manual_decisions'] = screen_preview(preview, snapshot(db), candidates)
            report['applied_at'] = datetime.now(timezone.utc).isoformat()
        elif args.all:
            trace = OUT / 'active-plan-keyword-blocks-cells.jsonl'
            books, gaps, decisions = collect_other(db, documents, candidates, trace)
            readable = [book for book in books if book['status'] == 'READ']
            represented = {p for book in readable for p in book['projects']} | set(coverage)
            report.update(active_projects=len(active), readable_projects=len(represented),
                          books_read=len(readable) + len(coverage),
                          sheets_read=sum(b['sheets'] for b in readable) + sum(map(len, coverage.values())),
                          unreadable_workbooks=gaps, projects_without_readable_workbook=sorted(active-represented),
                          workbook_coverage=books, decisions_by_project=decisions, cell_trace=str(trace))
        updates = choose_updates(snapshot(db), candidates)
        report['keywords'] = updates
        report['planned'] = dict(Counter((r['project'] + ' / ' + r['decision']) for r in updates if not r['previous_status']))
        if args.apply:
            report['changes'] = apply(db, updates, statuses)
        report['catalog_counts'] = summary(db, active if args.all else set(coverage) | (set(REVIEWED_TABS) if args.reviewed else set()))
        name = ('active-plan-keyword-blocks' if args.all else
                'reviewed-plan-keyword-fields' if args.reviewed else 'acbs-keyword-blocks')
        write_json(OUT / f'{name}{"" if args.apply else "-preview"}.json', report)
        print(encode({k: report[k] for k in ('planned','changes','active_projects','books_read','sheets_read') if k in report}))


if __name__ == '__main__':
    main()
