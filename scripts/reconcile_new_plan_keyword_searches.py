"""Record standalone search evidence for the latest plan keyword additions."""

from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import json
import sqlite3

from finalize_catalog_cross_platform_audit import classify, exact, query_url
from deduplicate_catalog_keywords import update_summaries
from reconcile_plan_keyword_remaining import FOLDER, REPORT
from reconcile_plan_keywords_deep import DB, encode, read_json, write_json


FACEBOOK = {
    'Sure Prevent': ('READY', 'Trang Vinamilk Sure và các bài về đúng dòng Sure Prevent của Vinamilk.'),
    'Hikid': ('READY', 'Trang Hikid Việt Nam, hội mẹ bỉm và bài bán lẻ đều nói về sữa Hikid.'),
    'Metaopti': ('REVIEW', 'Mẫu ít, chủ yếu hiện Meta Care Opti. Cần xác nhận Metaopti có phải cách gọi ổn định của dòng này.'),
    'Cocofresh': ('REVIEW', 'Kết quả có trà sữa CoCo và nội dung đồ uống khác. Chưa thấy đủ bài về CocoFresh của Vinamilk.'),
    'Phô mai Su su': ('REVIEW', 'Mẫu đầu chủ yếu là món ăn, đồ ăn vặt và tài khoản trùng tên.'),
    'Sữa bịch Fino': ('REVIEW', 'Có bài về siêu thị xen với dầu gội Fino. Chưa có mẫu xác nhận đúng dòng sữa.'),
    'Sữa đậu nành Gold Soy': ('REVIEW', 'Mẫu trả về Unisoy, Vegemil, Super Soy Gold. Chưa thấy đủ nội dung của Vinamilk.'),
    'I am mother': ('READY', 'Tìm riêng thấy bài nói về dòng sữa I Am Mother từ nhiều nguồn tiếng Việt.'),
    'Kid essentials': ('READY', 'Bài của cộng đồng mẹ bỉm và nhà bán lẻ nói đúng dòng sữa Kid Essentials.'),
    'Bubs': ('READY', 'Trang sữa Bubs ở Việt Nam, hội người dùng và bài bán lẻ nói đúng dòng sản phẩm.'),
}
SOCIAL_ONLY = {'I am mother', 'Bubs', 'Kid essentials'}
FACEBOOK_OTHER_PROJECTS = {
    ('TTC Group MS','TTC Trảng Bàng Aqua Park'): ('READY','Bản tin và trang đầu kết quả nói đúng công viên nước TTC Trảng Bàng.'),
    ('TTC Group MS','Cầu kính Ngàn Thông'): ('REVIEW','Mẫu chỉ hiện các khối trang, nhóm và người dùng. Chưa đủ bài về cây cầu.'),
    ('TTC Group MS','TTC Van Phong Aqua Park'): ('REVIEW','Kết quả nổi bật về Trảng Bàng. Cần mẫu xác nhận đúng cơ sở Vân Phong.'),
    ('Central Retail','Co.op Smile'): ('READY','Các bài và trang Co.opSmile nói đúng hệ thống cửa hàng.'),
    ('Central Retail','Co.opXtra'): ('READY','Trang Co.opXtra và bài từ các chi nhánh nói đúng chuỗi.'),
    ('Masan','ponnie'): ('REVIEW','Mẫu đầu chủ yếu về người có tên Ponnie. Cần mẫu về sản phẩm xúc xích Masan.'),
    ('Masan','M.E.A.T Deli'): ('REVIEW','Mẫu đầu có tin tuyển dụng Masan và nội dung Ponnie. Chưa đủ bằng chứng cho dòng thịt MEATDeli.'),
    ('Tasco','Six Senses Ninh Van Bay'): ('READY','Kết quả có hội review và nội dung trải nghiệm đúng khu nghỉ dưỡng ở Ninh Vân Bay.'),
    ('Vinmec','Thu Cúc TCI'): ('READY','Trang và bài về hệ thống Thu Cúc TCI, gồm cơ sở Hải Phòng.'),
    ('Vinmec','Hanoi French Hospital'): ('READY','Trang và nhiều bài trực tiếp của Hanoi French Hospital xác nhận đúng bệnh viện.'),
    ('VinaCapital','FUEMITEC'): ('REVIEW','Mẫu Facebook chỉ hiện nhóm kết quả người dùng, thiếu bài về chứng chỉ quỹ.'),
    ('VinaCapital','FUEVN50G'): ('REVIEW','Kết quả quá ít và có bài lạc chủ thể. Chưa đủ mẫu về đúng quỹ ETF.'),
}
SEARCH_DECISIONS = {
    ('Vinamilk','I am mother','youtube'): ('REVIEW','Mẫu chủ yếu là trailer, phim và video bình luận về phim I Am Mother.'),
    ('Vinamilk','I am mother','news'): ('REVIEW','Kết quả chủ yếu về người mẹ, phim và các chủ đề ngoài sữa.'),
    ('Vinamilk','Bubs','news'): ('REVIEW','Kết quả có bài về sữa Bubs và nhiều bài về tai nghe Buds do tìm gần đúng.'),
    ('Vinamilk','Kid essentials','news'): ('REVIEW','Chỉ thấy bài tổng hợp VIETBABY. Chưa có đủ tin về đúng dòng sữa.'),
    ('Vinamilk','Hikid','news'): ('READY','Mẫu tin độc lập từ nhiều tòa soạn xác nhận đúng sản phẩm Hikid.'),
    ('Vinamilk','Hikid','youtube'): ('READY','TVC, kênh Hikid Việt Nam và đa số video trong mẫu nói về đúng dòng sữa.'),
    ('TTC Group MS','TTC Trảng Bàng Aqua Park','youtube'): ('READY','Cả hai video trong mẫu đến từ TTC Hospitality và TTC Group, đều ghi đúng điểm đến.'),
    ('TTC Group MS','TTC Trảng Bàng Aqua Park','news'): ('READY','Tin từ nhiều báo và đài mô tả đúng công viên nước TTC tại Trảng Bàng.'),
    ('TTC Group MS','Cầu kính Ngàn Thông','news'): ('READY','Các bài nêu đúng cầu kính trong khu du lịch Thung lũng Tình yêu ở Đà Lạt.'),
    ('Central Retail','Co.op Food','news'): ('READY','Tin khai trương và mở rộng của nhiều báo xác nhận đúng chuỗi Co.op Food.'),
    ('Central Retail','Co.op Smile','news'): ('READY','Các tin khai trương, ưu đãi và hoạt động bán lẻ nói về đúng chuỗi Co.op Smile.'),
    ('Masan','Nước mắm Nam ngư','news'): ('READY','Có nhiều tin trực tiếp về sản phẩm nước mắm Nam Ngư.'),
    ('Masan','3F Việt','news'): ('READY','Các bài độc lập nhận diện đúng doanh nghiệp 3F Việt trong hệ sinh thái Masan MEATLife.'),
    ('Masan','Tops market','news'): ('READY','Mẫu tin về hệ thống siêu thị Tops Market của đối thủ Central Retail.'),
    ('Suzuki 2026','XL7 hybrid','news'): ('READY','Các tin ra mắt và so sánh xe xác nhận đúng mẫu Suzuki XL7 Hybrid.'),
    ('Tasco','Six Senses Ninh Van Bay','news'): ('READY','Tin từ nhiều báo xác nhận đúng khu nghỉ dưỡng Six Senses Ninh Vân Bay.'),
    ('Tasco','Việt Trì Legacy Lakeside','news'): ('READY','Nhiều báo xác nhận đúng dự án biệt thự của Tasco tại Phú Thọ.'),
    ('Vingroup','vinsmart future','news'): ('READY','Nhiều bài nhắc trực tiếp đến tổ chức VinSmart Future và hoạt động của đơn vị.'),
    ('Vinmec','Phương Châu Sóc Trăng','news'): ('READY','Tin về các hoạt động y tế và khám sức khỏe khớp cơ sở Phương Châu Sóc Trăng.'),
    ('Vinmec','Thu Cúc TCI','news'): ('READY','Tin khai trương, khám chữa bệnh và hoạt động hệ thống khớp Thu Cúc TCI.'),
    ('TTC Group MS','Đại học Yersin Đà Lạt','news'): ('READY','Các tin khai giảng và tốt nghiệp xác nhận đúng trường Đại học Yersin Đà Lạt.'),
    ('TTC Group MS','Trạm dừng nghỉ TTC Châu Thành','news'): ('READY','Các báo đưa tin về đúng trạm dừng nghỉ TTC trên cao tốc Vĩnh Hảo – Phan Thiết.'),
    ('TTC Group MS','TTC Plaza Đà Nẵng','news'): ('READY','Tin khánh thành và vận hành khớp dự án TTC Plaza Đà Nẵng.'),
    ('TTC Group MS','Yersin Biên Hòa','news'): ('READY','Các bài đưa tin trực tiếp về trường Tiểu học Yersin Biên Hòa.'),
    ('Truong Son Land','Sân golf Tân Sơn Nhất','news'): ('READY','Tin từ nhiều báo nói đúng dự án sân golf Tân Sơn Nhất ghi trong plan.'),
}
NEWS_VARIANTS = {
    ('Masan','meatlife'):'Masan MeatLife',
    ('Masan','Cholimex foods'):'cholimex food',
    ('Vinamilk','Sure Prevent'):'Vinamilk Sure Prevent',
}


