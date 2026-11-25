"""Reopen the remaining plan cells and keep channel evidence for the catalog follow-up."""

import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3

from audit_full_plan_contents import ACTIVE, CREDENTIAL_TEXT
from collect_catalog_platform_audit import replace_report
from deduplicate_catalog_keywords import refresh_term_views, update_summaries
from finalize_catalog_cross_platform_audit import exact, query_url
from reconcile_active_plan_coverage import cell_terms
from reconcile_new_plan_keyword_searches import read_observations
from reconcile_plan_keyword_remaining import DETAIL, FOLDER, REPORT, evidence_id, scope_decision
from reconcile_plan_keywords_deep import (DB, UNSAFE_TEXT, apply_updates, encode, field, fold, heading_level,
                                         is_result_sheet, query_key, read_book, read_json, write_json, xlsx_inventory)
from reconcile_plan_source_coverage import workbook_inputs
from review_active_plan_keyword_scope import candidate


OUT = FOLDER / 'scope-followup'
INPUT = OUT / 'inputs.json'
QUERIES = OUT / 'queries.json'
RESULTS = OUT / 'results.jsonl'
SUMMARY = OUT / 'summary.json'
MANUAL = OUT / 'reviewed-channel-evidence.json'
AUDIT = 'plan-scope-followup-standalone'
COMPETITOR_SHEET = re.compile(r'^(?:doi thu|competitor\w*|nganh|industry)\b')
GENERIC = re.compile(r'^(?:topic|brand|mainbrand|competitors?|san pham|nhan hang|cong ty|nganh|key\s*words?|khac|market)$')
PLACEHOLDER_SUBJECT = re.compile(r'\b(?:quy mo|loai khac|nganh hang|label|new brands?|tu khoa|yeu to|thao luan|customers?)\b')
NUMBERED_PLAN_LABEL = re.compile(r'(?:Đối thủ|Competitor)\s+\d{1,2}',re.I)
SCOPED_CANONICAL = {
    ('VinWonders','Bà Nà'):'Bà Nà Hills',
    ('Galaxy Cinema','Brand New Day'):'Spider-Man: Brand New Day',
    ('Galaxy Cinema','Doomsday'):'Avengers: Doomsday',
    ('Galaxy Cinema','Odyssey'):'The Odyssey',
    ('Galaxy Cinema','Spider Man'):'Spider-Man: Brand New Day',
}
VINMEC_SPECIALTIES = {'Sức khoẻ tinh thần','Thai Sản','Cơ Xương Khớp','Tiêu Hóa','IVF','Tim Mạch','Ung Bướu'}
SHOPEEFOOD_COMPETITORS = {'grab','befood','baemin','gofood','loship','greensmfood'}


def subject_key(subject):
    return query_key(re.sub(r'(?i)\((?:mainbrand|competitors?|đối thủ)\)\s*$', '', subject).strip())


def scoped_roles(db):
    roles = defaultdict(set)
    for p, level, subjects in db.execute("SELECT project_name,level,subjects_json FROM keywords WHERE status IN ('READY','CHANNEL_ONLY')"):
        for name in json.loads(subjects):
            key = subject_key(name)
            if len(key) >= 5 and not GENERIC.fullmatch(fold(name)):
                roles[p,key].add(level)
    return roles


def plan_level(project, subject, sheet, role, roles):
    if str(role) in {'1','2'}:
        return int(role)
    explicit = heading_level(str(role))
    if explicit in {'1','2'}:
        return int(explicit)
    if any(re.search(r'\((?:competitors?|đối thủ)\)',label,re.I) for label in (subject,sheet)):
        return 2
    matches = roles.get((project,subject_key(subject)),set())
    if len(matches)==1:
        return next(iter(matches))
    if COMPETITOR_SHEET.search(fold(sheet)):
        return 2
    if re.search(r'\b(?:mainbrand|mainbrand keywords|thuong hieu chinh)\b',fold(sheet)):
        return 1
    root,owner=subject_key(subject),query_key(project)
    if len(root)>=5 and (root.startswith(owner) or owner.startswith(root)) and len(owner)>=5:
        return 1
    return None


