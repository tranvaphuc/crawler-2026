from pathlib import Path
import json,tarfile,hashlib
out=Path('outputs/forum-deploy-2026-11-17');out.mkdir(parents=True,exist_ok=True)
lock=json.loads(Path('package-lock.json').read_text(encoding='utf-8'))
names=['axios','cheerio','dotenv','elasticsearch','iconv-lite']
deps={n:lock['packages']['node_modules/'+n]['version'] for n in names}
package={'name':'forum-flow','version':'1.0.0','type':'module','private':True,'engines':{'node':'>=22.13'},'dependencies':deps}
(out/'package.json').write_text(json.dumps(package,indent=2)+'\n',encoding='utf-8')
files=[]
for directory in ['src/forumFlow','src/web','config/forum-flow','config/web-sources']:
 files.extend(p for p in Path(directory).rglob('*') if p.is_file())
files.extend(Path('scripts')/n for n in ['run_forum_flow.mjs','run_forum_writer.mjs','preflight_forum_es5.mjs'])
files.extend(Path('test')/n for n in ['forum-flow.test.mjs','forum-es5.test.mjs','news-forum-parser.test.mjs'])
files.extend(Path('deploy')/n for n in ['forum-flow.service','forum-flow-writer.service'])
files.append(Path('docs/forum-eastdata-flow.md'))
def metadata(info):
 info.uid=info.gid=0;info.uname=info.gname='root';info.mode=0o644;return info
with tarfile.open(out/'release.tar.gz','w:gz') as tar:
 for p in sorted(set(files)):tar.add(p,arcname=p.as_posix(),filter=metadata)
 tar.add(out/'package.json',arcname='package.json',filter=metadata)
manifest={'files':len(set(files))+1,'bytes':(out/'release.tar.gz').stat().st_size,'sha256':hashlib.sha256((out/'release.tar.gz').read_bytes()).hexdigest(),'dependencies':deps}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(json.dumps(manifest))
