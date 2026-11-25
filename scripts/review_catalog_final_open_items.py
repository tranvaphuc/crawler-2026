"""Compare the final keyword review cohort with its workbook cells and channel evidence."""

import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import re
import sqlite3

import review_catalog_scope_followup as prior
import review_catalog_facebook_keywords as facebook
from finalize_catalog_facebook_keywords import classify as facebook_assess
from audit_full_plan_contents import CREDENTIAL_TEXT
from collect_catalog_platform_audit import OUT as AUDIT_ROOT
from reconcile_plan_keywords_deep import UNSAFE_TEXT


OUT = AUDIT_ROOT / 'remaining-review'
INPUT = OUT / 'keyword-input.json'
RESULTS = OUT / 'keyword-decisions.json'
LEVEL_INPUT = OUT / 'level-input.json'
FB_QUEUE = OUT / 'facebook-search-queue.json'
FB_DB = OUT / 'facebook-search.sqlite'

# Explicit project decisions are anchored to workbook sections reopened for this audit.
CLONED_NUTIFOOD = {'VinWonders', 'Galaxy Cinema', 'M-Village', 'ECCO Factory 2026', 'Campaign FluMist'}
GAZ_INDUSTRY = {'cho thue xe 16 chỗ', 'tải nhỏ', 'thue xe 16', 'thue xe 16 cho'}
MISS_COMPETITOR = {'D22', 'D23', 'D25'}
CHANNELS = ('facebook', 'youtube', 'news')
FACEBOOK_DISTINGUISHERS = {
    ('Be App','Be'): r'\b(?:app be|ung dung be|be bike|be food|befood|be car|becar|be group|taixe.?be|tai xe be)\b',
    ('C.P Việt Nam (SmartCom)','CPVN'): r'\b(?:c\.?p\.? viet nam|cpv food|chan nuoi c\.?p|thuc pham c\.?p)\b',
    ('C.P Việt Nam (SmartCom)','CPV'): r'\b(?:c\.?p\.? viet nam|cpv food|chan nuoi c\.?p|thuc pham c\.?p)\b',
    ('C.P Việt Nam (SmartCom)','five star'): r'\b(?:c\.?p\.? viet nam|ga ran|xuc xich|five star ga)\b',
    ('Central Retail','Lotte'): r'\blotte\s*mart\b',
    ('ACBS - Báo Cáo Năm 2025','CTS'): r'\b(?:chung khoan|vietinbank securities|thi truong co phieu)\b',
    ('Golden Gate Group','Bia Ơi'): r'\b(?:bia\s*oi\s*ha\s*noi|biaoi\.official|co day co voi)\b',
    ('Nghỉ dưỡng Alma','alma'): r'\b(?:alma resort|alma cam ranh|alma nha trang|nghi duong alma)\b',
    ('SCG','VKPC'): r'\b(?:vina kraft paper|vina kraft|giay vina kraft)\b',
}


def provenance(original):
    if isinstance(original, list):
        for entry in original:
            yield from provenance(entry)
    if not isinstance(original, dict):
        return
    if all(original.get(k) for k in ('plan_url', 'sheet', 'cell')):
        yield {k: original[k] for k in ('plan_url', 'sheet', 'cell')}
    plans = original.get('plans', [])
    if len(plans) == 1:
        for origin in original.get('origins', []):
            match = re.fullmatch(r"(.+)!([A-Z]+\d+)", origin)
            if match:
                yield dict(plan_url=plans[0], sheet=match[1].strip("'"), cell=match[2])
    for key in ('evidence', 'refs', 'origins', 'originals'):
        value = original.get(key)
        if isinstance(value, (dict, list)):
            yield from provenance(value)


