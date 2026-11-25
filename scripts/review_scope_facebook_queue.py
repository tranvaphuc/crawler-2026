"""Checkpoint public Facebook samples for the existing plan follow-up cohort."""

import argparse
from collections import Counter, defaultdict, deque
from contextlib import closing
from http.server import ThreadingHTTPServer
import json
import re
from urllib.parse import parse_qs, urlsplit

from finalize_catalog_facebook_keywords import normalized, target_match, wrong_scope
from finalize_catalog_cross_platform_audit import exact, query_url
from finalize_vinamilk_facebook_search import distinct
from reconcile_plan_keywords_deep import encode, query_key, read_json, write_json
from review_catalog_facebook_keywords import Handler, LOCK, prepare_stage, stage_db
from review_catalog_scope_followup import INPUT, MANUAL, NUMBERED_PLAN_LABEL, OUT, RESULTS, anchors_for

QUEUE = OUT / 'facebook-scope-queue.json'
OBSERVATIONS = OUT / 'facebook-scope-observations.sqlite'
SUMMARY = OUT / 'facebook-scope-summary.json'
METHOD = 'FACEBOOK_VISIBLE_SCOPE_AUDIT'
MAX_ATTEMPTS = 3


def prepare():
    if not QUEUE.is_file():
        reviewed={(r['project'],r['keyword']) for r in read_json(MANUAL) if r['platform']=='facebook'}
        groups=defaultdict(deque)
        for row in read_json(INPUT):
            key=(row['project'],row['keyword'])
            if row['group']=='plan_candidate' and row['plan_check']=='CELL_MATCH' and key not in reviewed:
                groups[row['project']].append(row)
        queries={}
        while any(groups.values()):
            for rows in groups.values():
                if not rows:
                    continue
                row=rows.popleft()
                word=row['keyword']
                item=queries.setdefault(word,{'key':str(len(queries)+1),'keyword':word,
                    'url':query_url('facebook',word),'targets':[]})
                item['targets'].append({'project':row['project'],'level':row['level'],
                    'subjects':anchors_for(row),'cell':row['cell'],'sheet':row['sheet']})
        write_json(QUEUE,list(queries.values()))
    prepare_stage(OBSERVATIONS)


def classify(sample,target):
    cards=distinct(sample['cards'])
    hits,_=target_match(sample,target,cards)
    keyword=sample['keyword']
    anchors=[a for a in target['subjects'] if len(query_key(a))>=6]
    matched=[]
    for hit in hits:
        actor=normalized(hit['actor'])
        context=normalized(hit['actor']+' '+hit['body'])
        if keyword.startswith('#') and not any(query_key(tag)==query_key(keyword)
                                              for tag in re.findall(r'#[\w]+',hit['body'])):
            continue
        direct_actor=any(actor==normalized(a) for a in anchors)
        independent=any(query_key(a)!=query_key(keyword).lstrip('#') and exact(context,a)
                        for a in anchors)
        if direct_actor or independent:
            matched.append(hit)
    owners={normalized(s['actor']) for s in matched if s['actor']}
    bad,others=wrong_scope(keyword,target['project'],[c for c in cards if c not in matched])
    state='REVIEW'
    status=sample['status']
    if status=='LOAD_UNCLEAR':
        state='NOT_CHECKED'
        reason=(f"{sample['attempts']} lượt tìm vẫn chưa lấy được mẫu công khai để đối chiếu." if sample.get('attempts',1)>1
                else 'Trang tìm chưa tải ra mẫu công khai đủ để kiểm tra.')
    elif status=='UNAVAILABLE':
        state,reason='NOT_CHECKED','Facebook không mở được kết quả của cụm trong lần này.'
    elif status=='EMPTY':
        reason='Facebook hiển thị thông báo không có bài cho truy vấn đứng riêng.'
    elif status=='NO_PUBLIC_SAMPLE' and not sample['displayed']:
        reason='Trang tìm hiển thị các mục Trang, Nhóm hoặc Người. Mẫu chưa có bài công khai để đối chiếu.'
    elif not cards:
        reason='Trang tìm đã mở. Chưa đọc được bài công khai để đối chiếu đúng chủ thể.'
    elif len(matched)>=2 and len(owners)>=2 and len(matched)*3>=len(cards)*2 and len(matched)>bad:
        state='READY' if target['level'] in (1,2) else 'REVIEW'
        detail='' if state=='READY' else ' Chưa đủ căn cứ gán Level từ plan.'
        reason=f'{len(matched)}/{len(cards)} bài công khai có cụm tìm và bằng chứng chủ thể từ {len(owners)} nguồn khác nhau.'+detail
    else:
        reason=f'{len(matched)}/{len(cards)} bài trong mẫu có dấu hiệu đủ rõ về chủ thể trong plan.'
        if others:
            reason+=' Mẫu có kết quả về '+', '.join(others)+'.'
        reason+=' Chưa đủ bằng chứng để bật Facebook.'
    return {'project':target['project'],'keyword':keyword,'platform':'facebook','status':state,'reason':reason,
            'observed_at':sample['checked_at'],'search_url':sample['url'],'method':METHOD,
            'sample_status':'CHECKED_VISIBLE_RESULTS' if state!='NOT_CHECKED' else status,
            'samples':[{'url':c['link'],'text_fingerprint':c['key'],'matches_scope':c in matched} for c in cards]}


