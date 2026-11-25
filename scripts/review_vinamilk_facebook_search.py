"""Stage public Facebook search evidence from Chrome for Vinamilk Level 2."""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
from hashlib import sha256
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import sqlite3
from threading import Lock
from urllib.parse import parse_qs, urlsplit

from collect_catalog_platform_audit import OUT, read_json, write_json
from audit_catalog_search_keywords import DB

OUTPUT = OUT / 'vinamilk-facebook-keyword-review'
QUEUE = OUTPUT / 'queue.json'
SAMPLES = OUTPUT / 'observations.jsonl'
REPORT = OUTPUT / 'summary.json'
RESAMPLE = OUTPUT / 'resample.json'
PROJECT = 'Vinamilk'
SERIAL = Lock()
SCOPE = "k.project_name=? AND k.level=2 AND k.status='READY' AND a.platform='facebook'"
VALID_OUTCOMES = {'OK','EMPTY','NO_PUBLIC_SAMPLE','UNAVAILABLE','LOAD_UNCLEAR'}


def catalog(write=False):
    mode = 'rw' if write else 'ro'
    db = sqlite3.connect(f'{DB.resolve().as_uri()}?mode={mode}',uri=True,timeout=10)
    db.row_factory = sqlite3.Row
    return db


def prepare():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    if not QUEUE.exists():
        with closing(catalog()) as db:
            rows = db.execute(f'''SELECT k.keyword,k.subjects_json,a.search_url FROM keywords k
                JOIN keyword_platform_audit a USING(project_name,keyword)
                WHERE {SCOPE} AND a.status='NOT_CHECKED' ORDER BY k.keyword COLLATE NOCASE''',(PROJECT,)).fetchall()
        items = [{'key':str(i),'keyword':row['keyword'],'subjects':json.loads(row['subjects_json']),'url':row['search_url']}
                 for i,row in enumerate(rows,1)]
        if len(items)!=316:
            raise RuntimeError(f'Expected 316 unchecked keywords, found {len(items)}')
        write_json(QUEUE,items)
    print(json.dumps({'queued':len(read_json(QUEUE)),'observed':len(observations())}))


def observations():
    if not SAMPLES.exists():
        return {}
    with SAMPLES.open(encoding='utf-8') as stream:
        return {r['key']:r for line in stream if line.endswith('\n') and (r:=json.loads(line))}


def clean_text(value, max_length):
    value = re.sub(r'[\w.+-]+@[\w.%-]+\.[A-Za-z]{2,}|(?<!\w)(?:\+?\d[-. ()]?){9,}(?!\w)','[ẩn]',value)
    return ' '.join(value.split())[:max_length]


def post_url(value):
    url = urlsplit(value)
    if url.scheme!='https' or url.hostname not in {'facebook.com','www.facebook.com','m.facebook.com'}:
        return None
    path = url.path.rstrip('/')
    if re.fullmatch(r'/(?:[\w.%-]+/(?:posts|videos)/[\w.%-]+|groups/[\w.%-]+/(?:posts|permalink)/[\w.%-]+|reel/\d+)',path):
        return 'https://www.facebook.com'+path
    query = parse_qs(url.query)
    if path in {'/story.php','/permalink.php'} and set(query)>={'id','story_fbid'}:
        group_id, post_id = query['id'][0],query['story_fbid'][0]
        if re.fullmatch(r'\d+',group_id) and re.fullmatch(r'(?:\d+|pfbid\w+)',post_id):
            return f'https://www.facebook.com/{group_id}/posts/{post_id}'
    return None