def explicit_plan_context(project, sheet, ref, subject, rows):
    col, number=re.fullmatch(r'([A-Z]+)(\d+)',ref).groups()
    number=int(number)
    if (project,sheet,ref)==('Tân Hiệp Phát','Pate HaLong','B11'):
        if (field(rows.get(2,{}),'B')=='Pate Hạ Long'
            and field(rows.get(4,{}),'B')=='Main keywords'
            and field(rows.get(11,{}),'B')=='CTCP Đồ hộp Hạ Long'):
            return 1,'Pate Hạ Long (CTCP Đồ hộp Hạ Long)'
    if project=='TTC Group MS' and sheet=='Keywords TTC & competitors' and col=='C' and 5<=number<=58:
        return 1,subject
    if project=='Tasco' and sheet=='Updated_Từ khóa' and col=='D' and 4<=number<=29:
        topic=field(rows.get(number,{}),'C') or field(rows.get(number-1,{}),'C')
        if topic:
            return 1,topic
    if project=='ShopeeFood' and sheet in {'Tracking Keyword','Tracking Keyword (2026)'} and query_key(subject) in SHOPEEFOOD_COMPETITORS:
        return 2,subject
    if (project=='Shopee' and sheet=='Keyword Campaign Tag' and ref=='C2'
        and field(rows.get(2,{}),'A')=='Shopee' and field(rows.get(2,{}),'B')=='Overall'):
        return 1,'Shopee'
    if (project=='Nestlé' and sheet.strip()=='Keywords' and ref=='P13'
        and fold(field(rows.get(8,{}),'P'))=='hashtag' and query_key(field(rows.get(13,{}),'Q'))=='milovietnam'
        and heading_level(field(rows.get(10,{}),'B'))=='1'):
        return 1,field(rows[13],'Q')
    if project=='Suzuki 2026' and sheet=='Keyword & Source' and col in {'C','E'} and re.fullmatch(
            r'(?:geely|byd|mitsubishi)(?:\s+2026)?',fold(subject)):
        return 2,subject
    if project=='Vinmec' and sheet in VINMEC_SPECIALTIES and col=='C' and fold(field(rows.get(1,{}),'C'))=='keyword':
        return 2,subject or sheet
    if project=='BIDV' and sheet=='18. BXH Top 10 giải chạy' and col=='D' and number>=5:
        return 2,field(rows.get(number,{}),'B') or subject
    if project=='Gaz Vietnam' and sheet=='+ key words (Irisgo update)' and col=='L' and 'doi thu' in fold(field(rows.get(2,{}),'L')):
        return 2,'Hyundai Solati'
    if project=='Ngành Mỹ Phẩm' and sheet=='Keyword' and col in {'A','B'}:
        return 2,subject
    if project=='PNJ' and sheet=='Từ khóa (đối thủ)':
        return 2,subject
    if project=='IMAP' and sheet=='Từ khóa (main brand)':
        return 1,subject
    return None,subject


def sources_to_open(db):
    pending=[]
    for line in DETAIL.open(encoding='utf-8'):
        item=json.loads(line)
        if item['decision']=='NEEDS_SCOPE':
            pending.append({k:item[k] for k in ('project','keyword','plan_url','sheet','cell','subject')} | {'group':'plan_candidate'})
    states={(p,query_key(k)):(k,s) for p,k,s in db.execute('SELECT project_name,keyword,status FROM keywords')}
    retained={(r['project'],query_key(r['keyword'])) for r in read_json(INPUT) if r['group']=='catalog_review'} if INPUT.exists() else set()
    for entry in read_json(REPORT)['keywords']:
        key=(entry['project'],query_key(entry['keyword']))
        if key in retained or (not retained and states.get(key,(None,None))[1]=='REVIEW'):
            for proof in entry['evidence']:
                reference={k:proof[k] for k in ('plan_url','sheet','cell','subject')}
                pending.append({**reference,'project':entry['project'],'keyword':entry['keyword'],
                                'group':'catalog_review','level':entry['level'],'subject':proof['resolved_subject']})
    return pending