def publish():
    with closing(stage_db(OBSERVATIONS)) as db:
        saved=[json.loads(r[0]) for r in db.execute('SELECT data FROM samples')]
    manual={(d['project'],d['keyword'],d['platform']):d for d in read_json(MANUAL)}
    scopes={(r['project'],r['keyword']):r for r in read_json(INPUT) if r['group']=='plan_candidate'}
    states=Counter()
    for sample in saved:
        for target in sample['targets']:
            key=target['project'],sample['keyword'],'facebook'
            scope=scopes.get(key[:2])
            if not scope or scope['plan_check']!='CELL_MATCH':
                continue
            if key not in manual or manual[key].get('method')==METHOD:
                target={**target,'level':scope['level'],'subjects':anchors_for(scope)}
                manual[key]=classify(sample,target)
            states[manual[key]['status']]+=1
    write_json(MANUAL,list(manual.values()))
    queue=read_json(QUEUE)
    actionable=[q for q in queue if not NUMBERED_PLAN_LABEL.fullmatch(q['keyword'])]
    report={'queued_queries':len(actionable),'queued_project_keywords':sum(len(q['targets']) for q in actionable),
            'attempted_queries':len(saved),'observations':dict(Counter(s['status'] for s in saved)),
            'project_keyword_statuses':dict(states),'ready_for_recheck':sum(
                s['status']=='LOAD_UNCLEAR' and s.get('attempts',1)<MAX_ATTEMPTS for s in saved)}
    write_json(SUMMARY,report)
    return report


class ScopeHandler(Handler):
    def render(self,message=''):
        saved=parse_qs(urlsplit(self.path).query).get('saved',[''])[0]
        super().render(message or (f'Đã lưu {saved} mẫu.' if len(saved)<=2 and saved.isdecimal() else ''))

    def normalize(self,item,payload):
        expected=urlsplit(item['url'])
        if urlsplit(payload.get('url','')).path.rstrip('/')=='/search/top':
            item={**item,'url':expected._replace(path='/search/top/').geturl()}
        return super().normalize(item,payload)

    def after_record(self,count):
        self.send_response(303)
        self.send_header('Location',f'/?saved={count}')
        self.end_headers()

    def pending(self):
        with closing(stage_db(OBSERVATIONS)) as db:
            seen={key:(state,json.loads(data).get('attempts',1)) for key,state,data in
                  db.execute('SELECT key,state,data FROM samples')}
        with RESULTS.open(encoding='utf-8') as results:
            first={r['keyword'] for line in results if (r:=json.loads(line))['outcome']=='SEARCH_PENDING'}
        queue=[r for r in self.server.queue if not NUMBERED_PLAN_LABEL.fullmatch(r['keyword'])]
        unseen=[r for r in queue if r['key'] not in seen]
        pending=unseen or [r for r in queue if seen[r['key']][0]=='LOAD_UNCLEAR' and seen[r['key']][1]<MAX_ATTEMPTS]
        return sorted(pending,key=lambda r:r['keyword'] not in first)

    def record(self,rows):
        count=0
        with LOCK:
            with closing(stage_db(OBSERVATIONS)) as db, db:
                for row in rows:
                    before=db.execute('SELECT state,data FROM samples WHERE key=?',(row['key'],)).fetchone()
                    attempts=0 if not before else json.loads(before['data']).get('attempts',1)
                    if before and (before['state']!='LOAD_UNCLEAR' or attempts>=MAX_ATTEMPTS):
                        continue
                    row['attempts']=attempts+1
                    db.execute('INSERT INTO samples VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET state=excluded.state,data=excluded.data',
                               (row['key'],row['status'],encode(row)))
                    count+=1
            publish()
        return count


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('serve','progress'))
    parser.add_argument('--port',type=int,default=8874)
    args=parser.parse_args()
    prepare()
    if args.action=='progress':
        print(SUMMARY.read_text(encoding='utf-8') if SUMMARY.is_file() else encode({'queued_queries':len(read_json(QUEUE))}))
        return
    print(encode(publish()),flush=True)
    with ThreadingHTTPServer(('127.0.0.1',args.port),ScopeHandler) as server:
        server.queue=read_json(QUEUE)
        server.by_key={r['key']:r for r in server.queue}
        print(f'http://127.0.0.1:{args.port}/',flush=True)
        server.serve_forever()


if __name__=='__main__':
    main()
