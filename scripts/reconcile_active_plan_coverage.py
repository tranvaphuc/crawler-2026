"""Audit active keyword plans against the catalog using live exports and exact plan cells."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit
from zipfile import BadZipFile

from audit_full_plan_contents import ACTIVE, allow_keyword
from audit_full_plan_links import ROOT as PLAN_ROOT, plan_links
from catalog_dashboard import keyword_page, open_catalog
from collect_catalog_platform_audit import MASTER_ID
from reconcile_plan_keyword_blocks import (
    ACBS, DB, OUT, LEVEL2_SECTION, NON_STANDALONE, acbs_cells, apply, choose_updates,
    snapshot, standalone_terms,
)
from reconcile_plan_keywords_deep import (
    NON_PRODUCT, encode, field, fold, heading_level, is_result_sheet, query_key, read_book,
    read_json, term_shape, write_json, xlsx_inventory,
)
from review_active_plan_keyword_scope import active_documents, candidate

AUDIT = 'active-plan-coverage-proof'
FOLDER = OUT / 'plan-audit-live'
PREVIEW = FOLDER / 'keyword-audit-preview.json'
FINAL = FOLDER / 'keyword-audit.json'
REVIEW_LOG = FOLDER / 'remaining-keyword-candidates.jsonl'

# Bounds follow the headers of the reviewed workbook. The expression identifies
# a named entity or campaign within the field and excludes descriptive subterms.
LAYOUTS = {
    ('ACV - Tổng Công ty cảng hàng không Việt Nam', 'Đối tượng nghiên cứu'): [
        ('BE', 3, 10, 1, r'^(?:acv|#acv|ctcpacv|tongcongtycanghangkhong(?:vietnam)?|airports?corporationofvietnam)$'),
        ('I', 3, 12, 2, r'^(?:nganhhangkhong|hangkhong)$'),
    ],
    ('BIEL Crystal', 'Keywords'): [('A', 2, 35, 1, r'(?:biel|#biel)')],
    ('Bánh Givral', 'Trang tính1'): [('A', 2, 10, 1, r'^(?:givral(?:bakery)?|girval)$')],
    ('CAEX', 'Trang tính1'): [('BC', 2, 12, 1, r'(?:caex|sangiaodichtaisanmahoavietnamthinhvuong)')],
    ('CC1 - Smartcom', 'Keywords'): [('D', 8, 15, 1, r'(?:cc1|tongcongtyxaydungso1)')],
    ('Cục Hàng không - CAAV', 'Trang tính1'): [
        ('A', 2, 11, 1, r'^(?:cuchangkhong(?:vietnam)?|cuchkvn|chkvn|caav|civilaviationauthorityofvietnam|cangvuhangkhongmien(?:bac|trung|nam)|uongvietdung)$'),
    ],
    ('Cùng Việt Nam tiến bước', 'Trang tính1'): [('A', 2, 14, 1, r'(?:cungvietnamtienbuoc|1tybuocchan)')],
    ('FPT Shop 2026', 'Trang tính1'): [
        ('BD', 2, 6, 1, r'^(?:#)?(?:fptshop|fstudiobyfpt|fstudio141trannao|fptunitour2026|fptshopunitour2026|fstudio)$'),
        ('D', 17, 27, 2, r'(?:tgdd|thegioididong)'),
    ],
    ('HDBank', 'Danh sách từ khóa'): [
        ('B', 5, 44, 1, r'(?:hdbank|nganhanghd|hochimincitydevelopment|hochiminhcitydevelopment|phattrien(?:nha|thanhpho|tp)?(?:hochiminh|hcm)|^hdbs?$|chungkhoanhd|hdfinance|hdsaigon)'),
        ('E', 5, 79, 1, r'^#.*hdbank'),
    ],
    ('LG', 'A. Corp _ Keywords'): [('E', 5, 30, 1, r'^#(?:lg|lifesgood|mylg)')],
    ('LG', 'A. Product _ Keywords'): [('D', 5, 90, 1, r'^lg(?:stand?byme|xboomai)')],
    ('LG', 'B. Another SG _ Keywords'): [('CF', 5, 20, 1, r'another(?:saigon|sg)|lgsai(?:gon|g0n)|lgwithoptimism')],
    ('LOTTE Properties HCMC', 'LOTTE Eco Smart City Thu Thiem'): [
        ('AC', 2, 7, 1, r'^#?(?:lotteecosmartcity|thuthiemecosmartcity|ecosmartcity(?:thuthiem)?)$'),
    ],
    ('LOTTE Properties HCMC', 'PhatDat'): [
        ('AC', 2, 11, 2, r'phatdat|quynhoniconic|monreisaigon|serenityphuochai'),
    ],
    ('Lotte Mart 2026', 'Trang tính1'): [('A', 2, 15, 1, r'^(?:sieuthilotte|lottemartonline|lottevn|lotte)$')],
    ('Lotte Properties', 'Trang tính1'): [
        ('A', 2, 30, 1, r'^(?:lotte|lottemall.*|ltmwestlake|lottecentre|toalottelieugiai|lottelieugiai|lottedaotan|lotteobservationdeck|daiquansatlotte|lotteskywalk|skywalklotte|khachsanlottehanoi|lotteresidencehanoi)$'),
    ],
    ('MUJI', 'Trang tính1'): [
        ('AB', 2, 10, 1, r'muji|無印良品'),
        ('A', 11, 65, 2, r'^(?:nitori(?:vietnam|vn)?|ニトリ|uniqlo(?:vietnam|vn)?|ユニクロ|miniso(?:vietnam|vn)?|daiso(?:vietnam|vn)?|jysk(?:vietnam|vn)?|baya(?:vietnam|vn)?)$'),
        ('B', 5, 10, 2, r'^#(?:nitori|uniqlo|miniso|daiso|jysk|baya)(?:vietnam|vn)$'),
    ],
    ('Mizuki Park', 'Trang tính1'): [
        ('AB', 2, 9, 1, r'mizuki|trellia'),
        ('AB', 6, 9, 2, r'^(?:#)?ttgenesis'),
    ],
    ('NAB', 'KWs'): [('A', 2, 30, 1, r'(?:^#nab|nabglobalcap|homeforinnovators)')],
    ('Những Thành Phố Mơ Màng', 'Trang tính1'): [
        ('A', 2, 10, 1, r'^(?:nhung)?thanhphomomang$|^ntpmm(?:2026|xhuythanhjewelry|yearend)?$'),
    ],
    ('Phú Hưng Life', 'Trang tính1'): [
        ('AC', 2, 16, 1, r'(?:#?phuhung|baohiemnhanthophuhung)'),
    ],
    ('Poshaco Group', 'Trang tính1'): [
        ('AB', 2, 9, 1, r'poshaco|^#tutonchatviet$'),
    ],
    ('SFinance', 'Từ khóa'): [('E', 2, 12, 1, r'^#(?:shbfinance|shbfc)$')],
    ('Stavianmetal', 'Trang tính1'): [('B', 2, 12, 1, r'(?:stavian|kimloaicongnghiepstavian)')],
    ('Tổ quốc trong tim mùa 2', 'Trang tính1'): [('A', 2, 8, 1, r'toquoctrongtim')],
    ('Coolmate × VPIM', 'Trang tính2'): [
        ('A', 2, 26, 1, r'^(?:coolmate(?!.*\.)\w*|coolactive|vpim2026|vpbank(?:hanoi)?internationalmarathon\w*)$'),
        ('B', 2, 11, 1, r'^#(?:coolmate|vpim2026|vpbankhanoiinternationalmarathon|cosplayvpim2026|coolactive)$'),
        ('B', 6, 10, 2, r'^#(?:nikerunning|nikerunclub|adidasrunning|kiprun|kalenji)$'),
    ],
    ('Samsung 2026', 'Trang tính1'): [
        ('B', 2, 129, 1, r'^(?:tainhanhluotmuot|tatyeubutpha|batvibeawesomecucnet|crystaluhd|odyssey(?:oled|neo)|familyhub|galaxygapmo|switchtogalaxy|hieuchisodinhphongdo|dangmuavuay|hieuminhkhoethongminh)$'),
        ('B', 154, 174, 2, r'^(?:ultragear|ultrafine|ultrasharp|asusrog)$'),
    ],
    ('Vingroup', 'Từ khóa các thương hiệu'): [('B', 30, 30, 1, r'^#phamnhatvuong$')],
    ('SHB Bank', 'Keyword'): [
        ('B', 5, 26, 1, r'^(?:nganhangsaigonhanoi|nganhangsghn|nhsaigonhanoi|nganhangthuongmaicophansaigonhanoi|appsaha|websaha|sahaapp|sahaweb|ungdungsaha|chuyentiensaha|ethatbe|nganhangscam|bankscam)$'),
    ],
    ('CapitaLand', 'PROJECT TO FOLLOW'): [
        ('C',2,120,1,r'^#?(?:capitaland|thevista|vistaquan2|vistaanphu|parcspring|vistaverde|thekrista|seasonsavenue)'),
    ],
    ('CapitaLand', 'Keywords (Competitors)'): [
        ('D',10,120,2,r'^#?(?:parkcity|keppelland|tapdoankeppel|klvsustainableurbanisation|klvsustainability|vincity|tapdoanvingroup)'),
    ],
    ('Petrolimex','3. Keywords'): [
        ('DE',9,60,1,r'^(?:petro(?:l+im[eé][cx]|llimec|llimex|l+imex[xs]?)|viet(?:nam)?nationalpetroleumgroup|vietnamnationalpetroleumgroup|tapdoanxangdauvietnam|petrolplx)$'),
    ],
    ('KAO Việt Nam','Keyword'): [
        ('B',2,18,1,r'^kao(?:vietnam(?:limitedliabilitycompany)?|vn|vietnamcompanylimited)$'),
    ],
    ('BIDV','Keywords'): [
        ('C',4,16,1,r'^(?:nganhang(?:tmcp)?dautu(?:va)?phattrien(?:vietnam)?|bidvtv|baohiembic|bidvnews)$'),
    ],
}
AMBIGUOUS = {
    'acv', '#acv', 'hangkhong', 'caav', 'chkvn', 'cuchkvn', 'uongvietdung',
    'girval', 'biel', '#biel', 'lotte', 'phuhung', 'stavian',
    'fstudio', 'hdb', 'hdbs', 'mizu ki', 'mizuki', 'trellia',
    '#tutonchatviet', 'homeforinnovators', 'ahomeforinnovators', 'ntpmm',
    'crystaluhd', 'familyhub', 'ultrafine', 'batvibeawesomecucnet',
    'tatyeubutpha', 'tainhanhluotmuot', 'dangmuavuay', 'hieuchisodinhphongdo',
    'hieuminhkhoethongminh', 'tech', 'jt', 'spe', '#lifesgood', '#lg',
    'ecosmartcity', 'karuna', 'babysteps', '#babysteps', 'arlaorganic',
}
SHEET_RULE = re.compile(r'^(?:link bai spam|rule|quy tac|sentiment|sac thai|labels?\b|muc luc|table of contents|access|dashboard|nguon|source|client contact|report\b|data\b)')
NOISE = re.compile(r'\b(?:bat buoc|ket hop|tu khoa phu|loai tru|include|exclude|tham khao|chua final|chua can update|chi la ban nhap)\b')
LOCAL_SCOPE = re.compile(r'\b(?:thuong hieu|brand|project|client|chu the|nganh|doi thu|competitor)\b')
SUBJECT_MATCH = re.compile(r'^[A-Z0-9. À-Ỹ&/\-]+$', re.I)
FOREVER_OWN = re.compile(r'babysteps?|bellamy|moroka|karuna|forevervietnam')
FOREVER_COMP = re.compile(r'ar la|arla|biostime|kendamil[l]?|hikid|ildong|true ?mom|jovie|kabrita|\bbubs|bubssupreme|\boli ?6|royal ?ausn|sua hoang gia uc|lactoferrin hong|lacto hong|happi|muma ?moo|aptamilessensis|suadebubs')
SUPPORT = {
    'trelliacove': 'https://www.namlongvn.com/khu-do-thi-nha-o/trellia/',
    'ttgenesis': 'https://ttcapital.vn/tin-tuc/le-ky-ket-lien-doanh-du-an-tt-genesis/?p=4303',
    'babysteps': 'https://foreverjsc.vn/',
    'karuna': 'https://foreverjsc.vn/',
    'moroka': 'https://vietbabyfair.vn/vi/exhibitors/cong-ty-co-phan-xuat-nhap-khau-va-thuong-mai-forever/',
}


def in_scope(documents, active):
    roster = read_json(PLAN_ROOT / 'roster.json')['projects']
    ignored = []
    for ident, doc in documents.items():
        allowed = []
        for project in doc['projects']:
            references = [r for r in roster.get(project, []) if any(p['id'] == ident for p in r['plans'])]
            if references and all(r['status'] == 'stop' for r in references):
                ignored.append({'project': project, 'url': doc['url'], 'reason': 'PLAN_STOP'})
            elif project in active:
                allowed.append(project)
        if allowed:
            yield ident, {**doc, 'projects': allowed}, None
    for item in ignored:
        yield None, None, item


def cell_terms(project, raw, kind):
    if kind in {'sub', 'exclude'}:
        return []
    terms = standalone_terms(project, raw, kind)
    return [w for w in terms if (
        term_shape(w) and not NOISE.search(fold(w)) and not NON_STANDALONE.search(w)
        and not re.search(r'(?i)\.(?:com|net|org|vn|me)(?:\.vn)?$', w)
        and not w.endswith('+sub') and allow_keyword({'project': project, 'keyword': w}))]


def make_proof(project, book, sheet, cell, raw, word, subject, level, label='plan_named_field'):
    proof = candidate(book, sheet, cell, word, subject, level, label, raw)
    key = query_key(word)
    proof['decision'] = 'REVIEW' if key in AMBIGUOUS else 'READY'
    for signature, url in SUPPORT.items():
        if signature in key:
            proof['support_url'] = url
            break
    return proof


def reviewed_layout(project, book, sheet):
    name, rows = sheet['name'], sheet['rows']
    sections = LAYOUTS.get((project, name), [])
    for columns, start, end, level, expression in sections:
        wanted = re.compile(expression)
        for number, row in rows.items():
            if not start <= number <= end:
                continue
            for col in columns:
                if raw := field(row, col):
                    for word in cell_terms(project, raw, 'main'):
                        if wanted.search(query_key(word)):
                            subjects = {
                                ('Mizuki Park', 2): 'TT Genesis',
                                ('LOTTE Properties HCMC', 2): 'Phát Đạt',
                                ('Vingroup', 1): 'Phạm Nhật Vượng',
                            }
                            subject = subjects.get((project,level), project if level == 1 else word.lstrip('#'))
                            yield make_proof(project,book,name,row[col]['ref'],raw,word,subject,level)


def reviewed_blocks(project, book, sheet):
    name, rows = sheet['name'], sheet['rows']
    if project not in {'Forever Việt Nam','HDBank','SPX','ShopeePay','Vinfast','TTC Group MS','Central Retail','VinWonders'}:
        return
    for number, row in sorted(rows.items()):
        fields = []
        if project == 'Forever Việt Nam' and name == 'Trang tính1' and number > 1:
            for col in 'AB':
                raw = field(row, col)
                compact = query_key(raw)
                if FOREVER_OWN.search(compact):
                    fields.append((col,1,next(p for p in ('Baby Steps','Moroka','Karuna','Bellamy','Forever Việt Nam')
                                              if query_key(p).removesuffix('s') in compact),None))
                elif FOREVER_COMP.search(fold(raw.lstrip('#'))) or FOREVER_COMP.search(compact.lstrip('#')):
                    fields.append((col,2,raw.lstrip('#'),None))
        elif project == 'HDBank' and name == 'Danh sách từ khóa' and 82 <= number <= 122:
            headings = {'A':'Techcombank','C':'ACB','E':'Vikki','F':'BIDV','H':'MB Bank'}
            signatures = {'A':r'techcom|techcomers|tcbs|kythuong|fast e?bank',
                          'C':r'acb|achau|asiacommercialbank',
                          'E':r'vikki',
                          'F':r'bidv|dautuvaphattrien|dautuphattrien',
                          'H':r'mbbank|nganhangquandoi|militarybank'}
            for col, subject in headings.items():
                if re.search(signatures[col],query_key(field(row,col))):
                    fields.append((col,2,subject,None))
        elif project == 'SPX' and name == 'Keywords 2023' and number >= 3:
            headings = {'A':('Shopee Express',1,r'spx|shopeeex|spexpress|spxpress|^spe$'),
                        'E':('GHN',2,r'ghn|giaohangnhanh'),
                        'H':('J&T Express',2,r'j[&n]?t|jandt'),
                        'K':('GHTK',2,r'ghtk|giaohangtietkiem'),
                        'N':('Viettel Post',2,r'viettelpost|vietelpost|buuchinhviettel')}
            for col, (subject,level,expression) in headings.items():
                if re.search(expression,query_key(field(row,col))) and 'sub' not in fold(field(row,col)):
                    fields.append((col,level,subject,None))
        elif project == 'ShopeePay':
            if name == 'Kw VTS' and number in {3,4,7}:
                fields.append(('A',1,'ShopeePay / SPayLater',r'shopee(?:pay|payxspaylater)|spaylater|airpay'))
                if number in {3,4}:
                    fields.extend([('D',2,'TikTok Pay',r'tiktokpay|tiktoklater'),
                                   ('G',2,'ZaloPay',r'zalopay')])
            elif name == 'Kw Vay online' and number in {3,4,7}:
                fields.append(('A',1,'ShopeePay / SEasy',r'seasy|shopeepay|airpay'))
                if number in {3,4}:
                    fields.extend([('E',2,'ZaloPay',r'zalopay'),('H',2,'MoMo',r'momo')])
            elif name == 'Keywords ShopeePay & competitor' and 2 <= number <= 32:
                fields.extend([('B',1,'ShopeePay',r'shopee(?:pay|muatruoctrasau)|spaylater'),
                               ('E',2,'MoMo',r'momo'),('F',2,'Viettel Money',r'viettel(?:pay|money)'),
                               ('G',2,'ZaloPay',r'zalopay|^#?vizalo$')])
        elif project == 'Vinfast' and name == 'Từ khóa VinBus' and number >= 5:
            fields.extend([('B',1,'VinBus',r'vinbus'),('D',1,'VinBus',r'vinbus')])
            fields.append(('G',2,'Vận tải hành khách',r'futa(?:bus|lines)?|transerco|bushanoi|xebuythanoi|phuongtrang'))
        elif project == 'Vinfast' and name == 'Từ khóa Xanh SM' and number >= 5:
            fields.extend([('B',1,'Xanh SM',r'xanhsm|^sanhsm$|gsm|bactaixanh|nutaixanh'),
                           ('D',1,'Xanh SM',r'xanhsm|bactaixanh'),
                           ('I',2,'Dịch vụ gọi xe',r'grab(?:bike|car|food|vietnam|rides)?|bevietnam|berides|gojek')])
        elif project == 'TTC Group MS' and name == 'Cập nhật keyword, query 2026 (0' and number >= 4:
            if field(row,'A').replace('.0','').isdigit() and number < 97:
                fields.append(('B',1,'Tập đoàn TTC',r'congty|tapdoan|tongcongty'))
            if number in {5,11,13,18,40,47,50,53,56,62,65,69,80,83,84,89,98}:
                fields.append(('D',1,field(row,'B'),r'ttc|thanhthanhcong|gialaielectricity|diengialai|sacomreal|saigonthuongtin|toanhaivan|daitin|thanhthanhnam|duongbienhoa|dhahealthcare|djoy|miaduongsongcon'))
        elif project == 'Central Retail' and name in {'Keywords - Mainbrand','Keywords - Competitors'}:
            competitor = name == 'Keywords - Competitors'
            header = 5 if competitor else 4
            signatures = {
                'centralgroup':r'centralgroup|centralretail|tapdoancentral',
                'bigc':r'bigc(?:vietnam|vn)?',
                'go!vietnam':r'govietnam|gomarket|gonguyenxien|gomytho',
                'lan chimart':r'lanchimart|lanchiimart',
                'lookkool':r'lookkool(?:vn|vietnam)?',
                'kubo':r'kubo(?:playground|vietnam|store)?|khuvuichoikubo',
                'robins':r'robins(?:royalcity|cresentmall)?',
                'topsmarket':r'topsmarket',
                'bipbip':r'bipbip',
                'comehome':r'comehome(?:vietnam|scvivocity)?',
                'masangroup':r'masangroup|tapdoanmasan',
                'vincommerce(wincommerce)':r'vincommerce|wincommerce',
                'aeonvietnam':r'aeonvietnam|tapdoanaeon|aeoneshop',
                'saigoncoop':r'saigoncoop|lienhiephoptacxathuongmaitphcm',
                'dienmaycholon':r'dienmaycholon|cholonelectronicssupermarket',
                'mediamart':r'mediamart',
                'lot te':r'lottemart|lottevietnam',
                'lotte':r'lottemart|lottevietnam',
                'thegioididong':r'thegioididong|mobileworld|mobileworldjsc|mobileworldinvestmentcorporation',
            }
            if number > header:
                for col in row:
                    if fold(field(rows[header],col)) != 'main':
                        continue
                    subject = field(rows[header-1],col)
                    key = query_key(subject)
                    expression = signatures.get(key)
                    if expression:
                        fields.append((col,2 if competitor else 1,subject,rf'^#?(?:{expression})$'))
        elif project == 'VinWonders' and name in {'keyword','key update cho Vinwonders'}:
            own = r'^(?:#)?(?:vinwonders?\w*|vinpearlland|vinpearlsafari\w*|grandworldphuquoc|tourthuycungphuquoc|thuycungphuquoc|vinpearlwonder\w*|onceshow|showonce|vinpearlharbour|nhahatvinpalace)$'
            rivals = r'^(?:#)?(?:sunworld\w*|thienduongbaoson|khudulichdoirong|doirong|(?:show)?tinhhoabacbo|(?:show)?kyuchoian|nuithantai|danangdowntown|banahills)$'
            if name == 'keyword' and number >= 6:
                own_block = number < 70
                fields.extend((col, 1 if own_block else 2, 'VinWonders' if own_block else 'Đối thủ VinWonders',
                               own if own_block else rivals) for col in 'FH')
            elif name != 'keyword' and number >= 3:
                fields.extend((col,1,'VinWonders',own) for col in 'EG')
        for col, level, subject, expression in fields:
            if not (raw := field(row, col)):
                continue
            for word in cell_terms(project, raw, 'main'):
                if expression and not re.search(expression, query_key(word)):
                    continue
                if len(query_key(word).lstrip('#')) < 4 and query_key(word) not in {'jt','spx','ghn','spe','ghtk'}:
                    continue
                yield make_proof(project,book,name,row[col]['ref'],raw,word,subject,level)


def existing_index(db, active):
    identities = defaultdict(set)
    for p, word, subjects in db.execute("SELECT project_name,keyword,subjects_json FROM keywords WHERE status='READY'"):
        if p not in active:
            continue
        key = query_key(word)
        if len(key.lstrip('#')) >= 5 and not NON_PRODUCT.fullmatch(fold(word.lstrip('#'))):
            identities[key].update(query_key(s) for s in json.loads(subjects) if s)
    return identities


def corroborated_cell(project, doc, word, proof, identities):
    if len(doc['projects']) != 1 or proof['kind'] not in {'main','hashtag','matrix'}:
        return None
    if SHEET_RULE.match(fold(proof['sheet'])):
        return None
    title = proof['subject'].strip()
    root = query_key(title)
    if len(root) < 5 or not SUBJECT_MATCH.fullmatch(title) or LOCAL_SCOPE.fullmatch(fold(title)):
        return None
    key = query_key(word)
    subject_keys = identities.get(key, set()) | identities.get(key.lstrip('#'), set())
    if not subject_keys:
        return None
    if root != key.lstrip('#') and root not in subject_keys and not any(
            len(s) >= 5 and (root.startswith(s) or s.startswith(root)) for s in subject_keys):
        return None
    role = str(proof['role'])
    role = heading_level(role) or role
    section = fold(proof['sheet'])
    level = int(role) if role in {'1','2'} else None
    if not level:
        level = 2 if LEVEL2_SECTION.search(section) else None
    if not level:
        base = query_key(project)
        if len(base) >= 5 and (root in base or base in root):
            level = 1
    if not level or len(title.split()) > 10:
        return None
    return make_proof(project,doc,proof['sheet'],proof['cell'],proof['original'],word,title,level,'plan_corroborated_field')


def coverage_audit(db, active, documents):
    existing = snapshot(db)
    identities = existing_index(db,active)
    candidate_groups = defaultdict(list)
    by_book, project_stats, remaining, failures = [], defaultdict(Counter), {}, []
    with REVIEW_LOG.open('w', encoding='utf-8') as remaining_file:
        for ident, doc in sorted(documents.items()):
            if not doc.get('file') or not Path(doc['file']).is_file():
                failures.append({'id':ident,'url':doc['url'],'projects':doc['projects'],'result':doc['live_status']})
                continue
            book = {'id':ident,'url':doc['url'],'projects':doc['projects'],'using':doc['using'],'live_status':doc['live_status'],'sheets':[]}
            by_book.append(book)
            try:
                for sheet in read_book(doc['file']):
                    name = sheet['name']
                    exported_data = is_result_sheet(sheet['rows'])
                    book['sheets'].append({'name':name,'rows':len(sheet['rows']),'state':sheet['state'],'exported_data':exported_data})
                    if exported_data:
                        continue
                    if ident in ACBS:
                        for claim in acbs_cells(doc,sheet):
                            word = claim['keyword']
                            if term_shape(word) and allow_keyword({'project':ACBS[ident],'keyword':word}):
                                candidate_groups[ACBS[ident],query_key(word)].append(claim)
                        continue
                    local = defaultdict(list)
                    for project in doc['projects']:
                        for proof in (*reviewed_layout(project,doc,sheet), *reviewed_blocks(project,doc,sheet)):
                            local[project,query_key(proof['keyword'])].append(proof)
                    entries, _ = xlsx_inventory({ident:doc},book_reader=lambda _: (sheet,))
                    blocked = {(p,query_key(w)) for ps,raw,proof in entries if proof['kind']=='exclude' or proof.get('context')=='exclude'
                               for p in ps for w in cell_terms(p,raw,'main')}
                    for projects,raw,proof in entries:
                        if proof['kind'] in {'exclude','sub','note','cell_note'} or proof.get('context') in {'exclude','sub'}:
                            for project in projects:
                                project_stats[project]['context_cells'] += 1
                            continue
                        if SHEET_RULE.match(fold(name)):
                            continue
                        for project in projects:
                            for word in cell_terms(project,raw,proof['kind']):
                                lookup = project,query_key(word)
                                if lookup in blocked:
                                    project_stats[project]['excluded_occurrences'] += 1
                                    continue
                                if lookup in existing:
                                    project_stats[project]['existing_occurrences'] += 1
                                    continue
                                if lookup not in local:
                                    claim = corroborated_cell(project,doc,word,{**proof,'original':raw},identities)
                                    if claim:
                                        local[lookup].append(claim)
                                    else:
                                        remaining.setdefault(lookup,{'project':project,'keyword':word,'sheet':name,
                                            'cell':proof['cell'],'plan_url':doc['url'],'subject':proof['subject'],
                                            'reason':'Cần xác định phạm vi hoặc chứng minh cụm tìm riêng trả đúng chủ thể.'})
                    for lookup, claims in local.items():
                        if lookup not in blocked:
                            candidate_groups[lookup].extend(claims)
            except (BadZipFile, OSError, ValueError, KeyError) as error:
                book['read_error'] = type(error).__name__
                failures.append({'id':ident,'url':doc['url'],'projects':doc['projects'],'result':book['read_error']})
        for lookup,item in sorted(remaining.items()):
            if lookup not in candidate_groups and lookup not in existing:
                project_stats[lookup[0]]['unresolved_distinct'] += 1
                remaining_file.write(encode(item)+'\n')
    return candidate_groups, by_book, project_stats, failures


def workbook_fingerprint(file):
    digest = hashlib.sha256()
    for sheet in read_book(file):
        digest.update(encode(sheet).encode('utf-8'))
    return digest.hexdigest()


def master_comparison():
    default = PLAN_ROOT / 'master.xlsx'
    status = next((row for row in read_json(FOLDER/'refresh.json') if row['id']==MASTER_ID), {})
    current = Path(status['file']) if status.get('file') else default
    def mappings(file):
        data = []
        for sheet in read_book(file, lambda n: n in {'Main','Sheet1'}):
            if sheet['name'] == 'Main':
                for row in sheet['rows'].values():
                    state='stop' if fold(field(row,'F'))=='stop' else fold(field(row,'E'))
                    if state in ACTIVE:
                        data.append((field(row,'A'),field(row,'B'),state,tuple(p['id'] for p in plan_links(row.get('D',{})))))
            else:
                data.extend((field(row,'B'),field(row,'C'),field(row,'E'),field(row,'G'),tuple(p['id'] for p in plan_links(row.get('F',{}))))
                            for row in sheet['rows'].values() if field(row,'G').casefold()!='stop')
        return set(data)
    before, after = mappings(default), mappings(current)
    return {'live_status':status.get('result'),'added_scope_rows':sorted(after-before),
            'removed_scope_rows':sorted(before-after)}


def plan_coverage(db, active):
    documents = {}
    skipped = []
    refreshed = {r['id']:r for r in read_json(FOLDER/'refresh.json')}
    for ident, doc, ignored in in_scope(active_documents(active),active):
        if ignored:
            skipped.append(ignored)
            continue
        live = refreshed.get(ident,{})
        previous = doc.get('file')
        newest = live.get('file')
        chosen = newest or previous
        state = live.get('result','NOT_REEXPORTED')
        if state == 'REEXPORTED' and previous and Path(previous).is_file() and workbook_fingerprint(newest) == workbook_fingerprint(previous):
            state = 'UNCHANGED_CONTENT'
        documents[ident] = {**doc,'file':chosen,'using':'LIVE_EXPORT' if newest else 'LOCAL_COPY','live_status':state}
    candidates, books, stats, failures = coverage_audit(db, active, documents)
    updates = choose_updates(snapshot(db), candidates)
    reviewed = {project for book in books if not book.get('read_error') for project in book['projects']}
    return {'checked_at':datetime.now(timezone.utc).isoformat(),'master':master_comparison(),
            'active_projects':sorted(active),'projects_without_readable_plan':sorted(active-reviewed),
            'workbooks':books,'skipped_stop':skipped,'inaccessible':failures,
            'status_of_public_recheck':dict(Counter(doc['live_status'] for doc in documents.values())),
            'plan_review_by_project':stats,'keywords':updates}


def verify_preview(db, report, statuses):
    """Use worksheet headers to verify proposed entries and identify sample-only entries."""
    result_refs = defaultdict(set)
    already_ready = []
    for project, word, payload in db.execute("""
        SELECT k.project_name,k.keyword,k.originals_json FROM keywords k JOIN projects p USING(project_name)
        WHERE k.status='READY' AND lower(trim(p.plan_status)) IN ('running','running trial')
        AND NOT EXISTS (SELECT 1 FROM keyword_platform_audit a
            WHERE a.project_name=k.project_name AND a.keyword=k.keyword AND a.status='READY')
    """):
        origins = json.loads(payload)
        if not origins or not all(o.get('plan_url') and o.get('sheet') for o in origins):
            continue
        refs = {(urlsplit(o['plan_url']).path.split('/d/')[-1].split('/')[0],o['sheet']) for o in origins}
        already_ready.append((project,word,refs))
        for ident,name in refs:
            result_refs[ident].add(name)

    book_info = {b['id']:b for b in report['workbooks'] if not b.get('read_error')}
    active = {p for p,s in statuses.items() if s.strip().lower() in ACTIVE}
    documents = {ident:doc for ident,doc,ignored in in_scope(active_documents(active),active) if not ignored}
    live = {r['id']:r for r in read_json(FOLDER/'refresh.json')}
    selected = {ident:{**doc,'file':live.get(ident,{}).get('file') or doc['file']}
                for ident,doc in documents.items() if ident in book_info}
    new_claims = defaultdict(list)
    for row in report['keywords']:
        if row['previous_status']:
            continue
        for proof in row['evidence']:
            ident = urlsplit(proof['plan_url']).path.split('/d/')[-1].split('/')[0]
            result_refs[ident].add(proof['sheet'])
            new_claims[row['project'],query_key(row['keyword'])].append(proof)

    sheets_for_supplement = defaultdict(set)
    extra = {'CapitaLand','Central Retail','VinWonders','Petrolimex','KAO Việt Nam','BIDV'}
    for p,name in LAYOUTS:
        if p in extra:
            sheets_for_supplement[p].add(name)
    sheets_for_supplement['Central Retail'].update({'Keywords - Mainbrand','Keywords - Competitors'})
    sheets_for_supplement['VinWonders'].update({'keyword','key update cho Vinwonders'})
    excluded_sheets = set()
    for ident, doc in selected.items():
        project_names = set(doc['projects'])
        extra_tabs = set().union(*(sheets_for_supplement[p] for p in project_names & extra))
        selected_tabs = result_refs[ident] | extra_tabs
        if not selected_tabs:
            continue
        for sheet in read_book(doc['file'],lambda name:name in selected_tabs):
            name = sheet['name']
            if is_result_sheet(sheet['rows']):
                excluded_sheets.add((ident,name))
                continue
            if name in extra_tabs:
                for project in project_names & extra:
                    for claim in (*reviewed_layout(project,doc,sheet), *reviewed_blocks(project,doc,sheet)):
                        new_claims[project,query_key(claim['keyword'])].append(claim)

    exclusions = {
        ('ShopeePay','shopee'),('ShopeePay','viettelpayonelinkme'),
        ('Forever Việt Nam','suakaruna'),('Forever Việt Nam','sua.karuna'),
        ('SHB Bank','appsaha'),('SHB Bank','sahaapp'),('SHB Bank','websaha'),
        ('SHB Bank','chuyentiensaha'),
        ('VinWonders','showonce'),
    }
    ambiguous = {
        ('Central Retail','vicom'),('SPX','jandt'),('SPX','vietelpost'),
        ('HDBank','techcom'),('TTC Group MS','daitin'),
        ('ShopeePay','seasyy'),('ShopeePay','spaylaterr'),
        ('Petrolimex','petrolimexs'),('Petrolimex','petrolimexx'),
        ('Petrolimex','petrollimec'),('Petrolimex','petrollimex'),
    }
    scope_only = re.compile(r'^(?:hanmuc|huy|kichhoat|ngaythanhtoan|phidinhki|phinam|phi|sudung|thanhtoan|tragop|vitrasau)spaylater$')
    ttc_descriptions = re.compile(r'^(?:amthuc|baibien|canhoholidayphuquoc|congviennuoc|dichvu|dienmattroi|hethong|khachsan|khudulich|matri|monngon|nhahang|robotvesinhpinmattroi|tampin|tongthauepc|xebon)')
    removed = []
    filtered = defaultdict(list)
    for (project,key), claims in new_claims.items():
        reason = None
        if (project,key) in exclusions:
            reason = 'Cụm trùng chủ thể đã có, tên miền hoặc từ khóa quá rộng so với phạm vi gốc.'
        elif project == 'ShopeePay' and scope_only.fullmatch(key):
            reason = 'Từ khóa sản phẩm đã bao phủ cùng chủ thể. Cụm này là ngữ cảnh về phí, hạn mức hoặc thao tác.'
        elif project == 'TTC Group MS' and ttc_descriptions.search(key) and key.endswith('ttc'):
            reason = 'Cụm mô tả chủ đề của TTC. Từ khóa tên thương hiệu đã bao phủ chủ thể.'
        for claim in claims:
            original_id = urlsplit(claim['plan_url']).path.split('/d/')[-1].split('/')[0]
            if reason or (original_id,claim['sheet']) in excluded_sheets:
                removed.append({'project':project,'keyword':claim['keyword'],'sheet':claim['sheet'],'cell':claim['cell'],
                                'reason':reason or 'Phát hiện cấu trúc cột của bảng dữ liệu kết quả.'})
                continue
            if (project,key) in ambiguous:
                claim = {**claim,'decision':'REVIEW'}
            filtered[project,key].append(claim)
    report['verification_exclusions'] = removed
    report['result_sheets_verified'] = [
        {'id':ident,'sheet':name,'url':selected[ident]['url']} for ident,name in sorted(excluded_sheets)]
    report['sample_only_reviews'] = [
        {'project':project,'keyword':word,
         'reason':'Các ô dẫn nguồn đều nằm trong bảng xuất kết quả, cần đối chiếu lại với danh sách keyword của plan.'}
        for project,word,refs in already_ready if refs and refs <= excluded_sheets
    ]
    report['keywords'] = [r for r in choose_updates(snapshot(db),filtered) if not r['previous_status']]
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands = parser.add_mutually_exclusive_group()
    commands.add_argument('--apply',action='store_true')
    commands.add_argument('--verify-preview',action='store_true')
    args=parser.parse_args()
    with closing(sqlite3.connect(DB.resolve().as_uri()+('?mode=rw' if args.apply else '?mode=ro'),uri=True,timeout=30)) as db:
        statuses=dict(db.execute('SELECT project_name,plan_status FROM projects'))
        active={p for p,s in statuses.items() if s.strip().lower() in ACTIVE}
        report=read_json(PREVIEW) if args.apply or args.verify_preview else plan_coverage(db,active)
        if args.verify_preview:
            report = verify_preview(db,report,statuses)
        if args.apply:
            if set(report['active_projects']) != active or 'sample_only_reviews' not in report:
                raise ValueError('Verify the worksheet evidence against the current project roster first')
            new=[r for r in report['keywords'] if not r['previous_status']]
            report['changes']=apply(db,new,statuses,audit_id=AUDIT,reviews=report.get('sample_only_reviews',()))
        with closing(open_catalog(DB.resolve())) as catalog:
            report['dashboard_counts'] = {p:keyword_page(catalog,{'project':p,'limit':1})['summary'] for p in sorted(active)}
        write_json(FINAL if args.apply else PREVIEW,report)
        print(encode({'workbooks':len(report['workbooks']),'worksheets':sum(len(b['sheets']) for b in report['workbooks']),
            'missing':report['projects_without_readable_plan'],'master_change':{k:len(v) for k,v in report['master'].items() if isinstance(v,list)},
            'new':dict(Counter((r['project']+' / '+r['decision']) for r in report['keywords'] if not r['previous_status'])),
            'changes':report.get('changes')}))


if __name__=='__main__':
    main()
