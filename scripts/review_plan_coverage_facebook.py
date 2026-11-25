"""Record Facebook searches for the 52 review rows from the active plan audit."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from http.server import ThreadingHTTPServer
import json
import sqlite3

from collect_catalog_platform_audit import read_json, write_json
from deduplicate_catalog_keywords import update_summaries
from finalize_catalog_cross_platform_audit import query_url
from reconcile_active_plan_coverage import FINAL
import review_catalog_facebook_keywords as receiver

AUDIT = 'active-plan-coverage-facebook-review'
FOLDER = FINAL.parent / 'facebook-review'
QUEUE = FOLDER / 'queue.json'
DECISIONS = FOLDER / 'decisions.json'
REPORT = FOLDER / 'report.json'
receiver.OUTPUT = FOLDER
receiver.QUEUE = QUEUE
receiver.OBSERVATIONS = FOLDER / 'observations.sqlite'


def prepare():
    FOLDER.mkdir(exist_ok=True)
    source = [row for row in read_json(FINAL)['keywords'] if row['decision'] == 'REVIEW']
    if len(source) != 52 or len({(r['project'],r['keyword']) for r in source}) != len(source):
        raise ValueError('The original plan audit must identify 52 unique project/keyword rows')
    queries = {}
    for row in source:
        word = row['keyword']
        query = queries.setdefault(word, {'key':str(len(queries)+1),'keyword':word,
                                    'url':query_url('facebook',word),'targets':[]})
        query['targets'].append({k:row[k] for k in ('project','level','subjects','evidence')})
    write_json(QUEUE,list(queries.values()))
    with closing(receiver.stage_db()) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS samples (key TEXT PRIMARY KEY, state TEXT NOT NULL, data TEXT NOT NULL)')
    print(f'{len(queries)} searches for {len(source)} project/keyword rows')


def serve(port):
    with ThreadingHTTPServer(('127.0.0.1',port),receiver.Handler) as server:
        server.queue=read_json(QUEUE)
        server.by_key={row['key']:row for row in server.queue}
        print(f'http://127.0.0.1:{server.server_port}/',flush=True)
        server.serve_forever()


def assemble():
    with closing(receiver.stage_db()) as db:
        results={row['key']:json.loads(row['data']) for row in db.execute('SELECT key,data FROM samples')}
    manual={(str(row['key']),row['project']):row for row in read_json(DECISIONS)}
    rows=[]
    queue=read_json(QUEUE)
    if set(results) != {item['key'] for item in queue}:
        raise ValueError('One or more exact Facebook searches are missing')
    for item in queue:
        key=item['key']
        sample=results[key]
        for target in item['targets']:
            decision=manual.pop((key,target['project']))
            status=decision['status']
            matched=decision.get('matches',[])
            cards=sample['cards']
            if (status not in {'READY','REVIEW'} or not decision['reason'].strip()
                    or len(set(matched)) != len(matched) or any(i<1 or i>len(cards) for i in matched)
                    or (status=='READY' and (sample['status']!='OK' or not matched))):
                raise ValueError(f'Invalid decision for {key} / {target["project"]}')
            rows.append({**target,'key':key,'keyword':item['keyword'],'url':item['url'],
                         'status':status,'reason':decision['reason'],'checked_at':sample['checked_at'],
                         'sample_status':sample['status'],'displayed':sample['displayed'],
                         'samples':[{'actor':post['actor'],'text':post['body'],'url':post['link'],
                                     'in_scope':index in matched} for index,post in enumerate(cards,1)]})
    if manual:
        raise ValueError('Found project/keyword decisions outside the requested audit')
    return rows


def apply(rows):
    with closing(receiver.catalog(write=True)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        with db:
            db.execute('BEGIN IMMEDIATE')
            for row in rows:
                project,word,status=(row[k] for k in ('project','keyword','status'))
                before=db.execute(f"""SELECT k.status catalog_status,k.level,k.reasons_json,a.status facebook_status,a.sample_status
                    FROM keywords k JOIN projects p USING(project_name)
                    JOIN keyword_platform_audit a USING(project_name,keyword)
                    WHERE {receiver.ACTIVE} AND k.project_name=? AND k.keyword=? AND a.platform='facebook'""",
                    (project,word)).fetchone()
                prior=db.execute('SELECT current_status FROM keyword_quality_audit WHERE audit_id=? AND project_name=? AND keyword=?',
                                 (AUDIT,project,word)).fetchone()
                if prior and before and prior[0]==before['catalog_status']==before['facebook_status']==status:
                    continue
                if (not before or before['catalog_status']!='REVIEW' or before['facebook_status']!='REVIEW'
                        or before['sample_status']!='PLAN_SCOPE' or before['level']!=row['level']):
                    raise ValueError(f'Unexpected state for {project} / {word}')
                reasons=[*json.loads(before['reasons_json']), 'Facebook. '+row['reason']]
                db.execute('UPDATE keywords SET status=?,reasons_json=? WHERE project_name=? AND keyword=?',
                           (status,json.dumps(reasons,ensure_ascii=False),project,word))
                db.execute("""UPDATE keyword_platform_audit SET status=?,reason=?,search_url=?,sample_status=?,checked_at=?,samples_json=?
                    WHERE project_name=? AND keyword=? AND platform='facebook'""",
                    (status,row['reason'],row['url'],'CHROME_PLAN_COVERAGE_'+row['sample_status'],row['checked_at'],
                     json.dumps(row['samples'],ensure_ascii=False),project,word))
                db.execute('INSERT INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',
                           (AUDIT,project,word,'REVIEW',status,row['level'],row['level'],None,row['reason']))
            if db.execute('PRAGMA quick_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
                raise sqlite3.IntegrityError('Keyword catalog integrity check failed')
        update_summaries(db)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','serve','apply'])
    parser.add_argument('--port',type=int,default=8878)
    args=parser.parse_args()
    if args.action=='prepare':
        prepare()
    elif args.action=='serve':
        serve(args.port)
    else:
        rows=assemble()
        apply(rows)
        projects=defaultdict(Counter)
        for row in rows:
            projects[row['project']][row['status']]+=1
        report={'total':len(rows),'searches':len({r['key'] for r in rows}),'counts':dict(Counter(r['status'] for r in rows)),
                'by_project':dict(projects),'keywords':rows}
        write_json(REPORT,report)
        print(json.dumps({k:v for k,v in report.items() if k!='keywords'},ensure_ascii=False))


if __name__=='__main__':
    main()
