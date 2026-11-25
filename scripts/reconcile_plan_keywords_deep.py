"""Read plan keywords and annotations, retaining a decision for each candidate."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from functools import lru_cache
import json
from pathlib import Path
import re
import sqlite3
from zipfile import BadZipFile

from audit_catalog_search_keywords import DB, ROOT, encode, fold
from collect_catalog_platform_audit import OUT, read_json, write_json
from deduplicate_catalog_keywords import query_key, reconcile, update_summaries
from extract_project_sources import read_book
from finalize_catalog_cross_platform_audit import PLATFORMS, query_url

AUDIT = 'plan-keywords-columns-and-notes'
ARCHIVE = Path('outputs/project-refresh-2026-11-10')
INVENTORY = OUT / 'plan-keywords-deep-inventory.json'
SUMMARY = OUT / 'plan-keywords-deep-summary.json'
TAG = re.compile(r'(?<![\w#])#[^\W\d_]\w{1,79}', re.UNICODE)
KEY_LABEL = re.compile(r'(?:(?:danh sach|bo|list of|updated|search|main|sub|alias|related|brand|competitor|chu de|cum|noi dung) )*(?:key\s*words?|kws?|tu khoa|cum tu|hashtag\w*)(?: (?:chinh|phu|lien quan|tim kiem|theo doi|official|brand|main|sub|bo sung|alert))*$')
NOTE_LABEL = re.compile(r'(?:notes?|ghi chu|remarks?|tu khoa lien quan|related terms)(?: \w+){0,2}$')
TOPIC_LABEL = re.compile(r'(?:subjects?|ten chu the|chu the|ten chu de|chu de|ten topic|topic|topics|doi tuong|thuong hieu|brand name|brand|nhan hang|ten nhan hang|san pham|product|ten san pham)$')
ROLE_LABEL = re.compile(r'(?:vai tro|loai chu the|topic type|type of topic|loai topic|role|level|phan loai)$')
NEGATIVE = re.compile(r'\b(?:loai tru|khong lay|khong quet|khong thu thap|bo qua|exclude|ignore|negative keyword|stopword)\b')
UNSAFE_TEXT = re.compile(r'(?i:https?://|www\.)|[\w.+-]+@[\w.-]+\.\w+|(?:\b\d[ .()-]?){9,}|[=<>]|\b(?:AND|OR|NOT|NEAR)\b|(?<!\w)[+!](?=\w)')
WORKFLOW = re.compile(r'^(?:cac van de|ghi chu|quy dinh|quy tac|thao luan lien quan|chi thu thap|khong |danh sach |stt\b|topic chung|giai thich|neu |theo doi |pham vi |cach |mau |nhom keyword|bao cao|can loc|can check|gui email|link |thong tin chung)')
KEY_SECTION = re.compile(r'^(?:main |sub |additional |list |danh sach |bo |nhom )?(?:keyword|keywords|tu khoa|cum tu|kws|hashtags?)(?: .{0,65})?$')
NON_KEY_SHEET = re.compile(r'^(?:dashboard|report|raw data|data sample|ket qua|du lieu|sample data|nguon tin|source list|list source)\b|\b(?:rule spam|spamrac|labeling rules?)\b')
VINGROUP = {
    'Ban Lãnh Đạo': ('Phạm Thúy Hằng','Phạm Thu Hương','Lê Khắc Hiệp','Phạm Nhật Vượng','Mai Hương Nội',
                   'Nhật Vượng','Vượng Vin','Phạm Nhật Vũ'),
    'Vingroup': ('Vingroup','VEFAC'),
    'Vinhomes': ('Vinhomes','VinCity','Times City','Park Hill','Royal City','Golden River','Riversides Harmony',
                 'Park Hill Premium','Times City Park Hill','Imperia Hải Phòng',"D'.CAPITALE"),
    'Dự án Cần Giờ': ('Sài Gòn Sunbay','Công ty cổ phần Đô thị Du lịch Cần Giờ'),
    'Vinschool': ('Vinschool','trường học Vin'),
    'Vineco': ('Vineco','rau Vin'),
    'Vinpearl': ('Vinpearl','Vinpearl Safari','Golf Land Hải Phòng','Làng Vân Resort','Du lịch làng Vân',
                 'Cắm trại làng Vân','VinWonders'),
    'Vincom': ('Vincom','Maximax','Maximark'),
    'Vinmec': ('Vinmec','bệnh viện Vin','bv Vin'),
    'Vinpro': ('VinPro',), 'VinTech': ('VinTech',), 'VinFast': ('VinFast','Ô tô Vin'),
}
VINGROUP_CONTEXT = {'Cần giờ':'Dự án Cần Giờ','khu đô thị lấn biển':'khu đô thị lấn biển Cần Giờ',
    'Dự án lấn biển':'Dự án lấn biển Cần Giờ','central park':'Vinhomes Central Park','gardenia':'Vinhomes Gardenia',
    'riverside':'Vinhomes Riverside','river side':'Vinhomes Riverside','Skylake':'Vinhomes Skylake',
    'Sky Lake':'Vinhomes Skylake','Greenbay':'Vinhomes Green Bay','Green Bay':'Vinhomes Green Bay'}
VINGROUP_VARIANTS = {
    'Vingroup': ('Vjngroup','wingroup','mã cổ phiếu VIC','mã cổ phiếu VRE','mã cổ phiếu VEF','mã cổ phiếu SDI'),
    'Vinhomes': ('Vinhome','Vjnhomes','Vjnhome','Vinhôm','Vjnhôm','Vinciti','Vjncjty','Vjncjtj','timecity','time citi','Pắc hiu'),
    'Vinschool': ('Vinskul','Vjnschool','Vjnskul','Vin sờ cu','vinskool','vin xơ cun'),
    'Vineco': ('Vjneco',), 'Vinmec': ('vinmek','vjnmec','vjnmek'), 'VinTech': ('VinTec',),
    'Vinpearl': ('vinpaerl','vipearl','vjnpearl','vjnpaerl','vjpearl','Vinwonder','vinpearl wonder','vin safari','vjnpearl safarj','vjn safarj'),
    'Vincom': ('vicom','Vjncom','vjcom','wincom','Maxjmax','Maxjmark','mắc xi mắc'),
    'VinFast': ('vin phét','vinphat'), 'Ban Lãnh Đạo': ('Vượn Vin',),
}
VNM_PLAN_NAMES = {
    'Thương hiệu Vinamilk': ('Vina-míu','VN Milk','Vinamik','công ty cổ phần sữa Vietnam','vjnamil','kỷ niệm 50 năm VNM','VNM 50 năm','វីណាមីលក៍'),
    'Angkor Milk': ('អង្គរមីល','ង្គរមីលកម្ពុជា','រោងចក្រអង្គរមីល','រោងចក្រអង្គរមីល ភ្នំពេញ'),
    'Probi': ('Proby','Probeauty'), 'Dielac': ('Alpha Gold IQ','SBPS Alpha Gold'),
    'Vfresh': ('Vfresh','Vi fresh','Nước trái cây Vfresh','Trà Vfresh'),
    'Hero': ('Sữa trẻ em Hero','Sữa Hero','Sữa trái cây Hero','STC Hero'),
    'Yomilk': ('yomiu',), 'Pedia Kenji': ('Pedia Kenji',), 'Sữa chua Ozela': ('Sữa chua Ozela',),
}
VINAMILK_PRODUCT_ANY = re.compile(r'\b(?:vinamilk|vnm|green farm|dielac|optimum|yoko|sure|diecerna|canxi ?pro|kenko|organic gold|ridielac|'
    r'goldsoy|yomil\w*|vinamil\w*|susu|su su|probi|v[ij]fresh|icy|my joy|twin ?cows?|subo|yolo|delight|cocofresh|sao phuong nam|'
    r'ong tho|tai loc|hai loc|moc chau|nhoc kem|love yogurt|giac mo sua viet|gmsv|zori|adm|angkor\w*|super nut|optimum colos)\b')
NON_PRODUCT = re.compile(r'^(?:n/?a|none|tbd|phan loai|khac|nganh hang|ten san pham|nhom|thuong hieu|sua hat|sua dac|sua tuoi|'
    r'sua tuong|sua chua|sua nuoc|sua bot|sua bot nguyen kem|sua bot pha san|sua tiet trung|sua thanh trung|sua thuc vat|'
    r'dau tu|kem|pho mai|bot an dam|nuoc giai khat|vi trai cay|vnm sua|trang trai nha may|chinh sach|dang cap nhat|'
    r'cua hang online|dai ly|cua hang|dat hang|order|mua hang|giao hang|nhan vien|cao cap)$')
NOTE_PREFIX = re.compile(r'^(?:(?:ghi chú|note|remark)\s*:\s*)?(?:keyword(?:s)?(?:\s+bổ sung)?|từ khoá(?:\s+liên quan)?|từ khóa(?:\s+liên quan)?|'
                        r'cụm từ liên quan|bổ sung(?:\s+(?:keyword|từ khóa))?|thêm(?:\s+(?:keyword|từ khóa))?)\s*[:：]\s*',re.I)
NOTE_INSTRUCTION = re.compile(r'\b(?:khi nao|se update|tu thang|se danh label|siteid|re parented|root|vi the chuyen gia|to hop|ngung topic|khong xoa|ko xoa|please check|tu dong|cap nhat them)\b')
TOPIC_NOTE = re.compile(r'^topic (?:chung )?cho (.+?)\s+(?:nếu|khi)\b',re.I)
CELL_METADATA = re.compile(r'\([^)]*(?:\bnói chung\b|nhiều hương vị|\bchung\b|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})[^)]*\)$',re.I)
TRACKING_ONLY = re.compile(r'^(?:hero|flex|icy|tai loc|9 loai hat|cao dam|nuoc (?:ep|dua|tinh khiet)|tra|kompucha co gaz|sua (?:hat|dau nan)|sua chua an it duong|sua dinh duong dam a2)$')


def parts(value):
    """Split lists at top-level separators without flattening a Boolean rule."""
    if re.search(r'\b(?:AND|OR|NOT|NEAR)\b|&&|\|\||\+\s*\(',value):
        return [value]
    seq = re.split(r'([,;\n|•]|\s+/\s+|[()])',value)
    pieces, buffer, depth = [], [], 0
    for token in seq:
        if token == '(':
            depth += 1
        elif token == ')':
            depth = max(0,depth-1)
        if not depth and re.fullmatch(r'[,;\n|•]|\s+/\s+',token):
            pieces.append(''.join(buffer))
            buffer.clear()
        else:
            buffer.append(token)
    return [*pieces,''.join(buffer)]


def tidy(word):
    word = word.translate(dict.fromkeys(map(ord,'\u200b\u200c\u200d\ufeff')))
    word = NOTE_PREFIX.sub('',word.strip())
    word = word.strip(' \t\r\n-–—•*“”"\'’‘:;,.')
    word = re.sub(r'^\d{1,2}[.)]\s+', '', word)
    word = re.sub(r'\s+v\s*\.\s*v\s*\.?$', '', word, flags=re.I)
    word = CELL_METADATA.sub('',word)
    return ' '.join(word.split())


def plain_candidates(value):
    for part in parts(value):
        part = tidy(part)
        if part:
            yield part


def field(row, column):
    return row.get(column,{}).get('text','').strip()


@lru_cache(maxsize=8192)
def header_kind(value):
    label = fold(value)
    if label.startswith(('exclude ','negative ','spam keyword','tu khoa spam','tu khoa rac',
                         'tu khoa loai tru','tu khoa khong lay','keyword loai tru')):
        return 'exclude'
    if re.fullmatch(r'main ?key(?:words?)?|kw auto', label):
        return 'main'
    if re.fullmatch(r'sub ?key(?:words?)?', label):
        return 'sub'
    if re.match(r'^(?:sub ?key(?:words?)?|tu khoa phu)(?: |$)',label):
        return 'sub'
    if KEY_LABEL.fullmatch(label):
        if 'hashtag' in label:
            return 'hashtag'
        return 'sub' if label.startswith('sub ') or label.endswith(' phu') else 'main'
    if NOTE_LABEL.fullmatch(label):
        return 'note'
    if TOPIC_LABEL.fullmatch(label):
        return 'subject'
    if ROLE_LABEL.fullmatch(label):
        return 'role'
    return None


def plan_files(projects):
    documents = {}
    for row in read_json(ARCHIVE/'plans-manifest.json'):
        assignments = [it['project'] for it in row['projects'] if it['project'] in projects]
        documents[row['id']] = {'file':row.get('file'),'url':row['url'],'projects':assignments}
    for row in read_json(OUT/'plan-document-coverage.json'):
        if row.get('comparison') == 'SUPERSEDED_BY_MAIN_PLAN':
            documents.pop(row['id'], None)
            continue
        item = documents.setdefault(row['id'],{'file':None,'url':row['url'],'projects':[]})
        path = row.get('current_file') or row.get('previous_file')
        if path and Path(path).is_file():
            item['file'] = path
        item['projects'] = sorted(set(item['projects']) | {p for p,_ in row['projects'] if p in projects})
    return documents


def origin(plan, sheet, ref, kind, subject='', role=''):
    return {'plan_url':plan,'sheet':sheet,'cell':ref,'kind':kind,'subject':subject,'role':role}


def column_group_roles(parent, header):
    """Read a role heading spanning keyword subcolumns on the next row."""
    parent_roles = {col: header_kind(field(parent, col)) for col in parent}
    if 'sub' not in parent_roles.values() and 'exclude' not in parent_roles.values():
        return {}
    if not any(kind in {'main', 'hashtag'} for kind in parent_roles.values()):
        return {}
    groups = {}
    role = None
    for col in sorted(set(parent) | set(header), key=lambda key: (len(key), key)):
        title = field(parent, col)
        if title:
            role = parent_roles.get(col)
        if role in {'sub', 'exclude'} and header.get(col) in {'main', 'hashtag'}:
            groups[col] = role
    return groups


def heading_level(value):
    label = fold(value)
    if re.fullmatch(r'main ?brands?|thuong hieu chinh|chu the chinh', label):
        return '1'
    if re.fullmatch(r'(?:competitors?|doi thu|nganh|industry)(?: can theo doi)?', label):
        return '2'
    return ''


def heading_levels(parent, header):
    levels = {}
    current = ''
    for col in sorted(set(parent) | set(header), key=lambda key: (len(key), key)):
        if value := field(parent, col):
            current = heading_level(value)
        if current:
            levels[col] = current
    return levels


def is_result_sheet(rows):
    """Detect exported search results even when the worksheet also has a KW column."""
    for row in list(rows.values())[:5]:
        labels = {fold(field(row, column)) for column in row}
        if (labels & {'id','post id','topic id','topicid','parentid'}
                and labels & {'content','description','noi dung','title'}
                and labels & {'siteid','site name','sitename','urlcomment','published date','publisheddate','total interaction'}):
            return True
    return False


def xlsx_inventory(documents, book_reader=read_book):
    entries, workbooks = [], []
    for doc, info in sorted(documents.items()):
        source = {'id':doc,'projects':info['projects'],'url':info['url'],'sheets':0,'notes':0,'structured_cells':0}
        if not info['file'] or not Path(info['file']).is_file():
            source['status'] = 'MISSING_EXPORT'
            workbooks.append(source)
            continue
        source['status'] = 'READ'
        try:
            for sheet in book_reader(info['file']):
                name, rows = sheet['name'],sheet['rows']
                source['sheets'] += 1
                if is_result_sheet(rows):
                    continue
                items = list(sorted(rows.items()))
                scopes, roles, labels, levels = {},{},{},{}
                horizontal = {}
                matrix_start = None
                for number, row in items[:24]:
                    values = {col:cell['text'].strip() for col,cell in row.items()}
                    markers = [col for col,val in values.items() if fold(val) in {'keyword','keywords','tu khoa'}]
                    before = rows.get(number-1,{})
                    if len(markers)==1 and fold(field(before,markers[0])) in {'label','labels','chu the','topic','chu de'}:
                        scopes = {col:cell['text'].strip() for col,cell in before.items()
                                  if col!=markers[0] and 2 <= len(cell['text'].strip()) <= 80}
                        if len(scopes) >= 2:
                            matrix_start = number
                            break
                for number,row in items:
                    values = {col:cell['text'].strip() for col,cell in row.items()}
                    header = {col:kind for col,value in values.items() if (kind:=header_kind(value))}
                    if KEY_SECTION.fullmatch(fold(name)) or {'main','sub'} <= {fold(value) for value in values.values()}:
                        header.update({col:fold(value) for col,value in values.items() if fold(value) in {'main','sub','exclude'}})
                    header_kinds = set(header.values())
                    keyword_columns = bool(header_kinds & {'main','sub','hashtag'})
                    notes_with_subject = {'note','subject'} <= header_kinds
                    is_header = (matrix_start is None and not NON_KEY_SHEET.search(fold(name)) and
                        (keyword_columns or notes_with_subject) and
                        (len(header) > 1 or number <= 12 or KEY_SECTION.fullmatch(fold(name))))
                    if is_header:
                        previous = rows.get(number-1, {})
                        header.update(column_group_roles(previous, header))
                        levels = heading_levels(previous, header)
                        labels = header
                        scopes, roles = {},{}
                        horizontal = {}
                        if sum(kind=='main' for kind in header.values())>1:
                            title = ''
                            for col in sorted(values,key=lambda c:(len(c),c)):
                                if header.get(col)=='main':
                                    title = field(previous,col)
                                if title.strip() and not heading_level(title):
                                    horizontal[col] = title
                    elif labels:
                        for col,kind in labels.items():
                            if values.get(col) and kind in {'subject','role'}:
                                (scopes if kind=='subject' else roles)[col] = values[col]
                    ordered = sorted(row,key=lambda c:(len(c),c))
                    scope_order = sorted(scopes,key=lambda c:(len(c),c))
                    for col in ordered:
                        cell = row[col]
                        word = values[col]
                        kind = None
                        preceding_scope = next((key for key in reversed(scope_order)
                                                if (len(key),key) <= (len(col),col)),None)
                        subject = horizontal.get(col) or scopes.get(preceding_scope,'')
                        role = levels.get(col) or (next(reversed(roles.values()),'') if roles else '')
                        if matrix_start is not None and number >= matrix_start and col in scopes:
                            kind,subject = 'matrix',scopes[col]
                        elif not is_header and labels.get(col) in {'main','sub','hashtag','note','exclude'}:
                            kind = labels[col]
                        ref = cell['ref']
                        if kind and word:
                            source['structured_cells'] += 1
                            entries.append([info['projects'],word,origin(info['url'],name,ref,kind,subject,role)])
                        if note:=cell.get('note','').strip():
                            source['notes'] += 1
                            note_origin = origin(info['url'],name,ref,'cell_note',subject,role)
                            if kind in {'exclude','sub'}:
                                note_origin['context'] = kind
                            entries.append([info['projects'],note,note_origin])
                    if is_header:
                        continue
                if info['projects'] != ['Vinamilk']:
                    continue
                for number,row in items:
                    if name == 'List Tracking_VNM' and number > 1:
                        for col,kind in [('C','own_product'),('E','note')]:
                            if word:=field(row,col):
                                entries.append([['Vinamilk'],word,origin(info['url'],name,f'{col}{number}',kind,field(row,'C'),'1')])
                    if name == 'List Tracking_Đối thủ' and number > 1 and (value:=field(row,'D')):
                        for label in value.splitlines():
                            segments = label.strip().split('_')
                            if len(segments)>2 and segments[1].strip():
                                word = re.sub(r'^Thương hiệu\s+','',segments[1].strip(),flags=re.I)
                                entries.append([['Vinamilk'],word,origin(info['url'],name,f'D{number}','competitor_product',word,'2')])
                    if name == 'Danh sách ngành hàng' and number > 3:
                        for col,cell in row.items():
                            if word:=cell['text'].strip():
                                if col=='B' and (number==4 or number>=11):
                                    entries.append([['Vinamilk'],word,origin(info['url'],name,cell['ref'],'own_product',word,'1')])
                                elif col in 'FGHIJKLMNOPQRSTUV' and field(row,'F'):
                                    entries.append([['Vinamilk'],word,origin(info['url'],name,cell['ref'],'competitor_product',field(row,'F'),'2')])
        except (BadZipFile,ValueError,KeyError,OSError) as error:
            source['status'] = f'READ_ERROR_{type(error).__name__}'
        workbooks.append(source)
    return entries,workbooks


def gather(db):
    projects = dict(db.execute('SELECT project_name,plan_status FROM projects'))
    entries,documents = xlsx_inventory(plan_files(projects))
    archived_cells = 0
    for project,kind,word,plan,sheet,cell,record in db.execute('''SELECT project_name,kind,raw_value,plan_url,sheet,cell,row_json FROM es_keyword_cells'''):
        if not word or project not in projects:
            continue
        info = json.loads(record)
        item = origin(plan,sheet,cell,kind,info.get('subject') or info.get('parent_keyword') or '',info.get('roleOriginal',''))
        item['archive'] = True
        entries.append([[project],word,item])
        archived_cells += 1
    return entries,documents,archived_cells


def term_shape(word):
    plain = fold(word)
    return (2 <= len(word) <= 100 and 1 <= len(plain.split()) <= 12 and bool(re.search(r'[^\W\d_]',word))
            and not (UNSAFE_TEXT.search(word) or WORKFLOW.match(plain) or NEGATIVE.search(plain)
                     or re.search(r'^\s*[+/]|\s\+\s|\+["“]|\b\d{1,2}/\d{1,2}/\d{4}\b|[→➜]|["“]\s+["”]|\(\.{2,}',word)
                     or re.search(r'\b(?:ket hop voi|ket hop xach tay|keyword cua|keywords cua|ngung topic|mention|de giup)\b',plain)
                     or re.fullmatch(r'(?:\d+\s*)+|n a|na|tbd|keyword|keywords|main|sub|hashtag|lan|online|offline|facebook|youtube|instagram|linkedin|tiktok',plain)))


def clean_terms(raw, project=None, kind=None):
    if re.search(r'\b(?:AND|OR|NOT)\b|&&|\|\||\+\s*\(',raw):
        return [raw]
    word = NOTE_PREFIX.sub('',raw.strip())
    if kind in {'note','cell_note'} and (topic:=TOPIC_NOTE.match(word)):
        word = topic[1]
    word = re.sub(r'["”]\s+["“]', '\n',word)
    tagged_text = re.sub(r'(?:https?://|www\.)\S+', '',word,flags=re.I)
    terms = [match[0] for match in TAG.finditer(tagged_text) if match[0].casefold() not in {'#ref','#value','#error','#name','#div'}]
    for part in plain_candidates(word):
        if part.startswith('#') or UNSAFE_TEXT.search(part):
            continue
        part = tidy(TAG.sub('',part))
        if project=='Gaz Vietnam' and ': ' in part:
            vietnamese,english = part.split(': ',1)
            terms.extend((tidy(vietnamese),tidy(re.sub(r'\s*\(slang\)$','',english))))
        elif '/' in part and not ({'PET/CT','SPECT/CT'} & set(part.upper().split())) and not re.search(r'\d/\d',part):
            joined = [tidy(phrase) for phrase in re.split(r'\s*/\s*',part)]
            if not any('+' in phrase for phrase in joined):
                terms.extend(joined)
        elif part:
            terms.append(part)
    return list(dict.fromkeys(terms))


def load_anchors(db):
    anchors = defaultdict(dict)
    project_status = dict(db.execute('SELECT project_name,plan_status FROM projects'))
    def add(project,word,subject,level):
        key = fold(word)
        if project in project_status and len(key.replace(' ','')) >= 3 and not WORKFLOW.match(key):
            anchors[project].setdefault(query_key(key),(key,subject,level))

    for project in project_status:
        add(project,project,project,1)
    for project,word,level,subjects in db.execute("SELECT project_name,keyword,level,subjects_json FROM keywords WHERE status IN ('READY','CHANNEL_ONLY')"):
        if word.startswith('#'):
            continue
        subjects = json.loads(subjects)
        for subject in subjects:
            if not re.search(r'_',subject) and not NON_PRODUCT.fullmatch(fold(subject)):
                add(project,subject,subject,level)
        add(project,word,subjects[0] if len(subjects)==1 else word,level)
    for row in read_json(ARCHIVE/'completion/topic-decisions-final.json'):
        if row['decision']=='ACCEPTED' and row.get('query') and not NON_PRODUCT.fullmatch(fold(row['query'])):
            add(row['project'],row['query'],row['subject'],row['level'])
    return project_status,anchors


def match_anchor(project,word,anchors):
    text = fold(word)
    table = anchors[project]
    if exact:=table.get(query_key(text)):
        return exact[1:]
    if word.startswith('#') or (re.search(r'[a-zà-ỹ][A-ZĐ]',word) and ' ' not in word):
        compact = query_key(word.removeprefix('#'))
        matches = [(key,hit) for key,hit in table.items() if len(key)>=5 and len(compact)>=len(key)+2
                   and (compact.startswith(key) or compact.endswith(key)) and not NON_PRODUCT.fullmatch(hit[0])]
        if matches:
            return max(matches,key=lambda pair:len(pair[0]))[1][1:]
    words = text.split()
    if len(words) < 2:
        return None
    for length in range(len(words)-1,0,-1):
        for start in range(len(words)-length+1):
            piece = ' '.join(words[start:start+length])
            if len(piece)<=3 and piece not in {'acb','bid','hsc','mwg','sbt','vnm','hdb','bsc','bim','fpt','vib','msb','nab','bvc'}:
                continue
            if hit:=table.get(query_key(piece)):
                if hit[0] == piece and not NON_PRODUCT.fullmatch(piece):
                    return hit[1:]
    return None


def assess(project,word,item,anchors):
    kind = item['kind']
    title = item['subject']
    if kind=='exclude' or item.get('context')=='exclude':
        return 'EXCLUDED',word,None
    if not term_shape(word):
        return 'TEXT_OR_RULE',word,None
    key = fold(word)
    if kind in {'note','cell_note'} and NOTE_INSTRUCTION.search(key):
        return 'TEXT_OR_RULE',word,None
    if project=='Samsung 2026' and kind=='main' and item['sheet']=='Trang tính1' and title==project:
        for model_line in ('tủ lạnh Samsung','máy giặt Samsung'):
            if query_key(word)==query_key(model_line):
                return 'DIRECT',model_line,(project,1)
    if project == 'Vingroup' and kind == 'matrix' and title in VINGROUP:
        for preferred in (*VINGROUP[title],*VINGROUP_VARIANTS.get(title,())):
            if query_key(preferred)==query_key(word):
                return 'DIRECT',preferred,(title,1)
        if title=='Vingroup' and key in {'vic','vre','vef','sdi'}:
            return 'DIRECT',f'mã cổ phiếu {word.upper()}',(title,1)
        if title in {'Dự án Cần Giờ','Vinpearl'} and key in {'lan bien can gio','can gio lan bien'}:
            return 'DIRECT','khu đô thị lấn biển Cần Giờ',('Dự án Cần Giờ',1)
        for raw,preferred in VINGROUP_CONTEXT.items():
            if query_key(raw)==query_key(word):
                return 'DIRECT',preferred,(title,1)
        return 'NEEDS_CONTEXT',word,None
    if project=='Vinamilk' and kind in {'own_product','main'}:
        for subject, names in VNM_PLAN_NAMES.items():
            if any(query_key(name)==query_key(word) for name in names):
                return 'DIRECT',word,(subject,1)
    if project=='Vinamilk' and kind in {'own_product','competitor_product'} and not (NON_PRODUCT.fullmatch(key) or TRACKING_ONLY.fullmatch(key)):
        if kind=='own_product' and not (re.search(r'\b(?:vinabeef|ngoi sao phuong nam|vnm|galeto)\b',key) or VINAMILK_PRODUCT_ANY.search(key)):
            return 'NEEDS_CONTEXT',word,None
        if kind=='own_product' and ':' in word:
            return 'NEEDS_CONTEXT',word,None
        if len(key.split()) >= 2 or (len(key)>=4 and not re.fullmatch(r'(sua|kem|susu|vnm|scu|brand|chia|comp\w*)',key)):
            level = 1 if kind=='own_product' else 2
            return 'DIRECT',word,(title if kind=='competitor_product' and title else word,level)
    if project=='Vinamilk' and item['sheet']=='Distribution List' and item['cell'].startswith('C'):
        if VINAMILK_PRODUCT_ANY.search(key) and not (NON_PRODUCT.fullmatch(key) or TRACKING_ONLY.fullmatch(key)):
            scoped_subject = title if title and len(title)<90 and '\n' not in title else 'Vinamilk'
            return 'DIRECT',word,(scoped_subject,1)
    found = match_anchor(project,word,anchors)
    if not found and word.startswith('#'):
        found = match_anchor(project,word[1:],anchors)
    anchor_title = match_anchor(project,title,anchors) if title else None
    if kind in {'main','sub'} and key == fold(title) and len(key.split())>=2 and anchor_title:
        return 'DIRECT',word,anchor_title
    if project=='Gaz Vietnam' and kind in {'main','sub'} and anchor_title and key in {'pho trang xit','fo transit'}:
        return 'DIRECT',word,anchor_title
    if kind in {'note','cell_note'} and (not found or (anchor_title and anchor_title[1]!=found[1])):
        return 'NOTE_CONTEXT',word,None
    if found and not NON_PRODUCT.fullmatch(key):
        return 'DIRECT',word,found
    if kind in {'sub','alias'}:
        return 'CONTEXT_ONLY',word,None
    return 'NEEDS_CONTEXT',word,None


def propose(db, inventory):
    project_status,anchors = load_anchors(db)
    matches = defaultdict(list)
    by_project = defaultdict(Counter)
    note_cells = defaultdict(set)
    all_projects = set(project_status)
    excluded = {(project,query_key(word)) for projects,raw,item in inventory['entries'] if item['kind']=='exclude'
                for project in projects for word in clean_terms(raw) if term_shape(word)}
    for projects,raw,item in inventory['entries']:
        for project in projects:
            if project not in all_projects:
                continue
            for word in clean_terms(raw,project,item['kind']):
                decision,term,scope = assess(project,word,item,anchors)
                if decision=='DIRECT' and (project,query_key(word)) in excluded:
                    decision,scope = 'ALSO_EXCLUDED',None
                if decision=='DIRECT' and len(projects)>1:
                    own = match_anchor(project,word,anchors)
                    if not own:
                        decision,scope = 'SHARED_PLAN',None
                by_project[project][decision] += 1
                row = {**item,'original':word,'decision':decision,'keyword':term}
                if word!=term:
                    row['qualified_from_plan'] = True
                if item['kind'] in {'note','cell_note'}:
                    note_cells[project].add((item['plan_url'],item['sheet'],item['cell'],item['kind']))
                    row['explicit_note'] = bool(NOTE_PREFIX.match(raw))
                if scope:
                    row.update(resolved_subject=scope[0],level=scope[1])
                matches[project,query_key(term)].append(row)
    return project_status, matches, by_project, note_cells


def resolve(db, matches):
    current = defaultdict(list)
    for project, word, level, status in db.execute('SELECT project_name,keyword,level,status FROM keywords'):
        current[project,query_key(word)].append((word,level,status))
    updates, remaining, variants, coverage = [], [], [], defaultdict(Counter)
    for (project,key), proofs in matches.items():
        if not key:
            continue
        existing = current[project,key]
        direct = [row for row in proofs if row['decision']=='DIRECT']
        searchable = [row for row in existing if row[2] in {'READY','CHANNEL_ONLY'}]
        if searchable:
            if len(searchable)==1:
                canonical,level,_ = searchable[0]
                spellings = [r for r in direct if r['level']==level and r['original']!=canonical
                             and query_key(r['original'])==key]
                if spellings:
                    variants.append({'project':project,'keyword':canonical,'evidence':spellings})
            coverage[project]['ALREADY_IN_CATALOG'] += 1
            continue
        levels = {r['level'] for r in direct}
        transition = 'ES_ONLY' if existing and all(r[2]=='ES_ONLY' for r in existing) and (
            any(r['kind'] in {'matrix','own_product','competitor_product'} or
                (project=='Vinamilk' and r['sheet']=='Distribution List') for r in direct)) else None
        if direct and len(levels)==1 and (not existing or transition):
            sources = defaultdict(set)
            for row in direct:
                sources[row['keyword']].add((row['plan_url'],row['sheet'],row['cell']))
            winner = min(sources,key=lambda word:(-len(sources[word]),word.islower(),-len(word.split()),word.casefold(),word))
            level = next(iter(levels))
            if transition:
                winner, old_level, _ = existing[0]
                if old_level != level:
                    winner = None
            if winner:
                evidence = list({(r['plan_url'],r['sheet'],r['cell'],r['original'],r['kind']):r for r in direct}.values())
                subjects = list(dict.fromkeys(r['resolved_subject'] for r in direct))
                updates.append({'project':project,'keyword':winner,'level':level,'subjects':subjects,
                                'previous_status':transition,'evidence':evidence})
                coverage[project]['PLAN_SCOPE_MATCH'] += 1
                continue
        states = {r['decision'] for r in proofs}
        show = [r for r in proofs if r['decision'] in {'DIRECT','NEEDS_CONTEXT','ALSO_EXCLUDED','SHARED_PLAN'}
                or (r['decision']=='NOTE_CONTEXT' and r.get('explicit_note'))]
        if show:
            state = 'EXISTING_DECISION' if existing else 'LEVEL_CONFLICT' if len(levels)>1 else 'NEEDS_CONTEXT'
            unique = {(r['plan_url'],r['sheet'],r['cell'],r['original']):r for r in show}
            reasons = {'EXISTING_DECISION':'Kho đã có quyết định riêng cho cụm này.',
                       'LEVEL_CONFLICT':'Các ô plan gán cụm này cho cả level 1 và level 2.',
                       'NEEDS_CONTEXT':'Thiếu căn cứ để cụm này tự tìm ra đúng chủ thể khi đứng riêng.'}
            remaining.append([{'project':project,'value':r['original'],'sheet':r['sheet'],'cell':r['cell'],'kind':r['kind'],
                               'plan_url':r['plan_url'],'status':state,'reason':reasons[state],
                               'subject':r['subject'],'scope_decision':r['decision']} for r in unique.values()])
            coverage[project][state] += 1
        else:
            coverage[project]['NOTE_OR_CONTEXT_ONLY' if states & {'NOTE_CONTEXT','CONTEXT_ONLY'} else 'TEXT_OR_EXCLUSION'] += 1
    return updates,remaining,variants,coverage


def retain_variant_evidence(db, variants, audit_id=AUDIT):
    for row in variants:
        project,keyword = row['project'],row['keyword']
        originals, = db.execute('SELECT originals_json FROM keywords WHERE project_name=? AND keyword=?',
                                (project,keyword)).fetchone()
        records = json.loads(originals)
        seen = {encode(record) for record in records}
        for proof in row['evidence']:
            record = {'method':audit_id,'plan_url':proof['plan_url'],'sheet':proof['sheet'],'cell':proof['cell'],
                      'raw_value':proof['original'],'kind':proof['kind'],'subject':proof['resolved_subject']}
            if encode(record) not in seen:
                seen.add(encode(record))
                records.append(record)
        db.execute('UPDATE keywords SET originals_json=? WHERE project_name=? AND keyword=?',
                   (encode(records),project,keyword))


def apply_updates(db, updates, statuses, audit_id=AUDIT):
    for row in updates:
        project,word,level = (row[key] for key in ('project','keyword','level'))
        item_evidence = [{'method':audit_id,'plan_url':r['plan_url'],'sheet':r['sheet'],'cell':r['cell'],
                          'raw_value':r['original'],'kind':r['kind'],'subject':r['resolved_subject'],
                          **({'support_url':r['support_url']} if r.get('support_url') else {})} for r in row['evidence']]
        provenance = list(dict.fromkeys(f"{r['sheet']}!{r['cell']} · {r['plan_url']}" for r in item_evidence))
        provenance.extend(dict.fromkeys(f"Đối chiếu chủ thể · {r['support_url']}" for r in item_evidence if r.get('support_url')))
        places = ', '.join(dict.fromkeys(f"{r['sheet']}!{r['cell']}" for r in item_evidence))
        reason = f'Keyword khớp trực tiếp chủ thể trong plan ({places}). Bằng chứng tìm kiếm theo từng kênh có trạng thái riêng.'
        if row['previous_status']:
            old = db.execute('''SELECT evidence_json,originals_json,reasons_json FROM keywords
                WHERE project_name=? AND keyword=? AND status=?''',(project,word,row['previous_status'])).fetchone()
            if not old:
                raise RuntimeError(f'Keyword state changed: {project} / {word}')
            old_evidence,old_originals,old_reasons = map(json.loads,old)
            db.execute('''UPDATE keywords SET status='READY', evidence_json=?, originals_json=?, reasons_json=?
                          WHERE project_name=? AND keyword=?''',
                       (encode([*old_evidence,*provenance]),encode([*old_originals,*item_evidence]),
                        encode([*old_reasons,reason]),project,word))
        else:
            db.execute('INSERT INTO keywords VALUES (?,?,?,?,?,?,?,?,?)',
                       (word,project,level,'READY',statuses[project],encode(row['subjects']),encode(provenance),
                        encode(item_evidence),encode([reason])))
        db.execute('INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',
                   (audit_id,project,word,row['previous_status'],'READY',level if row['previous_status'] else None,level,None,reason))
        for platform in PLATFORMS:
            out_of_scope = platform=='news' and word.startswith('#')
            platform_reason = 'Hashtag chỉ dùng với các kênh hỗ trợ hashtag.' if out_of_scope else 'Đã đối chiếu ô nguồn trong plan. Chưa kiểm tra riêng kết quả tìm kiếm trên kênh này.'
            db.execute('INSERT OR IGNORE INTO keyword_platform_audit VALUES (?,?,?,?,?,?,?,?,?,?)',
                       (project,word,platform,'OUT_OF_SCOPE' if out_of_scope else 'NOT_CHECKED',None,platform_reason,
                        query_url(platform,word),'PLAN_SCOPE',None,'[]'))


def ready_counts(db):
    return {p:{'total':n,'hashtags':tags,'plain':n-tags} for p,n,tags in db.execute(
        "SELECT ProjectName,count(*),sum(Keyword LIKE '#%') FROM search_queue GROUP BY ProjectName")}


def review_inventory(mode):
    inventory = read_json(INVENTORY)
    with closing(sqlite3.connect(DB.resolve().as_uri() + ('?mode=rw' if mode=='apply' else '?mode=ro'),uri=True)) as db:
        statuses,matches,rows,notes = propose(db,inventory)
        updates,remaining,variants,coverage = resolve(db,matches)
        before = ready_counts(db)
        merged, review = [], []
        if mode=='apply':
            db.execute('PRAGMA foreign_keys=ON')
            with db:
                db.execute('BEGIN IMMEDIATE')
                apply_updates(db,updates,statuses)
                retain_variant_evidence(db,variants)
                merged,review = reconcile(db)
                if db.execute('PRAGMA quick_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
                    raise RuntimeError('Catalog integrity check failed')
            ready_levels,unique_terms = update_summaries(db)
        else:
            ready_levels = dict(db.execute('SELECT Level,count(*) FROM search_queue GROUP BY Level'))
            unique_terms = {}
        after = ready_counts(db)
    readable_projects = {p for d in inventory['documents'] if d['status']=='READ' for p in d['projects']}
    summary = {'mode':mode,'projects':len(statuses),'documents':dict(Counter(r['status'] for r in inventory['documents'])),
        'projects_with_readable_plan':len(readable_projects),
        'projects_without_readable_plan':sorted(set(statuses)-readable_projects),
        'sheets':sum(d['sheets'] for d in inventory['documents']), 'archived_cells':inventory['archived_cells'],
        'entries':len(inventory['entries']),'note_cells':sum(map(len,notes.values())),
        'updates':len(updates),'promoted_es_only':sum(bool(r['previous_status']) for r in updates),
        'from_notes':sum(any(p['kind'] in {'note','cell_note'} for p in r['evidence']) for r in updates),
        'remaining_candidates':len(remaining),'merged':merged,'normalization_conflicts':review,
        'existing_keywords_with_plan_variants':len(variants),
        'existing_plan_variants':sum(len({p['original'] for p in r['evidence']}) for r in variants),
        'updated_projects':len({r['project'] for r in updates}),
        'additional_plan_variants':sum(len({p['original'] for p in r['evidence'] if p['original']!=r['keyword']
                                           and query_key(p['original'])==query_key(r['keyword'])}) for r in updates),
        'ready_levels':ready_levels,'distinct_terms':unique_terms,
        'ready_before':sum(row['total'] for row in before.values()),'ready_after':sum(row['total'] for row in after.values()),
        'ready_hashtags':sum(row['hashtags'] for row in after.values()),
        'by_project':{p:{'plan_items':dict(rows[p]),'dispositions':dict(coverage[p]),'note_cells':len(notes[p]),
                        'before':before.get(p,{}),'after':after.get(p,{})} for p in sorted(statuses)},
        'source_gaps':[d for d in inventory['documents'] if d['status']!='READ']}
    write_json(OUT/f'plan-keywords-deep-{mode}.json',updates)
    if mode=='apply':
        write_json(SUMMARY,summary)
        write_json(OUT/'plan-keywords-deep-context-review.json',remaining)
        actionable = [group for group in remaining if any(r['scope_decision'] in {'DIRECT','ALSO_EXCLUDED','NOTE_CONTEXT','SHARED_PLAN'}
                      for r in group)]
        write_json(OUT/'plan-keyword-candidates.json',actionable)
        write_json(OUT/'plan-keywords-deep-variants.json',variants)
        path = OUT/'cross-platform-summary.json'
        cross = read_json(path)
        cross['untriaged_plan_project_terms'] = len(actionable)
        cross['keyword_plan_review']={key:summary[key] for key in ('projects','documents','sheets','entries','note_cells','updates')}
        write_json(path,cross)
    print(encode({k:v for k,v in summary.items() if k not in {'by_project','source_gaps','merged','normalization_conflicts'}}))
    print(encode({'top_updates':Counter(r['project'] for r in updates).most_common(16),
                  'normalized_duplicates':len(merged),'normalization_groups_for_review':len(review)}))



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=('scan','preview','apply'))
    args = parser.parse_args()
    if args.mode != 'scan':
        review_inventory(args.mode)
        return
    with closing(sqlite3.connect(DB.resolve().as_uri()+'?mode=ro',uri=True)) as db:
        entries,documents,archived_cells = gather(db)
    write_json(INVENTORY,{'entries':entries,'documents':documents,'archived_cells':archived_cells})
    print(encode({'entries':len(entries),'documents':dict(Counter(r['status'] for r in documents)),
                  'sheets':sum(r['sheets'] for r in documents),'notes':sum(r['notes'] for r in documents)}))


if __name__ == '__main__':
    main()