def prepare(db, refresh=False):
    if INPUT.exists() and QUERIES.exists() and not refresh:
        return read_json(INPUT)
    roles=scoped_roles(db)
    awaiting=defaultdict(lambda:defaultdict(list))
    outcomes=defaultdict(list)
    for item in sources_to_open(db):
        awaiting[evidence_id(item['plan_url'])][item['sheet']].append(item)
    for ident,book in workbook_inputs(db):
        if ident not in awaiting or not book['file'] or not Path(book['file']).is_file():
            continue
        expected=awaiting[ident]
        for sheet in read_book(book['file'],lambda n:n in expected):
            name=sheet['name']
            exported=is_result_sheet(sheet['rows'])
            inventory,_=xlsx_inventory({ident:book},book_reader=lambda _: (sheet,))
            refs=defaultdict(list)
            for _,value,proof in inventory:
                refs[proof['cell']].append((value,proof))
            for item in expected.pop(name):
                project,word,ref=(item[k] for k in ('project','keyword','cell'))
                key=(project,query_key(word))
                match=re.fullmatch(r'([A-Z]+)([0-9]+)',ref)
                cell=sheet['rows'].get(int(match[2]),{}).get(match[1],{}) if match else {}
                record={**item,'copy_status':book['copy_status'],'sheet_state':sheet['state']}
                if project not in book['projects'] or exported:
                    outcomes[key].append({**record,'plan_check':'OUT_OF_SCOPE','reason':'Project hoặc bảng kết quả không khớp nguồn keyword.'})
                    continue
                raw=next((s for s in (cell.get('text',''),cell.get('note',''))
                          if key[1] in {query_key(v) for v in cell_terms(project,s,'main')}),None)
                if raw is None and project=='Vinamilk' and name=='List Tracking_Đối thủ' and ref in {'D10','D67'}:
                    label=field(sheet['rows'][int(match[2])],'B')
                    if query_key(label)==key[1]:
                        raw=label
                        record.update(cell='B'+match[2],origin_cell=ref,level=2,field_kind='competitor_brand')
                if raw is None:
                    outcomes[key].append({**record,'plan_check':'CELL_MISMATCH','reason':'Không trích được cụm đúng dạng từ ô gốc hoặc ghi chú của ô.'})
                    continue
                if NUMBERED_PLAN_LABEL.fullmatch(word):
                    outcomes[key].append({**record,'plan_check':'PLAN_LABEL',
                                          'reason':'Cụm là nhãn đánh số trong plan và chưa nêu tên chủ thể để tìm riêng.'})
                    continue
                if (project,name,ref,word)==('ShopeeFood','Hải Phòng Push','C11','b)%contribution buzz từ các nhóm Paid'):
                    outcomes[key].append({**record,'plan_check':'CONTEXT_ONLY',
                                          'reason':'C11 yêu cầu đo tỷ trọng buzz Paid/Earned/Owned cho chiến dịch Hải Phòng.'})
                    continue
                if (project,name,ref,word)==('Truong Son Land','Updated từ khóa','B33','Công ty CP Long "V'):
                    outcomes[key].append({**record,'plan_check':'QUERY_FORM_REVIEW',
                                          'reason':'B33 ghi Công ty CP Long "V" và các tên KCN Long Việt. Cụm trích hiện tại thiếu dấu kết thúc của tên gốc.'})
                    continue
                if UNSAFE_TEXT.search(word) or CREDENTIAL_TEXT.search(word):
                    outcomes[key].append({**record,'plan_check':'QUERY_FORM_REVIEW','reason':'Cụm có dấu hiệu định danh, mã, hoặc cú pháp truy vấn. Giữ để đối chiếu tại chỗ.'})
                    continue
                linked=[proof for value,proof in refs[ref] if value==raw]
                if linked and all(p['kind'] in {'sub','exclude'} or p.get('context') in {'sub','exclude'} for p in linked):
                    outcomes[key].append({**record,'plan_check':'CONTEXT_ONLY','reason':'Ô nằm ở cột subkey hoặc điều kiện loại trừ trong plan.'})
                    continue
                section=next((p for p in linked if p['kind'] in {'main','matrix','hashtag'}),{})
                subject=item['subject'] or section.get('subject','')
                if (project=='Cake' and name=='Competitors list' and 2<=int(match[2])<23
                    and field(sheet['rows'].get(2,{}),'A')=='Be App' and field(sheet['rows'].get(23,{}),'A')=='Cake'):
                    outcomes[key].append({**record,'plan_check':'OUT_OF_SCOPE',
                                          'reason':'A2 mở khối Be App, còn A23 mới mở khối Cake. Ô này thuộc phạm vi Be App.'})
                    continue
                if project=='Masan' and name=='Competitor Keywords' and ref=='D85' and query_key(word)=='govietnam':
                    ref_row=sheet['rows'][85]
                    if 'GO Việt Nam' in field(ref_row,'B') and field(ref_row,'A')=='Central Retail':
                        subject='GO Việt Nam (Central Retail)'
                        record['subject_correction']='B85 và A85 xác nhận GO Việt Nam thuộc Central Retail.'
                if (project,name,ref,query_key(word))==('Masan','Competitor Keywords','D95','mega'):
                    ref_row=sheet['rows'][95]
                    if field(ref_row,'A')=='MM Mega Market Việt Nam' and field(ref_row,'B')=='Mega Market':
                        subject=field(ref_row,'A')
                        record['subject_correction']='A95 và B95 xác nhận mega thuộc MM Mega Market Việt Nam.'
                explicit,explicit_subject=explicit_plan_context(project,name,ref,subject,sheet['rows'])
                if not item.get('level') and explicit:
                    subject=explicit_subject
                level=record.get('level') or explicit or plan_level(project,subject,name,section.get('role',''),roles)
                if item['group']=='plan_candidate' and (canonical:=SCOPED_CANONICAL.get((project,word))):
                    stored=db.execute('SELECT level,status FROM keywords WHERE project_name=? AND keyword=?',(project,canonical)).fetchone()
                    if stored==(level,'READY'):
                        outcomes[key].append({**record,'plan_check':'COVERED_BY_CANONICAL','canonical_keyword':canonical,
                                              'reason':f'Ô gốc chỉ chủ thể {subject}. Kho đã có cụm {canonical} để tìm đúng chủ thể.'})
                        continue
                outcome,_,why=scope_decision(project,item,exported)
                if item['group']=='plan_candidate' and outcome in {'CONTEXT_ONLY','LABEL_CONTEXT','OTHER_PROJECT','RESULT_EXAMPLE'}:
                    outcomes[key].append({**record,'plan_check':outcome,'reason':why})
                    continue
                outcomes[key].append({**record,'plan_check':'CELL_MATCH','subject':subject,'level':level,
                                      'field_kind':record.get('field_kind',section.get('kind','plan_named_field')),
                                      'reason':'Đã tìm lại được nguyên cụm trong ô nguồn.'})
    for sheets in awaiting.values():
        for items in sheets.values():
            for item in items:
                key=(item['project'],query_key(item['keyword']))
                outcomes[key].append({**item,'plan_check':'PLAN_REFERENCE_UNAVAILABLE','reason':'Bản plan đang dùng không mở được hoặc thiếu tab gốc.'})
    inputs=[]
    for refs in outcomes.values():
        verified=[r for r in refs if r['plan_check']=='CELL_MATCH']
        choices=verified or refs
        ref=next((r for r in choices if r.get('level')),choices[0])
        if len({r['level'] for r in verified if r.get('level')})>1:
            ref={**ref,'level':None,'reason':'Các ô gốc ghi vai trò main và đối thủ khác nhau cho cùng cụm.'}
        inputs.append({**ref,'references':refs})
    write_json(INPUT,inputs)
    queue=[]
    for group in ('catalog_review','plan_candidate'):
        for known_level in (True,False):
            projects=defaultdict(list)
            for item in inputs:
                if item['group']==group and item['plan_check']=='CELL_MATCH' and bool(item.get('level'))==known_level:
                    projects[item['project']].append(item['keyword'])
            for index in range(max(map(len,projects.values()),default=0)):
                queue.extend(words[index] for words in projects.values() if index<len(words))
    write_json(QUERIES,list(dict.fromkeys(queue)))
    return inputs