def extract(db):
    marks = ','.join('?' for _ in prior.ACTIVE)
    sql = f"""SELECT k.project_name,k.keyword,k.level,k.subjects_json,k.originals_json
              FROM keywords k JOIN projects p USING(project_name)
              WHERE lower(trim(p.plan_status)) IN ({marks}) AND k.status='REVIEW'
              ORDER BY k.project_name,k.keyword"""
    active = db.execute(sql, tuple(prior.ACTIVE)).fetchall()
    levels = [r for r in map(json.loads, prior.RESULTS.open(encoding='utf8'))
              if r['outcome'] == 'LEVEL_UNCONFIRMED']
    prior_refs = {(r['project'], prior.query_key(r['keyword'])): r.get('references', [])
                  for r in prior.read_json(prior.INPUT)}
    unique_refs = defaultdict(lambda: defaultdict(list))
    rows = []
    for project, word, level, subjects, originals in active:
        refs = set()
        key = prior.query_key(word)
        for ref in [*provenance(json.loads(originals)), *prior_refs.get((project, key), [])]:
            ident = prior.evidence_id(ref['plan_url'])
            location = (ident, ref['sheet'], ref['cell'])
            if ident and location not in refs:
                refs.add(location)
                unique_refs[ident][ref['sheet']].append((len(rows), ref))
        rows.append(dict(project=project, keyword=word, level=level, subjects=json.loads(subjects),
                         references=[], source_references=len(refs), group='catalog_review'))

    books = dict(prior.workbook_inputs(db))
    for ident, sheets in unique_refs.items():
        book = books.get(ident)
        if not book or not book['file'] or not Path(book['file']).is_file():
            continue
        for sheet in prior.read_book(book['file'], lambda n: n in sheets):
            is_result = prior.is_result_sheet(sheet['rows'])
            for idx, ref in sheets[sheet['name']]:
                item = rows[idx]
                if item['project'] not in book['projects']:
                    continue
                if is_result:
                    item['result_references'] = item.get('result_references', 0) + 1
                    continue
                match = re.fullmatch(r'([A-Z]+)(\d+)', ref['cell'])
                if not match:
                    continue
                cell = sheet['rows'].get(int(match[2]), {}).get(match[1], {})
                for field in ('text', 'note'):
                    value = cell.get(field, '')
                    if not value:
                        continue
                    terms = prior.cell_terms(item['project'], value, 'main')
                    key = prior.query_key(item['keyword'])
                    if (any(prior.query_key(w) == key for w in terms)
                            or (key == 'hsx' and re.fullmatch(r'HOSE\s*\(HSX\)',value.strip(),re.I))):
                        item['references'].append({k:ref[k] for k in ('plan_url','sheet','cell')} |
                                                  {'field':field,'copy':book['copy_status']})
                        break
    prior.write_json(INPUT, rows)
    prior.write_json(LEVEL_INPUT, levels)
    return rows, levels


