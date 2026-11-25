from pathlib import Path
import argparse
import json
from urllib.parse import urlsplit, urlunsplit

parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('progress')
parser.add_argument('output')
parser.add_argument('unresolved')
args = parser.parse_args()

rows = [line.strip() for line in Path(args.source).read_text(encoding='utf-8').splitlines() if line.strip()]
mapping = json.loads(Path(args.progress).read_text(encoding='utf-8'))
results = []
unresolved = []

for source in rows:
    target = mapping.get(source, source)
    if target.startswith('__ERROR__') or 'error=invalid_post' in target or ('/share/' in target and source in mapping):
        results.append(source)
        unresolved.append(source)
        continue
    parts = urlsplit(target)
    path = parts.path.rstrip('/') + '/'
    results.append(urlunsplit(('https', 'www.threads.com', path, '', '')))

Path(args.output).write_text('\n'.join(results) + '\n', encoding='utf-8')
Path(args.unresolved).write_text('\n'.join(unresolved) + ('\n' if unresolved else ''), encoding='utf-8')
print(json.dumps({
    'rows': len(results),
    'resolved_share_links': len(mapping) - len(unresolved),
    'unresolved': len(unresolved),
    'unique_results': len(set(results)),
    'tracking_remaining': sum('?' in item or '#' in item for item in results),
}, ensure_ascii=False))