def anchors_for(item):
    subject=re.sub(r'(?i)\((?:mainbrand|competitors?|đối thủ)\)|\s+(?:202[0-9]|MS)$','',item['subject']).strip()
    if not subject or GENERIC.fullmatch(fold(subject)) or PLACEHOLDER_SUBJECT.search(fold(subject)):
        return []
    anchors=[subject]
    if len(subject.split())>1:
        for term in re.split(r'\s*[,/|]\s*',subject):
            if len(query_key(term))>=5 and term not in anchors:
                anchors.append(term)
    return anchors


def assess(item, platform, observed):
    word=item['keyword']
    if word.startswith('#') and platform=='news':
        return 'OUT_OF_SCOPE','Hashtag không nằm trong luồng Google News.',[]
    if not observed:
        return 'NOT_CHECKED','Chưa có mẫu tìm riêng trên kênh này.',[]
    if observed['status']!='OK':
        why={'NO_ARTICLE_SAMPLE':'Google News không trả bài cho truy vấn này.',
             'NO_VIDEO_SAMPLE':'YouTube không trả video cho truy vấn này.',
             'HTTP_429':'Kênh đang giới hạn số lượt tìm. Cần thử lại khi sẵn sàng.'}
        return 'REVIEW',why.get(observed['status'],f"Lượt tìm chỉ trả trạng thái {observed['status']}."),[]
    sources='channel' if platform=='youtube' else 'publisher'
    anchors=anchors_for(item)
    strong=[]
    phrase_hits=[]
    hits=observed.get('results',[])[:10]
    for r in hits:
        title=r.get('title') or ''
        context=' '.join(r.get(k) or '' for k in ('title',sources,'snippet'))
        if not exact(title,word):
            continue
        if word.startswith('#') and not any(query_key(tag)==query_key(word) for tag in re.findall(r'#[\w]+',context)):
            continue
        phrase_hits.append(r)
        independent=[a for a in anchors if subject_key(a)!=query_key(word).lstrip('#') and exact(context,a)]
        if independent:
            strong.append(r)
    matches={r.get(sources) for r in strong} - {None,''}
    if len(strong)>=3 and len(strong)*5>=len(hits)*3 and len(matches)>=2:
        return 'READY',f'{len(strong)}/{len(hits)} kết quả từ {len(matches)} nguồn có cả cụm tìm và dấu hiệu chủ thể trong plan.',strong[:5]
    observed_count=len(phrase_hits)
    why=(f'{observed_count}/{len(hits)} tiêu đề chứa cụm tìm. Chưa đủ dấu hiệu gắn với đúng chủ thể trong plan.'
         if observed_count else 'Mẫu đầu chưa thấy tiêu đề khớp nguyên cụm trong plan.')
    return 'REVIEW',why,phrase_hits[:5]