def level_resolution(item):
    p, sheet, cell, word = (item[k] for k in ('project', 'sheet', 'cell', 'keyword'))
    if p in CLONED_NUTIFOOD and sheet == 'Đối tượng nghiên cứu':
        return None, 'OUT_OF_SCOPE', 'B1 ghi Đối tượng nghiên cứu - Nutifood. D7 và D23 thuộc khối sản phẩm Nutifood sao chép vào plan.'
    if p == 'Gaz Vietnam' and word in GAZ_INDUSTRY:
        return 2, 'REVIEW', 'F2/I2 là nhóm từ ngành xe tải nhỏ và xe 16 chỗ. Mẫu YouTube thiên về dịch vụ thuê xe hoặc phim hoạt hình, thiếu dấu hiệu theo dõi xe GAZ hay đối thủ chỉ định.'
    if p == 'Ngành tài chính' and sheet == 'Bộ Keywords Brand chính':
        return 1, 'ENABLE', 'Brand list cột D/E ghi Main brand / Home Credit. Hai ô B9/B15 nằm trong MAIN KEYWORD.'
    if p == 'Tasco' and (sheet,cell)==('Từ khóa','B22'):
        return 1, 'ENABLE', 'Danh sách topic dòng 22 gán CMC / Tasco. Updated_Từ khóa dòng 11 ghi CMC là chủ thể theo dõi của Tasco.'
    if p == 'Enfa' and cell == 'C4':
        return 2, 'ENABLE', 'Dòng 2 là thương hiệu chính Enfa, dòng 4 nêu NAN với mô tả Sữa mát Thụy Sĩ.'
    if p == 'Masterise Homes 2026' and sheet == 'Trang tính1':
        return 2, 'ENABLE', 'A39 mở khối Khang Dien 2026. Các ô B39/B44/B54 cùng thuộc khối Khang Điền.'
    if p == 'Miss Cosmo 2026' and sheet == 'Keywords MCVN2025':
        if cell in MISS_COMPETITOR:
            if word == 'hoa hậu việt nam':
                return 2, 'REVIEW', 'D25 là nhóm đối thủ Sen Vàng. Mẫu News lẫn các bài chỉ nói về người mang danh hiệu ở nhiều mùa.'
            return 2, 'ENABLE', 'D18 ghi Ngành - đối thủ, C22/C23/C25 xác định cuộc thi hoặc đơn vị tổ chức của từng ô.'
        if cell == 'D11':
            return 1, 'REVIEW', 'B3 nêu Hoa Hậu Hoàn Vũ Việt Nam - Miss Cosmo Vietnam. Mẫu YouTube mở đầu bằng nội dung Miss Universe Vietnam 2022, trước giai đoạn được plan theo dõi.'
    if p == 'Suzuki 2026' and sheet == 'Keyword & Source':
        return 2, 'ENABLE', 'B57 mở khối MG 2026, B2 là Suzuki. Các ô C60–C68 là mẫu xe trong khối MG.'
    if p == 'ShopeePay' and (sheet,cell)==('Kw VTS','J3'):
        return 2, 'ENABLE', 'A1 là ShopeePay. J1 là MoMo, J2 ghi Main kw của MoMo và J3 liệt kê ví trả sau momo.'
    raise ValueError((p, sheet, cell, word))


def stored_channels(db):
    checks = defaultdict(dict)
    cols = 'project_name,keyword,platform,status,reason,search_url,sample_status,checked_at,samples_json,canonical_keyword'
    for project, word, channel, status, reason, url, sample, checked, evidence, canonical in db.execute(
            f'SELECT {cols} FROM keyword_platform_audit'):
        checks[(project, word)][channel] = dict(status=status, reason=reason, search_url=url, sample_status=sample,
                                                observed_at=checked, samples=json.loads(evidence or '[]'),
                                                canonical_keyword=canonical)
    return checks


def verify_facebook(item, sample):
    project, word = item['project'], item['keyword']
    dec = facebook_assess(sample,sample,{'project':project,'subjects':item['subjects'],'level':item['level']})
    status, reason = dec['status'], dec['reason']
    hits = dec['_hits']
    context = FACEBOOK_DISTINGUISHERS.get((project,word))
    if project.startswith('ACBS') and word=='VND':
        context = r'\b(?:vndirect|vn direct|chung khoan vnd|co phieu vnd|ma vnd)\b'
    if word.startswith('#'):
        tag = prior.query_key(word)
        hits = [c for c in hits if any(prior.query_key(t)==tag for t in re.findall(r'#[\w]+',c['body']))]
        if status=='READY' and (not hits or len(tag)<=4 and len(hits)<2):
            status,reason = 'REVIEW','Chưa thấy đủ bài công khai có nguyên hashtag và đúng chủ thể.'
    if status=='READY' and context:
        hits = [c for c in hits if re.search(context,prior.fold(c['actor']+' '+c['body']))]
        if len(hits)<2 or len(hits)*2<dec['total_samples']:
            status,reason = 'REVIEW','Mẫu tìm lẫn tên viết tắt hoặc chủ thể khác. Chưa đủ bài công khai xác nhận đúng chủ thể trong plan.'
    if status=='READY' and project=='Vinmec' and any(r['sheet']=='Sức khoẻ tinh thần' for r in item['references']):
        status,reason = 'REVIEW','Mẫu là bài y khoa về triệu chứng chung. Ô gốc nằm trong phạm vi Sức khoẻ tinh thần.'
    if status=='READY' and (project,word)==('Tân Hiệp Phát','chai number 1'):
        return {'status':'ALIAS','reason':'Cụm chỉ thêm từ chai. Kho đã có Nước tăng lực Number 1 READY trên Facebook.',
                'canonical_keyword':'Nước tăng lực Number 1','samples':hits,
                'observed_at':sample['checked_at'],'sample_status':sample['status'],'search_url':prior.query_url('facebook',word)}
    return {'status':status if status!='OUT_OF_SCOPE' else 'REVIEW','reason':reason,'samples':hits or dec['_posts'],
            'observed_at':sample['checked_at'],'sample_status':sample['status'],'search_url':prior.query_url('facebook',word)}


