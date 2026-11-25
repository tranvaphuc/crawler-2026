"""Reconcile typed source evidence and platform counters in the local catalog."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import json
import re
import sqlite3

from audit_catalog_search_keywords import DB
from build_source_keyword_catalog import metric, observation_index, observed_followers, url_key
from reconcile_catalog_source_identities import OUT, SOCIAL, aliases, load_observations
from collect_catalog_platform_audit import read_json, write_json

ROOT = OUT/'source-metadata-followup'
AUDIT = 'source-metadata-followup-2026-11-19'
VERIFIED = {'ARCHIVE_VERIFIED','PLATFORM_VERIFIED'}
FOLLOWER = re.compile(r'^([\d., ]+\s*(?:[KM]|nghìn|ngàn|triệu|tỷ)?)\s+(followers?|người theo dõi|subscribers?|người đăng ký|members?|thành viên)$',re.I)


def snapshot(db):
    rows=db.execute('''SELECT channel,count(*) total,
        sum(id_status IN ('ARCHIVE_VERIFIED','PLATFORM_VERIFIED')) typed_id,
        sum(type IN ('unknown','group_unknown')) unresolved_type_or_privacy,
        sum(type='unknown') unresolved_type,sum(type='group_unknown') unresolved_privacy,
        sum(follower IS NOT NULL AND coalesce(follower_kind,'')!='group_members') follower,
        sum(follower IS NOT NULL AND follower_kind='group_members') group_members,
        sum(type='group_public') group_public,sum(type='group_private') group_private
        FROM sources WHERE channel IN ('facebook','threads','youtube','tiktok','instagram','linkedin') GROUP BY channel''')
    return {r['channel']:dict(r) for r in rows}


def prepare(db):
    rows=db.execute('''SELECT source_key,channel,link,type,id,id_status,
        CASE WHEN EXISTS(SELECT 1 FROM source_projects p JOIN projects j USING(project_name)
            WHERE p.source_key=s.source_key AND lower(j.plan_status) IN ('running','running trial')) THEN 1 ELSE 0 END AS active
      FROM sources s WHERE channel IN ('facebook','threads','youtube','tiktok','instagram','linkedin')
      AND type NOT IN ('content_reference','website','forum')
      AND source_status NOT IN ('BLOCKED_BY_PROJECT','PLAN_CONTENT_REFERENCE')
      AND (id_status NOT IN ('ARCHIVE_VERIFIED','PLATFORM_VERIFIED') OR type IN ('unknown','group_unknown') OR follower IS NULL)
      ORDER BY CASE WHEN active=1 AND source_status='PLAN_FULL_AUDIT' AND type IN ('page','group_unknown','channel','company') THEN 0
               WHEN active=1 AND type IN ('page','group_unknown','channel','company') THEN 1
               WHEN active=1 AND link NOT GLOB '*facebook.com/[0-9]*' THEN 2 WHEN active=1 THEN 3
               WHEN type IN ('page','channel','company') THEN 4 ELSE 5 END, channel, link''')
    targets=[dict(r) for r in rows]
    write_json(ROOT/'targets.json',targets)
    print(json.dumps({'targets':len(targets),'by_channel':Counter(r['channel'] for r in targets)}))


def records():
    for filename in ('public.jsonl','browser.jsonl'):
        path=ROOT/filename
        if not path.is_file():
            continue
        with path.open(encoding='utf-8') as handle:
            for line in handle:
                if line.endswith('\n'):
                    yield json.loads(line)


def counters(proof):
    if not (match:=FOLLOWER.fullmatch(proof.get('metricText') or '')):
        return None
    amount,precision=metric(match[1])
    if amount is None or not 0<=amount<10**12:
        return None
    label=match[2].casefold()
    kind='group_members' if label.startswith('member') or label=='thành viên' else 'subscribers' if label.startswith('subscriber') or label=='người đăng ký' else 'followers'
    if kind=='group_members' and proof.get('type')!='group':
        return None
    return amount,precision,kind


def kind_of(raw):
    return 'group' if raw in {'group','group_unknown','group_public','group_private'} else raw


def safe_archive(row):
    if not row['safe'] or not row.get('id') or not row.get('name'):
        return False
    ch,kind,evidence=row['platform'],row['type'],row['evidence'] or ''
    if ch=='facebook':
        markers={'page':r'pageID|delegate_page\.id','user':r'userID|matched_User\.is_additional_profile',
            'group':r'groupID|group_id|group header|matching ID \+ privacy_info'}
        return kind in markers and bool(re.search(markers[kind],evidence,re.I)) and row['id'].isdigit()
    return kind in {'profile','company','channel','threads'} and bool(re.search(r'metadata|URN|native pk|native userInfo|root user_id|profile',evidence,re.I))


def reconcile(db):
    live=defaultdict(list)
    stats=defaultdict(Counter)
    for proof in records():
        stats[proof['channel']][proof['status']]+=1
        if proof['status'] in {'live','METRIC_ONLY'}:
            live[proof['sourceKey']].append(proof)
    trusted=load_observations()
    archive=observation_index()
    changes=[]
    conflicts=[]
    touched=Counter()
    for row in db.execute('SELECT * FROM sources ORDER BY source_key'):
        key,channel=row['source_key'],row['channel']
        if channel not in SOCIAL or row['type']=='content_reference' or row['source_status']=='BLOCKED_BY_PROJECT':
            continue
        links=[row['link'],*json.loads(row['original_links_json'])]
        original={k for url in links if (k:=url_key(channel,url))}
        kinds=defaultdict(list)
        for proof in live[key]:
            if url_key(channel,proof['originalLink']) not in original or proof['channel']!=channel:
                continue
            if proof.get('id') and proof.get('type') and proof.get('identityEvidence'):
                kinds[proof['id'],kind_of(proof['type'])].append({**proof,'live':True})
        for url in links:
            for compatible in aliases(channel,url):
                for legacy in trusted[channel,compatible]:
                    kinds[legacy['id'],kind_of(legacy['type'])].append({'id':legacy['id'],'type':legacy['type'],'name':legacy['name'],
                        'checkedAt':legacy['checked_at'],'url':legacy['url'],'identityEvidence':legacy['evidence'],'live':False})
        for entry in original:
            for old in archive[entry]:
                if not safe_archive(old):
                    continue
                value={'id':old['id'],'type':old['type'],'name':old['name'],'checkedAt':old['checked_at'],'url':old['url'],
                    'privacy':old['privacy'],'identityEvidence':old['evidence'],'live':False}
                if counted:=observed_followers(old):
                    value['metricText']=counted[2]
                kinds[old['id'],kind_of(old['type'])].append(value)
        old_identity=(row['id'],kind_of(row['type']))
        live_options={k for k,items in kinds.items() if any(p['live'] for p in items)}
        if len(live_options)>1 or (row['id_status'] in VERIFIED and live_options and old_identity not in live_options):
            conflict={'source_key':key,'channel':channel,'link':row['link'],
                      'catalog':old_identity,'live_candidates':sorted(live_options)}
            conflicts.append(conflict)
            if row['id_status']!='CONFLICT':
                evidence=json.loads(row['identity_evidence_json'])
                evidence.append({'method':AUDIT,'conflict':conflict})
                db.execute('UPDATE sources SET id_status=?,identity_evidence_json=? WHERE source_key=?',
                           ('CONFLICT',json.dumps(evidence,ensure_ascii=False),key))
                changes.append({'source_key':key,'channel':channel,'link':row['link'],'updated':{'id_status':'CONFLICT'}})
                touched[channel]+=1
            continue
        candidate=next(iter(live_options),None)
        if not candidate and len(kinds)==1:
            candidate=next(iter(kinds))
        if row['id_status'] in VERIFIED and candidate!=old_identity:
            candidate=None
        if row['id_status']=='CONFLICT' and not live_options:
            candidate=None
        fields={}
        proofs=[]
        viable=kinds[candidate] if candidate else []
        if viable:
            best=max(viable,key=lambda p:(p['live'],p.get('checkedAt') or ''))
            identity,kind=candidate
            status='PLATFORM_VERIFIED' if best['live'] else 'ARCHIVE_VERIFIED'
            if (row['id'],kind_of(row['type']),row['id_status'])!=(identity,kind,status) and not (
                    row['id_status']=='PLATFORM_VERIFIED' and status=='ARCHIVE_VERIFIED'):
                fields.update(id=identity,id_status=status,type=row['type'] if kind=='group' and row['type'].startswith('group_') else 'group_unknown' if kind=='group' else kind)
                proofs.append(best)
            if not row['name'] and best.get('name'):
                fields['name']=best['name']
            privacy=[p for p in viable if p.get('privacy') in {'public','private'}]
            if privacy and kind=='group':
                view=max(privacy,key=lambda p:(p['live'],p.get('checkedAt') or ''))
                if view['live'] or row['group_privacy_status'] in (None,'UNKNOWN','PLAN_LABEL'):
                    label='PLATFORM_OBSERVATION' if view['live'] else 'ARCHIVE_OBSERVATION'
                    if (row['group_privacy'],row['group_privacy_status'])!=(view['privacy'],label):
                        fields.update(group_privacy=view['privacy'],group_privacy_status=label,type='group_'+view['privacy'])
                        proofs.append(view)
        metric_proofs=[p for p in live[key] if url_key(channel,p['originalLink']) in original and not p.get('identityConflict') and p.get('metricText')]
        if row['id_status']=='CONFLICT' and not candidate:
            metric_proofs=[]
        if viable:
            metric_proofs.extend(p for p in viable if not p['live'] and p.get('metricText') and row['follower'] is None)
        for proof in sorted(metric_proofs,key=lambda p:p.get('checkedAt') or '',reverse=True):
            value=counters(proof)
            final_kind=kind_of(fields.get('type',row['type']))
            if value and ((value[2]=='group_members') != (final_kind=='group')):
                continue
            if value and (row['follower'] is None or (proof.get('checkedAt') or '')>(row['follower_as_of'] or '')):
                n,precision,kind=value
                fields.update(follower=n,follower_kind=kind,follower_precision=precision,follower_as_of=proof.get('checkedAt'),
                              follower_source=proof.get('url'),follower_evidence=proof.get('metricEvidence') or proof.get('identityEvidence'))
                proofs.append(proof)
                break
        if fields:
            evidence=json.loads(row['identity_evidence_json'])
            seen={json.dumps(e,ensure_ascii=False,sort_keys=True) for e in evidence}
            for p in proofs:
                record={'method':AUDIT,'id':p.get('id'),'type':p.get('type'),'url':p.get('url'),'checked_at':p.get('checkedAt'),
                        'evidence':p.get('identityEvidence') or p.get('metricEvidence'),'privacy':p.get('privacy'),'metric':p.get('metricText')}
                key_proof=json.dumps(record,ensure_ascii=False,sort_keys=True)
                if key_proof not in seen:
                    evidence.append(record)
                    seen.add(key_proof)
            update={**fields,'identity_evidence_json':json.dumps(evidence,ensure_ascii=False)}
            db.execute('UPDATE sources SET '+','.join(k+'=?' for k in update)+' WHERE source_key=?',(*update.values(),key))
            touched[channel]+=1
            changes.append({'source_key':key,'channel':channel,'link':row['link'],'updated':fields})
    return stats,changes,conflicts,touched


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage',choices=('prepare','apply'))
    args=parser.parse_args()
    ROOT.mkdir(parents=True,exist_ok=True)
    with closing(sqlite3.connect(DB.resolve().as_uri()+('?mode=rw' if args.stage=='apply' else '?mode=ro'),uri=True)) as db:
        db.row_factory=sqlite3.Row
        if args.stage=='prepare':
            prepare(db)
            return
        db.execute('PRAGMA foreign_keys=ON')
        before=snapshot(db)
        with db:
            db.execute('BEGIN IMMEDIATE')
            stats,changes,conflicts,touched=reconcile(db)
            if db.execute('PRAGMA quick_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
                raise RuntimeError('Source catalog integrity check failed')
        after=snapshot(db)
    summary={'checked_at':datetime.now(timezone.utc).isoformat(),'before':before,'after':after,'attempts':stats,'changes_by_channel':touched,
        'changed':len(changes),'id_changes':sum('id_status' in r['updated'] for r in changes),
        'privacy_changes':sum('group_privacy' in r['updated'] for r in changes),
        'metric_changes':sum('follower' in r['updated'] for r in changes),'conflicts':len(conflicts)}
    if (ROOT/'summary.json').is_file():
        earlier=read_json(ROOT/'summary.json')
        previous={row['source_key']:row for row in read_json(ROOT/'changes.json')}
        for row in changes:
            existing=previous.get(row['source_key'],{}).get('updated',{})
            previous[row['source_key']]={**row,'updated':{**existing,**row['updated']}}
        changes=list(previous.values())
        summary.update(before=earlier['before'],changed=len(changes),changes_by_channel=Counter(r['channel'] for r in changes),
            id_changes=sum('id_status' in r['updated'] for r in changes),privacy_changes=sum('group_privacy' in r['updated'] for r in changes),
            metric_changes=sum('follower' in r['updated'] for r in changes))
    write_json(ROOT/'changes.json',changes)
    write_json(ROOT/'conflicts.json',conflicts)
    write_json(ROOT/'summary.json',summary)
    print(json.dumps({k:v for k,v in summary.items() if k not in {'before','after'}}))


if __name__=='__main__':
    main()
