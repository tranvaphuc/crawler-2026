"""Resolve the active plan roster by project ID, then refresh its workbook exports."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re
from urllib.parse import parse_qs, urlsplit
from zipfile import is_zipfile

import fetch_catalog_plan_snapshot as exports
from collect_catalog_platform_audit import OUT, read_json, write_json
from extract_project_sources import read_book, URL_RE
from reconcile_plan_keywords_deep import field
from deduplicate_catalog_keywords import query_key

ROOT = OUT / 'full-plan-audit'
ACTIVE = {'running', 'running trial'}
OBJECT_ID = re.compile(r'\b[a-f0-9]{24}\b', re.I)
OLD_HUNG_THINH = '1AvthzzllUqBUf-0DFikfc51zj0k9nk3m'
CURRENT_HUNG_THINH = '19g3qCTAsE9E9soZfK35zJxo2ql_uTCoj'
TOPIC_INDEX = '1qtPtqt5uLoQpVS1Nz7uP8T3dZedJO7-_324kQYmbRcQ'


def plan_links(cell):
    links = {}
    for source in ('link', 'text', 'formula'):
        for match in URL_RE.finditer(cell.get(source) or ''):
            url = match[0].rstrip('.,;)]}')
            try:
                parts = urlsplit(url)
            except ValueError:
                continue
            if parts.hostname in {'google.com','www.google.com'} and parts.path == '/url':
                url = parse_qs(parts.query).get('q',parse_qs(parts.query).get('url',['']))[0]
                parts = urlsplit(url)
            if parts.hostname not in {'docs.google.com', 'drive.google.com'}:
                continue
            path = re.match(r'/((?:spreadsheets|document|presentation|file))/d/(?:e/)?([\w-]{15,})', parts.path)
            if path:
                kind, ident = path.groups()
            elif parts.hostname == 'drive.google.com' and (ident := parse_qs(parts.query).get('id', [None])[0]):
                kind = 'file'
            elif (folder := re.search(r'/folders/([\w-]+)', parts.path)):
                ident, kind = folder[1], 'folder'
            else:
                continue
            links.setdefault(ident, {'id': ident, 'url': url, 'kind': kind})
    return list(links.values())


def roster():
    master = list(read_book(ROOT / 'master.xlsx'))
    sheets = {sheet['name']: sheet['rows'] for sheet in master}
    projects = defaultdict(list)
    by_name, by_id = defaultdict(set), defaultdict(set)
    for n, row in sheets['Main'].items():
        if n == 1 or not (name := field(row, 'A')):
            continue
        identifiers = sorted(set(OBJECT_ID.findall(field(row, 'B'))))
        status = field(row, 'E').casefold()
        note = field(row, 'F')
        if note.casefold() == 'stop':
            status = 'stop'
        projects[name].append({'row': n, 'status': status, 'project_ids': identifiers,
                               'plans': plan_links(row.get('D', {})), 'raw_link': field(row, 'D')})
        by_name[query_key(name)].add(name)
        for identifier in identifiers:
            by_id[identifier].add(name)

    active = {name for name, rows in projects.items() if any(r['status'] in ACTIVE for r in rows)}
    docs, issues, covered = {}, [], set()
    stopped_by_document = defaultdict(set)

    def add(plan, project, reference):
        doc = docs.setdefault(plan['id'], {**plan, 'projects': {}})
        doc['projects'].setdefault(project, []).append(reference)
        covered.add(project)

    for name, refs in projects.items():
        for original in refs:
            for plan in original['plans']:
                if original['status'] == 'stop':
                    stopped_by_document[plan['id']].add(name)
                elif original['status'] in ACTIVE:
                    add(plan, name, {'role': 'MAIN', 'cell': f"Main!D{original['row']}"})

    for n, row in sheets['Sheet1'].items():
        if n == 1 or not (plans := plan_links(row.get('F', {}))):
            continue
        label, topic = field(row, 'B'), field(row, 'D')
        typed = field(row, 'G')
        owners = set().union(*(by_id[i] for i in OBJECT_ID.findall(field(row, 'C'))))
        named = by_name[query_key(label)]
        textual = owners & named if owners and named else owners or named
        if len(textual) != 1:
            if (owners | named) & active or not (owners | named):
                issues.append({'cell': f'Sheet1!F{n}', 'label': label, 'topic': topic, 'plans': plans,
                               'id_owners': sorted(owners), 'name_owners': sorted(named),
                               'reason': 'PROJECT_MAPPING_CONFLICT' if owners or named else 'PROJECT_UNKNOWN'})
            continue
        project = textual.pop()
        if project not in active:
            continue
        for plan in plans:
            if project in stopped_by_document[plan['id']]:
                continue
            if project == 'Hưng Thịnh Corp' and plan['id'] == OLD_HUNG_THINH:
                if CURRENT_HUNG_THINH in docs and project in docs[CURRENT_HUNG_THINH]['projects']:
                    continue
            add(plan, project, {'role': 'TOPIC', 'cell': f'Sheet1!F{n}', 'topic': topic,
                                'topic_role': typed, 'topic_id': field(row, 'E'), 'label': label})

    index_path=ROOT/'browser-plans'/f'{TOPIC_INDEX}.xlsx'
    if TOPIC_INDEX in docs and index_path.is_file():
        docs[TOPIC_INDEX]['document_role']='TOPIC_INDEX'
        for sheet in read_book(index_path):
            for n,row in sheet['rows'].items():
                options=by_id[field(row,'D')] & active
                if len(options)!=1 or field(row,'I').casefold() not in {'giữ','running','running trial'}:
                    continue
                project=next(iter(options))
                named=by_name[query_key(field(row,'C'))]
                if named and project not in named:
                    continue
                for plan in plan_links(row.get('H',{})):
                    if project in stopped_by_document[plan['id']] or plan['id']==TOPIC_INDEX:
                        continue
                    add(plan,project,{'role':'TOPIC_INDEX_REFERENCE','cell':f"{sheet['name']}!H{n}",
                                      'index_id':TOPIC_INDEX,'topic':field(row,'E'),'topic_role':field(row,'G')})

    missing = [{ 'project': p, 'rows': projects[p] } for p in sorted(active-covered)]
    data = {'projects': projects, 'active_projects': sorted(active), 'stop_projects': sorted(set(projects)-active),
            'master_sheets': [{'name': s['name'], 'rows': len(s['rows'])} for s in master],
            'documents': list(docs.values()), 'missing_plan': missing, 'mapping_issues': issues}
    write_json(ROOT / 'roster.json', data)
    print('Projects', len(active), 'documents', len(docs), 'missing', len(missing), 'mapping issues', len(issues))
    print('Document categories', Counter('main' if any(r['role']=='MAIN' for a in d['projects'].values() for r in a) else 'topic-only' for d in docs.values()))


def saved_export(doc, coverage):
    ident = doc['id']
    candidates = [ROOT/'browser-plans'/f'{ident}.xlsx', OUT/'browser-plans'/f'{ident}.xlsx']
    candidates.extend(Path(name) for field in ('current_file','previous_file') if (name:=coverage.get(field)))
    candidates.extend([OUT/'public-plans'/f'{ident}.xlsx',Path('outputs/project-refresh-2026-11-10/plans')/f'{ident}.xlsx'])
    return next((str(p) for p in candidates if p.is_file() and is_zipfile(p)), None)


def fetch():
    exports.ROOT = ROOT
    (ROOT/'public-plans').mkdir(exist_ok=True)
    coverage = {d['id']:d for d in read_json(OUT/'plan-document-coverage.json')}
    docs = read_json(ROOT/'roster.json')['documents']
    def check(doc):
        ident, status = exports.fetch(doc)
        current = ROOT/'public-plans'/f'{ident}.xlsx'
        archived = saved_export(doc, coverage.get(ident, {}))
        return {**doc,'fetch_status':status,'file':str(current) if status=='FETCHED' else archived,
                'copy_status':'LIVE_PUBLIC' if status=='FETCHED' else 'LOCAL_BACKUP' if archived else 'UNREADABLE'}
    result=[]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for row in pool.map(check,docs):
            result.append(row)
            if len(result)%25==0 or len(result)==len(docs):
                print('Checked',len(result),'of',len(docs),dict(Counter(d['copy_status'] for d in result)),flush=True)
    write_json(ROOT/'access.json',result)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage',choices=('roster','fetch'))
    args=parser.parse_args()
    (roster if args.stage=='roster' else fetch)()