def levels_with_channels(levels, stored):
    for source in levels:
        item = dict(source)
        level, action, reason = level_resolution(item)
        item.update(level=level, level_resolution=action, level_reason=reason)
        checks = item['checks'] = {p: dict(c) for p,c in item['checks'].items()}
        for p, c in checks.items():
            if c['status'] == 'READY' and action != 'ENABLE':
                c.update(status='REVIEW', reason=reason)
            if c['status'] == 'READY' and p=='news' and item['project']=='Miss Cosmo 2026' and item['keyword']=='đăng quang miss grand vietnam':
                main = stored.get(('Miss Cosmo 2026','miss grand vietnam'), {}).get('news', {})
                if main.get('status') == 'READY':
                    c.update(status='REVIEW', reason='Kho đã có Miss Grand Vietnam cho News. Cụm này là một lát cắt về lễ đăng quang.')
        yield item


def assess_review(db, rows, cached):
    history = {p:prior.read_observations(p,{r['keyword'].casefold() for r in rows}) for p in ('youtube','news')}
    fresh = OUT / 'reviewed-channel-evidence.json'
    manual = {(r['project'],r['keyword'],r['platform']):r for r in prior.read_json(fresh)} if fresh.is_file() else {}
    samples = {}
    if FB_QUEUE.is_file() and FB_DB.is_file():
        words = {r['key']:r['keyword'] for r in prior.read_json(FB_QUEUE)}
        with closing(facebook.stage_db(FB_DB)) as stage:
            samples = {words[key]:json.loads(data) for key,data in stage.execute('SELECT key,data FROM samples') if key in words}
    for item in rows:
        project, word = item['project'], item['keyword']
        refs = item['references']
        existing = cached[project,word]
        item['checks'] = dict(existing)
        item['plan_check'] = 'CELL_MATCH' if refs else 'CELL_MISMATCH'
        item['reason'] = ('Đã đối chiếu lại cụm trong ô gốc.' if refs else
                          'Các vị trí đối chiếu thuộc tab kết quả báo cáo. Chưa có ô đặt keyword độc lập trong plan.'
                          if item.get('result_references') else
                          'Chưa tìm nguyên cụm trong các ô gốc hiện có. Giữ REVIEW dù có kết quả tìm gần đúng.')
        item['reason'] = item.get('reopened_reason',item['reason'])
        item['subject'] = next((s for s in item['subjects'] if s and not prior.GENERIC.fullmatch(prior.fold(s))), project)
        if not refs or UNSAFE_TEXT.search(word) or CREDENTIAL_TEXT.search(word):
            yield item
            continue
        item.update({k:refs[0][k] for k in ('sheet','cell','plan_url')}, field_kind='plan_named_field')
        for platform in CHANNELS:
            if existing.get(platform, {}).get('status') in {'OUT_OF_SCOPE','ALIAS','READY'}:
                continue
            c = prior.observation(platform, item, history, manual)
            if platform == 'facebook' and word in samples:
                c = verify_facebook(item,samples[word])
            if c['status'] in {'READY','ALIAS'}:
                item['checks'][platform] = c
            elif c['observed_at'] and (platform=='facebook' and word in samples or not existing.get(platform, {}).get('observed_at')):
                item['checks'][platform] = c
        yield item


