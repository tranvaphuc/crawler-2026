from pathlib import Path
import argparse
import json
from urllib.parse import urlsplit, urlunsplit

parser = argparse.ArgumentParser()
parser.add_argument('progress')
parser.add_argument('output')
parser.add_argument('unresolved')
args = parser.parse_args()

mapping = json.loads(Path(args.progress).read_text(encoding='utf-8'))
results = []
unresolved = []

for source, target in mapping.items():
    if target.startswith('__ERROR__') or 'error=invalid_post' in target or '/share/' in target:
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
    'resolved': len(results) - len(unresolved),
    'unresolved': len(unresolved),
    'unique': len(set(results)),
}))