def observation(platform, item, search_cache, manual):
    key=(item['project'],item['keyword'],platform)
    if key in manual:
        m=manual[key]
        return {**m,'sample_status':m.get('sample_status','CHECKED_VISIBLE_RESULTS'),'samples':m.get('samples',[])}
    sample=search_cache.get(platform,{}).get(item['keyword'].casefold())
    state,reason,chosen=assess(item,platform,sample)
    return {'status':state,'reason':reason,'samples':chosen,'observed_at':sample.get('checked_at') if sample else None,
            'sample_status':sample['status'] if sample else 'NOT_OBSERVED',
            'search_url':sample.get('url') if sample else query_url(platform,item['keyword'])}


def check_channels(rows):
    words={r['keyword'].casefold() for r in rows if r['plan_check']=='CELL_MATCH'}
    history={p:read_observations(p,words) for p in ('youtube','news')}
    manual={(d['project'],d['keyword'],d['platform']):d for d in (read_json(MANUAL) if MANUAL.is_file() else [])}
    for row in rows:
        checks={} if row['plan_check']!='CELL_MATCH' else {
            p:observation(p,row,history,manual) for p in ('facebook','youtube','news')}
        yield {**row,'checks':checks}


def keyword_state(platforms):
    ready={p for p,c in platforms.items() if c=='READY'}
    if 'facebook' in ready:
        return 'READY'
    if ready:
        return 'CHANNEL_ONLY'
    return 'REVIEW'


