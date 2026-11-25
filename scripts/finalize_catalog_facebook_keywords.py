"""Apply observed Facebook evidence per project and keep unobserved searches pending."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
import json
import re
import unicodedata

from collect_catalog_platform_audit import read_json, write_json
from deduplicate_catalog_keywords import query_key, update_summaries
from finalize_vinamilk_facebook_search import distinct, overlapping
from review_catalog_facebook_keywords import ACTIVE, OUTPUT, QUEUE, REPORT, catalog, progress, stage_db

DECISIONS = OUTPUT / 'decisions.json'
SAMPLE_PREFIX = 'CHROME_ACTIVE_KEYWORDS_'
CONTEXTS = {
    'bank': re.compile(r'\b(?:ngan hang|bank|acbbank|vpbank|tai khoan|tin dung|the ghi no|thanh toan|lai suat|tiet kiem|tai chinh)\b'),
    'hospital': re.compile(r'\b(?:benh vien|hospital|phong kham|bac si|tiem chung|kham benh|san phu khoa|thai san|y khoa|y te)\b'),
    'broker': re.compile(r'\b(?:chung khoan|broker|co phieu|vn index|thi truong|giao dich|quan ly quy|nha dau tu)\b'),
    'development': re.compile(r'\b(?:du an|bat dong san|can ho|chung cu|nha pho|khu do thi|chu dau tu|residence|capitaland)\b'),
    'restaurant': re.compile(r'\b(?:nha hang|am thuc|restaurant|buffet|lau|mon an|nha bep|quan an|thuc don|bbq|ban an)\b'),
    'dairy': re.compile(r'\b(?:sua|dairy|milk|kem|bo sua|dinh duong|nutrition|bot an dam|yogurt|yoghurt|men song|vinamilk|nutifood)\b'),
    'transport': re.compile(r'\b(?:xe khach|oto|o to|tuyen xe|goi xe|tai xe|dat xe|van tai|bus|van|chuyen xe)\b'),
    'cosmetics': re.compile(r'\b(?:my pham|cosmetics|beauty|cham soc da|trang diem|makeup|skincare|son|sua rua mat|da|kem chong nang)\b'),
}
CAREFUL = {
    'cake':'bank','app cake':'bank','#cake':'bank','c a k e':'bank','define':'development','define residence':'development',
    'benh vien hanh phuc':'hospital','bv hanh phuc':'hospital','hanh phuc':'hospital','hoan my':'hospital',
    'rohto':'cosmetics','kao':'cosmetics','3ce':'cosmetics','bioderma':'cosmetics','son':'cosmetics','anessa':'cosmetics',
    'hsc':'broker','hsc 2026':'broker','ssi':'broker','vps':'broker','acbs':'broker','mirae asset':'broker',
    'acb':'bank','bidv':'bank','vib':'bank','nab':'bank','scb':'bank','mb':'bank','ocb':'bank','abb':'bank','acbbank':'bank',
    'vpbank':'bank','agribank':'bank','msb':'bank','timo':'bank','cake by vpbank':'bank','tpbank':'bank','shb':'bank',
    'green farm':'dairy','hero':'dairy','susu':'dairy','su su':'dairy','vnm':'dairy','probi':'dairy','icy':'dairy',
    'optimum':'dairy','organic gold':'dairy','twin cows':'dairy','ong tho':'dairy','enfa':'dairy','moc chau':'dairy',
    'nha hang define':'restaurant','ashima':'restaurant','hutong':'restaurant','daruma':'restaurant','kpub':'restaurant',
    'gaz':'transport','futa':'transport','green sm':'transport','xanh sm':'transport',
}
GENERIC = {'official','vietnam','viet nam','group','tap doan','cong ty','thuong hieu','main','topic','project','sua','du an',
           'khuyen mai','ho tro','tin tuc','tai khoan','event','services','hospital','nganh','dinh duong','qua tang','ngan hang'}
NAME_PREFIX = re.compile(r'^(?:ngan hang(?: so)?|cong ty co phan|cong ty tnhh|ctcp|tap doan|benh vien|b v|bv|nha hang|anh ngu)\s+')
NAME_SUFFIX = re.compile(r'\s+(?:vn|vietnam|viet nam|bank)$')
ACTOR_WITHOUT_SECTOR = {'agribank','vietcombank','techcombank','vietinbank','vietcapital','vikkibank','acbbank',
                        'topzone','omoda','geely','cognita','cellphones','mo mo','momo','viettelpost'}
RELATED_ACTORS = {
    ('Cake','cake'):{'cake by vpbank','ngan hang so cake by vpbank','cake digital bank'},
    ('Golden Gate Group','kpub'):{'k pub','k pub korean grill pub','kpub'},
    ('BIDV','bidv'):{'bidv','bidv viet nam','bidv smartbanking'},
    ('ACBS','acbs'):{'chung khoan acb acbs'},
    ('Vinamilk','vinamilk'):{'vinamilk','vinamilk shop more'},
    ('Enfa','enfa'):{'enfa a smart club'},
    ('Bánh Givral','banh givral'):{'givral bakery'},
}
PROJECT_TERMS = {
    ('ACBS - Báo Cáo Năm 2026','acbs cham thong tin'):('cham thong tin',),
    ('ACV - Tổng Công ty cảng hàng không Việt Nam','tong cong ty cang hang khong viet nam acv'):
        ('tong cong ty cang hang khong viet nam',),
    ('Bánh Givral','banh givral'):('givral bakery',),
    ('Cognita School','ishcmc'):('international school ho chi minh city',),
}
WRONG = {
    ('Cake','cake'):{'tiem banh|banh kem|banh sinh nhat|baking|birthday cake|cake shop':'bánh và cửa hàng bánh'},
    ('CapitaLand','define'):{'damwon|define your|define yourself|meaning|definition':'nội dung dùng từ define hoặc chủ thể khác'},
    ('Báo Nhân Dân','bao nhan dan'):{'bao cong an nhan dan|bao quan doi nhan dan':'Báo Công an nhân dân hoặc Báo Quân đội nhân dân'},
    ('Vinamilk','hero'):{'game|marvel|superhero|sieu anh hung|mobie legends|mobile legends':'trò chơi hoặc siêu anh hùng'},
    ('Vinamilk','icy'):{'icy ve|ice cream|cute ice|ice on|duong dong bang':'nội dung khác dùng từ ICY'},
    ('Vinamilk','moc chau'):{'du lich|check in|homestay|cao nguyen|san may|nghi duong':'du lịch Mộc Châu'},
    ('Vinamilk','vnm'):{'vietnam|shipping|vtv':'nội dung khác dùng chữ viết tắt VNM'},
    ('Gaz Vietnam','kim long 99'):{'ly kim long|bai sau vung tau':'bài về cá nhân cùng tên Kim Long'},
    ('Gaz Vietnam','kim long hue'):{'ly kim long|bai sau vung tau':'bài về cá nhân cùng tên Kim Long'},
    ('Gaz Vietnam','dai ly kim long'):{'ly kim long|bai sau vung tau':'bài về cá nhân cùng tên Kim Long'},
    ('NAB','sap vietnam'):{'visit vietnam|tour|du lich|aeon|when in vietnam':'trang du lịch hoặc doanh nghiệp khác ngoài SAP'},
}


def normalized(text):
    value=[]
    latin=False
    for c in unicodedata.normalize('NFKD',text).casefold().replace('đ','d'):
        category=unicodedata.category(c)
        if category.startswith('M'):
            if not latin:
                value.append(c)
        else:
            latin='LATIN' in unicodedata.name(c,'')
            value.append(c if c.isalnum() or c=='#' else ' ')
    return ' '.join(unicodedata.normalize('NFC',''.join(value)).split())


def has(text, phrase):
    if not phrase:
        return False
    if f' {phrase} ' in f' {text} ':
        return True
    compact=phrase.replace(' ','').lstrip('#')
    if len(compact)<4:
        return False
    tokens=[word.lstrip('#') for word in text.split()]
    for pos,token in enumerate(tokens):
        if not token or not compact.startswith(token):
            continue
        if token==compact:
            return True
        assembled=token
        for extra in tokens[pos+1:pos+6]:
            assembled+=extra
            if assembled==compact:
                return True
            if not compact.startswith(assembled):
                break
    return False


def scope_for(project, q, subjects):
    subject=[s for raw in subjects for s in [normalized(raw.replace('_',' '))] if s and s not in GENERIC]
    text=normalized(project)+' '+' '.join(subject)
    explicit=CAREFUL.get(q) or CAREFUL.get(q.removeprefix('#'))
    if not explicit and len(q.replace(' ','').removeprefix('#'))<=4:
        explicit=next((k for k,pat in CONTEXTS.items() if pat.search(text)),None)
    return subject, CONTEXTS.get(explicit)


def target_match(data, target, cards):
    keyword=data['keyword']
    phrase=normalized(keyword)
    project=target['project']
    subjects,scope=scope_for(project,phrase,target['subjects'])
    known=RELATED_ACTORS.get((project,phrase),set())
    rare=[s for s in subjects if len(s.replace(' ',''))>=6 and s not in GENERIC]
    qparts=set(phrase.lstrip('#').split())-GENERIC
    if not qparts:
        return [],0
    aliases={s for s in rare if query_key(s)==query_key(keyword.removeprefix('#'))}
    aliases.update(PROJECT_TERMS.get((project,phrase),()))
    locale_body=phrase.removesuffix(' viet nam').removesuffix(' vietnam')
    bare_alias=NAME_SUFFIX.sub('',NAME_PREFIX.sub('',phrase))
    if bare_alias!=phrase and len(bare_alias.replace(' ',''))>=5 and bare_alias not in GENERIC and not keyword.startswith('#'):
        # A shorter company name needs an explicit plan subject or sector support in the result.
        names={NAME_SUFFIX.sub('',NAME_PREFIX.sub('',s)) for s in rare}
        if bare_alias in names:
            aliases.add(bare_alias)
    domain_label=normalized(keyword.rsplit('.',1)[0]) if re.search(r'\.(?:vn|com)$',keyword,re.I) else None
    hits=[]
    official=0
    for post in cards:
        actor=normalized(post['actor'])
        body=normalized(post['body'])
        text=actor+' '+body
        if actor in known:
            hits.append(post)
            official+=1
            continue
        official_title=next((x for x in ACTOR_WITHOUT_SECTOR if has(actor,x) and (has(phrase,x) or has(domain_label or '',x))),None)
        if scope and not scope.search(text) and not official_title and not any(has(text,x) for x in rare if not has(phrase,x)):
            continue
        local_language=bool(re.search(r'[ăâêôơưđ]',post['body'].casefold()) or 'viet nam' in actor)
        if (has(text,phrase) or (phrase.startswith('#') and has(text,phrase[1:])) or any(has(text,x) for x in aliases)
            or (local_language and locale_body!=phrase and len(locale_body.replace(' ',''))>=6 and has(text,locale_body))
            or (domain_label and (actor==domain_label or actor.startswith(domain_label+' viet nam')))
            or (official_title and phrase.lstrip('#') in {official_title,official_title+' viet nam',official_title+' vietnam'})):
            hits.append(post)
            continue
        # Preserve the named product/campaign modifier when the plan subjects name only a parent brand.
        if len(qparts)>=2 and any(has(text,s) and set(s.split())<=qparts and
                                  all(has(body,x) for x in qparts-set(s.split())) for s in rare):
            hits.append(post)
    return hits,official


def wrong_scope(keyword,project,cards):
    patterns=WRONG.get((project,normalized(keyword)),{})
    labels=set()
    matched=0
    for card in cards:
        text=normalized(card['actor']+' '+card['body'])
        found={label for pattern,label in patterns.items() if any(has(text,p) for p in pattern.split('|'))}
        if found:
            labels.update(found)
            matched+=1
    return matched, sorted(labels)


def classify(item,data,target):
    cards=distinct(data['cards'])
    hits,official=target_match(data,target,cards)
    count,good=len(cards),len(hits)
    bad,alternatives=wrong_scope(item['keyword'],target['project'],[c for c in cards if c not in hits])
    status='REVIEW'
    if (good>=2 and good/count>=.5 and good>=bad) or (good==count==1 and official):
        status='READY'
        reason=f'{good}/{count} bài công khai trong mẫu Facebook khớp cụm tìm, chủ thể hoặc dòng sản phẩm trong plan của project.'
    elif not good and count>=2 and bad>=max(2,(count+1)//2):
        status='OUT_OF_SCOPE'
        reason=f'0/{count} bài khớp chủ thể của project. Mẫu chủ yếu về '+', '.join(alternatives)+'.'
    elif count:
        reason=f'{good}/{count} bài công khai đủ bằng chứng khớp chủ thể của project.'
        if alternatives:
            reason+=' Một phần mẫu trả về '+', '.join(alternatives)+'.'
        reason+=' Giữ để rà vì mẫu còn ít, lẫn chủ thể hoặc chưa thể phân biệt rõ.'
    else:
        reason={'EMPTY':'Facebook báo không tìm thấy bài cho cụm này.',
                'NO_PUBLIC_SAMPLE':'Có khung kết quả nhưng chưa đọc được nội dung bài công khai.',
                'UNAVAILABLE':'Facebook báo không mở được trang kết quả của cụm này.',
                'OK':'Không đủ nội dung công khai để đối chiếu chủ thể.'}.get(data['status'],'Chưa xác nhận được trang kết quả.')
    return {**target,'key':item['key'],'keyword':item['keyword'],'url':item['url'],'status':status,'reason':reason,
            'canonical':None,'sample_status':data['status'],'checked_at':data['checked_at'],
            'total_samples':count,'matched_samples':good,'_hits':hits,'_posts':cards}


def fingerprint(row):
    key=query_key(row['keyword'])
    # Each alias group is scoped to the project, Level and the same complete keyword after spelling normalization.
    return row['project'],row['level'],key


def equivalent_name(row):
    term=normalized(row['keyword'])
    if term.startswith('#'):
        return fingerprint(row)
    term=re.sub(r'^(?:cong ty co phan|cong ty tnhh|tap doan|ctcp|ngan hang|benh vien|b v|bv|cua hang|nha hang)\s+','',term)
    term=re.sub(r'\s+(?:vietnam|viet nam|bank)$','',term)
    return row['project'],row['level'],query_key(term)


def merge_exact_spelling(rows):
    by_scope=defaultdict(list)
    for r in rows:
        if r['status']=='READY':
            by_scope[fingerprint(r)].append(r)
    for group in by_scope.values():
        group.sort(key=lambda r:(-r['matched_samples'],len(r['keyword']),r['keyword'].casefold()))
        for pos,base in enumerate(group):
            if base['status']!='READY':
                continue
            for alt in group[pos+1:]:
                if alt['status']!='READY':
                    continue
                anchors={query_key(s) for s in base['subjects']} & {query_key(s) for s in alt['subjects']}
                shared=overlapping(base['_hits'],alt['_hits']) if anchors else 0
                n,m=sorted((base['matched_samples'],alt['matched_samples']))
                if shared>=3 and shared/n>=.75 and shared/m>=.60:
                    alt.update(status='ALIAS',canonical=base['keyword'],
                               reason=f'Cùng chủ thể và cách viết tương đương {base["keyword"]}. Hai mẫu có {shared} bài cùng liên kết hoặc nội dung.')


def assemble():
    queue=read_json(QUEUE)
    with closing(stage_db()) as db:
        samples={key:json.loads(data) for key,data in db.execute("SELECT key,data FROM samples WHERE state<>'LOAD_UNCLEAR'")}
    rows=[classify(item,samples[item['key']],t) for item in queue if item['key'] in samples for t in item['targets']]
    merge_exact_spelling(rows)
    for r in rows:
        r['samples']=[{'url':c['link'],'text_fingerprint':c['key'],'matches_scope':any(c is p for p in r['_hits'])}
                      for c in r.pop('_posts')]
        r.pop('_hits')
    return rows


def apply(rows):
    with closing(stage_db()) as stage:
        finished={(k,p) for k,p in stage.execute('SELECT key,project FROM applied')}
    pending=[r for r in rows if (r['key'],r['project']) not in finished]
    outcomes=[]
    with closing(catalog(write=True)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        with db:
            db.execute('BEGIN IMMEDIATE')
            for r in pending:
                stored=db.execute(f'''SELECT k.status AS catalog_status,k.level,a.status,a.sample_status,a.checked_at,a.reason
                    FROM keywords k JOIN projects p USING(project_name)
                    LEFT JOIN keyword_platform_audit a ON a.project_name=k.project_name AND a.keyword=k.keyword AND a.platform='facebook'
                    WHERE {ACTIVE} AND k.project_name=? AND k.keyword=?''',(r['project'],r['keyword'])).fetchone()
                if not stored or stored['catalog_status']!=r['catalog_status'] or stored['level']!=r['level']:
                    continue
                if stored['sample_status']==SAMPLE_PREFIX+r['sample_status'] and stored['checked_at']==r['checked_at']:
                    if stored['status']!=r['status'] or stored['reason']!=r['reason']:
                        continue
                elif stored['status']!=r['platform_status']:
                    continue
                else:
                    db.execute('''INSERT INTO keyword_platform_audit(project_name,keyword,platform,status,canonical_keyword,reason,
                        search_url,sample_status,checked_at,samples_json) VALUES (?,?,'facebook',?,?,?,?,?,?,?)
                        ON CONFLICT(project_name,keyword,platform) DO UPDATE SET status=excluded.status,
                        canonical_keyword=excluded.canonical_keyword,reason=excluded.reason,search_url=excluded.search_url,
                        sample_status=excluded.sample_status,checked_at=excluded.checked_at,samples_json=excluded.samples_json''',
                        (r['project'],r['keyword'],r['status'],r['canonical'],r['reason'],r['url'],SAMPLE_PREFIX+r['sample_status'],
                         r['checked_at'],json.dumps(r['samples'],ensure_ascii=False)))
                outcomes.append(r)
            if db.execute('PRAGMA quick_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
                raise RuntimeError('Keyword catalog integrity check failed')
        if outcomes:
            update_summaries(db)
    with closing(stage_db()) as stage, stage:
        stage.executemany('INSERT OR IGNORE INTO applied VALUES (?,?,?)',
                          ((r['key'],r['project'],json.dumps(r,ensure_ascii=False)) for r in outcomes))
    return len(outcomes),len(pending)-len(outcomes)


def refine_review(rows):
    """Upgrade earlier conservative decisions using the same captured scope evidence."""
    with closing(stage_db()) as stage:
        previous={(k,p):json.loads(data) for k,p,data in stage.execute('SELECT key,project,data FROM applied')}
    candidates=[]
    for r in rows:
        old=previous.get((r['key'],r['project']))
        if old and old['status']=='REVIEW' and r['status'] in {'READY','OUT_OF_SCOPE'}:
            candidates.append(r)
    updated=[]
    with closing(catalog(write=True)) as db,db:
        db.execute('BEGIN IMMEDIATE')
        for r in candidates:
            changed=db.execute('''UPDATE keyword_platform_audit SET status=?,reason=?,samples_json=?
                WHERE project_name=? AND keyword=? AND platform='facebook' AND status='REVIEW'
                  AND sample_status=? AND checked_at=?''',
                (r['status'],r['reason'],json.dumps(r['samples'],ensure_ascii=False),r['project'],r['keyword'],
                 SAMPLE_PREFIX+r['sample_status'],r['checked_at'])).rowcount
            if changed or db.execute('''SELECT 1 FROM keyword_platform_audit WHERE project_name=? AND keyword=?
                AND platform='facebook' AND status=? AND sample_status=? AND checked_at=? AND reason=?''',
                (r['project'],r['keyword'],r['status'],SAMPLE_PREFIX+r['sample_status'],r['checked_at'],r['reason'])).fetchone():
                updated.append(r)
    if updated:
        with closing(catalog()) as db:
            update_summaries(db)
        with closing(stage_db()) as stage,stage:
            stage.executemany('UPDATE applied SET data=? WHERE key=? AND project=?',
                              ((json.dumps(r,ensure_ascii=False),r['key'],r['project']) for r in updated))
    return len(updated)


def reconcile_sampled_aliases():
    """Compare supported variants after both searches were observed and written to the catalog."""
    with closing(stage_db()) as stage:
        applied={(key,project):json.loads(data) for key,project,data in stage.execute('SELECT key,project,data FROM applied')}
        observations={key:json.loads(data) for key,data in stage.execute('SELECT key,data FROM samples')}
    grouped=defaultdict(list)
    for identity,row in applied.items():
        if row['status']=='READY' and row['matched_samples']>=3 and equivalent_name(row)[2]:
            grouped[equivalent_name(row)].append(row)
    updates=[]
    with closing(catalog(write=True)) as db, db:
        db.execute('BEGIN IMMEDIATE')
        for group in grouped.values():
            if len(group)<2:
                continue
            group.sort(key=lambda r:(-r['matched_samples'],len(r['keyword']),r['keyword'].casefold()))
            receipts={r['key']:[c for c,e in zip(distinct(observations[r['key']]['cards']),r['samples']) if e['matches_scope']]
                      for r in group}
            for i,base in enumerate(group):
                if base['status']!='READY':
                    continue
                for alt in group[i+1:]:
                    if alt['status']!='READY' or not {query_key(s) for s in base['subjects']} & {query_key(s) for s in alt['subjects']}:
                        continue
                    a,b=receipts[base['key']],receipts[alt['key']]
                    if not a or not b:
                        continue
                    shared=overlapping(a,b)
                    if shared<3 or shared/min(len(a),len(b))<.75 or shared/max(len(a),len(b))<.70:
                        continue
                    reason=f'Cùng chủ thể với {base["keyword"]}. Hai mẫu có {shared} bài cùng liên kết hoặc nội dung, trên {len(a)} và {len(b)} bài khớp.'
                    changed=db.execute('''UPDATE keyword_platform_audit SET status='ALIAS',canonical_keyword=?,reason=?
                        WHERE project_name=? AND keyword=? AND platform='facebook' AND status='READY' AND checked_at=?
                          AND EXISTS(SELECT 1 FROM keyword_platform_audit k WHERE k.project_name=? AND k.keyword=?
                                     AND k.platform='facebook' AND k.status='READY')''',
                        (base['keyword'],reason,alt['project'],alt['keyword'],alt['checked_at'],base['project'],base['keyword'])).rowcount
                    if changed:
                        alt.update(status='ALIAS',canonical=base['keyword'],reason=reason)
                        updates.append(alt)
    if updates:
        with closing(catalog()) as db:
            update_summaries(db)
        with closing(stage_db()) as stage,stage:
            stage.executemany('UPDATE applied SET data=? WHERE key=? AND project=?',
                              ((json.dumps(r,ensure_ascii=False),r['key'],r['project']) for r in updates))
    return len(updates)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=('preview','apply','refine','reconcile','report'))
    args=parser.parse_args()
    if args.mode=='preview':
        rows=assemble()
        write_json(OUTPUT/'preview.json',rows)
        print(json.dumps({'sampled_pairs':len(rows),'statuses':Counter(r['status'] for r in rows)},ensure_ascii=False))
        return
    if args.mode=='apply':
        new,conflicts=apply(assemble())
        print(json.dumps({'newly_applied':new,'conflicts':conflicts}))
    if args.mode=='refine':
        print(json.dumps({'evidence_based_upgrades':refine_review(assemble())}))
    if args.mode=='reconcile':
        print(json.dumps({'overlapping_queries_merged':reconcile_sampled_aliases()}))
    with closing(stage_db()) as db:
        decisions=[json.loads(data) for data, in db.execute('SELECT data FROM applied ORDER BY project,cast(key AS INTEGER)')]
    per_project=defaultdict(Counter)
    per_level=defaultdict(Counter)
    for r in decisions:
        per_project[r['project']][r['status']]+=1
        per_level[r['level']][r['status']]+=1
    report={**progress(),'decisions':dict(Counter(r['status'] for r in decisions)),
            'by_project':dict(per_project),'decisions_by_level':dict(per_level)}
    write_json(DECISIONS,decisions)
    write_json(REPORT,report)
    print(json.dumps({k:v for k,v in report.items() if k!='by_project'},ensure_ascii=False))


if __name__=='__main__':
    main()
