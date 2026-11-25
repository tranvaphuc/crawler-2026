"""Read-only dashboard for the local keyword and source catalog."""
import argparse
from contextlib import closing
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
from pathlib import Path
import sqlite3
import unicodedata
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / 'outputs/source-keyword-catalog-2026-11-19/source-keyword-catalog.sqlite'
STATIC = ROOT / 'src/catalog-dashboard'
PLATFORMS = {'facebook', 'youtube', 'news'}
VERIFIED = "id_status IN ('ARCHIVE_VERIFIED','PLATFORM_VERIFIED') AND id IS NOT NULL AND type <> 'unknown'"
CANONICAL = """(SELECT replacement FROM keyword_quality_audit qa
    WHERE qa.project_name=k.ProjectName AND qa.keyword=k.Keyword AND qa.current_status='ALIAS'
    AND qa.replacement IS NOT NULL ORDER BY qa.rowid DESC LIMIT 1)"""


@lru_cache(maxsize=4096)
def fold(value):
    text = unicodedata.normalize('NFKD', (value or '').casefold().replace('đ', 'd'))
    return ''.join(char for char in text if not unicodedata.combining(char))


def open_catalog(path):
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=3)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    db.create_function('fold', 1, fold, deterministic=True)
    return db


def metadata(db):
    return {'projects': [r[0] for r in db.execute('SELECT project_name FROM projects ORDER BY project_name COLLATE NOCASE')],
            'channels': [r[0] for r in db.execute('SELECT DISTINCT channel FROM sources ORDER BY channel')],
            'types': [r[0] for r in db.execute('SELECT DISTINCT type FROM sources ORDER BY type')],
            'statuses': [r[0] for r in db.execute('SELECT DISTINCT Status FROM keyword_catalog ORDER BY Status')],
            'platform_statuses': [r[0] for r in db.execute('SELECT DISTINCT status FROM keyword_platform_audit ORDER BY status')]}


def page_args(params):
    return max(1, int(params.get('page', '1'))), min(100, max(1, int(params.get('limit', '25'))))


def filters(params, supported):
    clauses, values = [], []
    for field, sql in supported.items():
        if value := params.get(field):
            clauses.append(sql)
            values.append(value)
    return clauses, values


def text_filter(clauses, values, params, columns):
    if query := fold(params.get('q', '').strip()):
        clauses.append('(' + ' OR '.join(f'instr(fold({column}),?) > 0' for column in columns) + ')')
        values.extend([query] * len(columns))


def keyword_page(db, params):
    page, limit = page_args(params)
    platform = params.get('platform', '')
    if platform and platform not in PLATFORMS:
        raise ValueError('Kênh keyword không hợp lệ.')
    clauses, values = filters(params, {'project': 'k.ProjectName=?', 'level': 'k.Level=?',
                                      'status': ('a.status=?' if platform else 'k.Status=?')})
    if params.get('status') != 'ALIAS':
        clauses.append("k.Status <> 'ALIAS'")
        if platform:
            clauses.append("a.status <> 'ALIAS'")
    text_filter(clauses, values, params, ('k.Keyword','k.ProjectName','k.subjects_json'))
    if params.get('kind') == 'tag':
        clauses.append("k.Keyword LIKE '#%'")
    elif params.get('kind') == 'plain':
        clauses.append("k.Keyword NOT LIKE '#%'")
    base = 'FROM keyword_catalog k'
    fields = 'k.Keyword AS keyword,k.ProjectName AS project,k.Level AS level,k.Status AS catalog_status,k.project_status,k.subjects_json'
    if platform:
        base += ' JOIN keyword_platform_audit a ON a.project_name=k.ProjectName AND a.keyword=k.Keyword AND a.platform=?'
        values.insert(0, platform)
        fields += ',a.status,a.canonical_keyword,a.search_url'
    else:
        fields += f",k.Status AS status,CASE WHEN k.Status='ALIAS' THEN {CANONICAL} END AS canonical_keyword"
    if clauses:
        base += ' WHERE ' + ' AND '.join(clauses)
    status = 'a.status' if platform else 'k.Status'
    summary = dict(db.execute(f"""SELECT count(*) AS total,
        count(*) FILTER (WHERE k.Level=1) AS level_1, count(*) FILTER (WHERE k.Level=2) AS level_2,
        count(*) FILTER (WHERE k.Keyword LIKE '#%') AS hashtags,
        count(*) FILTER (WHERE {status}='READY') AS ready,
        count(*) FILTER (WHERE {status}='NOT_CHECKED') AS not_checked {base}""", values).fetchone())
    summary['plain'] = summary['total'] - summary['hashtags']
    rows = db.execute('SELECT ' + fields + ' ' + base + ' ORDER BY k.Keyword COLLATE NOCASE,k.ProjectName LIMIT ? OFFSET ?',
                      [*values,limit,(page-1)*limit]).fetchall()
    return {'total':summary['total'], 'summary':summary, 'items':[dict(r) for r in rows]}