def store(db, rows):
    db.execute('PRAGMA foreign_keys=ON')
    changes=Counter()
    with db:
        db.execute('BEGIN IMMEDIATE')
        statuses=dict(db.execute('SELECT project_name,plan_status FROM projects'))
        existing={(p,query_key(w)):(w,s,l) for p,w,s,l in db.execute('SELECT project_name,keyword,status,level FROM keywords')}
        for item in rows:
            if statuses.get(item['project'],'').strip().lower() not in ACTIVE:
                continue
            project,word=item['project'],item['keyword']
            key=(project,query_key(word))
            current=existing.get(key)
            inserted=db.execute('''SELECT 1 FROM keyword_quality_audit WHERE audit_id=? AND project_name=? AND keyword=?''',
                                (AUDIT+'-plan',project,current[0])).fetchone() if current else None
            if item['plan_check']!='CELL_MATCH':
                if current and inserted and item['plan_check']=='OUT_OF_SCOPE' and current[1]!='OUT_OF_SCOPE':
                    word,old,level=current
                    note=item['reason']
                    earlier=json.loads(db.execute('SELECT reasons_json FROM keywords WHERE project_name=? AND keyword=?',
                                                  (project,word)).fetchone()[0])
                    db.execute("UPDATE keywords SET status='OUT_OF_SCOPE',reasons_json=? WHERE project_name=? AND keyword=?",
                               (encode([*earlier,note]),project,word))
                    db.execute("UPDATE keyword_platform_audit SET status='OUT_OF_SCOPE',reason=? WHERE project_name=? AND keyword=?",
                               (note,project,word))
                    db.execute('INSERT OR IGNORE INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',
                               (AUDIT+'-scope',project,word,old,'OUT_OF_SCOPE',level,level,None,note))
                    changes['PLAN','OUT_OF_SCOPE']+=1
                continue
            checks=item['checks']
            planned_state=keyword_state({p:c['status'] for p,c in checks.items()})
            is_new=current is None
            if is_new:
                if item['group']!='plan_candidate' or planned_state=='REVIEW' or item['level'] not in {1,2}:
                    continue
                proof=candidate({'url':item['plan_url']},item['sheet'],item['cell'],word,item['subject'] or project,
                                item['level'],item['field_kind'],word)
                apply_updates(db,[{'project':project,'keyword':word,'level':item['level'],'subjects':[item['subject'] or project],
                                   'previous_status':None,'evidence':[proof]}],statuses,audit_id=AUDIT+'-plan')
                current=(word,'READY',item['level'])
                existing[key]=current
            elif item['group']=='plan_candidate' and not inserted:
                continue
            word,old,level=current
            if old not in {'READY','CHANNEL_ONLY','REVIEW'}:
                continue
            if item.get('subject_correction'):
                old_subjects,old_reasons=db.execute('SELECT subjects_json,reasons_json FROM keywords WHERE project_name=? AND keyword=?',
                                                    (project,word)).fetchone()
                corrected=encode([item['subject']])
                if old_subjects!=corrected:
                    db.execute('UPDATE keywords SET subjects_json=?,reasons_json=? WHERE project_name=? AND keyword=?',
                               (corrected,encode([*json.loads(old_reasons),item['subject_correction']]),project,word))
                    changes['PLAN','SUBJECT_CORRECTED']+=1
            for p,c in checks.items():
                if c['status'] not in {'READY','REVIEW','ALIAS'} or not c['observed_at']:
                    continue
                canonical=c.get('canonical_keyword')
                if c['status']=='ALIAS' and db.execute('''SELECT 1 FROM keyword_platform_audit a
                      JOIN keywords k USING(project_name,keyword) WHERE a.project_name=? AND a.keyword=? AND a.platform=? AND a.status='READY' AND k.level=?''',
                      (project,canonical,p,level)).fetchone() is None:
                    continue
                args=(c['status'],canonical,c['reason'],c['search_url'],c['sample_status'],c['observed_at'],encode(c['samples']),
                      project,word,p,c['observed_at'],c['observed_at'],c['status'],c['reason'])
                count=db.execute('''UPDATE keyword_platform_audit SET status=?,canonical_keyword=?,reason=?,search_url=?,sample_status=?,checked_at=?,samples_json=?
                    WHERE project_name=? AND keyword=? AND platform=? AND status IN ('NOT_CHECKED','REVIEW')
                    AND (checked_at IS NULL OR checked_at<? OR (checked_at=? AND (status<>? OR reason<>?)))''',args).rowcount
                if count:
                    changes[p,c['status']]+=1
            actual=dict(db.execute('SELECT platform,status FROM keyword_platform_audit WHERE project_name=? AND keyword=?',(project,word)))
            target=keyword_state(actual)
            if old==target and not is_new:
                continue
            matched=[p for p,s in actual.items() if s=='READY']
            note=('Kết quả tìm riêng xác nhận đúng chủ thể trên '+', '.join(matched)+'.' if matched
                  else 'Chưa có mẫu tìm riêng đủ căn cứ để bật keyword theo kênh.')
            old_reasons=json.loads(db.execute('SELECT reasons_json FROM keywords WHERE project_name=? AND keyword=?',(project,word)).fetchone()[0])
            db.execute('UPDATE keywords SET status=?,reasons_json=? WHERE project_name=? AND keyword=?',
                       (target,encode(list(dict.fromkeys([*old_reasons,note]))),project,word))
            db.execute('''INSERT OR IGNORE INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)''',
                       (AUDIT,project,word,None if is_new else old,target,None if is_new else level,level,None,note))
            changes['NEW' if is_new else 'PROMOTED',target]+=1
        if any(p=='NEW' for p,state in changes):
            refresh_term_views(db)
        if db.execute('PRAGMA quick_check').fetchone()!=('ok',) or db.execute('PRAGMA foreign_key_check').fetchone():
            raise sqlite3.IntegrityError('Catalog integrity check failed')
    update_summaries(db)
    return {f'{p}/{s}':v for (p,s),v in changes.items()}


