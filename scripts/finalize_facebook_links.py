from pathlib import Path
import json
import re
from urllib.parse import parse_qsl, parse_qs, urlencode, urlsplit, urlunsplit

SOURCE = Path('/Users/phuctran/.codex/attachments/6b5cf7ad-9839-40ce-992d-5e8e62b14050/Pasted text.txt')
PROGRESS = Path('/Users/phuctran/Workspace/crawler-2026/facebook-large-progress.json')
OUTPUT = Path('/Users/phuctran/Workspace/crawler-2026/facebook-resolved-250.txt')
UNRESOLVED = Path('/Users/phuctran/Workspace/crawler-2026/facebook-unresolved-250.txt')


def clean_input(value: str) -> str:
    value = value.strip()
    if '/https://' in value:
        value = value.split('/https://', 1)[0] + '/'
    if '/share/v/16HZt9aKba6/' in value:
        value = 'https://www.facebook.com/share/v/16HZt9aKba6/'
    return value


def unwrap_login(url: str) -> str:
    parts = urlsplit(url)
    if parts.path == '/login.php':
        target = parse_qs(parts.query).get('next', [])
        if target:
            return target[0]
    return url


def canonicalize(url: str) -> str:
    url = unwrap_login(url)
    parts = urlsplit(url)
    host = parts.netloc.lower()
    if host in {'facebook.com', 'm.facebook.com', 'web.facebook.com'} or host.endswith('.facebook.com'):
        host = 'www.facebook.com'

    path = parts.path or '/'
    video_match = re.match(r'^/([^/]+)/videos/(?:.+/)?(\d+)/?$', path)
    if video_match:
        path = f'/{video_match.group(1)}/videos/{video_match.group(2)}/'
    elif re.match(r'^/reel/\d+/?$', path):
        path = path.rstrip('/') + '/'
    elif not path.endswith('/') and not path.endswith('.php'):
        path += '/'

    allowed = {'story_fbid', 'id', 'fbid', 'set', 'idorvanity', 'comment_id', 'reply_comment_id'}
    if path == '/watch/':
        allowed.add('v')
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=False) if key in allowed]
    return urlunsplit(('https', host, path, urlencode(query), ''))


rows = [clean_input(line) for line in SOURCE.read_text(encoding='utf-8').splitlines() if line.strip()]
resolved_map = json.loads(PROGRESS.read_text(encoding='utf-8'))
results = []
unresolved = []

for row in rows:
    target = resolved_map.get(row, row)
    final = canonicalize(target)
    results.append(final)
    if '/share/' in final or target.startswith('__ERROR__'):
        unresolved.append(row)

OUTPUT.write_text('\n'.join(results) + '\n', encoding='utf-8')
UNRESOLVED.write_text('\n'.join(unresolved) + ('\n' if unresolved else ''), encoding='utf-8')

print(json.dumps({
    'rows': len(rows),
    'output_rows': len(results),
    'unique_output': len(set(results)),
    'duplicate_occurrences': len(results) - len(set(results)),
    'unresolved_rows': len(unresolved),
    'tracking_remaining': sum(any(key in item for key in ('mibextid=', 'rdid=', 'share_url=', 'notif_id=', 'notif_t=', 'ref=')) for item in results),
}, ensure_ascii=False))