def source_page(db, params):
    page, limit = page_args(params)
    clauses, values = filters(params, {'channel':'s.channel=?','type':'s.type=?',
        'project':'EXISTS(SELECT 1 FROM source_projects sp WHERE sp.source_key=s.source_key AND sp.project_name=?)'})
    text_filter(clauses, values, params, ('s.name','s.link','s.id'))
    if params.get('id_state') == 'verified':
        clauses.append(f'({VERIFIED})')
    elif params.get('id_state') == 'unverified':
        clauses.append(f'NOT ({VERIFIED})')
    elif params.get('id_state') == 'conflict':
        clauses.append("s.id_status='CONFLICT'")
    if params.get('follower') == 'known':
        clauses.append('s.follower IS NOT NULL')
    elif params.get('follower') == 'unknown':
        clauses.append('s.follower IS NULL')
    base = 'FROM sources s' + (' WHERE ' + ' AND '.join(clauses) if clauses else '')
    summary = dict(db.execute(f'''SELECT count(*) AS total, count(*) FILTER (WHERE {VERIFIED}) AS verified,
        count(*) FILTER (WHERE s.follower IS NOT NULL) AS with_count,
        count(*) FILTER (WHERE s.type IN ('group_public','group_private','group_unknown')) AS groups,
        count(DISTINCT s.channel) AS channels {base}''', values).fetchone())
    order = 's.follower DESC,' if params.get('sort') == 'followers' else ''
    rows = db.execute(f'''SELECT s.source_key AS key,s.channel,s.type,s.name,s.link,s.id,s.id_status,s.follower,
        s.follower_kind,s.follower_precision,s.group_privacy,s.source_status,({VERIFIED}) AS verified,
        (SELECT json_group_array(project_name) FROM source_projects WHERE source_key=s.source_key) AS projects_json
        {base} ORDER BY {order} s.name IS NULL,s.name COLLATE NOCASE,s.source_key LIMIT ? OFFSET ?''',
        [*values,limit,(page-1)*limit]).fetchall()
    return {'total':summary['total'], 'summary':summary, 'items':[dict(r) for r in rows]}


def keyword_detail(db, params):
    key = (params.get('project',''),params.get('keyword',''))
    row = db.execute(f"SELECT k.*,CASE WHEN k.Status='ALIAS' THEN {CANONICAL} END AS canonical_keyword "
                     'FROM keyword_catalog k WHERE k.ProjectName=? AND k.Keyword=?',key).fetchone()
    if row is None:
        return None
    audit = db.execute('''SELECT platform,status,canonical_keyword,reason,search_url,sample_status,checked_at
        FROM keyword_platform_audit WHERE project_name=? AND keyword=? ORDER BY platform''',key).fetchall()
    return {'keyword':row['Keyword'],'project':row['ProjectName'],'level':row['Level'],'status':row['Status'],
            'subjects':json.loads(row['subjects_json']),'reasons':json.loads(row['reasons_json']),
            'canonical_keyword':row['canonical_keyword'], 'evidence':json.loads(row['evidence_json']),
            'channels':[dict(r) for r in audit]}


def source_detail(db, params):
    row = db.execute(f'SELECT *,({VERIFIED}) AS verified FROM sources WHERE source_key=?',(params.get('key',''),)).fetchone()
    if row is None:
        return None
    projects = db.execute('SELECT project_name FROM source_projects WHERE source_key=? ORDER BY project_name',(row['source_key'],)).fetchall()
    evidence = json.loads(row['identity_evidence_json'])
    return {**{key:row[key] for key in ('channel','type','name','link','id','id_status','follower','follower_kind',
                'follower_precision','follower_as_of','group_privacy','group_privacy_status','source_status','verified')},
            'projects':[r[0] for r in projects],
            'identity_evidence':[{key:item[key] for key in ('id','type','name','evidence','checked_at') if key in item}
                                 for item in evidence if isinstance(item,dict) and 'evidence' in item][-8:]}


@lru_cache(maxsize=2)
def audit_file(path, version):
    return json.loads(path.read_text(encoding='utf-8'))


def read_audit(directory, name, default):
    path = directory / 'cross-platform-audit' / name
    try:
        return audit_file(path, path.stat().st_mtime_ns)
    except FileNotFoundError:
        return default