def serve_facebook(port):
    if not FB_QUEUE.is_file():
        with closing(sqlite3.connect(prior.DB,timeout=30)) as db:
            stored = stored_channels(db)
        queries = {}
        for row in prior.read_json(INPUT):
            project, word = row['project'], row['keyword']
            check = stored[project,word].get('facebook',{})
            if (not row['references'] or check.get('status') in {'OUT_OF_SCOPE','ALIAS','READY'}
                    or UNSAFE_TEXT.search(word) or CREDENTIAL_TEXT.search(word)
                    or check.get('sample_status') in {'CHECKED_VISIBLE_RESULTS','CHROME_PLAN_COVERAGE_OK',
                                                     'CHROME_ACTIVE_KEYWORDS_OK'}):
                continue
            item = queries.setdefault(word,{'key':str(len(queries)+1),'keyword':word,
                'url':prior.query_url('facebook',word),'targets':[]})
            item['targets'].append({'project':project,'level':row['level'],'subjects':row['subjects']})
        prior.write_json(FB_QUEUE,list(queries.values()))
    facebook.OBSERVATIONS = FB_DB
    facebook.prepare_stage(FB_DB)
    with ThreadingHTTPServer(('127.0.0.1',port),facebook.Handler) as server:
        server.queue = prior.read_json(FB_QUEUE)
        server.by_key = {item['key']:item for item in server.queue}
        print(f'{len(server.queue)} Facebook queries',flush=True)
        server.serve_forever()


def run(apply=False, refresh=False):
    OUT.mkdir(parents=True,exist_ok=True)
    with closing(sqlite3.connect(prior.DB,timeout=30)) as db:
        rows, levels = (prior.read_json(INPUT),prior.read_json(LEVEL_INPUT)) if INPUT.exists() and not refresh else extract(db)
        cached = stored_channels(db)
        evaluated = list(assess_review(db, rows, cached))
        classified = list(levels_with_channels(levels, cached))
        changes = prior.store(db, [*evaluated,*classified]) if apply else {}
        if apply and RESULTS.is_file() and not refresh:
            last = prior.read_json(RESULTS)
            if [(r['project'],r['keyword']) for r in last['review']]==[(r['project'],r['keyword']) for r in evaluated]:
                changes = dict(Counter(last['updates'])+Counter(changes))
        if apply:
            with db:
                for item in evaluated:
                    p,word = item['project'],item['keyword']
                    row = db.execute('SELECT status,reasons_json FROM keywords WHERE project_name=? AND keyword=?',(p,word)).fetchone()
                    item['catalog_status'] = row[0]
                    if row[0]!='REVIEW':
                        continue
                    note = item['reason']
                    reasons = json.loads(row[1])
                    if note not in reasons:
                        db.execute('UPDATE keywords SET reasons_json=? WHERE project_name=? AND keyword=?',
                                   (prior.encode([*reasons,note]),p,word))
                for item in classified:
                    row = db.execute('SELECT status FROM keywords WHERE project_name=? AND keyword=?',
                                     (item['project'],item['keyword'])).fetchone()
                    item['catalog_status'] = row[0] if row else None
        report = dict(at=datetime.now(timezone.utc).isoformat(), review=evaluated, level=classified, updates=changes)
        prior.write_json(RESULTS,report)
        print(json.dumps({'review':len(evaluated), 'exact_cell':sum(x['plan_check']=='CELL_MATCH' for x in evaluated),
                          'level':Counter(x['level_resolution'] for x in classified),
                          'review_ready':Counter(p for x in evaluated for p,c in x['checks'].items() if c['status']=='READY'),
                          'level_ready':Counter(p for x in classified for p,c in x['checks'].items() if c['status']=='READY'),
                          'updates':changes},ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--refresh',action='store_true')
    parser.add_argument('--facebook-port',type=int)
    args = parser.parse_args()
    if args.facebook_port:
        serve_facebook(args.facebook_port)
    else:
        run(args.apply,args.refresh)