def report(db, rows, changes):
    new=set(db.execute('SELECT project_name,keyword FROM keyword_quality_audit WHERE audit_id=?',(AUDIT+'-plan',)))
    tracked={(p,w):s for p,w,s in db.execute('SELECT project_name,keyword,status FROM keywords')}
    counts=defaultdict(Counter)
    checked=defaultdict(Counter)
    cohort_channels=defaultdict(lambda:defaultdict(Counter))
    projects=defaultdict(Counter)
    temporary=RESULTS.with_suffix('.partial')
    with temporary.open('w',encoding='utf-8') as handle:
        for item in rows:
            key=(item['project'],item['keyword'])
            if key in new and tracked[key]!='OUT_OF_SCOPE':
                state='ADDED_'+tracked[key]
            elif item['group']=='catalog_review':
                state=tracked.get(key,'REVIEW')
            elif any(c['status']=='READY' for c in item['checks'].values()):
                state='LEVEL_UNCONFIRMED' if not item.get('level') else 'EXISTING_OR_NOT_APPLIED'
            elif item['plan_check']=='CELL_MATCH':
                samples={c['sample_status'] for c in item['checks'].values()}
                if samples & {'OK','NO_ARTICLE_SAMPLE','NO_VIDEO_SAMPLE','CHECKED_VISIBLE_RESULTS'}:
                    state='REVIEW_SEARCHED'
                elif any(c['observed_at'] for c in item['checks'].values()):
                    state='COLLECTION_BLOCKED'
                else:
                    state='SEARCH_PENDING'
            else:
                state=item['plan_check']
            counts[item['group']][state]+=1
            projects[item['project']][state]+=1
            for p,c in item['checks'].items():
                checked[p][c['status']]+=1
                cohort_channels[item['group']][p][c['status']]+=1
            handle.write(encode({**item,'outcome':state})+'\n')
    replace_report(temporary,RESULTS)
    result={'checked_at':datetime.now(timezone.utc).isoformat(),'rows':len(rows),
            'outcomes':{p:dict(r) for p,r in counts.items()},'channels':{p:dict(r) for p,r in checked.items()},
            'channels_by_cohort':{g:{p:dict(c) for p,c in v.items()} for g,v in cohort_channels.items()},
            'changes_this_apply':changes}
    write_json(SUMMARY,result)
    write_json(OUT/'by-project.json',{p:dict(s) for p,s in sorted(projects.items())})
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode',choices=['prepare','preview','apply'])
    p.add_argument('--refresh',action='store_true')
    args=p.parse_args()
    OUT.mkdir(exist_ok=True)
    access='rw' if args.mode=='apply' else 'ro'
    with closing(sqlite3.connect(DB.resolve().as_uri()+'?mode='+access,uri=True,timeout=25)) as db:
        rows=prepare(db,args.refresh)
        if args.mode!='prepare':
            reviewed=list(check_channels(rows))
            changes=store(db,reviewed) if args.mode=='apply' else {}
            print(encode(report(db,reviewed,changes)))
            return
    print(encode({'counts':dict(Counter((r['group']+' '+r['plan_check']) for r in rows)),
                  'scoped':dict(Counter(r['group'] for r in rows if r['plan_check']=='CELL_MATCH' and r.get('level'))),
                  'queries':len(read_json(QUERIES))}))


if __name__=='__main__':
    main()
