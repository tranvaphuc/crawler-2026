"""Account for source rows in current active workbooks and reconcile project links."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit

from audit_full_plan_contents import (
    ACTIVE, CREDENTIAL_TEXT, NAME_HEADER, REFERENCE_SHEET, ROOT as PLAN_ROOT, SOURCE_SHEET,
    add_sources, assign, classify, review_sources, row_metadata,
)
from build_source_keyword_catalog import url_key
from extract_project_sources import urls
from reconcile_active_plan_coverage import FOLDER, active_documents, in_scope
from reconcile_plan_keywords_deep import DB, encode, field, fold, is_result_sheet, read_book, read_json, write_json

OUT = FOLDER / 'source-coverage'
PREVIEW = OUT / 'preview.json'
REPORT = OUT / 'report.json'
AUDIT = 'active-plan-source-coverage'
FINANCE_PLAN = '1HgWRvIYXLoaB2xkBnrp5K76OUMv6OuQ4'
LINK_HEADER = re.compile(
    r'^(?:url|link|domain|source|sources|main sources|highlight sources|owned channel|owned media|'
    r'duong dan|nguon|nguon thu thap|(?:link|url|nguon|kenh|trang) (?:chinh|theo doi|thu thap|facebook|fb|fanpage|'
    r'group|page|user|youtube|tiktok|instagram|threads|linkedin)|facebook|youtube|tiktok|instagram|threads|linkedin|fanpage)$'
)
NAME = re.compile(r'^(?:ten souce|ten source|ten page group|page name|group name|profile name|site name|site title|ten hien thi|name location|dia diem)$')
ID = re.compile(r'^(?:id|site ?id|account ?id|page ?id|group ?id|user ?id|channel ?id|native id|fb ?id)$')
FOLLOWER = re.compile(r'^(?:(?:so|luot|total) )?(?:followers?|nguoi theo doi|subscribers?|members?|thanh vien)$')
ROLE_HEADER = re.compile(r'^(?:channel|kenh|loai|type|brand|thuong hieu|chu the|platform|topic)$')
WORKSHEET_REFERENCE = {
    ('BIDV','List Group 2025'):'HISTORICAL_DISCUSSION_EXPORT_NUMERIC_FACEBOOK_ROUTE',
    ('BIDV','GG Review'):'Danh sách báo giá. Cột BIDV chọn đều bằng 0 trong bản đang đối chiếu.',
    ('30SHINE','Kênh chủ sở hữu'):'Cấu trúc sheet cũ chứa danh sách công ty chứng khoán từ mẫu khác.',
    ('Vingroup','Blacklist'):'Danh sách URL cần lưu ý ở tab Blacklist.',
    ('Vinfast','Link-Id'):'Bảng đối chiếu URL nội dung với ID.',
    ('Vinfast','Paid links (T5)'):'Danh sách bài trả phí lưu ở tab ẩn.',
    ('ShopeePay','Tiktok E-Wallet_old'):'Bản cũ, có bảng Set up Tiktok e-wallet đang dùng.',
    ('SPX','Tiktok E-Wallet_old'):'Bản cũ theo dõi ví điện tử.',
    ('SPX','Set up Tiktok e-wallet'):'Bảng đối thủ ví điện tử thuộc scope ShopeePay.',
}


def workbook_inputs(db):
    active = {p for p,s in db.execute('SELECT project_name,plan_status FROM projects') if s.strip().lower() in ACTIVE}
    latest = {row['id']:row for row in read_json(FOLDER/'refresh.json')}
    for ident, book, ignored in in_scope(active_documents(active),active):
        if ignored:
            continue
        refreshed = latest.get(ident,{})
        file = refreshed.get('file') or book.get('file')
        yield ident, {**book,'file':file,'copy_status':'LIVE_EXPORT' if refreshed.get('file') else 'LOCAL_COPY'}


def named_rows(sheet):
    """Yield a link only with evidence from a source table, not a cell of example results."""
    name, rows = sheet['name'], sheet['rows']
    folded = fold(name)
    if is_result_sheet(rows) or REFERENCE_SHEET.search(folded):
        return
    linkcols, namecols, idcols, metriccols, roles = set(),set(),set(),set(),set()
    for row in rows.values():
        labels = {col:fold(cell['text'].strip()) for col,cell in row.items()
                  if 0 < len(cell['text'].strip()) < 72 and not re.search(r'https?://|www\.',cell['text'],re.I)}
        links = {col for col,val in labels.items() if LINK_HEADER.fullmatch(val)}
        texts = set(labels.values())
        if links and (len(links) >= 2 or any(ROLE_HEADER.fullmatch(x) or NAME_HEADER.fullmatch(x) or NAME.fullmatch(x)
                                             or ID.fullmatch(x) or x in {'stt','no','index','keyword','mainkey','keywords'}
                                             for x in texts)):
            linkcols = links
            namecols = {c for c,v in labels.items() if NAME_HEADER.fullmatch(v) or NAME.fullmatch(v)}
            idcols = {c for c,v in labels.items() if ID.fullmatch(v)}
            metriccols = {c for c,v in labels.items() if FOLLOWER.fullmatch(v)}
            roles = {c for c,v in labels.items() if ROLE_HEADER.fullmatch(v)}
            continue
        if not linkcols and not SOURCE_SHEET.search(folded):
            continue
        selected = [field(row,c) for c in sorted(namecols) if field(row,c)]
        role = ' '.join(fold(field(row,c)) for c in sorted(roles) if field(row,c))
        display = next((value for value in selected if len(value)<=105 and not CREDENTIAL_TEXT.search(value)
                        and not re.search(r'https?://|\bwww\.',value)),None)
        # Keyword tabs attach sources in separately labeled columns.
        fields = (c for c in row if c in linkcols) if linkcols else iter(row)
        for col in fields:
            cell = row[col]
            if any(CREDENTIAL_TEXT.search(cell.get(k,'') or '') for k in ('text','note','formula')):
                continue
            for url in dict.fromkeys(urls(cell)):
                try:
                    parts=urlsplit(url)
                    if parts.path.lower().startswith(('/login','/checkpoint','/share','/dialog','/search')):
                        continue
                    if (parts.hostname or '').endswith('linkedin.com') and re.fullmatch(
                            r'/(?:company|school|showcase)/[\w.%\-]+/(?:posts|about|people)/?',parts.path):
                        url=f'https://www.linkedin.com{parts.path.rstrip("/").rsplit("/",1)[0]}/'
                    channel, kind = classify(url,folded,role)
                except ValueError:
                    continue
                if not kind or kind=='content_reference':
                    continue
                identity=url_key(channel,url)
                if not identity:
                    continue
                safe_idcols = idcols if len(linkcols)==1 else set()
                safe_metriccols = metriccols if len(linkcols)==1 else set()
                meta=row_metadata(row,safe_idcols,safe_metriccols,channel,kind)
                if channel == 'facebook' and len(safe_idcols)==1:
                    candidate=field(row,next(iter(safe_idcols)))
                    if valid:=re.fullmatch(r'fb_(\d{5,24})',candidate):
                        meta['plan_id']=valid[1]
                yield identity, cell['ref'], url, display, role, kind, meta


def inventory(db):
    groups = defaultdict(list)
    skips = Counter()
    unscoped = []
    books = []
    gaps = []
    references = []
    roster={d['id']:d for d in read_json(PLAN_ROOT/'roster.json')['documents']}
    historical=Counter()
    for ident,book in workbook_inputs(db):
        path = book['file']
        if not path or not Path(path).is_file():
            gaps.append({'projects':book['projects'],'url':book['url']})
            continue
        count = {'id':ident,'projects':book['projects'],'url':book['url'],'sheets':0,'source_cells':0}
        books.append(count)
        for sheet in read_book(path):
            count['sheets']+=1
            name=sheet['name']
            projects=[p for p in book['projects'] if (p,name) not in WORKSHEET_REFERENCE]
            if not projects:
                skips[name]+=1
                if name=='List Group 2025' and 'BIDV' in book['projects']:
                    historical['sheet_rows']=sum(1 for n,r in sheet['rows'].items() if n>1 and url_key('facebook',field(r,'C')))
                    historical['archived_rows']=db.execute('''SELECT count(*) FROM plan_source_reference_records
                        WHERE project_name='BIDV' AND plan_url=? AND sheet=?''',(book['url'],name)).fetchone()[0]
                if name in {'GG Review','Blacklist'}:
                    is_maps=name=='GG Review'
                    p='BIDV' if is_maps else 'Vingroup'
                    for n,row in sheet['rows'].items():
                        url=field(row,'D' if is_maps else 'C')
                        lookup=url_key('gg reviews' if is_maps else 'facebook',url)
                        if not lookup:
                            continue
                        if is_maps and field(row,'E') not in {'0','0.0'}:
                            raise ValueError(f'BIDV choice changed at E{n}')
                        display=field(row,'C' if is_maps else 'B')
                        if CREDENTIAL_TEXT.search(display):
                            continue
                        references.append((p,book['url'],name,f'{"D" if is_maps else "C"}{n}',display,url,None,None,
                                           'PLAN_NOT_SELECTED' if is_maps else 'PLAN_BLACKLIST_REFERENCE'))
                continue
            by_ref={c['ref']:r for r in sheet['rows'].values() for c in r.values()} if (
                ident==FINANCE_PLAN and name=='Brand list') else {}
            for ident_key,cell,url,display,role,kind,meta in named_rows(sheet):
                project=assign(projects,display or '',name,role,url)
                if cell in by_ref and cell.startswith('H'):
                    row=by_ref[cell]
                    label=field(row,'E')
                    if field(row,'I').lower()=='inactive':
                        references.append(('Home Credit',book['url'],name,cell,display or label,url,None,None,'PLAN_INACTIVE'))
                        continue
                    if not project and label:
                        subject=fold(label).replace(' ','')
                        owners=[p for p in projects if any(fold(r.get('topic','')).replace(' ','')==subject
                                for r in roster[ident]['projects'][p])]
                        if len(owners)==1:
                            project=owners[0]
                            display=display or label
                if name=='List page group' and not project and len(projects)>1 and kind=='group':
                    for owner in projects:
                        references.append((owner,book['url'],name,cell,display,url,meta.get('plan_id'),None,'SHARED_PLAN_REVIEW'))
                if ident==FINANCE_PLAN and name=='Brand list' and not project and cell.startswith('M'):
                    for owner in projects:
                        references.append((owner,book['url'],name,cell,field(by_ref[cell],'K') or display,url,None,None,'SHARED_PLAN_REVIEW'))
                proof={'planUrl':book['url'],'sheet':name,'cell':cell,'url':url,'name':display,
                       'kind':kind,'workbook_status':book['copy_status'],'sheet_state':sheet['state'],**meta}
                if not project:
                    unscoped.append({'projects':projects,**proof})
                    continue
                count['source_cells']+=1
                groups[ident_key,project].append({'project':project,**proof})
        if len(books)%25==0:
            print(f'Đã đối chiếu {len(books)} workbook',flush=True)
    found,conflicts=review_sources(db,groups)
    return {'workbooks':books,'missing_workbooks':gaps,'excluded_sheets':dict(skips),'scope_review':unscoped,
            'reference_rows':references,'historical_bidv':dict(historical),
            'conflicts':conflicts,'already_mapped':sum(not row['new_membership'] for row in found),
            'new_mappings':[row for row in found if row['new_membership']],
            'source_provenance':sum(len(row['proofs']) for row in found),
            'tabs_to_review':dict(Counter(f'{r["project"]} | {r["proofs"][0]["sheet"]}' for r in found if r['new_membership']))}


def apply(db, accepted, references):
    db.execute('PRAGMA foreign_keys=ON')
    with db:
        db.execute('BEGIN IMMEDIATE')
        current=dict(db.execute('SELECT project_name,plan_status FROM projects'))
        for row in accepted:
            if current[row['project']].strip().lower() not in ACTIVE:
                raise ValueError('The project state changed after source review')
            if row['channel']=='facebook' and row['new_source'] and row['type'] not in {'group','unknown'}:
                # Retain the plan label as provenance. Facebook UI evidence confirms page versus user.
                row['type']='unknown'
            if any(urlsplit(p['url']).hostname in {None,'fireant.vn'} or
                   urlsplit(p['url']).hostname.endswith('.fireant.vn') for p in row['proofs']):
                raise ValueError('Invalid URL in reviewed source list')
        changes=add_sources(db,accepted)
        changes['reference_rows_saved']=db.executemany(
            'INSERT OR IGNORE INTO plan_source_reference_records VALUES (?,?,?,?,?,?,?,?,?)',references).rowcount
        if db.execute('PRAGMA quick_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
            raise sqlite3.IntegrityError('Catalog integrity check failed')
    return changes


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    OUT.mkdir(exist_ok=True)
    with closing(sqlite3.connect(DB.resolve().as_uri()+('?mode=rw' if args.apply else '?mode=ro'),
                                 uri=True,timeout=25)) as db:
        if not args.apply:
            report=inventory(db)
            write_json(PREVIEW,report)
        else:
            report=read_json(PREVIEW)
            reviewed=read_json(OUT/'reviewed-decisions.json')
            resolution={(r['project'],r['source_key']):r for r in reviewed}
            if len(resolution)!=len(report['new_mappings']):
                raise ValueError('Every proposed source needs a recorded decision')
            accepted=[]
            for row in report['new_mappings']:
                mapped=resolution.pop((row['project'],row['source_key']))
                if mapped['include']:
                    accepted.append(row)
            if resolution:
                raise ValueError('Unexpected source decisions')
            report.update(changes=apply(db,accepted,report['reference_rows']),decisions=reviewed)
            write_json(REPORT,report)
    print(encode({'books':len(report['workbooks']),'known':report['already_mapped'],
           'new':len(report['new_mappings']),'conflicts':len(report['conflicts']),
           'shared_scope':len(report['scope_review']),'changes':report.get('changes')}))


if __name__=='__main__':
    main()