def read_observations(platform, wanted):
    results = {}
    complete = {'OK','NO_ARTICLE_SAMPLE','NO_VIDEO_SAMPLE'}
    for suffix in ('', '-followup'):
        path = FOLDER.parent / f'{platform}-search{suffix}.jsonl'
        with path.open(encoding='utf-8') as stream:
            for line in stream:
                if not line.endswith('\n'):
                    continue
                row = json.loads(line)
                keyword = row['keyword'].casefold()
                if keyword not in wanted:
                    continue
                prior = results.get(keyword,{}).get('status')
                if row['status'] == 'OK' or prior not in complete:
                    results[keyword] = row
    return results


def evaluate(platform, entry, observed):
    keyword = entry['keyword']
    if observed['status'] != 'OK':
        return 'REVIEW', f"Lần tìm công khai trả về trạng thái {observed['status']}."
    if decision := SEARCH_DECISIONS.get((entry['project'],keyword,platform)):
        return decision
    row = (keyword, encode(entry['subjects']), 'READY', entry['level'])
    state, _, reason = classify(row, platform, observed, False)
    if state == 'READY':
        return state, reason
    if any(evidence.get('support_url') for evidence in entry['evidence']):
        sample = observed.get('results', [])[:10]
        hits = [r for r in sample if exact(r.get('title'), keyword)]
        field = 'publisher' if platform == 'news' else 'channel'
        sources = {r.get(field) for r in hits} - {None, ''}
        minimum = 5 if platform == 'news' else 4
        if len(hits) >= minimum and len(hits) * 5 >= len(sample) * 3 and len(sources) >= 3:
            return 'READY', f"{len(hits)}/{len(sample)} tiêu đề từ {len(sources)} nguồn khớp tên riêng đã đối chiếu."
    return state, reason