def normalize_sample(item, payload):
    status = payload.get('status')
    seen = urlsplit(payload.get('url',''))
    expected = urlsplit(item['url'])
    if (status not in VALID_OUTCOMES or seen.scheme!='https' or seen.hostname not in {'facebook.com','www.facebook.com'}
        or seen.path.rstrip('/')!=expected.path.rstrip('/') or parse_qs(seen.query).get('q')!=[item['keyword']]):
        raise ValueError('Search route mismatch')
    cards = []
    for post in payload.get('cards',[])[:12]:
        if post.get('audience','').casefold() not in {'shared with public','public','chia sẻ với công chúng','công khai'}:
            continue
        actor = clean_text(post.get('actor',''),120)
        body = clean_text(post.get('body',''),640)
        link = post_url(post.get('link',''))
        if len(body)<15 and not actor:
            continue
        signature = re.sub(r'\W+','',body.casefold())
        key = link or (sha256(signature.encode('utf-8')).hexdigest() if len(signature)>28 else None)
        cards.append({'actor':actor,'body':body,'link':link,'key':key})
    if not cards and status=='OK':
        status = 'NO_PUBLIC_SAMPLE'
    return {**item,'status':status,'cards':cards,'displayed':min(30,max(0,int(payload.get('displayed',0)))),
            'checked_at':datetime.now(timezone.utc).isoformat()}


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*_):
        pass

    def valid_host(self):
        return self.headers.get('Host')==f'127.0.0.1:{self.server.server_port}'

    def render(self, message=''):
        old = observations()
        retry = parse_qs(urlsplit(self.path).query).get('retry')==['1']
        followups = set(read_json(RESAMPLE)) if retry and RESAMPLE.is_file() else set()
        pending = [r for r in read_json(QUEUE) if (r['key'] in followups and not old.get(r['key'],{}).get('rechecked_at'))
                   or (not retry and r['key'] not in old)]
        rows = ''.join(f'<li data-key="{r["key"]}"><a href="{escape(r["url"],quote=True)}">{escape(r["keyword"])}</a></li>'
                       for r in pending[:30])
        markup = f'''<!doctype html><meta charset="utf-8"><title>Rà tìm kiếm Vinamilk</title>
<h1>Vinamilk · Facebook · Level 2</h1><p id="progress">Còn {len(pending)} dòng trong lượt này.</p>
<p id="receipt">{escape(message)}</p><ol id="queue">{rows}</ol>
<form method="post" action="/submit{'?retry=1' if retry else ''}"><label for="evidence">Mẫu kết quả</label><textarea id="evidence" name="evidence" required></textarea>
<button>Lưu mẫu</button></form>'''
        body = markup.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type','text/html; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.valid_host() or urlsplit(self.path).path!='/':
            return self.send_error(404)
        self.render()

    def do_POST(self):
        if (not self.valid_host() or self.headers.get('Origin')!=f'http://127.0.0.1:{self.server.server_port}'
            or urlsplit(self.path).path!='/submit'):
            return self.send_error(403)
        try:
            size = int(self.headers.get('Content-Length',0))
            if not 0<size<1500000:
                raise ValueError('Invalid size')
            payload = json.loads(parse_qs(self.rfile.read(size).decode())['evidence'][0])
            if not isinstance(payload,list) or not 0<len(payload)<=30:
                raise ValueError('Invalid payload')
            items = {r['key']:r for r in read_json(QUEUE)}
            proofs = [normalize_sample(items[r['key']],r) for r in payload]
            with SERIAL:
                old = observations()
                retry = parse_qs(urlsplit(self.path).query).get('retry')==['1']
                if retry:
                    allowed = set(read_json(RESAMPLE))
                    saved = []
                    for proof in proofs:
                        before = old.get(proof['key'])
                        if not before or proof['key'] not in allowed or before.get('rechecked_at'):
                            continue
                        cards = list({(p['key'] or (p['actor'],p['body'])):p for p in [*before['cards'],*proof['cards']]}.values())
                        proof.update(cards=cards[:18],rechecked_at=proof['checked_at'],
                                     displayed=max(before['displayed'],proof['displayed']),
                                     status='OK' if cards else (proof['status'] if proof['status']!='LOAD_UNCLEAR' else before['status']))
                        saved.append(proof)
                else:
                    saved = [p for p in proofs if p['key'] not in old]
                with SAMPLES.open('a',encoding='utf-8') as output:
                    for proof in saved:
                        output.write(json.dumps(proof,ensure_ascii=False)+'\n')
            self.render(f'Đã lưu {len(saved)} mẫu.')
        except (KeyError,ValueError,TypeError,AttributeError):
            self.send_error(400,'Không lưu được mẫu tìm kiếm')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','serve','progress'])
    parser.add_argument('--port',type=int,default=8872)
    args = parser.parse_args()
    if args.action=='prepare':
        prepare()
    elif args.action=='progress':
        print(json.dumps({'queued':len(read_json(QUEUE)),'observed':len(observations()),
                          'outcomes':Counter(r['status'] for r in observations().values())}))
    else:
        with ThreadingHTTPServer(('127.0.0.1',args.port),Handler) as server:
            print(f'http://127.0.0.1:{server.server_port}/',flush=True)
            server.serve_forever()


if __name__ == '__main__':
    main()
