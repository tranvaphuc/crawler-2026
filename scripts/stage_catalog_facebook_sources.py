"""Persist verified source results and prepare guarded input for the continuous Facebook flow."""

import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import json
import sqlite3

import recheck_active_facebook_sources as scan
from collect_catalog_platform_audit import OUT
from collect_catalog_platform_audit import write_json


FOLDER = OUT / 'active-facebook-chrome-recheck'
OLD = OUT / 'active-facebook-chrome-review'
RESULTS = FOLDER / 'source-decisions.json'
HANDOFF = FOLDER / 'auto-source-input.json'
IDENTITIES = {
    'page': {'matched_profile.delegate_page.id', 'matched_Page.id'},
    'user': {'matched_User.explicit_personal_profile', 'matched_User.id'},
}
ALLOWED_PROJECTS = {'running', 'running trial'}
WHY = {
    'UNAVAILABLE': 'Facebook báo nội dung hiện không khả dụng khi mở link.',
    'NO_VISIBLE_PROOF': 'Link mở nhưng chưa thấy dấu hiệu đủ để phân biệt Page với hồ sơ cá nhân hoặc xác nhận quyền riêng tư.',
    'ACCESS_GATE': 'Facebook yêu cầu đăng nhập lại, xác nhận bảo mật hoặc đang giới hạn lượt truy cập.',
    'NAVIGATION_ERROR': 'Lỗi tải link trong Chrome.',
    'UNSUPPORTED_ROUTE': 'Link trong plan không trỏ trực tiếp tới Trang, hồ sơ hoặc group qua một đường dẫn có thể đối chiếu.',
    'NOT_OBSERVED': 'Chưa có lượt kiểm tra công khai được lưu.',
}


def journal(filename):
    if not filename.is_file():
        return []
    with filename.open(encoding='utf-8-sig') as stream:
        return [json.loads(line) for line in stream if line.startswith('{') and line.endswith('\n')]


def source_proofs(targets, current):
    by_url = defaultdict(list)
    for row in journal(FOLDER / 'auto-sources-before.jsonl'):
        proof = row.get('identityProof') or {}
        kind, ident = row.get('type'), row.get('nativeId')
        if (kind in IDENTITIES and row.get('identityStatus') == 'verified' and proof.get('type') == kind
                and ident == proof.get('nativeId') and proof.get('evidence') in IDENTITIES[kind]
                and proof.get('checkedAt') and not row.get('canonicalSourceId')):
            if url := scan.stable_route(row['url']):
                by_url[url].append(row)
    latest = {p['source_key']:p for p in journal(FOLDER / 'api-resolve-results.jsonl')}
    trusted = {}
    for key, target in targets.items():
        if not target['visit'] or target['lane'] != 'profile':
            continue
        result = latest.get(key, {})
        seen = current.get(key, {})
        kind, ident, proof = result.get('type'), result.get('id'), result.get('evidence')
        if (ident and proof in IDENTITIES.get(kind, set()) and
                scan.stable_route(result['target']) in {scan.stable_route(target['visit']),scan.stable_route(seen.get('url') or '')}):
            if not seen.get('type') or seen['type'] == kind:
                trusted[key] = {**result, 'basis':'CRAWLER_PUBLIC_IDENTITY_API'}
            continue
        exact = by_url.get(scan.stable_route(target['visit']), [])
        if len(exact) != 1 or seen.get('status') == 'UNAVAILABLE':
            continue
        owner = exact[0]
        if seen.get('type') and seen['type'] != owner['type']:
            continue
        saved = owner['identityProof']
        trusted[key] = {'id':owner['nativeId'],'type':owner['type'],'evidence':saved['evidence'],
                        'checked_at':saved['checkedAt'],'name':owner.get('name'),'basis':'EXACT_AUTO_SOURCE_RECEIPT'}
    return trusted, latest


