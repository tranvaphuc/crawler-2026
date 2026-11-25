"""Recover standalone project and competitor keywords from the active workbook exports."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
import json
from pathlib import Path
import re
import sqlite3
from zipfile import BadZipFile

from audit_full_plan_contents import (ACTIVE, BACKUP_NOTES, OLD_30SHINE, PRIMARY_CONTENT_OWNERS,
    ROOT as FULL, allow_keyword, assign)
from audit_full_plan_links import TOPIC_INDEX
from collect_catalog_platform_audit import MASTER_ID
from deduplicate_catalog_keywords import refresh_term_views
from reconcile_plan_keywords_deep import (DB, OUT, NON_PRODUCT, TRACKING_ONLY, apply_updates,
    clean_terms, encode, field, fold, origin, plan_files, propose, query_key, read_book, read_json,
    term_shape, update_summaries, write_json, xlsx_inventory)

AUDIT = 'active-plan-standalone-keyword-scope'
REPORT = OUT / 'active-plan-standalone-keyword-review.json'
PREVIEW = REPORT.with_name(REPORT.stem+'-preview.json')
VNM = 'Vinamilk'
VNM_BOOK = '1839xTvCF5kzwWo_GMvssVqVA4m-kkrrajI5RjFJXFMQ'
COMPETITOR = re.compile(r'(?:doi thu(?: can theo doi| can do luong)?|ten doi thu|thuong hieu doi thu|competitors?|competitor (?:name|brands?)|competitive brands?)$')
KEY_HEADER = re.compile(r'(?:danh sach )?(?:tu khoa|keywords?|hashtag|kws?)$')
BRAND_LABEL = re.compile(r'^(?:thương hiệu|nhãn hiệu)\s+', re.I)
AMBIGUOUS = re.compile(r'^(?:khac|all|all brands|doi thu|nganh hang|nganh|thi truong|tong hop|ten doi thu|nhan hang|giai thich|chung|brand|nan|loai khac|chua co|none|n a)$')
TTC_OWN = {'B4','B17','B22','B28','B31','B34','B38','B52'}
SAINT_COMPETITOR_SCOPE = {'betongnheacc','demex','goodgroup','insee','jorakay',
                          'kingsmen','lukyta','vicin','yoshinogypsum'}
SAINT_QUALIFIED = {'kingsmen':('Keo chà ron Kingsmen','https://www.youtube.com/channel/UCInUNllol4yAqjDnhF1Tdcg'),
                   'vicin':('Keo dán gạch Vicin','https://vicin.vn/danh-muc-san-pham/keo-dan-gach-vicin/'),
                   'goodgroup':('Tấm xi măng GoodGroup',None)}
VNM_PRODUCT = re.compile(r'\b(?:vinamilk|vnm|dielac|optimum|yoko|organic gold|kenko|sure (?:prevent|diecerna)|'
    r'canxi ?pro|green farm|goldsoy|ridielac|moc chau milk|sua (?:tuoi |chua )?moc chau|yomilk|probi|probeauty|susu|su su|'
    r'iced? (?:chanh muoi)|vfresh|coco ?fresh|fruit love|twin ?cows|ngoi sao phuong nam|ong tho|(?:sua|kem|nha may) tai loc|'
    r'kem (?:cay |oc que )?delight|kem ?(?:subo|oze|yolo)|happy milk tea|pedia kenji)\b')
VNM_COMPETITOR_NAMES = {
    ('Danh sách ngành hàng','F4'): [('Cô Gái Hà Lan','FrieslandCampina','https://careers.frieslandcampina.com/vnm/vi/page/brands'),
                                    ('Dutch Lady','FrieslandCampina','https://careers.frieslandcampina.com/vnm/vi/page/brands')],
    ('Danh sách ngành hàng','F9'): [('Sữa Quốc tế LOF','LOF','https://lof.vn/vi/about?activeTab=1'),
                                    ('Công ty Sữa IDP','LOF / IDP','https://www.lof.vn/vi/news/cong-ty-sua-idp-doi-ten-thanh-lof-va-dat-muc-tieu-tro-thanh-doanh-nghiep-ty-usd')],
    ('Danh sách ngành hàng','F26'): [('QBB Việt Nam','QBB','https://www.youtube.com/watch?v=ApTWC02XIqQ')],
    ('Danh sách ngành hàng','F27'): [('Lothamilk','Sữa Long Thành','https://www.youtube.com/channel/UC7xBdztzPR3ikdnC6lndLHw')],
    ('List Tracking_Đối thủ','D71'): [('Sữa KUN','LOF KUN','https://www.lof.vn/vi/brand?activeBrand=kun')],
}
VNM_SPECIFIC_PRODUCTS = {
    ('List Tracking_VNM','C21'): [('sữa chua ít đường Vinamilk','https://www.vinamilk.com.vn/products/sua-chua-vinamilk-it-duong')],
    ('List Tracking_VNM','C46'): [('sữa hạt Vinamilk','https://www.vinamilk.com.vn/collections/sua-thuc-vat')],
}
VNM_NON_STANDALONE = {'twincowscaocap','scavinamilk100%suatuoicoduong','cocofresh','fruitlove','happymilktea'}
VNM_TOPIC_PLAN = '1-e_cLtG_oP1Wr-06WGGoMKUuTu0FWAHL'
NUTRICARE_DISCLOSURES = 'https://www.dinhduongyhoc.com.vn/pages/cong-bo-san-pham-va-dang-ky-quang-cao'
NUTRICARE_DECLARATIONS = 'https://nutricare.com.vn/cong-bo-san-pham/page/7/'
NUTRICARE_PHARMA = 'https://nutricare.com.vn/san-pham/san-pham-pharma/'
VNM_ROSTER_PRODUCTS = {
    728: ('Dutch Lady Mama','https://www.dutchlady.com.vn/sites/default/files/2022-07/dl-mama.pdf'),
    772: ('Enfamil Premium','https://moit.gov.vn/cong-bo-gia-sua/cong-ty-tnhh-mead-johnson-nutrition-viet-nam-thong-bao-gia-d.html'),
    809: ('Nuvita Grow','https://www.ipvietnam.gov.vn/documents/20182/732510/CONGBAO-12040213533729806.pdf'),
    818: ('Sữa tươi Nuvi','https://nutifood.com.vn/en/products/thuc-uong-sua-tuoi-trai-cay-nuvi'),
    822: ('Bột ăn dặm Coloscare',NUTRICARE_DECLARATIONS),
    826: ('Colos Glucare','https://nutricare.com.vn/cong-bo-san-pham/page/8/'),
    835: ('Sữa hạt Grand.Nut',NUTRICARE_DECLARATIONS),
    836: ('GrandCare Gold',NUTRICARE_DECLARATIONS),
    840: ('Leankid 100+',NUTRICARE_DISCLOSURES),
    842: ('Leanmax Bone',NUTRICARE_DISCLOSURES),
    843: ('Leanmax Colostrum',NUTRICARE_DISCLOSURES),
    844: ('Leanmax Hope',NUTRICARE_PHARMA),
    845: ('Leanmax Ligos',NUTRICARE_PHARMA),
    846: ('Leanmax Mom',NUTRICARE_PHARMA),
    847: ('Leanmax Rena Gold',NUTRICARE_DISCLOSURES),
    849: ('Leanpro Hope',NUTRICARE_PHARMA),
    857: ('Metacare Grow','https://nutricare.com.vn/en/'),
    859: ('Metacare YoYo','https://nutricare.com.vn/wp-content/uploads/2023/01/TCB-2023.12-Sua-chua-uong-Metacare-YOYO-huong-nho.pdf'),
    861: ('Metamax Adults',NUTRICARE_DISCLOSURES),
    864: ('Ospo Nutricare',NUTRICARE_DECLARATIONS),
    867: ('Smarta Mom','https://nutricare.com.vn/wp-content/uploads/2023/08/HSCB-31.2019-Smarta-Mom-vi-viet-quat.pdf'),
    868: ('Sữa bột Smarta Grow',NUTRICARE_DECLARATIONS),
    951: ('TH true MILK Organic','https://thmilk.vn/thong-bao-ra-mat-san-pham-moi-sua-tuoi-tiet-trung-huu-co-th-true-milk-organic-nguyen-chat-1-lit/'),
}
VNM_CLEANUP = {
    'Frieslandcampina Vietnam (FCV)': ('FrieslandCampina Việt Nam','Dấu ngoặc trong plan giải thích tên viết tắt.'),
    'LOF (IDP cũ)': ('Sữa Quốc tế LOF','Plan ghi tên công ty và chú thích tên cũ IDP. Kho giữ tên tìm riêng của cả hai thời kỳ.'),
    'Long Thành': ('sữa Long Thành','Cụm đứng riêng trùng tên địa danh. Dùng tên ngành hàng trong tab đối thủ.'),
    'Mộc Châu': ('Mộc Châu Milk','Cụm đứng riêng trùng tên địa danh. Dùng tên nhãn sữa trong Distribution List.'),
    'ADM': ('Sữa ADM','Dùng tên ngành hàng ghi rõ trong cùng ô vì ADM là chữ viết tắt.'),
    'CGHL': ('Cô Gái Hà Lan','Dùng tên thương hiệu đầy đủ.'),
    'mạch Super Susu': ('Ca cao lúa mạch Super Su Su','Dòng xuống hàng cắt giữa tên sản phẩm. Dùng tên đầy đủ ở cột B.'),
    'Optimum mama gold Sure Prevent': (None,'Hai dòng sản phẩm bị dính chữ trong một ô. Các tên Optimum Mama Gold và Sure Prevent đã có riêng.'),
    'uống Su Su vnm susu': ('Sữa chua uống Susu','Cụm vỡ do dấu phẩy giữa tên sản phẩm. Dùng tên hoàn chỉnh theo plan.'),
    'VNM Linkedin': ('Vinamilk','Nhãn dùng để chỉ nguồn LinkedIn trong Distribution List.'),
    'Youtube channel VNM': ('Vinamilk','Nhãn chỉ kênh YouTube trong Distribution List.'),
    'Kem Vinamilk nói chung': ('Kem Vinamilk','Bỏ chú thích phân loại sau tên sản phẩm.'),
    'Fanpage Vinamilk Chung Tay Vì Cộng Đồng': ('Vinamilk Chung Tay Vì Cộng Đồng','Bỏ loại nguồn Fanpage khỏi tên chủ thể.'),
}


def active_documents(projects):
    # The audited project-to-workbook assignments override the legacy roster.
    docs = {key: doc for key, doc in plan_files(projects).items() if doc['projects'] and key!=TOPIC_INDEX}
    for doc in read_json(FULL / 'access.json'):
        ident = doc['id']
        if doc.get('document_role') == 'TOPIC_INDEX' or doc['kind'] != 'spreadsheets' or ident == OLD_30SHINE:
            docs.pop(ident, None)
            continue
        group = [p for p in doc['projects'] if p in projects]
        if owner := PRIMARY_CONTENT_OWNERS.get(ident):
            group = [p for p in group if p == owner]
        if not group:
            docs.pop(ident, None)
            continue
        browser = FULL / 'browser-plans' / f'{ident}.xlsx'
        file = browser if browser.is_file() else doc.get('file') or docs.get(ident, {}).get('file')
        docs[ident] = {'projects':group, 'url':doc['url'], 'file':file,
                       'unreadable':BACKUP_NOTES.get(ident, doc['fetch_status'])}
    return docs


def candidate(book, name, ref, word, subject, level, kind='plan_keyword', raw=None):
    word = word.strip()
    return {**origin(book['url'], name, ref, kind, subject, str(level)),
            'original':raw or word, 'keyword':word, 'resolved_subject':subject, 'level':level}


def brand_name(value):
    # A parenthetical acronym or an old brand note is metadata, not search syntax.
    return BRAND_LABEL.sub('',re.sub(r'\s*\((?:[A-Z0-9]{2,8}|[^)]*\bcũ|đã có sẵn)\)\s*$', '', value).strip())


def standalone_brand(word):
    key = fold(word)
    if not term_shape(word) or NON_PRODUCT.fullmatch(key) or AMBIGUOUS.fullmatch(key):
        return False
    return bool(len(query_key(word)) >= 5 and not re.search(r'[:;()/#_]|\b(?:competitors?|topic|nhom|chua xac dinh|tuong duong|vi du)\b',key))


def competitor_columns(book, sheets):
    """Read explicit competitor-name columns with a nearby keyword or role header."""
    if len(book['projects']) != 1 or book['projects'][0] == VNM:
        return
    project = book['projects'][0]
    for sheet in sheets:
        name = sheet['name']
        competitor_sheet = bool(re.search(r'\b(?:doi thu|competitor\w*)\b',fold(name)))
        saint = project=='Saint-gobain' and name=='Đối tượng nghiên cứu'
        if not (competitor_sheet or saint):
            continue
        cols = set()
        cake_scope = name!='Competitors list'
        for n, row in sorted(sheet['rows'].items()):
            labels = {col:fold(cell['text'].strip()) for col,cell in row.items() if cell['text'].strip()}
            if n <= 20:
                explicit = {col for col,value in labels.items() if COMPETITOR.fullmatch(value)}
                if explicit and (saint or bool(set(labels.values()) & {'stt','ten thuong hieu','nhan hang','san pham','brand chinh'})):
                    cols = explicit
                    continue
                if competitor_sheet and any(KEY_HEADER.fullmatch(value) for value in labels.values()):
                    cols |= {col for col,value in labels.items() if value in {'ten thuong hieu','thuong hieu','brand','brand name'}}
                    continue
            if project=='Cake' and labels.get('A') in {'be app','cake'}:
                cake_scope = labels['A']=='cake'
            if project=='Cake' and not cake_scope:
                continue
            for col in cols & labels.keys():
                raw = field(row,col)
                for value in clean_terms(raw):
                    word = brand_name(value)
                    ref = row[col]['ref']
                    if saint and query_key(word) not in SAINT_COMPETITOR_SCOPE:
                        continue
                    if project=='TTC Group MS':
                        if name=='Keywords TTC & competitors' and ref in TTC_OWN and standalone_brand(word):
                            yield project,candidate(book,name,ref,word,word,1,'owned_brand_name',value)
                        continue
                    if project=='Cake' and fold(word)=='ubank':
                        word = field(row,'C')
                    if standalone_brand(word) and not word.isnumeric():
                        subject = word
                        authority = None
                        if saint and (qualified := SAINT_QUALIFIED.get(query_key(word))):
                            word,authority = qualified
                        proof = candidate(book,name,ref,word,subject,2,'competitor_name',value)
                        if authority:
                            proof['support_url'] = authority
                        yield project,proof


def vinamilk_rows(book, sheets):
    for sheet in sheets:
        name = sheet['name']
        for n, row in sorted(sheet['rows'].items()):
            for col, cell in row.items():
                for word, subject, authority in VNM_COMPETITOR_NAMES.get((name,f'{col}{n}'),()):
                    if raw := cell['text'].strip():
                        yield VNM,{**candidate(book,name,cell['ref'],word,subject,2,'competitor_name',raw),
                                   'support_url':authority}
                for word, authority in VNM_SPECIFIC_PRODUCTS.get((name,f'{col}{n}'),()):
                    if raw := cell['text'].strip():
                        yield VNM,{**candidate(book,name,cell['ref'],word,word,1,'product_search_expression',raw),
                                   'support_url':authority}
            if name == 'Danh sách ngành hàng' and n >= 4 and (raw := field(row,'F')):
                name_in_plan = brand_name(raw)
                if standalone_brand(name_in_plan):
                    yield VNM,candidate(book,name,f'F{n}',name_in_plan,name_in_plan,2,'competitor_name',raw)
            elif name == 'List Tracking_Đối thủ' and n > 1:
                if raw := field(row,'B'):
                    brand = brand_name(raw)
                    if standalone_brand(brand):
                        yield VNM,candidate(book,name,f'B{n}',brand,brand,2,'competitor_name',raw)
                for label in field(row,'D').splitlines():
                    pieces = [part.strip() for part in label.strip().split('_')]
                    if len(pieces) >= 3 and pieces[-1] == 'BRAND':
                        brand = brand_name(pieces[1])
                        if standalone_brand(brand):
                            yield VNM,candidate(book,name,f'D{n}',brand,brand,2,'competitor_name',pieces[1])
                for word in clean_terms(field(row,'E')):
                    if term_shape(word) and query_key(word.removeprefix('#')).startswith(('varnalife','suatuoicongthucvarnalife')):
                        yield VNM,candidate(book,name,f'E{n}',word,'Varna Life Cao Đạm',2,'competitor_keyword')
            elif name == 'Distribution List' and n > 1:
                for col in ('B','C'):
                    raw = field(row,col)
                    if not raw or re.search(r'\b(?:ho ten|email|dien thoai)\b',fold(raw)):
                        continue
                    # The label column contains explicit product queries alongside category and routing labels.
                    for line in raw.splitlines():
                        line = re.sub(r'^\s*[-–•\']+\s*','',line.strip())
                        if col=='B' and ':' in line:
                            line = line.split(':',1)[1]
                        if col=='C' and re.search(r'\b(?:he thong|thong bao|se khong|nguoi nhan|gui email)\b',fold(line)):
                            continue
                        for word in clean_terms(line):
                            word = re.sub(r'^SCA\s+','Sữa chua ăn ',word,flags=re.I)
                            key = fold(word)
                            if (VNM_PRODUCT.search(key) and term_shape(word) and not NON_PRODUCT.fullmatch(key)
                                and not TRACKING_ONLY.fullmatch(key) and not re.search(r'\b(?:youtube|linkedin|facebook|nhan hang|tung nhan vien|hinh anh san pham|dang noi ve|quy tac)\b',key)
                                and not re.search(r'\b(?:vi|huong)\s*:',key) and ':' not in word
                                and query_key(word) not in VNM_NON_STANDALONE
                                and not re.search(r'\([^)]*(?:có (?:từ khóa|hình ảnh)|hướng táo|hương [^)]*hương|thức uống.*thức uống)',word,re.I)):
                                yield VNM,candidate(book,name,f'{col}{n}',word,word,1,'product_search_expression')
            elif name == 'Owned Media' and n > 2:
                raw = field(row,'C')
                for word in ('Life At Vinamilk','Giấc Mơ Sữa Việt','Vinamilk Chung Tay Vì Cộng Đồng'):
                    if query_key(raw)==query_key(word):
                        yield VNM,candidate(book,name,f'C{n}',word,word,1,'owned_brand_name',raw)


def group_recoveries(db, projects):
    documents = active_documents(projects)
    terms, entries, seen, gaps = defaultdict(list), [], [], []
    for ident, book in sorted(documents.items()):
        if not book['file'] or not Path(book['file']).is_file():
            gaps.append({'projects':book['projects'],'url':book['url'],'reason':book.get('unreadable','MISSING_EXPORT')})
            continue
        try:
            sheets = list(read_book(book['file']))
        except (OSError, ValueError, KeyError, BadZipFile) as error:
            gaps.append({'projects':book['projects'],'url':book['url'],'reason':type(error).__name__})
            continue
        if not sheets:
            gaps.append({'projects':book['projects'],'url':book['url'],'reason':'NO_WORKSHEETS'})
            continue
        seen.append({'projects':book['projects'],'sheets':len(sheets)})
        if len(seen)%20==0:
            print(f"Đã đọc {len(seen)} workbook và {sum(x['sheets'] for x in seen)} sheet.",flush=True)
        extracted,_ = xlsx_inventory({ident:book},book_reader=lambda _:sheets)
        for group, raw, item in extracted:
            if project := assign(group,item['subject'],item['sheet'],raw):
                entries.append([[project],raw,item])
        for p, row in competitor_columns(book,sheets):
            terms[p,query_key(row['keyword'])].append(row)
        if ident == VNM_BOOK:
            for p,row in vinamilk_rows(book,sheets):
                terms[p,query_key(row['keyword'])].append(row)
    _, findings, _, _ = propose(db,{'entries':entries})
    for (project,key), proofs in findings.items():
        if project in projects:
            terms[project,key].extend(p for p in proofs if p['decision']=='DIRECT')
    return terms, seen, gaps


def vinamilk_roster_products():
    source = next(r for r in read_json(FULL/'access.json') if r['id']==VNM_TOPIC_PLAN)
    references = {r['cell']:r for r in source['projects'][VNM] if r.get('topic_role')=='Competitor'}
    book = {'url':f'https://docs.google.com/spreadsheets/d/{MASTER_ID}/edit'}
    sheet = next(read_book(FULL/'master.xlsx',lambda name:name=='Sheet1'))
    terms = defaultdict(list)
    for number,(word,authority) in VNM_ROSTER_PRODUCTS.items():
        ref = references[f'Sheet1!F{number}']
        row = sheet['rows'][number]
        raw = field(row,'D')
        if field(row,'A')!=VNM or field(row,'G')!='Competitor' or raw!=ref['topic'] or field(row,'E')!=ref['topic_id']:
            raise RuntimeError(f'Vinamilk topic roster changed at row {number}')
        proof = candidate(book,'Sheet1',f'D{number}',word,ref['label'],2,'competitor_keyword',raw)
        terms[VNM,query_key(word)].append({**proof,'support_url':authority})
    return terms,len(source['projects'][VNM])


def stage(db, terms):
    current = defaultdict(list)
    for p, word, level, state in db.execute('SELECT project_name,keyword,level,status FROM keywords'):
        current[p,query_key(word)].append((word,level,state))
    updates = []
    dropped = Counter()
    for (project,key), rows in terms.items():
        if not key or not rows or (project==VNM and key in VNM_NON_STANDALONE):
            continue
        old = current[project,key]
        if old and not (len(old)==1 and old[0][2]=='ES_ONLY' and any(r['kind'] in {'product_search_expression','competitor_name','competitor_keyword'} for r in rows)):
            continue
        if any(r['kind'] in {'competitor_name','competitor_keyword'} for r in rows):
            rows = [r for r in rows if r['level']==2]
        levels = {r['level'] for r in rows}
        if len(levels)!=1 or old and old[0][1] not in levels:
            dropped[project] += 1
            continue
        approved = defaultdict(list)
        for row in rows:
            if allow_keyword({'project':project,'keyword':row['keyword']}) and term_shape(row['keyword']):
                approved[row['keyword']].append(row)
        if not approved:
            continue
        word = old[0][0] if old else min(approved,key=lambda k:(-len(approved[k]),k.islower(),len(k),k.casefold(),k))
        evidence = list({(r['plan_url'],r['sheet'],r['cell'],r['original']):r for group in approved.values() for r in group}.values())
        subjects = sorted({r['resolved_subject'] for r in evidence})
        updates.append({'project':project,'keyword':word,'level':levels.pop(),'subjects':subjects,
                        'previous_status':'ES_ONLY' if old else None,'evidence':evidence})
    return sorted(updates,key=lambda r:(r['project'],r['level'],r['keyword'].casefold())), dropped


def clean_vinamilk(db):
    changes = []
    for word,(replacement,reason) in VNM_CLEANUP.items():
        row = db.execute('SELECT level,reasons_json FROM keywords WHERE project_name=? AND keyword=? AND status=\'READY\'',(VNM,word)).fetchone()
        if not row:
            continue
        if replacement is not None and not db.execute('SELECT 1 FROM keywords WHERE project_name=? AND keyword=? AND status=\'READY\'',(VNM,replacement)).fetchone():
            continue
        if db.execute('SELECT 1 FROM keyword_platform_audit WHERE project_name=? AND keyword=? AND status=\'READY\'',(VNM,word)).fetchone():
            continue
        level, previous = row
        status = 'ALIAS' if replacement else 'OUT_OF_SCOPE'
        db.execute('UPDATE keywords SET status=?,reasons_json=? WHERE project_name=? AND keyword=?',
                   (status,encode([*json.loads(previous),reason]),VNM,word))
        db.execute('''UPDATE keyword_platform_audit SET status=?,canonical_keyword=?,reason=?
                      WHERE project_name=? AND keyword=? AND status='NOT_CHECKED' ''',
                   (status,replacement,reason,VNM,word))
        db.execute('INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',
                   (AUDIT,VNM,word,'READY',status,level,level,replacement,reason))
        changes.append({'keyword':word,'replacement':replacement,'status':status,'reason':reason})
    return changes


def apply_reviewed(db, plan, statuses):
    db.execute('PRAGMA foreign_keys=ON')
    with db:
        db.execute('BEGIN IMMEDIATE')
        for row in plan['keywords']:
            project,word,level = (row[k] for k in ('project','keyword','level'))
            if statuses.get(project,'').strip().lower() not in ACTIVE:
                raise RuntimeError(f'Project scope changed: {project}')
            prior = db.execute('SELECT status,level FROM keywords WHERE project_name=? AND keyword=?',(project,word)).fetchone()
            expected = (row['previous_status'],level) if row['previous_status'] else None
            if prior!=expected:
                raise RuntimeError(f'Keyword changed since preview: {project} / {word}')
        apply_updates(db,plan['keywords'],statuses,audit_id=AUDIT)
        cleanup = clean_vinamilk(db)
        refresh_term_views(db)
        if db.execute('PRAGMA quick_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('Catalog integrity check failed')
    update_summaries(db)
    return cleanup


def vinamilk_counts(db):
    return dict(db.execute("SELECT level,count(*) FROM keywords WHERE project_name='Vinamilk' AND status='READY' GROUP BY level"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument('--apply',action='store_true')
    actions.add_argument('--roster',action='store_true',help='Apply individually corroborated Vinamilk competitor topics from the roster')
    args = parser.parse_args()
    writing = args.apply or args.roster
    with closing(sqlite3.connect(DB.resolve().as_uri()+('?mode=rw' if writing else '?mode=ro'),uri=True,timeout=15)) as db:
        statuses = dict(db.execute('SELECT project_name,plan_status FROM projects'))
        projects = {p:s for p,s in statuses.items() if s.strip().lower() in ACTIVE}
        before = vinamilk_counts(db)
        if args.roster:
            report = read_json(REPORT)
            terms, roster_count = vinamilk_roster_products()
            updates,_ = stage(db,terms)
            apply_reviewed(db,{'keywords':updates},statuses)
            report['keywords'].extend(updates)
            report.update(changes=len(report['keywords']),changes_by_project=dict(Counter(r['project'] for r in report['keywords'])),
                          vinamilk_after=vinamilk_counts(db),vinamilk_roster_topic_rows=roster_count,
                          vinamilk_roster_keywords=sum(any(p['plan_url'].find(MASTER_ID)!=-1 for p in x['evidence']) for x in report['keywords']))
        elif args.apply:
            report = read_json(PREVIEW)
            cleanup = apply_reviewed(db,report,statuses)
            report.update(applied=True,vinamilk_before=before,vinamilk_after=vinamilk_counts(db),vinamilk_cleanup=cleanup)
        else:
            terms, books, gaps = group_recoveries(db,projects)
            updates, conflicting = stage(db,terms)
            projects_read = {p for b in books for p in b['projects']}
            report = {'applied':False,'active_projects':len(projects),'books_read':len(books),
                      'sheets_read':sum(x['sheets'] for x in books),'projects_with_readable_plan':len(projects_read),
                      'projects_without_readable_plan':sorted(set(projects)-projects_read),
                      'vinamilk_before':before,'changes':len(updates),'changes_by_project':dict(Counter(r['project'] for r in updates)),
                      'level_conflicts':dict(conflicting),'unreadable_plans':gaps,'keywords':updates}
    write_json(REPORT if writing else PREVIEW,report)
    print(encode({k:v for k,v in report.items() if k not in {'keywords','unreadable_plans','level_conflicts','vinamilk_cleanup'}}))


if __name__ == '__main__':
    main()
