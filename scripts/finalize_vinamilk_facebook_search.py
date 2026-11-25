"""Classify and apply the sampled Vinamilk Facebook results for the 316 reviewed terms."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from difflib import SequenceMatcher
import json
import re
import unicodedata

from collect_catalog_platform_audit import read_json, write_json
from deduplicate_catalog_keywords import update_summaries
from review_vinamilk_facebook_search import OUTPUT, PROJECT, QUEUE, REPORT, SCOPE, catalog, observations

PREVIEW = OUTPUT / 'decisions-preview.json'
DECISIONS = OUTPUT / 'decisions.json'
SECTOR = re.compile(r'\b(?:sua|milk|dairy|kem|ice cream|bo sua|bot an dam|dinh duong|nutrition|yogurt|yoghurt|'+
                    r'pho mai|cheese|plant based|dam thuc vat|care 100|lactoferrin|men song)\b')
AMBIGUOUS = {'bliss','hoan hao','truong sinh','oggi','nuvi','merino','celano','kun','sua kun','walls','wall s','abbott','abbott viet nam',
             'heinz','heinz viet nam','meiji','meiji viet nam','glico','glico viet nam','unilever','fami','milo','milo viet nam',
             'bel vietnam','grow plus','anlene','dalat milk','nestle','nestle viet nam','friso','colos baby','long thanh scu'}
OFFICIAL_ACTOR = {
    'abbott grow':{'abbott grow vietnam'}, 'anlene':{'anlene vietnam','anlene viet nam'}, 'bel':{'bel ga vietnam','bel ga viet nam'},
    'betagen':{'betagen vietnam','betagen viet nam'}, 'dutch lady':{'dutch lady vietnam','dutch lady viet nam','co gai ha lan'},
    'friso':{'friso vietnam','friso viet nam'},'milo':{'milo viet nam','milo vietnam'},
    'meiji':{'meiji nhat ban nhap khau chinh hang','meiji meibalance thuc pham dinh duong'},
    'pediasure':{'pediasure viet nam','pediasure vietnam'},'yakult':{'yakult viet nam','yakult vietnam'},
    'nutifood':{'nutifood viet nam','nutifood vietnam'},'vinasoy':{'vinasoy'},'vitadairy':{'vitadairy viet nam','vitadairy vietnam'},
    'fristi':{'fristi viet nam','fristi vietnam'},'fami':{'fami','fami vinasoy'},'ensure gold':{'ensure gold vietnam','ensure gold viet nam'},
    'oatside':{'oatside vietnam','oatside viet nam'},'lothamilk':{'lothamilk'},'kun':{'kun','lof kun'},
}
PRODUCT_VARIANTS = {
    'bel vietnam':('bel ga vietnam','bel ga viet nam'),
    'bột ăn dặm coloscare':('bot an dam colos care',),
    'công ty sữa idp':('sua quoc te idp','idp corp','idpcorp','cong ty co phan sua quoc te lof'),
    'sữa quốc tế lof':('sua quoc te idp','idp corp','idpcorp','cong ty co phan sua quoc te lof'),
    'dalatmilk sữa bịch':('sua tuoi da lat milk bich','sua tuoi dalat milk bich','sua tuoi dalatmilk bich','dalat milk fino'),
    'dalatmilk fino':('sua tuoi da lat milk bich','sua tuoi dalat milk bich','sua tuoi dalatmilk bich','dalat milk fino'),
    'dalat milk thanh trùng':('thanh trung dalat milk','thanh trung da lat milk'),
    'dalat milk tiệt trùng':('tiet trung dalat milk','tiet trung da lat milk'),
    'dutch lady organic':('co gai ha lan organic','dutch lady huu co'),
    'dutchlady yogurt':('dutch lady yogurt','dutch lady yoghurt','sua chua co gai ha lan','sua chua dutch lady'),
    'enfa mama a+':('enfamama a','enfamil mama a','enfa mama a'), 'enfa enspire':('enfamil enspire','enfagrow enspire'),
    'kem bliss':('bliss premium gelato','bliss gelato'),
    'long thành scu':('sua chua uong long thanh','sua chua uong lothamilk'),
    'long thành thanh trùng':('sua tuoi thanh trung long thanh','sua tuoi thanh trung lothamilk'),
    'meiji scu thanh trùng':('sua chua uong thanh trung meiji','sua chua uong meiji thanh trung'),
    'nan a2':('nan infinipro a2',),'nutramigen a+':('nutramigen a lgg',),
    'nunest kid nutricare':('nunest kid',),'nunut lục bảo nutricare':('nunut luc bao','nun ut luc bao'),
    'nutimilk creamer':('sua dac nutimilk','kem dac nutimilk'), 'nutimilk fino':('fino sua tuoi tuoi sach nutimilk','fino nutimilk'),
    'nuvi sữa chua lên men':('sua chua uong men song nuvi','sua chua len men nuvi'),
    'nuvi sữa lúa mạch':('sua nuvi cacao lua mach','nuvi cacao lua mach','nuvi sua tuoi lua mach'),
    'ospo nutricare':('nutricare ospo','sua ospo'),
    'sc betagen':('sc len men betagen','sua chua uong betagen','sua chua betagen'),
    'sữa bắp non lif':('sua bap non lof','bap non lif','bap non lof'),
    'sữa bắp non lof':('sua bap non lif','bap non lif','bap non lof'),
    'sữa bột trẻ em meiji':('sua bot meiji','sua meiji hohoemi'),
    'sữa bone nutricare':('nutricare bone','leanmax bone'),
    'sữa cerna nutricare':('nutricare cerna','sua cerna'),
    'sữa fine nutricare':('nutricare fine',),'sữa gastro nutricare':('nutricare gastro',),
    'sữa gold nutricare':('nutricare gold',),'sữa kidney nutricare':('nutricare kidney',),'sữa liver nutricare':('nutricare liver',),
    'sữa chua ăn ba vì':('sua chua an lof ba vi','sua chua ba vi'),
    'sữa đặc hoàn hảo':('sua dac co gai ha lan hoan hao','creamer dac hoan hao'),
    'sữa đặc trường sinh':('kem dac truong sinh','sua truong sinh'),
    'th true chocomalt mistori':('chocomalt mistori','th true chocomalt'),
    'th true light meal':('th true milk light meal',),
    'th true milk thanh trùng':('sua tuoi thanh trung th true milk','sua thanh trung th true milk'),
    'th true probiotics':('th true yogurt probiotics',),'sữa đậu nành fami':('sdn fami','fami vinasoy'),
    'th true yogurt topkid':('sua chua topkid','th true yogurt topkid'),
    'varna life cao đạm':('varna life cao dam',),
}
WRONG_TOPICS = {
    'bliss': {'spa|laser|tham my|not ruoi':'spa và thẩm mỹ','shop|chan vay|vay ao|brand thoi trang|outfit|mac do':'cửa hàng thời trang',
              'music|nhac|dj|festival':'nhạc và sự kiện'},
    'hoan hao': {'cuoc song|tinh yeu|nguoi hoan hao|khong hoan hao|dep hoan hao':'cụm miêu tả chung',
                 'make up|toc|da|tham my|trang diem|my pham':'làm đẹp'},
    'truong sinh': {'phim|dao tieu|tieu thuyet|kiem hiep|nhan vat|so phan':'phim, truyện và nhân vật',
                    'nuoc giai khat|ruou|thao duoc|duoc lieu|nam lim':'đồ uống hoặc dược liệu khác',
                    'xay dung|nha hang|bat dong san|cong trinh':'công ty hoặc sản phẩm khác'},
    'merino': {'wool|len|ao khoac|cua hang len|alpaca|cuu|merino atelier|tu do|thu dong':'len, thời trang và studio'},
    'oggi': {'oggi e|oggi a|oggi si|giorno|notizie|buongiorno|stamattina':'bài tiếng Ý dùng từ thông thường'},
    'abbott': {'thuoc|device|freestyle|khau trang|may do duong huyet|xet nghiem':'thiết bị và dược phẩm ngoài ngành sữa'},
    'heinz': {'ketchup|tuong ca|tuong ot|sauce|baked beans':'tương và thực phẩm Heinz ngoài dòng cần theo dõi'},
    'meiji': {'chocolate|socola|nha hang|rau|vien dai hoc':'đồ ăn hoặc chủ thể Meiji khác'},
    'enfagrow enspire': {'enfamil enspire|enfamil enspire opti|enfamil inspire':'Enfamil Enspire, dòng khác với EnfaGrow'},
    'dalatmilk fino': {'fino vinamilk|vinamilk fino|th fino':'Fino của Vinamilk hoặc TH'},
    'nutizen': {'tuyen dung|job|cong viec|phan mem':'tuyển dụng hoặc chủ thể khác'},
    'cghl fino': {'buon|giorno|pomeriggio|squadra|famiglia|elmo|madona':'bài tiếng Ý không liên quan'},
    'co gai ha lan cao khoe': {'truyen|ngon tinh|truyen tranh|chong danh|tuong quan|chuong':'truyện và bài giải trí'},
    'fami': {'family|familia|mother|father|brother|sister|together':'bài về gia đình, từ family'},
    'glico viet nam': {'pocky|banh que|snack':'bánh que Pocky, ngoài dòng sữa và dinh dưỡng cần theo dõi'},
    'heinz viet nam': {'ketchup|tuong ca|tuong ot|sauce|baked beans|food service':'tương và nguyên liệu bếp Heinz ngoài dòng cần theo dõi'},
    'long thanh scu': {'san bay|dat dau gia|dat nen|bat dong san':'bất động sản và sân bay Long Thành'},
    'smarta mom': {'salim|smart mom|luxuo':'chuyên mục SMART MOM về Salim'},
    'nutimilk': {'nut milk|almond milk|plant milk|nut recipes|cashew milk|sua hat tu lam':'công thức sữa hạt chung'},
    'enfamil premium': {'enfamil enspire|enfamil a2|enfamil nutramigen':'Enspire, A2 và Nutramigen, các dòng Enfamil khác'},
    'grandcare gold': {'babymall|gold coast|ensure gold':'Babymall, Gold Coast và Ensure Gold'},
    'sua smarta iq nutricare': {'smarta grow|smart grow':'Smarta Grow, dòng khác với Smarta IQ'},
    'sua tuoi dutch lady rtd': {'dream home|family memories|grow up fast|grateful heart|outfit|work feels':'bài đời sống và xây nhà ngoài chủ thể Dutch Lady'},
    'dutch lady mama': {'woke up|happiness|dutch lady 180ml|sometimes|grateful':'bài đời sống hoặc sữa Dutch Lady thông thường'},
}
EXACT_EQUIVALENTS = (
    ('Abbott Grow','Abbott Grow Vietnam','sữa Abbott Grow'),
    ('CaloSure America','sữa CaloSure America'),
    ('CGHL Cao Khỏe','Cô Gái Hà Lan Cao Khỏe'),('CGHL Fino','Cô Gái Hà Lan Fino'),
    ('Colos Baby','sữa ColosBaby'),('Colos Gain','sữa Colos gain'),
    ('Cô Gái Hà Lan','Dutch Lady'),
    ('Công ty Sữa IDP','Sữa Quốc tế LOF','sữa LOF IDP'),
    ('Dalatmilk Fino','Dalatmilk sữa bịch'),
    ('Ensure Gold','Ensure Gold Vietnam'),('Phô Mai con bò cười','Phô Mai con bò cười Bel','Phô Mai con bò cười Bel Vietnam'),
    ('Glico ICREO','sữa Glico ICREO'),('Glucerna','sữa Glucerna'),
    ('Growplus NutiFood','Nuti Grow Plus+','Grow Plus'),('LOF KUN','Sữa KUN'),
    ('Lothamilk','sữa Long Thành'),('Long Thành SCU','Sữa chua uống Long Thành'),
    ('Long Thành thanh trùng','sữa tươi Long Thành'),
    ('Meiji SCU Thanh trùng','Meiji sữa chua uống','Sữa chua uống Meiji'),
    ('Nestlé Yogu','Sữa chua uống Nestle Yogu'),('Nuti IQ','sữa Nuti IQ'),
    ('Oggi','sữa Oggi'),('Pediasure','Pediasure Vietnam'),
    ('Phô Mai QBB','QBB Việt Nam'),('SĐN Fami','sữa đậu nành Fami'),
    ('sữa bắp non LIF','Sữa bắp non LOF'),('Sữa tươi Dutch Lady','Sữa tươi Dutch Lady (RTD)'),
    ('TH True Formula','sữa TH true Formula'),('TH True Gold','TH True Milk Gold'),
    ('TH True HILO','TH True Milk Hilo'),('TH Fino','sữa bịch TH true Milk'),
    ('Wall\'s','kem Walls'),('Yakult','Sữa chua Yakult'),
    ('Varna Life Cao đạm','sữa tươi công thức Varna Life Cao Đạm'),
)


def fold(text):
    text = unicodedata.normalize('NFKD',text).casefold().replace('đ','d')
    return ' '.join(re.sub(r'[^a-z0-9#]+',' ',''.join(c for c in text if not unicodedata.combining(c))).split())


def core(text):
    return fold(text).replace(' cghl ',' co gai ha lan ').removesuffix(' viet nam').removesuffix(' vietnam').removesuffix(' rtd').strip()


GROUPS = {fold(name):group for group in EXACT_EQUIVALENTS for name in group}
PRODUCT_FORMS = {fold(k):v for k,v in PRODUCT_VARIANTS.items()}
PREFIX = re.compile(r'^(?:bot an dam|sua chua uong men song|sua chua uong tiet trung|sua chua uong|sua chua an|sua chua|'+
                    r'sua bot nguyen kem|sua bot tre em|sua bot|sua tuoi cong thuc|sua tuoi|sua tiet trung|sua thanh trung|'+
                    r'sua dac|sua hat|sua dau nanh|sua trai cay|sua bi ch|sua bich|sua nuoc|sua|kem|pho mai)\s+')
DESCRIPTORS = {'thanhtrung','tiettrung','muclua','nguyenkem','lengaon','men song','men song','thanh trung','tiet trung','nguyen kem',
               'len men','tre em','lua mach','trai cay','sua hat','rau cu','bap non','ngu coc','sua chua','an dam','sua dac','sua tuoi'}
BASE_BRAND = set(map(fold,('Anlene','Betagen','Dalat Milk','Dutch Lady','Friso','Fonterra','Glucerna','HiPP','Heinz','Meiji',
    'Milo','Nutifood','Nutricare','Nestlé','Nuvi','Oggi','Vinasoy','Vitadairy','Yakult','Varna','Cô Gái Hà Lan','Nutimilk',
    'Lof Malto','Abbott','TH True Milk','Sữa KUN','Pediasure','Glico','Celano','Merino','Cornetto','Bliss')))
SECTOR_MARKERS = re.compile(r'\b(?:abbott grow|similac|ensure|glucerna|nan optipro|friso gold|nuti(?:food|milk)|coloscare|'+
                            r'fristi|yomost|co gai ha lan|nutren|pha sua|chong suy dinh duong|kem bliss|sua dac)\b')


def has(text, phrase):
    if not phrase:
        return False
    return f' {phrase} ' in f' {text} '


def compact_phrase(text, phrase):
    squash = phrase.replace(' ','')
    return len(squash)>=5 and any(token.lstrip('#') == squash for token in text.split())


def matches(text, phrase):
    return has(text,phrase) or compact_phrase(text,phrase)


def target_variants(row):
    word = fold(row['keyword'])
    if word.startswith('#'):
        return {word, 'varna life cao dam'}
    choices = {word,core(word)}
    choices.update(core(x) for x in GROUPS.get(word,()))
    choices.update(PRODUCT_FORMS.get(word,()))
    if word.startswith('cghl '):
        choices.add(word.replace('cghl ','co gai ha lan ',1))
    if word=='sc betagen':
        choices.add('sua chua betagen')
    if word=='sdn nutifood':
        choices.add('sua dau nanh nutifood')
    if word=='s26 ultima':
        choices.add('s 26 ultima')
    if word=='nan supremepro':
        choices.add('nan supreme pro')
    return {p for p in choices if p}


def official_actor(word,actor):
    parent = core(word)
    parent = {'bel vietnam':'bel','bel':'bel','co gai ha lan':'dutch lady','lof kun':'kun','sua kun':'kun'}.get(parent,parent)
    known = OFFICIAL_ACTOR.get(parent,set())
    return any(actor==brand or actor.startswith(brand+' added ') or actor.startswith(brand+' is ') for brand in known)


def specifically_related(row, card):
    word = fold(row['keyword'])
    actor = fold(card['actor'])
    body = fold(card['body'])
    text = f'{actor} {body}'
    private_label = re.search(r'\b(?:spa|tham my|beauty spa|tuyen dai ly my pham)\b',actor)
    if word.startswith('#'):
        return matches(body,word) or (has(body,'varna life') and has(body,'cao dam')) or compact_phrase(body,'varna life cao dam')
    if word=='thi truong sua viet nam':
        return has(body,'thi truong sua') and (has(body,'viet nam') or has(body,'noi dia')) or has(body,'nganh sua viet nam')
    if word in {'nestle','nestle viet nam'} and (has(body,'nestle viet nam') or actor=='nestle careers'):
        return True
    phrases = target_variants(row)
    # Status reflects the requested product line. A parent-store label alone does not prove a subtype.
    if word=='enfagrow enspire' and has(text,'enfamil enspire') and not matches(body,'enfagrow enspire'):
        return False
    dairy = bool(SECTOR.search(text) or SECTOR_MARKERS.search(text))
    if word=='long thanh scu' and not dairy:
        return False
    if official_actor(word,actor):
        return True
    safe_name = not private_label and (dairy or word not in AMBIGUOUS)
    for phrase in phrases:
        if safe_name and (dairy or phrase not in AMBIGUOUS) and matches(text,phrase):
            return True
    for phrase in phrases:
        remaining = PREFIX.sub('',phrase)
        if remaining!=phrase and remaining not in BASE_BRAND and word not in AMBIGUOUS:
            # E.g. sữa Nuti IQ Gold and Nuti IQ Gold. Distinct product names survive a type prefix.
            if len(remaining.replace(' ',''))>=6 and matches(text,remaining):
                return True
        product, _, maker = remaining.rpartition(' ')
        if maker in {'nutricare','nutifood'} and len(product.replace(' ',''))>=7 and product not in BASE_BRAND and matches(text,product):
            return True
    for descriptor in DESCRIPTORS:
        if not has(word,descriptor) or not matches(text,descriptor):
            continue
        remaining = ' '.join(re.sub(r'\b'+re.escape(descriptor)+r'\b',' ',PREFIX.sub('',core(word))).split())
        remaining = remaining.removesuffix(' nutricare').removesuffix(' nutifood')
        if remaining and matches(text,remaining) and safe_name:
            return True
    return False


def content_signature(card):
    raw = re.split(r'(?i)(?:m\.me|may be an image|có thể là hình ảnh|may be an illustration)',card['body'],maxsplit=1)[0]
    stable = fold(raw).replace(' ','').replace('#','')
    return stable[:120] if len(stable)>=34 else ''


def same_post(left, right):
    if left['link'] and left['link']==right['link']:
        return True
    a,b = content_signature(left),content_signature(right)
    if not a or not b:
        return False
    length = min(len(a),len(b))
    return a[:length]==b[:length] or (length>=70 and SequenceMatcher(None,a[:length],b[:length],autojunk=False).ratio()>=.93)


def distinct(cards):
    unique = []
    for card in cards:
        if not any(same_post(card,x) for x in unique):
            unique.append(card)
    return unique


def wrong_context(row, posts):
    word = fold(row['keyword'])
    signals = WRONG_TOPICS.get(word,{})
    counts = Counter()
    unexplained = 0
    for post in posts:
        text = fold(post['actor']+' '+post['body'])
        topics = {label for patterns,label in signals.items() if any(has(text,p) for p in patterns.split('|'))}
        if not topics:
            unexplained += 1
        counts.update(topics)
    return counts,unexplained


def initial_decision(row):
    cards = distinct(row['cards'])
    hit = [c for c in cards if specifically_related(row,c)]
    n,m = len(cards),len(hit)
    signal = row['status']
    status = 'REVIEW'
    authoritative = any(official_actor(fold(row['keyword']),fold(c['actor'])) for c in hit)
    wrong,unexplained = wrong_context(row,[c for c in cards if c not in hit])
    if (m>=2 and m/n>=.40 and (not wrong or m>=n-m-unexplained)) or (m==n==1 and authoritative):
        status = 'READY'
        reason = f'{m}/{n} bài công khai trong mẫu Facebook nhắc đúng đối thủ hoặc dòng sản phẩm theo plan.'
    elif n and not m:
        if n>=3 and wrong and (n-unexplained)>=2:
            status = 'OUT_OF_SCOPE'
            reason = f'0/{n} bài đúng chủ thể. Mẫu trả kết quả về '+', '.join(wrong)+'.'
        else:
            reason = f'Chưa thấy bài nào đối chiếu được đúng chủ thể trong {n} mẫu công khai.'
            if wrong:
                reason += ' Mẫu hiện có trả bài về '+', '.join(wrong)+'.'
    elif n:
        reason = f'{m}/{n} bài công khai có bằng chứng khớp chủ thể. Mẫu còn ít hoặc lẫn chủ thể nên giữ để rà.'
    else:
        reason = {'EMPTY':'Facebook báo không tìm thấy bài cho cụm này.',
                  'NO_PUBLIC_SAMPLE':'Có khung kết quả nhưng chưa thấy bài công khai có nội dung đọc được.',
                  'UNAVAILABLE':'Facebook báo không mở được trang kết quả của cụm này.',
                  'LOAD_UNCLEAR':'Không xác nhận được nội dung trang kết quả sau khi mở.'}.get(signal,'Chưa có bài công khai đủ bằng chứng.')
    return {**{k:row[k] for k in ('key','keyword','subjects','url','checked_at')},'status':status,'reason':reason,'canonical':None,
            'sample_status':signal,'total_samples':n,'matched_samples':m,'_posts':cards,'_hits':hit}


def equivalent(row):
    value = fold(row['keyword'])
    if value.startswith('#'):
        return value
    if group := GROUPS.get(value):
        return fold(group[0])
    value = core(value)
    if value.startswith('kem '):
        return value.removeprefix('kem ')
    return value


def overlapping(left,right):
    visited = set()
    for a in left:
        match = next((i for i,b in enumerate(right) if i not in visited and same_post(a,b)),None)
        if match is not None:
            visited.add(match)
    return len(visited)


def replace_duplicates(decisions):
    groups = defaultdict(list)
    for r in decisions:
        if r['status']=='READY':
            groups[equivalent(r)].append(r)
    for rows in groups.values():
        rows.sort(key=lambda r:(-r['matched_samples'],len(r['keyword']),r['keyword'].casefold()))
        for i,base in enumerate(rows):
            if base['status']!='READY':
                continue
            for row in rows[i+1:]:
                if row['status']!='READY':
                    continue
                shared = overlapping(row['_hits'],base['_hits'])
                low,high = sorted((row['matched_samples'],base['matched_samples']))
                if (shared>=3 and shared/low>=.75 and shared/high>=.60) or shared==low==high==2:
                    row['status'] = 'ALIAS'
                    row['canonical'] = base['keyword']
                    row['reason'] = f'Cùng chủ thể với {base["keyword"]}. Hai mẫu có {shared} bài công khai cùng liên kết hoặc nội dung, trên {low} và {high} bài khớp.'


def preview():
    sampled = observations()
    rows = [initial_decision(sampled[r['key']]) for r in read_json(QUEUE) if r['key'] in sampled]
    replace_duplicates(rows)
    for row in rows:
        row['samples'] = [{'url':p['link'],'text_fingerprint':p['key'],'matches_scope':any(p is q for q in row['_hits'])}
                          for p in row.pop('_posts')]
        row.pop('_hits')
    write_json(PREVIEW,rows)
    print(json.dumps({'observed':len(rows),'decisions':Counter(r['status'] for r in rows)},ensure_ascii=False))


def apply():
    rows = read_json(PREVIEW)
    targets = read_json(QUEUE)
    samples = observations()
    keys = {r['key']:(r['keyword'],r['url']) for r in targets}
    if (len(rows)!=len(targets) or {r['key']:(r['keyword'],r['url']) for r in rows}!=keys
        or any(samples.get(r['key'],{}).get('checked_at')!=r['checked_at'] for r in rows)):
        raise RuntimeError('Decision list does not cover the original 316 items')
    names = {r['keyword']:r for r in rows}
    with closing(catalog(write=True)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        with db:
            db.execute('BEGIN IMMEDIATE')
            for r in rows:
                canonical = r['canonical']
                if (r['status']=='ALIAS' and names.get(canonical,{}).get('status')!='READY'
                    or r['status'] not in {'READY','ALIAS','OUT_OF_SCOPE','REVIEW'}):
                    raise RuntimeError('Invalid decision for '+r['keyword'])
                changed = db.execute('''UPDATE keyword_platform_audit SET status=?,canonical_keyword=?,reason=?,
                    sample_status=?,checked_at=?,samples_json=? WHERE platform='facebook' AND project_name=?
                    AND keyword=? AND status='NOT_CHECKED'
                    AND EXISTS(SELECT 1 FROM keywords k WHERE k.project_name=keyword_platform_audit.project_name
                      AND k.keyword=keyword_platform_audit.keyword AND k.level=2 AND k.status='READY')''',
                    (r['status'],canonical,r['reason'],'CHROME_PUBLIC_'+r['sample_status'],r['checked_at'],
                     json.dumps(r['samples'],ensure_ascii=False),PROJECT,r['keyword'])).rowcount
                if changed!=1:
                    raise RuntimeError('Catalog changed since the staged review: '+r['keyword'])
            if db.execute('PRAGMA quick_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
                raise RuntimeError('Catalog integrity check failed')
        update_summaries(db)
        platform_totals = dict(db.execute(f'''SELECT a.status,count(*) FROM keywords k JOIN keyword_platform_audit a
                        USING(project_name,keyword) WHERE {SCOPE} GROUP BY a.status''',(PROJECT,)))
    report = {'project':PROJECT,'platform':'facebook','level':2,'checked':len(rows),'rechecked':sum(bool(r.get('rechecked_at')) for r in samples.values()),
              'decisions':dict(Counter(r['status'] for r in rows)),
              'sample_outcomes':dict(Counter(r['sample_status'] for r in rows)),'total_platform_status':platform_totals}
    write_json(DECISIONS,rows)
    write_json(REPORT,report)
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=('preview','apply'))
    args = parser.parse_args()
    (preview if args.mode=='preview' else apply)()