def run(apply):
    targets = {r['source_key']:r for r in scan.read_json(FOLDER / 'queue.json')}
    fresh = {r['source_key']:r for r in journal(FOLDER / 'observations.jsonl')}
    old = {r['source_key']:r for r in journal(OLD / 'observations.jsonl')}
    trusted, latest_api = source_proofs(targets, fresh)
    output, candidates = [], {}
    stats = Counter()
    with closing(scan.catalog(not apply)) as db:
        if apply:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('BEGIN IMMEDIATE')
        for key, target in targets.items():
            row = db.execute('SELECT * FROM sources WHERE source_key=?',(key,)).fetchone()
            projects = sorted({r[0] for r in db.execute('''SELECT sp.project_name FROM source_projects sp
                JOIN projects p USING(project_name) WHERE sp.source_key=? AND lower(trim(p.plan_status)) IN (?,?)''',
                (key, *sorted(ALLOWED_PROJECTS)))})
            if not row or not projects or row['source_status'] in {'PLAN_CONTENT_REFERENCE','BLOCKED_BY_PROJECT'}:
                continue
            seen = fresh.get(key) or old.get(key) or {}
            identity = trusted.get(key)
            kind, ident = row['type'], row['id']
            conflict = False
            if identity:
                kind, ident = identity['type'], identity['id']
                conflict = ((row['type'] not in {'unknown',kind})
                            or (row['id_status'] in scan.VERIFIED and row['id'] != ident))
                if not conflict and apply:
                    evidence = json.loads(row['identity_evidence_json'])
                    receipt = {'method':identity['basis'],'evidence':identity['evidence'], 'id':ident,'type':kind,
                               'checked_at':identity['checked_at'],'url':identity.get('target') or target['visit']}
                    if receipt not in evidence:
                        db.execute('''UPDATE sources SET type=?,id=?,id_status='PLATFORM_VERIFIED',
                            name=coalesce(nullif(name,''),?),identity_evidence_json=? WHERE source_key=?''',
                            (kind,ident,identity.get('name'),json.dumps([*evidence,receipt],ensure_ascii=False),key))
            verdict = 'CONFIRMED'
            why = 'Facebook xác nhận loại tài khoản và ID theo bằng chứng đã lưu.'
            receipt = None
            if identity and not conflict:
                receipt = {'type':kind,'nativeId':ident,'evidence':identity['evidence'],
                           'checkedAt':identity['checked_at'],'proofUrl':identity.get('target') or target['visit']}
            elif kind in {'group_public','group_private'} and seen.get('type')=='group' and seen.get('id')==ident:
                receipt = {'type':'group','nativeId':ident,'evidence':'facebook_visible_group_privacy_and_id',
                           'checkedAt':seen['checked_at'],'proofUrl':seen['url']}
                why = f"Facebook hiển thị {seen['marker']} và ID group."
            elif kind in {'user','page','group_public','group_private'} and not conflict:
                verdict,why = 'TYPE_ONLY','Đã rõ loại qua thông tin Facebook hiển thị. Chưa có ID gốc đủ căn cứ để đưa vào luồng.'
            else:
                observation = 'UNSUPPORTED_ROUTE' if not target['visit'] else seen.get('status','NOT_OBSERVED')
                verdict = 'CONFLICT' if conflict else observation
                why = ('Loại hoặc ID từ các bằng chứng mâu thuẫn, cần giữ để kiểm tra tiếp.' if conflict else
                       WHY.get(observation,'Đã thấy thông tin công khai nhưng chưa đủ để xác nhận loại và ID.'))
            if receipt:
                mongo_type = receipt['type']
                index = (mongo_type, ident)
                item = candidates.setdefault(index,{'platform':'facebook','type':mongo_type,'nativeId':ident,
                    'name':(identity or {}).get('name') or seen.get('name') or row['name'],
                    'groupPrivacy':row['group_privacy'] if mongo_type=='group' else None,
                    'identityProof':receipt,'projects':[],'originalLinks':[], 'sourceKeys':[]})
                item['projects'] = sorted(set(item['projects']) | set(projects))
                if target['visit'] not in item['originalLinks']:
                    item['originalLinks'].append(target['visit'])
                item['sourceKeys'].append(key)
            stats[target['lane'],verdict] += 1
            if apply and verdict != 'CONFIRMED':
                audit = {'method':'ACTIVE_CATALOG_FB_SOURCE_REVIEW_20261120','status':verdict,'reason':why,'evidence':why,
                         'checked_at':seen.get('checked_at'),'url':target['visit']}
                latest_row = db.execute('SELECT identity_evidence_json FROM sources WHERE source_key=?',(key,)).fetchone()
                evidence = json.loads(latest_row[0])
                if audit not in evidence:
                    evidence = [x for x in evidence if x.get('method')!=audit['method']]
                    db.execute('UPDATE sources SET identity_evidence_json=? WHERE source_key=?',
                               (json.dumps([*evidence,audit],ensure_ascii=False),key))
            output.append({'source_key':key,'link':target['link'],'name':row['name'],'projects':projects,'type':kind,
                'id':ident if receipt else None,'follower':row['follower'],'follower_kind':row['follower_kind'],
                'follower_precision':row['follower_precision'],'privacy':row['group_privacy'],
                'verdict':verdict,'reason':why,'chrome_pass':'current' if key in fresh else 'prior' if key in old else None,
                'chrome_observation':seen,'api_observation':latest_api.get(key),'proof':receipt})
        if apply:
            if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchone():
                raise sqlite3.IntegrityError('Catalog integrity check failed')
            db.commit()
    grouped = {lane:{k:v for (l,k),v in stats.items() if l==lane} for lane in ('profile','group')}
    write_json(RESULTS,{'checked_at':datetime.now(timezone.utc).isoformat(),'summary':grouped,'sources':output})
    write_json(HANDOFF,list(candidates.values()))
    print(json.dumps({'summary':grouped,'qualified':Counter(r['type'] for r in candidates.values())}))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--apply',action='store_true')
    run(p.parse_args().apply)
