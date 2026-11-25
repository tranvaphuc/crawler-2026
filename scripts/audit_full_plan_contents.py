"""Inventory every sheet in active plans and stage scope-checked catalog changes."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qs, urlsplit
from zipfile import BadZipFile

from audit_full_plan_links import ACTIVE, ROOT, plan_links
from build_source_keyword_catalog import numeric_url_id, privacy_from_plan, url_key
from extract_project_sources import read_book, urls
from reconcile_plan_keywords_deep import (DB, OUT, apply_updates, encode, field, fold, origin, propose,
    query_key, read_json, ready_counts, reconcile, resolve, retain_variant_evidence, term_shape,
    update_summaries, write_json, xlsx_inventory)
from import_catalog_reopened_plans import HOSPITAL_TYPOS

fold = lru_cache(maxsize=32768)(fold)

AUDIT = 'active-plan-full-sheet-audit-2026-11-19'
SOCIAL_DOMAINS = {'facebook':('facebook.com','fb.com','fb.me','fb.watch'), 'youtube':('youtube.com','youtu.be'),
    'tiktok':('tiktok.com',), 'instagram':('instagram.com',), 'threads':('threads.net','threads.com'),
    'linkedin':('linkedin.com',), 'x':('twitter.com','x.com')}
SOURCE_SHEET = re.compile(r'\b(?:nguon|kenh|channel|sources?|fanpage|fan page|group|forum|sites?|website|owned|kol|koc|influencers?)\b')
REFERENCE_SHEET = re.compile(r'\b(?:sample|vi du|case study|mau|sentiment|quy tac|rule|dinh nghia|raw data|bao cao|phan loai sac thai)\b')
NEWS_SHEET = re.compile(r'\b(?:bao chi|bao dien tu|newspapers?|news|sites cam ket)\b')
NAME_HEADER = re.compile(r'^(?:name|user|site ?name|ten|ten (?:nguon|bao|trang|kenh|fanpage|page|group|nhom|website|tai khoan)|source name|channel name)$')
SOURCE_LINK_HEADER = re.compile(r'^(?:link\s*(?:facebook|fanpage|source|kenh|group|youtube|tiktok|instagram|linkedin)?|url|domain|duong dan)$')
ID_HEADER = re.compile(r'^(?:(?:channel|site|page|user|group|account|native) )?id$')
FOLLOWER_HEADER = re.compile(r'^(?:(?:so|luot|total) )?(?:followers?|nguoi theo doi|theo doi|subscribers?)$')
GROUP_URL = re.compile(r'^/groups/[\w.%\-]+(?:/(?:about|members|people))?/?$')
SOURCE_TYPE = re.compile(r'\b(?:fanpage|fb page|facebook page|facebook user|fb user|profile|trang ca nhan|group|nhom)\b')
HOSPITALS = ('Hoan My Hospital','Hanh Phuc Hospital')
BACKUP_NOTES = {'16TxfaiBTC_Any2fh7waSigAKTIw0QXlT2e0TQEWMwtc':'OPENED_EXPORT_FAILED',
                '1UjesStmfSyEGlkz7uZxnedFlMBYMzx_7':'OPENED_DRIVE_PREVIEW'}
PRIMARY_CONTENT_OWNERS = {
    '15DACFAzcz2deJE_VVgnrdE548N8ETCvz':'NAPAS MS',
    '1Uux5aoruRaBsV2VD_f0A86kIZCb28GIY':'Vingroup',
}
REPLACEMENT_PLAN = {'30SHINE':'19_CWyPbLARrUrq_kKvAWie-tjuIHpWkq',
                    'Nestle Campaign':'1MlquDgEqdZEYY9VkJyw5m2gHjJ5qnnUs'}
OLD_30SHINE = '1e-Vld7c9fDtGkDDX7HuPC2MI67oAbHKj'
HOSPITAL_AMBIGUOUS = {'hoanmy','hoanmy1','phongkhamhanhphuc','pkhanhphuc','#hoanmyitodong','#benhvienhoanmyitodong'}
VIN_ENTITIES = {'vinuni','vinbus','vinenergo','vinspeed','vinrobotics','vinmetal','vgreen','vfilm','greenfuture'}
REJECT_KEYWORDS = {('PNJ','#caofinejewellery'),('SCG','scg'),('Vinamilk','hero')}
CREDENTIAL_TEXT = re.compile(r'\b(?:password|mật khẩu|api[_ -]?key|access[_ -]?token|bearer)\s*[:=]',re.I)


def scope_keys(name):
    if name==HOSPITALS[0]:
        return ['hoanmy','thuanmy','primasaigon']
    if name==HOSPITALS[1]:
        return ['hanhphuc']
    if name=='Monte and ZOTT GOURMET CHEESE SLICE':
        return ['zott','monte']
    if name=='Nestle Campaign':
        return ['nestle','nescafe','milo']
    return [query_key(name)]


def assign(projects, *context):
    if len(projects)==1:
        return projects[0]
    for piece in context:
        compact=query_key(piece)
        owners=[p for p in projects if any(token in compact for token in scope_keys(p))]
        if len(owners)==1:
            return owners[0]
        if len(owners)>1:
            return None
    return None


def classify(link, sheet_hint, context):
    parts=urlsplit(link)
    host=parts.hostname or ''
    path=parts.path.rstrip('/') or '/'
    if not host or parts.username or parts.password or host=='fireant.vn' or host.endswith('.fireant.vn'):
        return None,None
    channel=next((ch for ch,domains in SOCIAL_DOMAINS.items() if any(host==d or host.endswith('.'+d) for d in domains)),None)
    if channel=='facebook':
        query=parse_qs(parts.query)
        if host=='fb.watch' or re.search(r'/(?:posts|videos|photos|reel|watch|share|permalink|groups/[^/]+/user|events)(?:/|$)',path,re.I) or re.fullmatch(r'/\d+_\d+',path) or set(query)&{'fbid','story_fbid','comment_id'}:
            return channel,'content_reference'
        if GROUP_URL.fullmatch(path):
            return channel,'group'
        if path in {'/','/groups','/search','/pages','/login','/home.php','/l.php','/dialog','/photo.php','/story.php'}:
            return None,None
        if path=='/profile.php' and len(query.get('id',[]))==1 and query['id'][0].isdigit():
            return channel,'unknown'
        if re.fullmatch(r'/people/[^/]+/\d+',path):
            return channel,'user'
        if re.fullmatch(r'/pages/[^/]+/\d+',path):
            return channel,'page'
        if not re.fullmatch(r'/(?:pg/)?[\w.%-]+(?:/(?:about|community))?',path) or '?' in path:
            return None,None
        if re.search(r'\b(?:fb page|facebook page|fanpage|fan page)\b',context):
            return channel,'page'
        if re.search(r'\b(?:fb user|facebook user|trang ca nhan)\b',context):
            return channel,'user'
        return channel,'unknown'
    if channel=='youtube':
        if host.endswith('youtu.be') or re.match(r'^/(?:watch|live|shorts|playlist)(?:/|$)',path):
            return channel,'content_reference'
        return (channel,'channel') if re.match(r'^/(?:@[^/]+|(?:c|channel|user)/[^/]+)(?:/|$)',path) else (None,None)
    if channel in {'instagram','tiktok','threads','linkedin','x'}:
        if re.search(r'/(?:status|video|photo|p|reels?|stories|posts|post|feed|pulse)(?:/|$)',path):
            return channel,'content_reference'
        if channel=='linkedin':
            typed=re.match(r'^/(company|in|school|showcase)/[\w.%\-]+$',path)
            return (channel,'profile' if typed[1]=='in' else 'company') if typed else (None,None)
        profile=re.fullmatch(r'/@?[\w.%\-]+',path)
        reserved={'/login','/explore','/about','/accounts','/search','/download','/home','/settings'}
        if profile and path not in reserved and (channel not in {'tiktok','threads'} or path.startswith('/@')):
            return channel,'profile'
        return None,None
    if host.endswith('maps.app.goo.gl') or host.endswith('google.com') and path.startswith('/maps'):
        return ('gg reviews','place') if 'review' in sheet_hint else (None,None)
    if host.endswith('google.com') or host in {'bit.ly','tinyurl.com','forms.gle','t.co','zalo.me'}:
        return None,None
    if NEWS_SHEET.search(sheet_hint):
        return ('news','news') if path=='/' else ('news','content_reference')
    if re.search(r'\b(?:forum|dien dan)\b',sheet_hint):
        return ('forum','forum') if not re.search(r'\b(?:threads|showthread)\b',path) else ('forum','content_reference')
    return ('website','website') if re.search(r'\b(?:website|domain|trang web)\b',sheet_hint) and path=='/' else (None,None)


def row_metadata(row, idcols, followercols, channel, kind):
    meta={}
    ids={field(row,c).removesuffix('.0') for c in idcols if field(row,c)}
    if len(ids)==1:
        value=next(iter(ids))
        if channel=='youtube' and re.fullmatch(r'UC[\w-]{22}',value) or (
                channel in {'facebook','instagram','tiktok','threads','linkedin','x'}
                and kind not in {'unknown','content_reference'} and re.fullmatch(r'\d{5,24}',value)):
            meta['plan_id']=value
    counts={field(row,c).removesuffix('.0') for c in followercols if field(row,c)}
    if len(counts)==1:
        value=next(iter(counts))
        if re.fullmatch(r'\d{1,12}|\d{1,3}(?:[., ]\d{3}){1,3}',value):
            meta['plan_follower']=int(re.sub(r'\D','',value))
    return meta


def inspect_sources(doc,sheets,source_groups,content,unresolved,sheet_records):
    projects=[doc['content_owner']] if doc.get('content_owner') else list(doc['projects'])
    for sheet in sheets:
        name,rows=sheet['name'],sheet['rows']
        hint=fold(name)
        record={'name':name,'state':sheet['state'],'rows':len(rows),'cells':sum(len(r) for r in rows.values()),
                'notes':sum(bool(c.get('note')) for r in rows.values() for c in r.values()),
                'links':0,'source_occurrences':0,'keyword_cells':0}
        sheet_records.append(record)
        namecols,linkcols,idcols,followercols=set(),set(),set(),set()
        section=''
        for row in rows.values():
            headers={c for c,v in row.items() if NAME_HEADER.fullmatch(fold(v['text']))}
            if headers:
                namecols=headers
                linkcols={c for c,v in row.items() if SOURCE_LINK_HEADER.fullmatch(fold(v['text']))}
                idcols={c for c,v in row.items() if ID_HEADER.fullmatch(fold(v['text']))}
                followercols={c for c,v in row.items() if FOLLOWER_HEADER.fullmatch(fold(v['text']))}
            selected=[v['text'].strip() for c,v in row.items() if c in namecols and v['text'] and not list(urls(v))]
            row_values=[v['text'].strip() for v in row.values() if 1<len(v['text'].strip())<=100 and not re.search(r'@[^ ]+\.',v['text'])]
            if len(row_values)==1 and SOURCE_TYPE.search(fold(row_values[0])) and not re.search(r'https?://',row_values[0]):
                section=fold(row_values[0])
            context=' '.join(fold(v) for v in row_values if SOURCE_TYPE.fullmatch(fold(v)))+' '+section
            for col,cell in row.items():
                if CREDENTIAL_TEXT.search(cell['text']):
                    continue
                references=list(urls(cell))
                record['links']+=len(references)
                if any('google.' in (cell.get(prop) or '') for prop in ('text','link','formula')):
                    record['links']+=len(plan_links(cell))
                for link in references:
                    try:
                        channel,kind=classify(link,hint,context)
                    except ValueError:
                        continue
                    if not kind:
                        continue
                    project=assign(projects, ' '.join(selected), name, ' '.join(row_values),link)
                    if not project:
                        unresolved.append({'doc':doc['id'],'sheet':name,'cell':cell['ref'],'link':link,'projects':projects,
                                           'reason':'SHARED_PLAN_SOURCE_NO_UNIQUE_SCOPE'})
                        continue
                    proof={'project':project,'planUrl':doc['url'],'sheet':name,'cell':cell['ref'],'url':link,
                           'workbook_status':doc['copy_status'],'kind':kind}
                    if kind=='content_reference':
                        content.append(proof)
                    elif (SOURCE_SHEET.search(hint) or col in linkcols and selected) and not REFERENCE_SHEET.search(hint):
                        key=url_key(channel,link)
                        if key:
                            record['source_occurrences']+=1
                            display=next((v for v in selected if len(v)<=105 and not list(urls({'text':v}))),None)
                            meta=row_metadata(row,idcols,followercols,channel,kind)
                            source_groups[key,project].append({**proof,'name':display,**meta})


def inventory(docs):
    keyword_entries,source_groups,content,unresolved,files=[],defaultdict(list),[],[],[]
    for index,doc in enumerate(docs,1):
        projects=list(doc['projects'])
        current=ROOT/'browser-plans'/f"{doc['id']}.xlsx"
        if current.is_file():
            doc={**doc,'file':str(current),'copy_status':'LIVE_AUTHENTICATED'}
        if doc['id'] in BACKUP_NOTES:
            doc={**doc,'browser_status':BACKUP_NOTES[doc['id']]}
        if doc['id'] in PRIMARY_CONTENT_OWNERS:
            doc={**doc,'content_owner':PRIMARY_CONTENT_OWNERS[doc['id']]}
            projects=[doc['content_owner']]
        if doc['copy_status']=='UNREADABLE':
            doc={**doc,'browser_status':'VIEWER_REQUIRED' if doc['fetch_status']=='HTTP_401' else 'FILE_DELETED' if doc['fetch_status']=='HTTP_410' else doc['fetch_status']}
        target={**doc,'sheets':[]}
        files.append(target)
        if not doc['file']:
            continue
        try:
            sheets=list(read_book(doc['file']))
        except (ValueError,KeyError,BadZipFile,OSError) as error:
            target['copy_status']=f'READ_ERROR_{type(error).__name__}'
            continue
        inspect_sources(doc,sheets,source_groups,content,unresolved,target['sheets'])
        if index%15==0:
            print(f'Inspected {index}/{len(docs)} document assignments',flush=True)
        if doc.get('document_role')=='TOPIC_INDEX':
            continue
        extracted,_=xlsx_inventory({doc['id']:{**doc,'projects':projects}},book_reader=lambda _:sheets)
        sheet_counts=Counter(p['sheet'] for _,_,p in extracted)
        for record in target['sheets']:
            record['keyword_cells']=sheet_counts[record['name']]
        for group,raw,proof in extracted:
            project=assign(group,proof['subject'],proof['sheet'],raw)
            if project and not CREDENTIAL_TEXT.search(raw):
                keyword_entries.append([[project],raw,proof])
        if doc['id']=='19_CWyPbLARrUrq_kKvAWie-tjuIHpWkq':
            rows=next(s['rows'] for s in sheets if s['name']=='Từ khóa')
            for n in (6,7,8,9,13,14,15,16,17):
                term=field(rows[n],'B')
                keyword_entries.append([['30SHINE'],term,origin(doc['url'],'Từ khóa',f'B{n}','scoped_main','30SHINE','1')])
        if doc['id']=='1Uux5aoruRaBsV2VD_f0A86kIZCb28GIY':
            tab=next(s for s in sheets if s['name']=='Từ khóa các thương hiệu')
            headings=tab['rows'][1]
            for col,heading in headings.items():
                subject=heading['text'].strip()
                key=query_key(subject)
                if key not in VIN_ENTITIES:
                    continue
                keyword_entries.append([['Vingroup'],subject,origin(doc['url'],tab['name'],heading['ref'],'scoped_main',subject,'1')])
                for n,row in tab['rows'].items():
                    if n>1 and (raw:=field(row,col)) and query_key(raw).startswith(key) and term_shape(raw) and not CREDENTIAL_TEXT.search(raw):
                        keyword_entries.append([['Vingroup'],raw,origin(doc['url'],tab['name'],row[col]['ref'],'scoped_main',subject,'1')])
    return keyword_entries,source_groups,content,unresolved,files


def review_sources(db,groups):
    known=defaultdict(set)
    for key,channel,link,originals in db.execute('SELECT source_key,channel,link,original_links_json FROM sources'):
        for url in [link,*json.loads(originals)]:
            if norm:=url_key(channel,url):
                known[norm].add(key)
    membership=set(db.execute('SELECT source_key,project_name FROM source_projects'))
    accepted,conflicts=[],[]
    for (identity,project),proofs in groups.items():
        ids=known[identity]
        if len(ids)>1:
            conflicts.append({'project':project,'link':proofs[0]['url'],'reason':'MULTIPLE_CATALOG_SOURCE_KEYS','source_keys':sorted(ids)})
            continue
        source=next(iter(ids),hashlib.sha256(encode(identity).encode()).hexdigest()[:24])
        types={p['kind'] for p in proofs}-{'unknown'}
        kind=next(iter(types),'unknown') if len(types)<=1 else 'unknown'
        accepted.append({'project':project,'source_key':source,'channel':identity[0],'identity':identity,'type':kind,
                         'new_source':not ids,'new_membership':(source,project) not in membership,
                         'proofs':list({(p['planUrl'],p['sheet'],p['cell'],p['url']):p for p in proofs}.values())})
    return accepted,conflicts


def add_sources(db,rows):
    changes=Counter()
    typed=defaultdict(set)
    for row in rows:
        if row['type']!='unknown':
            typed[row['source_key']].add(row['type'])
    for row in rows:
        p, key, channel, kind = (row[f] for f in ('project','source_key','channel','type'))
        if len(typed[key])>1:
            kind='unknown'
        evidence=row['proofs']
        link=evidence[0]['url']
        display=next((e['name'] for e in evidence if e['name']),None)
        privacy=privacy_from_plan(evidence) if kind=='group' else {}
        visibility=next(iter(privacy),None) if len(privacy)==1 else None
        source_type='group_'+(visibility or 'unknown') if kind=='group' else kind
        native=numeric_url_id(channel,row['identity'])
        plan_ids={e['plan_id'] for e in evidence if 'plan_id' in e}
        followers={e['plan_follower'] for e in evidence if 'plan_follower' in e}
        plan_id=next(iter(plan_ids)) if len(plan_ids)==1 else None
        follower=next(iter(followers)) if len(followers)==1 else None
        if len(plan_ids)>1 or (plan_id and native and plan_id!=native):
            status,native='CONFLICT',None
        else:
            status='URL_ONLY' if native else 'PLAN_LISTED' if plan_id else 'UNRESOLVED'
        changes['sources_added']+=db.execute('''INSERT OR IGNORE INTO sources
            (source_key,channel,type,name,link,id,id_status,group_privacy,group_privacy_status,
             source_status,identity_evidence_json,original_links_json,evidence_json,follower,follower_kind,
             follower_precision,follower_source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
             (key,channel,source_type,display,link,native or (plan_id if status=='PLAN_LISTED' else None),status,
              visibility,'PLAN_LABEL' if visibility else None,'PLAN_FULL_AUDIT','[]',
              encode(list(dict.fromkeys(e['url'] for e in evidence))),encode({'plan_full_audit':evidence}),
              follower,('subscribers' if channel=='youtube' else 'followers') if follower is not None else None,
              'exact' if follower is not None else None,'plan' if follower is not None else None)).rowcount
        old=db.execute('SELECT origins_json FROM source_projects WHERE source_key=? AND project_name=?',(key,p)).fetchone()
        previous=json.loads(old[0]) if old else []
        origins={encode(e):e for e in [*previous,*evidence]}
        if len(origins)!=len(previous):
            db.execute('''INSERT INTO source_projects VALUES (?,?,?) ON CONFLICT(source_key,project_name)
                DO UPDATE SET origins_json=excluded.origins_json''',(key,p,encode(list(origins.values()))))
            changes['new_project_sources' if not old else 'project_source_provenance_updated']+=1
    return dict(changes)


def allow_keyword(row):
    word, project = row['keyword'],row['project']
    key=query_key(word)
    if (project,key) in REJECT_KEYWORDS or CREDENTIAL_TEXT.search(word):
        return False
    if project in HOSPITALS and (key in HOSPITAL_AMBIGUOUS or key in HOSPITAL_TYPOS
          or re.search(r'\balert with tag\b|\(added\s',word,re.I)):
        return False
    if project=='Hưng Thịnh Corp' and key.startswith('duanbienhoauniversecomplexnothue'):
        return False
    return True


def project_links(roster,files):
    result={p:{'project':p,'chosen_plan':None,'references':[]} for p in roster['active_projects']}
    for doc in files:
        has_contents=bool(doc['sheets']) and doc.get('document_role')!='TOPIC_INDEX'
        for p,refs in doc['projects'].items():
            roles=sorted({r['role'] for r in refs})
            rejected=bool(doc.get('content_owner') and doc['content_owner']!=p)
            reference={'id':doc['id'],'url':doc['url'],'copy_status':doc['copy_status'],
                'browser_status':doc.get('browser_status'),'roles':roles,'cells':[r['cell'] for r in refs],
                'worksheet_count':len(doc['sheets']),'can_use_as_plan':has_contents and not rejected,
                'document_role':'OTHER_PROJECT_TOPIC' if rejected else doc.get('document_role','WORKBOOK')}
            result[p]['references'].append(reference)
    for p,row in result.items():
        usable=[d for d in row['references'] if d['can_use_as_plan']]
        replacements=[d for d in usable if REPLACEMENT_PLAN.get(p)==d['id']]
        primary=[d for d in usable if 'MAIN' in d['roles']]
        if eligible:=replacements or primary or usable:
            if len(eligible)==1:
                row['chosen_plan']=eligible[0]
            else:
                row['usable_plans']=eligible
        elif not row['references']:
            row['reason']='NO_ACTIVE_WORKBOOK_LINK'
        else:
            row['reason']='NO_READABLE_WORKBOOK'
    return result


def apply_links(db,roster,files,links,status,checked):
    main_changes=[]
    for project,info in links.items():
        candidates=[p for row in roster['projects'][project] if row['status'] in ACTIVE for p in row['plans']]
        chosen=info['chosen_plan']
        primary=next(iter(candidates),None) if len({p['id'] for p in candidates})==1 else None
        plan=(chosen if chosen and REPLACEMENT_PLAN.get(project)==chosen['id'] else primary)
        if plan:
            current,=db.execute('SELECT plan_url FROM projects WHERE project_name=?',(project,)).fetchone()
            if current!=plan['url']:
                db.execute('UPDATE projects SET plan_url=? WHERE project_name=?',(plan['url'],project))
                main_changes.append({'project':project,'previous':current,'current':plan['url']})
    for doc in files:
        state=doc['copy_status'] if doc['sheets'] else doc.get('browser_status',doc['copy_status'])
        if doc['id']==OLD_30SHINE and links['30SHINE']['chosen_plan']:
            state='SUPERSEDED_BY_VERIFIED_TOPIC_PLAN'
        references=[[p,status[p]] for p in doc['projects'] if not doc.get('content_owner') or doc['content_owner']==p]
        sheet_stats={s['name']:{'cells':s['cells'],'state':s['state']} for s in doc['sheets']}
        db.execute('''INSERT INTO plan_refresh_documents VALUES (?,?,?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET
            plan_url=excluded.plan_url,comparison_status=excluded.comparison_status,projects_json=excluded.projects_json,
            changed_tabs_json=excluded.changed_tabs_json,checked_at=excluded.checked_at''',
            (doc['id'],doc['url'],state,encode(references),encode(sheet_stats),checked))
        db.execute('UPDATE plan_access_gaps SET status=? WHERE instr(plan_url,?)>0 AND lower(project_status) IN (?,?)',
                   (state,'/d/'+doc['id'],'running','running trial'))
    return main_changes


def dashboard_coverage(report,links,files):
    path=OUT/'cross-platform-summary.json'
    current=read_json(path)
    gaps=[]
    for project,row in links.items():
        if row.get('chosen_plan') or row.get('usable_plans'):
            continue
        if not row['references']:
            gaps.append({'projects':[project],'url':None,'fetch_status':row['reason']})
        else:
            for ref in row['references']:
                gaps.append({'projects':[project],'url':ref['url'],'fetch_status':ref['browser_status'] or ref['copy_status']})
    current['running_links_without_local_copy']=gaps
    current['plan_full_audit']={k:report[k] for k in ('checked_at','active_projects','documents_by_copy_status',
        'worksheets','hidden_worksheets','cells','keyword_updates','source_updates')}
    write_json(path,current)


def review_new_plan_columns(files):
    """Capture direct terms where a merged header leaves the keyword column unnamed."""
    by_id={doc['id']:doc for doc in files}
    specs={
        '15pMujYFC5pi7PoBeAyFndK_Q0Ia8i3XP': ('KAO Việt Nam','Keyword',{
            'B':[2,7,8,9,10], 'C':[3,4], 'D':[3], 'E':[3], 'G':[3]}),
        '1MlquDgEqdZEYY9VkJyw5m2gHjJ5qnnUs': ('Nestle Campaign','Keywords',{'C':[9]}),
    }
    added=defaultdict(list)
    for ident,(project,tab,columns) in specs.items():
        doc=by_id[ident]
        name,rows=next((s['name'],s['rows']) for s in read_book(doc['file'],lambda n:n.strip()==tab))
        for column,numbers in columns.items():
            for n in numbers:
                raw=field(rows[n],column)
                for token in raw.split(','):
                    term=token.strip()
                    if not term_shape(term) or query_key(term)=='nan':
                        continue
                    proof=origin(doc['url'],name,f'{column}{n}','scoped_main',project,'1')
                    added[project,query_key(term)].append({**proof,'original':term,'keyword':term,'decision':'DIRECT',
                        'level':1,'resolved_subject':project})
    return added


def separate_reference_sources(rows):
    """Keep historical discussion exports and their ambiguous Facebook routes as references."""
    chosen,references=[],[]
    for row in rows:
        proofs=[]
        for proof in row['proofs']:
            if row['project']=='BIDV' and proof['sheet']=='List Group 2025':
                references.append({**proof,'reason':'HISTORICAL_DISCUSSION_EXPORT_NUMERIC_FACEBOOK_ROUTE'})
            else:
                proofs.append(proof)
        if proofs:
            chosen.append({**row,'proofs':proofs})
    return chosen,references


def apply_reviewed(roster,docs):
    report=read_json(ROOT/'coverage-preview.json')
    files=report['files']
    if [doc['id'] for doc in files]!=[doc['id'] for doc in docs] or len(files)!=len(roster['documents']):
        raise RuntimeError('Preview plan coverage is out of date')
    active=set(roster['active_projects'])
    sources,references=separate_reference_sources(read_json(ROOT/'source-choices-preview.json'))
    choices=read_json(ROOT/'keyword-choices-preview.json')
    links=project_links(roster,files)
    checked=datetime.now(timezone.utc).isoformat()
    with closing(sqlite3.connect(DB.resolve().as_uri()+'?mode=rw',uri=True)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        statuses=dict(db.execute('SELECT project_name,plan_status FROM projects'))
        if any(statuses.get(p) not in ACTIVE for p in active) or any(r['project'] not in active for r in [*sources,*choices]):
            raise RuntimeError('The chosen records include a project outside current scope')
        before=ready_counts(db)
        if sum(c['total'] for c in before.values())!=report['keyword_before']:
            raise RuntimeError('The catalog changed after the preview')
        additional,_,variants,_=resolve(db,review_new_plan_columns(files))
        choices_by_key={(r['project'],query_key(r['keyword'])):r for r in choices if allow_keyword(r)}
        for row in additional:
            choices_by_key.setdefault((row['project'],query_key(row['keyword'])),row)
        choices=list(choices_by_key.values())
        with db:
            db.execute('BEGIN IMMEDIATE')
            apply_updates(db,choices,statuses,AUDIT)
            retain_variant_evidence(db,variants,AUDIT)
            counts=add_sources(db,sources)
            cursor=db.executemany('INSERT OR IGNORE INTO plan_refresh_content_links VALUES (?,?,?,?,?)',
                [(r['project'],r['url'],r['planUrl'],r['sheet'],r['cell']) for r in references])
            counts['historical_references_archived']=cursor.rowcount
            main_changes=apply_links(db,roster,files,links,statuses,checked)
            merged,conflicts=reconcile(db)
            if db.execute('PRAGMA quick_check').fetchone()!=('ok',) or db.execute('PRAGMA foreign_key_check').fetchall():
                raise RuntimeError('Catalog integrity check failed')
        update_summaries(db)
        after=ready_counts(db)
        levels=dict(db.execute('SELECT Level,count(*) FROM search_queue GROUP BY Level'))
    report.update(checked_at=checked,applied=True,keyword_updates=len(choices),keyword_after=sum(c['total'] for c in after.values()),
                  keyword_levels=levels,source_updates=counts,main_links_updated=main_changes,
                  normalization_merges=merged,normalization_conflicts=conflicts)
    for p in active:
        report['projects'][p]['after']=after.get(p,{})
    write_json(ROOT/'coverage-applied.json',report)
    write_json(ROOT/'project-links-applied.json',links)
    write_json(ROOT/'keyword-choices-applied.json',choices)
    write_json(ROOT/'source-choices-applied.json',sources)
    dashboard_coverage(report,links,files)
    print(encode({k:v for k,v in report.items() if k not in {'files','projects','missing_plan','main_links_updated'}}))


def finish_source_metadata():
    """Use the explicit source-name and site-ID columns for the large plan tables."""
    path=ROOT/'coverage-applied.json'
    report=read_json(path)
    docs={d['id']:d for d in report['files']}
    bids=docs['1EOQXcznOsew_SaC87-8_htcfJlCyNfBf']
    cohorts=[(docs['1ER-97E6XusDf4XJYA33ayebU-d3u94tY'],'BIDV','Top Users KOLs','B','C'),
             (docs['15jj5qDWc_wBn4tu1TfuSQAbvRZPgzH1w'],'Vinamilk','Source KOLS','A','B')]
    historical=[]
    for sheet in read_book(bids['file'],lambda n:n=='List Group 2025'):
        for n,row in sheet['rows'].items():
            if n==1 or not (link:=field(row,'C')) or not url_key('facebook',link):
                continue
            site=field(row,'A')
            if CREDENTIAL_TEXT.search(site):
                continue
            raw_id=field(row,'B')
            discussions=field(row,'D').removesuffix('.0')
            historical.append(('BIDV',bids['url'],sheet['name'],f'C{n}',site or None,link,raw_id or None,
                               int(discussions) if discussions.isdigit() else None,'HISTORICAL_REFERENCE_TYPE_UNVERIFIED'))
    with closing(sqlite3.connect(DB.resolve().as_uri()+'?mode=rw',uri=True)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        with db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('''CREATE TABLE IF NOT EXISTS plan_source_reference_records (
                project_name TEXT NOT NULL REFERENCES projects, plan_url TEXT NOT NULL,
                sheet TEXT NOT NULL, cell TEXT NOT NULL, name TEXT, link TEXT NOT NULL,
                plan_site_id TEXT, discussions INTEGER, status TEXT NOT NULL,
                PRIMARY KEY(project_name,plan_url,sheet,cell))''')
            db.executemany('INSERT OR IGNORE INTO plan_source_reference_records VALUES (?,?,?,?,?,?,?,?,?)',historical)
            named=0
            for doc,project,tab,name_col,link_col in cohorts:
                known=defaultdict(set)
                for key,link in db.execute('''SELECT s.source_key,s.link FROM sources s JOIN source_projects p USING(source_key)
                    WHERE p.project_name=? AND s.channel='facebook' ''',(project,)):
                    known[url_key('facebook',link)].add(key)
                for sheet in read_book(doc['file'],lambda n:n==tab):
                    for n,row in sheet['rows'].items():
                        name,link=field(row,name_col),field(row,link_col)
                        if n==1 or not name or not link or len(name)>105 or CREDENTIAL_TEXT.search(name):
                            continue
                        keys=known[url_key('facebook',link)]
                        if len(keys)!=1:
                            continue
                        key=next(iter(keys))
                        named+=db.execute("UPDATE sources SET name=? WHERE source_key=? AND coalesce(name,'')=''",(name,key)).rowcount
            assert db.execute('PRAGMA quick_check').fetchone()==('ok',)
            assert not db.execute('PRAGMA foreign_key_check').fetchall()
    report['source_updates'].update(named_existing_sources=named,historical_reference_rows=len(historical))
    write_json(path,report)
    dashboard_coverage(report,read_json(ROOT/'project-links-applied.json'),report['files'])
    print(encode({'names_filled':named,'historical_reference_rows':len(historical)}))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--apply-reviewed',action='store_true')
    parser.add_argument('--finish-source-metadata',action='store_true')
    args=parser.parse_args()
    if args.finish_source_metadata:
        finish_source_metadata()
        return
    roster=read_json(ROOT/'roster.json')
    active=set(roster['active_projects'])
    docs=read_json(ROOT/'access.json')
    if any(set(d['projects'])-active for d in docs):
        raise RuntimeError('Plan manifest contains a stopped or unassigned project')
    if args.apply_reviewed:
        apply_reviewed(roster,docs)
        return
    entries,groups,content,unresolved,files=inventory(docs)
    links=project_links(roster,files)
    checked=datetime.now(timezone.utc).isoformat()
    with closing(sqlite3.connect(DB.resolve().as_uri()+('?mode=rw' if args.apply else '?mode=ro'),uri=True)) as db:
        status=dict(db.execute('SELECT project_name,plan_status FROM projects'))
        if any(status.get(p) not in ACTIVE for p in active):
            raise RuntimeError('Active plan roster disagrees with the catalog')
        _,matches,by_project,_=propose(db,{'entries':entries})
        for projects,term,evidence in entries:
            if evidence['kind']=='scoped_main':
                matches[projects[0],query_key(term)].append({**evidence,'original':term,'keyword':term,
                    'decision':'DIRECT','level':1,'resolved_subject':evidence['subject']})
        updates,review,variants,_=resolve(db,matches)
        updates=[row for row in updates if allow_keyword(row)]
        sources,source_conflicts=review_sources(db,groups)
        counts={}
        main_changes=[]
        before=ready_counts(db)
        if args.apply:
            db.execute('PRAGMA foreign_keys=ON')
            with db:
                db.execute('BEGIN IMMEDIATE')
                apply_updates(db,updates,status,AUDIT)
                retain_variant_evidence(db,variants,AUDIT)
                counts=add_sources(db,sources)
                db.executemany('INSERT OR IGNORE INTO plan_refresh_content_links VALUES (?,?,?,?,?)',
                    [(r['project'],r['url'],r['planUrl'],r['sheet'],r['cell']) for r in content])
                main_changes=apply_links(db,roster,files,links,status,checked)
                reconcile(db)
                if db.execute('PRAGMA quick_check').fetchone()!=('ok',) or db.execute('PRAGMA foreign_key_check').fetchall():
                    raise RuntimeError('Catalog integrity check failed')
            update_summaries(db)
        after=ready_counts(db)
    report={'checked_at':checked,'applied':args.apply,'active_projects':len(active),
            'skipped_stop_projects':len(roster['stop_projects']),'files':files,
            'documents_by_copy_status':dict(Counter(d['copy_status'] for d in files)),
            'worksheets':sum(len(f['sheets']) for f in files),'hidden_worksheets':sum(s['state']!='visible' for f in files for s in f['sheets']),
            'cells':sum(s['cells'] for f in files for s in f['sheets']),'keyword_entries':len(entries),
            'keyword_updates':len(updates),'keyword_before':sum(c['total'] for c in before.values()),
            'keyword_after':sum(c['total'] for c in after.values()),'source_updates':counts,
            'source_candidates':len(sources),'source_new_memberships_preview':sum(r['new_membership'] for r in sources),
            'new_source_keys_preview':len({r['source_key'] for r in sources if r['new_source']}),
            'content_references':len(content),'unresolved_shared_source_cells':len(unresolved),'conflicting_source_links':len(source_conflicts),
            'keyword_review':len(review),'missing_plan':roster['missing_plan'],'project_mapping_issues':len(roster['mapping_issues']),
            'main_links_updated':main_changes,
            'projects':{p:{'before':before.get(p,{}),'after':after.get(p,{}),'keywords':dict(by_project[p])} for p in sorted(active)}}
    suffix='applied' if args.apply else 'preview'
    write_json(ROOT/f'coverage-{suffix}.json',report)
    write_json(ROOT/f'project-links-{suffix}.json',links)
    write_json(ROOT/f'keyword-choices-{suffix}.json',updates)
    write_json(ROOT/f'source-choices-{suffix}.json',[row for row in sources if row['new_source'] or row['new_membership']])
    write_json(ROOT/f'scope-review-{suffix}.json',{'source_unresolved':unresolved,'source_conflicts':source_conflicts,
        'keyword_review':review,'project_mapping_issues':roster['mapping_issues']})
    if args.apply:
        dashboard_coverage(report,links,files)
    print(encode({k:v for k,v in report.items() if k not in {'files','projects','missing_plan'}}),flush=True)


if __name__=='__main__':
    main()