def plan_page(directory, params):
    page, limit = page_args(params)
    project = params.get('project','')
    q = fold(params.get('q','').strip())
    summary = read_audit(directory,'cross-platform-summary.json',{})
    candidates = read_audit(directory,'plan-keyword-candidates.json',[])
    items = []
    for group in candidates:
        if not group:
            continue
        matched = [r for r in group if (not project or project == r['project']) and
                   (not q or any(q in fold(r.get(field)) for field in ('project','value','sheet','subject','cell')))]
        if matched:
            row = matched[0]
            items.append({'project':row['project'],'keyword':row['value'],'sheet':row['sheet'],
                          'cell':row['cell'],'plan_url':row.get('plan_url'),'reason':row.get('reason'),
                          'origins':len({(r.get('plan_url'),r['sheet'],r['cell']) for r in matched})})
    gaps = [{k:g[k] for k in ('projects','fetch_status')} for g in summary.get('running_links_without_local_copy',[])
            if (not project or project in g['projects']) and (not q or any(q in fold(p) for p in g['projects']))]
    return {'total':len(items),'items':items[(page-1)*limit:page*limit],
            'summary':{'total':len(items),'origins':sum(r['origins'] for r in items),
                       'projects':len({r['project'] for r in items})}, 'coverage':{'gaps':gaps}}


class CatalogHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def log_request(self, code='-', size='-'):
        peer = ipaddress.ip_address(self.client_address[0])
        if peer.is_loopback or str(peer) == self.server.lan_ip:
            return
        if self.requestline.startswith('\x16\x03'):
            route = 'HTTPS handshake on HTTP port'
        else:
            path = getattr(self, 'path', '').split('?', 1)[0]
            route = path if path in {'/', '/app.js', '/style.css', '/api/meta', '/api/keywords', '/api/sources',
                                     '/api/plans', '/api/keyword', '/api/source'} else 'other'
        print(f'{self.log_date_time_string()} {peer} {route} {code}', flush=True)

    def reply(self, status, data, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        try:
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(data)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            return

    def json_reply(self, status, value):
        self.reply(status,json.dumps(value,ensure_ascii=False).encode('utf-8'),'application/json; charset=utf-8')

    def do_GET(self):
        host = self.headers.get('Host','').lower().split(':',1)[0]
        client = ipaddress.ip_address(self.client_address[0])
        if host not in self.server.allowed_hosts or not (client.is_loopback or client in self.server.lan):
            self.json_reply(403,{'error':'Chỉ truy cập từ máy này hoặc mạng LAN đã cấu hình.'})
            return
        route = urlsplit(self.path)
        assets = {'/':('index.html','text/html'),'/app.js':('app.js','text/javascript'),'/style.css':('style.css','text/css')}
        if route.path in assets:
            name, content_type = assets[route.path]
            self.reply(200,(STATIC/name).read_bytes(),content_type + '; charset=utf-8')
            return
        actions = {'/api/meta':lambda db,_:metadata(db),'/api/keywords':keyword_page,'/api/sources':source_page,
                   '/api/keyword':keyword_detail,'/api/source':source_detail}
        try:
            if len(route.query) >= 2500:
                raise ValueError('Query too long')
            params = {key:values[0] for key,values in parse_qs(route.query,max_num_fields=20).items()}
            if route.path == '/api/plans':
                result = plan_page(self.server.catalog.parent,params)
            elif route.path in actions:
                with closing(open_catalog(self.server.catalog)) as db:
                    db.execute('BEGIN')
                    result = actions[route.path](db,params)
                if route.path == '/api/meta':
                    result['lan_url'] = f'http://{self.server.lan_ip}:{self.server.server_port}' if self.server.lan_ip else None
            else:
                result = None
            self.json_reply(200 if result is not None else 404,result if result is not None else {'error':'Không tìm thấy dữ liệu.'})
        except (ValueError,OverflowError):
            self.json_reply(400,{'error':'Bộ lọc không hợp lệ.'})
        except sqlite3.Error:
            self.json_reply(503,{'error':'Kho dữ liệu đang bận hoặc chưa sẵn sàng. Thử lại sau.'})

    do_HEAD = do_GET


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--lan',type=ipaddress.IPv4Interface,help='LAN IP and prefix, e.g. 192.168.1.51/24')
    parser.add_argument('--db',type=Path,default=DEFAULT_DB)
    args = parser.parse_args()
    catalog = args.db.resolve(strict=True)
    with closing(open_catalog(catalog)) as db:
        db.execute('SELECT 1 FROM keyword_platform_audit LIMIT 1').fetchall()
    lan = args.lan
    if lan and (not lan.ip.is_private or lan.network.prefixlen < 16 or not lan.network.is_private):
        parser.error('--lan requires a private IPv4 subnet with a prefix of /16 or narrower')
    with ThreadingHTTPServer(('0.0.0.0' if lan else '127.0.0.1',args.port),CatalogHandler) as server:
        server.catalog = catalog
        server.lan = lan.network if lan else ipaddress.IPv4Network('127.0.0.0/8')
        server.lan_ip = str(lan.ip) if lan else None
        server.allowed_hosts = {'localhost','127.0.0.1',server.lan_ip}
        print(f'Local: http://localhost:{server.server_port}',flush=True)
        if lan:
            print(f'LAN: http://{server.lan_ip}:{server.server_port} ({server.lan})',flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
