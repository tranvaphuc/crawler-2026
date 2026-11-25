import tarfile,json,subprocess,hashlib
from pathlib import Path
root=Path('outputs/news-deploy-2026-11-13');root.mkdir(parents=True,exist_ok=True)
lock=json.loads(Path('package-lock.json').read_text(encoding='utf-8'))
names=['axios','cheerio','dotenv','elasticsearch','http-proxy-agent','https-proxy-agent','iconv-lite']
deps={p:lock['packages']['node_modules/'+p]['version'] for p in names}
package={'name':'news-flow','version':'1.0.0','private':True,'type':'module','engines':{'node':'>=22.13 <23'},'scripts':{'start':'node scripts/run_news_flow.mjs --write','test':'node --test test/*.test.mjs'},'dependencies':deps}
(root/'package.json').write_text(json.dumps(package,indent=2)+'\n',encoding='utf-8')
files=[]
for folder in ['src/newsFlow','src/web','config/web-sources/news','config/web-sources/tls']:
 files.extend(p for p in Path(folder).rglob('*') if p.is_file())
files.extend(Path('config/web-sources')/f for f in ['news-date-overrides.json','news-http-profiles.json','news-flow-quality.json'])
files.extend(Path('scripts')/f for f in ['run_news_flow.mjs','run_news_writer.mjs','run_news_three_flow.mjs','probe_news_proxies.mjs','check_news_deployment.mjs','verify_news_canary.mjs','benchmark_news_batch.mjs','benchmark_news_master.mjs','benchmark_news_maintenance.mjs','benchmark_news_parser_replay.mjs'])
files.extend(Path('test')/f for f in ['news-flow.test.mjs','news-flow-transport.test.mjs','news-deep-audit-evidence.test.mjs','news-field-verification.test.mjs','news-publisher-dispatch.test.mjs','news-http-transport.test.mjs','news-http-sources.test.mjs','news-link-policy.test.mjs','news-runtime-repairs.test.mjs','news-batch-reader.test.mjs','news-network-pool.test.mjs','news-freshness.test.mjs','news-writer-service.test.mjs','news-parse-once.test.mjs','news-three-flow.test.mjs','news-sqlite-maintenance.test.mjs','news-parser-throughput.test.mjs','news-flow-durable-completion.test.mjs'])
files.extend(Path('docs')/f for f in ['news-flow.md','news-eastdata-flow.md','news-deployment.md','news-three-flows.md'])
with tarfile.open(root/'release.tar.gz','w:gz') as archive:
 for p in sorted(set(files)):archive.add(p,arcname=p.as_posix())
 archive.add(root/'package.json',arcname='package.json')
env=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import dotenv from 'dotenv';const e=dotenv.parse(fs.readFileSync('.env'));process.stdout.write(JSON.stringify({ES5_HOST:e.ES5_HOST}));"],text=True))
assert env.get('ES5_HOST')
(root/'news.env').write_text('ES5_HOST='+json.dumps(env['ES5_HOST'])+'\n',encoding='utf-8')
proof=json.loads(Path('outputs/news-flow-build-2026-11-12/identity-proof.json').read_text(encoding='utf-8'))
(root/'identity-proof.summary.json').write_text(json.dumps({'summary':proof['summary']},indent=2)+'\n',encoding='utf-8')
manifest={'files':len(set(files))+1,'dependencies':deps,'sha256':hashlib.sha256((root/'release.tar.gz').read_bytes()).hexdigest(),'bytes':(root/'release.tar.gz').stat().st_size}
(root/'release-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(json.dumps(manifest))
