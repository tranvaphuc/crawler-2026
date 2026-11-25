from pathlib import Path
import json
from urllib.parse import urlsplit, urlunsplit

PROGRESS = Path('/Users/phuctran/Workspace/crawler-2026/threads-progress-67.json')
OUTPUT = Path('/Users/phuctran/Workspace/crawler-2026/threads-resolved-67.txt')
UNRESOLVED = Path('/Users/phuctran/Workspace/crawler-2026/threads-unresolved-67.txt')

mapping = json.loads(PROGRESS.read_text(encoding='utf-8'))
results = []
unresolved = []

for source, target in mapping.items():
    if 'error=invalid_post' in target or '/share/' in target or target.startswith('__ERROR__'):
        results.append(source)
        unresolved.append(source)
        continue

    parts = urlsplit(target)
    path = parts.path.rstrip('/') + '/'
    results.append(urlunsplit(('https', 'www.threads.com', path, '', '')))

OUTPUT.write_text('\n'.join(results) + '\n', encoding='utf-8')
UNRESOLVED.write_text('\n'.join(unresolved) + ('\n' if unresolved else ''), encoding='utf-8')

print(json.dumps({
    'rows': len(results),
    'resolved': len(results) - len(unresolved),
    'unresolved': len(unresolved),
    'unique_results': len(set(results)),
}, ensure_ascii=False))