def candidates(entries, observations):
    for entry in entries:
        project, keyword = (entry[field] for field in ('project', 'keyword'))
        for platform, indexed in observations.items():
            if platform == 'news' and keyword.startswith('#'):
                continue
            observed = indexed.get(keyword.casefold())
            if observed:
                state, reason = evaluate(platform, entry, observed)
                yield (project, keyword, platform, state, reason, observed)
        facebook = FACEBOOK.get(keyword) if project == 'Vinamilk' else FACEBOOK_OTHER_PROJECTS.get((project,keyword))
        if facebook:
            state, reason = facebook
            yield (project, keyword, 'facebook', state, reason, {
                'status': 'LOGGED_IN_SEARCH', 'checked_at': datetime.now(timezone.utc).isoformat(),
                'url': query_url('facebook', keyword), 'results': [{'summary': reason}],
            })


def reconcile_news_variants(db, observations):
    outcomes = []
    for (project, keyword), canonical in NEWS_VARIANTS.items():
        variant, main = (observations.get(w.casefold(),{}) for w in (keyword,canonical))
        if any(o.get('status') != 'OK' for o in (variant,main)):
            continue
        first, second = ({s['url'] for s in o['results'][:12] if s.get('url')} for o in (variant,main))
        common = len(first & second)
        if common < 4 or common * 10 < 7 * min(len(first),len(second)):
            continue
        levels = db.execute('''SELECT keyword,level FROM keywords WHERE project_name=? AND keyword IN (?,?)
                               AND status IN ('READY','REVIEW','CHANNEL_ONLY')''',(project,keyword,canonical)).fetchall()
        if len(levels)!=2 or len({level for _,level in levels})!=1:
            continue
        reason = f"Cùng chủ thể trong plan và trùng {common} bài trong mẫu News. Giữ {canonical} làm keyword chính khi tìm tin."
        for word, state, target, seen in ((keyword,'ALIAS',canonical,variant),(canonical,'READY',None,main)):
            db.execute('''UPDATE keyword_platform_audit SET status=?,canonical_keyword=?,reason=?,search_url=?,
                sample_status=?,checked_at=?,samples_json=? WHERE project_name=? AND keyword=? AND platform='news'
                AND (status IN ('REVIEW','READY','NOT_CHECKED') OR (status='ALIAS' AND canonical_keyword=?))''',
                (state,target,reason,seen['url'],seen['status'],seen['checked_at'],encode(seen['results']),
                 project,word,canonical))
        outcomes.append({'project':project,'keyword':keyword,'canonical_keyword':canonical,'overlap':common,'reason':reason})
    return outcomes


