set -eu
cd /opt/news-flow/current
python3 - <<'PY'
s=open('scripts/requested7_verify_discovery.mjs').read()
s=s.replace("const url='https://'+site+'/',key=requestKey(url);let task;", "const url='https://'+site+'/rss.xml',key=requestKey(url);const source=registry.sources.get(site);if(![source.config.publishedDate,...(source.config.variants||[]).map(v=>v.publishedDate)].some(d=>d?.strategy==='public_feed'&&d.feedUrl===url))throw Error('DECLARED_FEED_REQUIRED');state.tx(()=>{state.db.prepare('INSERT OR IGNORE INTO seed_sources(url_key,url,site) VALUES(?,?,?)').run(key,url,site);state.event('verified_publication_feed_seed_added',{site,url,reason:'homepage_discovery_timeout'});});let task;")
s=s.replace("'recovery/discovery-'", "'recovery/feed-discovery-'")
open('scripts/requested7_verify_tcc_feed.mjs','w').write(s)
PY
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/requested7_verify_tcc_feed.mjs taichinhcongnghe.vn
