"""Local queue and evidence sink for a read-only Chrome review of active Facebook sources."""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sqlite3
from threading import Lock
from urllib.parse import parse_qs, urlsplit, urlunsplit

from audit_source_metadata_followup import DB, OUT, VERIFIED, counters, kind_of, read_json, write_json

OUTPUT = OUT / 'active-facebook-chrome-review'
QUEUE = OUTPUT / 'queue.json'
PROOFS = OUTPUT / 'observations.jsonl'
REPORT = OUTPUT / 'summary.json'
METHOD = 'logged-in Chrome visible Facebook source header'
ACTIVE = '''EXISTS (SELECT 1 FROM source_projects sp JOIN projects p USING(project_name)
    WHERE sp.source_key=s.source_key AND lower(trim(p.plan_status)) IN ('running','running trial'))'''
ROUTE = re.compile(r'^/(?:groups/[\w.%-]+|[\w.%-]+|(?:people|pages)/[\w.%-]+/\d+)/?$',re.I)
MEMBER_ID = re.compile(r'^/groups/(\d+)/(?:members|people)/?$',re.I)
POSITIVE_ID = re.compile(r'^[1-9]\d{3,24}$')
SERIAL = Lock()


def catalog(read_only=True):
    db = sqlite3.connect(DB.resolve().as_uri() + ('?mode=ro' if read_only else '?mode=rw'), uri=True, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def facebook_url(raw):
    try:
        url = urlsplit(raw)
        if url.scheme not in {'http','https'} or url.port or url.username or url.password:
            return None
    except ValueError:
        return None
    if url.hostname not in {'facebook.com','www.facebook.com','web.facebook.com','m.facebook.com','fb.com','www.fb.com'}:
        return None
    return url


def destination(row):
    url = facebook_url(row['link'])
    if not url:
        return None
    path = url.path.rstrip('/')
    query = parse_qs(url.query)
    if set(query) & {'fbid','story_fbid','comment_id'}:
        return None
    if re.fullmatch(r'/groups/[\w.%-]+/(?:members|people|about|discussion)',path,re.I):
        path = path.rsplit('/',1)[0]
    if row['type']=='group_unknown' and row['id_status'] in VERIFIED and POSITIVE_ID.fullmatch(row['id'] or ''):
        path = '/groups/'+row['id']
    if path=='/profile.php' and len(query.get('id',[]))==1 and POSITIVE_ID.fullmatch(query['id'][0]):
        return 'https://www.facebook.com/profile.php?id='+query['id'][0]
    if not ROUTE.fullmatch(path) or re.fullmatch(r'/(?:\d+_\d+|profile\.php|login|watch|share|settings|search|groups|marketplace|reel)',path,re.I):
        return None
    return urlunsplit(('https','www.facebook.com',path+'/', '', ''))


def prepare(*, current_targets=False):
    OUTPUT.mkdir(parents=True,exist_ok=True)
    with closing(catalog()) as db:
        rows=db.execute(f'''SELECT s.source_key,s.link,s.type,s.id_status,s.id FROM sources s
            WHERE channel='facebook' AND type IN ('unknown','group_unknown') AND {ACTIVE}
            AND source_status NOT IN ('PLAN_CONTENT_REFERENCE','BLOCKED_BY_PROJECT')
            ORDER BY s.source_status='PLAN_FULL_AUDIT' DESC, s.type, s.link GLOB '*facebook.com/[0-9]*',
               s.link GLOB '*profile.php*', s.follower IS NOT NULL, s.link, s.source_key''').fetchall()
    items=[{**dict(r),'visit':destination(r),'lane':'group' if r['type']=='group_unknown' else 'profile'} for r in rows]
    if QUEUE.exists() and not current_targets:
        known={r['source_key'] for r in read_json(QUEUE)}
        items=read_json(QUEUE)+[r for r in items if r['source_key'] not in known]
    write_json(QUEUE,items)
    print(json.dumps({'queue':Counter(r['lane'] for r in items),'source_routes':sum(bool(r['visit']) for r in items)}))


def observations():
    if not PROOFS.is_file():
        return []
    with PROOFS.open(encoding='utf-8') as stream:
        return [json.loads(line) for line in stream if line.endswith('\n')]


def stable_route(value):
    url=facebook_url(value)
    if not url:
        return None
    path=url.path.rstrip('/').lower()
    if path=='/profile.php':
        choices=parse_qs(url.query).get('id',[])
        return '/'+choices[0] if len(choices)==1 and POSITIVE_ID.fullmatch(choices[0]) else None
    path=re.sub(r'/(?:about|about_profile_transparency|followers|members|people)$','',path)
    return path if ROUTE.fullmatch(path) else None


def normalize_proof(item, raw):
    stamp=datetime.now(timezone.utc).isoformat()
    result={'source_key':item['source_key'],'target':item['visit'],'lane':item['lane'],'checked_at':stamp}
    if raw.get('status') in {'NO_VISIBLE_PROOF','UNAVAILABLE','ACCESS_GATE','NAVIGATION_ERROR'}:
        return {**result,'status':raw['status']}
    name=(raw.get('name') or '').strip()
    actual=stable_route(raw.get('url') or '')
    requested=stable_route(item['visit'])
    kind=raw.get('type')
    marker=raw.get('marker') or ''
    if not actual or not name or len(name)>180 or kind not in {'group','page','user',None}:
        return {**result,'status':'NO_VISIBLE_PROOF'}
    if bool(requested.startswith('/groups/'))!=bool(actual.startswith('/groups/')) and kind!='group':
        return {**result,'status':'NO_VISIBLE_PROOF'}
    # FB may redirect a vanity or numerical alias to the same canonical entity. The
    # evidence must still be from the page we opened, and only explicit UI proves type.
    proof_url=facebook_url(raw['url'])
    result.update(status='OBSERVED',url=urlunsplit(('https','www.facebook.com',proof_url.path,proof_url.query,'')),name=name)
    native=raw.get('id')
    native=native if isinstance(native,str) and POSITIVE_ID.fullmatch(native) else None
    if kind=='group':
        private={'public group':'public','private group':'private','nhóm công khai':'public','nhóm riêng tư':'private','nhóm kín':'private'}
        privacy=private.get(marker.casefold())
        if not actual.startswith('/groups/') or privacy is None:
            return {**result,'status':'NO_VISIBLE_PROOF'}
        member_url=facebook_url(raw.get('counterUrl') or '')
        explicit=MEMBER_ID.fullmatch(member_url.path) if member_url else None
        route_id=actual.removeprefix('/groups/')
        route_id=route_id if POSITIVE_ID.fullmatch(route_id) else None
        if explicit and route_id and explicit[1]!=route_id:
            return {**result,'status':'NO_VISIBLE_PROOF'}
        # A numerical route is evidence only together with a rendered group heading
        # and an exact Public/Private group label on that actual group page.
        native=explicit[1] if explicit else route_id
        result.update(type=kind,id=native,privacy=privacy,marker=marker)
    else:
        if kind=='page' and re.match(r'^(?:Facebook Page|Page\s*[·•]|Trang\s*[·•]|Page ID|ID Trang)',marker,re.I):
            result.update(type=kind,marker=marker)
            if native and marker.casefold() in {'page id','id trang'}:
                result['id']=native
        elif kind=='user' and re.match(r'^(?:Personal profile|Profile\s*[·•]|Trang cá nhân|Trang cá nhân\s*[·•])',marker,re.I):
            result.update(type=kind,marker=marker)
            if native and raw.get('profileMetadataId')==native and raw.get('identitySource')=='META_FB_PROFILE':
                result['id']=native
        count_url=raw.get('counterUrl') or ''
        if count_url and stable_route(count_url)!=actual:
            raw={**raw,'metricText':None}
    value=counters({'type':result.get('type'), 'metricText':raw.get('metricText')})
    if value and ((value[2]=='group_members')==(kind=='group')):
        result.update(metric_text=raw['metricText'],metric=list(value))
    if not (result.get('type') or result.get('metric')):
        result['status']='NO_VISIBLE_PROOF'
    return result


def apply_proofs(db, proofs):
    totals=Counter()
    for proof in proofs:
        if proof['status']!='OBSERVED':
            continue
        row=db.execute(f'SELECT s.* FROM sources s WHERE s.source_key=? AND {ACTIVE}',(proof['source_key'],)).fetchone()
        if not row:
            continue
        fields={}
        kind,native=proof.get('type'),proof.get('id')
        if row['id_status'] in VERIFIED and native and (row['id']!=native or kind_of(row['type'])!=kind):
            evidence=json.loads(row['identity_evidence_json'])
            evidence.append({'method':METHOD,'conflict':proof})
            db.execute('UPDATE sources SET id_status=?,identity_evidence_json=? WHERE source_key=?',
                       ('CONFLICT',json.dumps(evidence,ensure_ascii=False),row['source_key']))
            totals['conflicts']+=1
            continue
        if kind and (row['type'] in {'unknown','group_unknown'} or kind_of(row['type'])==kind):
            privacy=proof.get('privacy')
            next_type='group_'+privacy if kind=='group' and privacy else kind
            if row['type']!=next_type:
                fields['type']=next_type
                totals['type_or_privacy']+=1
            if privacy:
                fields.update(group_privacy=privacy,group_privacy_status='PLATFORM_OBSERVATION')
                totals['group_'+privacy]+=1
            if native and (row['id']!=native or row['id_status']!='PLATFORM_VERIFIED'):
                fields.update(id=native,id_status='PLATFORM_VERIFIED')
                totals['typed_id']+=1
            if kind=='page' and not native and row['id_status']=='URL_ONLY':
                # Keep the original URL candidate out of the Page ID field.
                fields.update(id=None,id_status='UNRESOLVED')
        if (value:=proof.get('metric')) and (row['follower_as_of'] or '')<proof['checked_at']:
            fields.update(follower=value[0],follower_precision=value[1],follower_kind=value[2],
                          follower_as_of=proof['checked_at'],follower_source=proof['url'],follower_evidence=proof['metric_text'])
            totals[value[2]]+=1
        if not row['name'] and proof.get('name'):
            fields['name']=proof['name']
        if fields:
            evidence=json.loads(row['identity_evidence_json'])
            evidence.append({'method':METHOD,'evidence':proof.get('marker') or proof.get('metric_text'),
                             'checked_at':proof['checked_at'],'url':proof['url'],'id':native,'type':kind})
            fields['identity_evidence_json']=json.dumps(evidence,ensure_ascii=False)
            db.execute('UPDATE sources SET '+','.join(f'{key}=?' for key in fields)+' WHERE source_key=?',
                       (*fields.values(),row['source_key']))
            totals['updated']+=1
    return totals


def summary():
    targets={r['source_key']:r for r in read_json(QUEUE)}
    proofs={p['source_key']:p for p in observations()}
    with closing(catalog()) as db:
        left=dict(db.execute(f'''SELECT s.type,count(*) FROM sources s WHERE channel='facebook'
            AND type IN ('unknown','group_unknown') AND {ACTIVE} GROUP BY s.type'''))
    by_lane={}
    for lane in ('group','profile'):
        lane_targets=[r for r in targets.values() if r['lane']==lane]
        lane_results=Counter(p['status'] for p in proofs.values() if p['lane']==lane)
        by_lane[lane]={'queued':len(lane_targets),'results':dict(lane_results),
                       'unsupported_links':sum(not r['visit'] for r in lane_targets),
                       'unattempted_links':sum(bool(r['visit']) and r['source_key'] not in proofs for r in lane_targets)}
    identified=[p for p in proofs.values() if p.get('id')]
    data={'queued':len(targets),'attempted':len(proofs),'results':dict(Counter(p['status'] for p in proofs.values())),
          'observed_types':dict(Counter(p.get('type') for p in proofs.values() if p.get('type'))),
          'observed_privacy':dict(Counter(p.get('privacy') for p in proofs.values() if p.get('privacy'))),
          'observed_metrics':dict(Counter(p['metric'][2] for p in proofs.values() if p.get('metric'))),
          'observed_ids':len(identified),'ids_by_type':dict(Counter(p['type'] for p in identified)),
          'ids_newly_verified':sum(targets[p['source_key']]['id_status'] not in VERIFIED for p in identified),
          'remaining':left,'unsupported_links':sum(not r['visit'] for r in targets.values()),'by_lane':by_lane}
    write_json(REPORT,data)
    return data


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        return

    def valid_host(self):
        return self.headers.get('Host')==f'127.0.0.1:{self.server.server_port}'

    def render(self,lane,message=''):
        finished={p['source_key'] for p in observations() if p['status']!='ACCESS_GATE'}
        candidates=[r for r in read_json(QUEUE) if r['lane']==lane and r['visit'] and r['source_key'] not in finished]
        rows=''.join(f'<li data-key="{escape(r["source_key"],quote=True)}"><a href="{escape(r["visit"],quote=True)}">{escape(r["visit"])}</a></li>' for r in candidates[:28])
        markup=f'''<!doctype html><meta charset="utf-8"><title>Rà nguồn Facebook</title>
<h1>Nguồn Facebook cần rà</h1><p id="result">{escape(message)}</p>
<nav><a href="/?lane=group">Group</a> <a href="/?lane=profile">Page / profile</a></nav>
<p id="pending">{len(candidates)} link còn trong lượt {lane}</p><ol id="targets">{rows}</ol>
<form method="post" action="/?lane={lane}"><label for="proofs">Kết quả rà</label><textarea id="proofs" name="proofs" required></textarea>
<button>Lưu kết quả vào kho</button></form>'''
        body=markup.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type','text/html; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def lane(self):
        return 'profile' if parse_qs(urlsplit(self.path).query).get('lane')==['profile'] else 'group'

    def do_GET(self):
        if not self.valid_host() or urlsplit(self.path).path!='/':
            self.send_error(404)
            return
        saved = parse_qs(urlsplit(self.path).query).get('saved', [''])[0]
        updated = parse_qs(urlsplit(self.path).query).get('updated', [''])[0]
        receipt = f'Đã lưu {saved} kết quả. Cập nhật {updated} nguồn.' if saved.isdecimal() and updated.isdecimal() else ''
        self.render(self.lane(),receipt)

    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin')!=f'http://127.0.0.1:{self.server.server_port}' or urlsplit(self.path).path!='/':
            self.send_error(403)
            return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<524288:
                raise ValueError('bad length')
            items=json.loads(parse_qs(self.rfile.read(length).decode('utf-8'))['proofs'][0])
            if not isinstance(items,list) or not 0<len(items)<=32:
                raise ValueError('bad batch')
            targets={r['source_key']:r for r in read_json(QUEUE)}
            if any(not isinstance(r,dict) or r.get('source_key') not in targets or targets[r['source_key']]['lane']!=self.lane() for r in items):
                raise ValueError('source out of scope')
            with SERIAL:
                prior={p['source_key'] for p in observations() if p['status']!='ACCESS_GATE'}
                proofs=[normalize_proof(targets[r['source_key']],r) for r in items if r['source_key'] not in prior]
                with closing(catalog(False)) as db:
                    db.execute('PRAGMA foreign_keys=ON')
                    with db:
                        db.execute('BEGIN IMMEDIATE')
                        counts=apply_proofs(db,proofs)
                with PROOFS.open('a',encoding='utf-8') as output:
                    for p in proofs:
                        output.write(json.dumps(p,ensure_ascii=False)+'\n')
                summary()
            self.send_response(303)
            self.send_header('Location',f'/?lane={self.lane()}&saved={len(proofs)}&updated={counts["updated"]}')
            self.end_headers()
        except (ValueError, TypeError, KeyError, AttributeError, sqlite3.Error):
            self.send_error(400,'Không thể lưu lô kết quả')


def main():
    global OUTPUT, QUEUE, PROOFS, REPORT
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','serve','report'])
    parser.add_argument('--port',type=int,default=8871)
    parser.add_argument('--current-pass',action='store_true')
    args=parser.parse_args()
    if args.current_pass:
        OUTPUT=OUT/'active-facebook-chrome-recheck'
        QUEUE=OUTPUT/'queue.json'
        PROOFS=OUTPUT/'observations.jsonl'
        REPORT=OUTPUT/'summary.json'
    if args.action=='prepare':
        if not args.current_pass or not QUEUE.exists():
            prepare(current_targets=args.current_pass)
        else:
            print(json.dumps(summary(),ensure_ascii=False))
    elif args.action=='report':
        print(json.dumps(summary(),ensure_ascii=False))
    else:
        with ThreadingHTTPServer(('127.0.0.1',args.port),Handler) as server:
            print(f'http://127.0.0.1:{server.server_port}/',flush=True)
            server.serve_forever()


if __name__=='__main__':
    main()