def main():
    entries = read_json(REPORT)['keywords']
    wanted = {entry['keyword'].casefold() for entry in entries}
    observations = {p: read_observations(p, wanted) for p in ('youtube', 'news')}
    variant_keys = {term.casefold() for (_,variant),chosen in NEWS_VARIANTS.items() for term in (variant,chosen)}
    variant_observations = read_observations('news', variant_keys)
    evaluated = list(candidates(entries, observations))
    counts = Counter()
    catalog_states = Counter()
    with closing(sqlite3.connect(DB.resolve().as_uri()+'?mode=rw', uri=True, timeout=25)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        for project, keyword, platform, state, reason, observed in evaluated:
            cursor = db.execute('''UPDATE keyword_platform_audit
                SET status=?,reason=?,search_url=?,sample_status=?,checked_at=?,samples_json=?
                WHERE project_name=? AND keyword=? AND platform=? AND (status='NOT_CHECKED' OR
                    (status='REVIEW' AND (checked_at IS NULL OR checked_at<=?)) OR
                    (checked_at=? AND search_url=? AND sample_status=?))''',
                (state, reason, observed['url'], observed['status'], observed['checked_at'],
                 encode(observed.get('results', [])), project, keyword, platform, observed['checked_at'],
                 observed['checked_at'], observed['url'], observed['status']))
            if cursor.rowcount:
                counts[platform, state] += 1
        aliases = reconcile_news_variants(db, variant_observations)
        for entry in entries:
            project, keyword = entry['project'],entry['keyword']
            ready = {p for (p,) in db.execute('''SELECT platform FROM keyword_platform_audit
                      WHERE project_name=? AND keyword=? AND status='READY' ''', (project,keyword))}
            current, level, notes = db.execute('''SELECT status,level,reasons_json FROM keywords
                WHERE project_name=? AND keyword=?''', (project,keyword)).fetchone()
            if current not in {'READY','CHANNEL_ONLY','REVIEW'}:
                catalog_states[current] += 1
                continue
            target = ('READY' if 'facebook' in ready and not (project=='Vinamilk' and keyword in SOCIAL_ONLY)
                      else 'CHANNEL_ONLY' if ready else 'REVIEW')
            catalog_states[target] += 1
            if target == current:
                continue
            reason = ('Có ô gốc trong plan. Mẫu tìm riêng hiện đủ bằng chứng trên '+', '.join(sorted(ready))+'.'
                      if ready else 'Có ô gốc trong plan. Chưa có mẫu theo kênh đủ chắc để vào hàng đợi tìm tự động.')
            reasons = list(dict.fromkeys([*json.loads(notes),reason]))
            db.execute('UPDATE keywords SET status=?,reasons_json=? WHERE project_name=? AND keyword=?',
                       (target,encode(reasons),project,keyword))
            db.execute('INSERT OR IGNORE INTO keyword_quality_audit VALUES (?,?,?,?,?,?,?,?,?)',
                       ('active-plan-standalone-search',project,keyword,current,target,level,level,None,reason))
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchone():
            raise sqlite3.IntegrityError('Catalog integrity check failed')
        db.commit()
        update_summaries(db)
    aliases_by_keyword = {(a['project'],a['keyword']):a for a in aliases}
    decisions = []
    for project,keyword,channel,state,reason,observation in evaluated:
        entry = {'project':project,'keyword':keyword,'platform':channel,'status':state,'reason':reason,
                 'search_url':observation['url'],'sample_status':observation['status']}
        if channel=='news' and (alias:=aliases_by_keyword.get((project,keyword))):
            entry.update(status='ALIAS',reason=alias['reason'],canonical_keyword=alias['canonical_keyword'])
        decisions.append(entry)
    write_json(FOLDER/'additional-keyword-search-results.json', {
        'observations': {p: dict(Counter(r['status'] for r in rows.values())) for p, rows in observations.items()},
        'updated': {p: dict((s,n) for (channel,s),n in counts.items() if channel==p) for p in ('facebook','youtube','news')},
        'catalog_statuses': dict(catalog_states),
        'news_aliases': aliases,
        'decisions': decisions,
    })
    print(encode({'catalog_inputs':len(entries), 'updates':{f'{p}/{s}':n for (p,s),n in counts.items()}}))


if __name__ == '__main__':
    main()
