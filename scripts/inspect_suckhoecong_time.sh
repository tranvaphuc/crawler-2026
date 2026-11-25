set -euo pipefail
python3 - <<'PY'
import pathlib,json,sqlite3
r=pathlib.Path('/opt/news-flow/current')
c=json.loads((r/'config/web-sources/news/suckhoecong.vn.json').read_text())
print('LIVE_DATE_CONFIG',json.dumps({k:c.get(k) for k in ['publishedDate','variants','timezone','publicationTimePolicy','publicationValidationPolicy','originalPublicationBlockedReason','publicationEvidencePolicy']},ensure_ascii=False))
print('LIVE_STRICT', (r/'src/web/newsStrictPublication.mjs').read_text())
print('LIVE_DATE_OVERRIDES',json.dumps(json.loads((r/'config/web-sources/news-date-overrides.json').read_text()).get('suckhoecong.vn')))
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
print('LATEST_FAILURES',json.dumps(db.execute("SELECT url,error FROM article_links WHERE site='suckhoecong.vn' AND parse_status='fail' LIMIT 6").fetchall()))
PY
