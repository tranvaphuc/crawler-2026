"""Collect Facebook post search samples for active keyword projects through Chrome."""
import argparse
from collections import Counter, defaultdict, deque
from contextlib import closing
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import sqlite3
from threading import Lock
from urllib.parse import parse_qs, urlsplit

from collect_catalog_platform_audit import OUT, read_json, write_json
from finalize_catalog_cross_platform_audit import query_url
from review_vinamilk_facebook_search import catalog, normalize_sample

OUTPUT = OUT / 'active-facebook-keyword-review'
QUEUE = OUTPUT / 'queue.json'
OBSERVATIONS = OUTPUT / 'observations.sqlite'
REPORT = OUTPUT / 'summary.json'
ACTIVE = "lower(trim(p.plan_status)) IN ('running','running trial')"
LOCK = Lock()


def stage_db(path=None):
    db = sqlite3.connect(path if path is not None else OBSERVATIONS,timeout=12)
    db.row_factory = sqlite3.Row
    return db


def prepare_stage(path):
    with closing(stage_db(path)) as db, db:
        db.execute('''CREATE TABLE IF NOT EXISTS samples (key TEXT PRIMARY KEY, state TEXT NOT NULL, data TEXT NOT NULL)''')
        db.execute('''CREATE TABLE IF NOT EXISTS applied (key TEXT NOT NULL,project TEXT NOT NULL,data TEXT NOT NULL,
                      PRIMARY KEY(key,project),FOREIGN KEY(key) REFERENCES samples(key))''')


def prepare():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    if not QUEUE.is_file():
        with closing(catalog()) as db:
            rows = db.execute(f'''SELECT k.project_name,k.level,k.keyword,k.subjects_json,k.status catalog_status,
                      a.status platform_status
                FROM keywords k JOIN projects p USING(project_name)
                LEFT JOIN keyword_platform_audit a ON a.project_name=k.project_name AND a.keyword=k.keyword AND a.platform='facebook'
                WHERE {ACTIVE} AND k.status IN ('READY','CHANNEL_ONLY')
                      AND (a.status='NOT_CHECKED' OR a.status IS NULL)
                ORDER BY k.project_name COLLATE NOCASE,k.level,k.keyword LIKE '#%',length(k.keyword),k.keyword COLLATE NOCASE''').fetchall()
        projects = defaultdict(deque)
        for r in rows:
            projects[r['project_name']].append(r)
        exact = {}
        while any(projects.values()):
            for project, pending in projects.items():
                if not pending:
                    continue
                row=pending.popleft()
                keyword=row['keyword']
                item=exact.setdefault(keyword,{'key':str(len(exact)+1),'keyword':keyword,'url':query_url('facebook',keyword),'targets':[]})
                item['targets'].append({'project':project,'level':row['level'],'subjects':json.loads(row['subjects_json']),
                                        'catalog_status':row['catalog_status'],'platform_status':row['platform_status']})
        write_json(QUEUE,list(exact.values()))
    prepare_stage(OBSERVATIONS)
    print(json.dumps(progress(),ensure_ascii=False))


def progress():
    queue=read_json(QUEUE)
    targets=[t for r in queue for t in r['targets']]
    with closing(stage_db()) as db:
        observed=dict(db.execute('SELECT state,count(*) FROM samples GROUP BY state'))
        applied=db.execute('SELECT count(*) FROM applied').fetchone()[0]
        seen={r[0] for r in db.execute('SELECT key FROM samples')}
    by_level=Counter(t['level'] for t in targets)
    sampled=Counter(t['level'] for r in queue if r['key'] in seen for t in r['targets'])
    return {'projects':len({t['project'] for t in targets}),'project_keywords':len(targets),
            'unique_queries':len(queue),'levels':dict(by_level),'sampled_queries':len(seen),
            'sampled_project_keywords':sum(len(r['targets']) for r in queue if r['key'] in seen),
            'sampled_levels':dict(sampled),'sample_states':observed,'applied_project_keywords':applied}


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*_):
        pass

    def origin(self):
        return f'127.0.0.1:{self.server.server_port}'

    def pending(self):
        with closing(stage_db()) as db:
            seen={r[0] for r in db.execute('SELECT key FROM samples')}
        selection=parse_qs(urlsplit(self.path).query).get('level',[''])[0]
        level=int(selection) if selection in {'1','2'} else None
        return [r for r in self.server.queue if r['key'] not in seen
                and (not level or any(t['level']==level for t in r['targets']))]

    def render(self,message=''):
        remaining=self.pending()
        items=''.join(f'<li data-key="{r["key"]}"><a href="{escape(r["url"],quote=True)}">{escape(r["keyword"])}</a></li>'
                      for r in remaining[:48])
        body=f'''<!doctype html><meta charset="utf-8"><title>Rà keyword Facebook</title>
<h1>Keyword Facebook của project đang chạy</h1><p id="pending">Còn {len(remaining)} lượt tìm.</p>
<p id="receipt">{escape(message)}</p><ol id="queue">{items}</ol>
<form method="post" action="/submit"><label for="proof">Mẫu kết quả</label>
<textarea id="proof" name="proof" required></textarea><button>Lưu mẫu</button></form>'''.encode()
        self.send_response(200)
        self.send_header('Content-Type','text/html; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.headers.get('Host')!=self.origin() or urlsplit(self.path).path!='/':
            return self.send_error(404)
        self.render()

    def do_POST(self):
        if (self.headers.get('Host')!=self.origin() or self.headers.get('Origin')!=f'http://{self.origin()}'
            or self.path!='/submit'):
            return self.send_error(403)
        try:
            size=int(self.headers.get('Content-Length',0))
            if not 0<size<1800000:
                raise ValueError('Invalid batch size')
            payload=json.loads(parse_qs(self.rfile.read(size).decode())['proof'][0])
            if not isinstance(payload,list) or not 0<len(payload)<=48:
                raise ValueError('Invalid batch')
            rows=[self.normalize(self.server.by_key[p['key']],p) for p in payload]
            count=self.record(rows)
        except (TypeError,AttributeError,ValueError,KeyError,sqlite3.Error):
            return self.send_error(400, explain='Không lưu được mẫu tìm kiếm.')
        self.after_record(count)

    def after_record(self,count):
        self.render(f'Đã lưu {count} mẫu.')

    def normalize(self,item,payload):
        return normalize_sample(item,payload)

    def record(self,rows):
        with LOCK, closing(stage_db()) as db, db:
            count=db.total_changes
            db.executemany('INSERT OR IGNORE INTO samples VALUES (?,?,?)',
                           ((r['key'],r['status'],json.dumps(r,ensure_ascii=False,separators=(',',':'))) for r in rows))
            return db.total_changes-count


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('prepare','progress','serve'))
    parser.add_argument('--port',type=int,default=8873)
    args=parser.parse_args()
    if args.action=='prepare':
        prepare()
    elif args.action=='progress':
        print(json.dumps(progress(),ensure_ascii=False))
    else:
        with ThreadingHTTPServer(('127.0.0.1',args.port),Handler) as server:
            server.queue=read_json(QUEUE)
            server.by_key={r['key']:r for r in server.queue}
            print(f'http://127.0.0.1:{server.server_port}/',flush=True)
            server.serve_forever()


if __name__=='__main__':
    main()
