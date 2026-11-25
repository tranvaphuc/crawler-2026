from pathlib import Path
import argparse
import json
import re
from urllib.parse import parse_qsl, parse_qs, urlencode, urlsplit, urlunsplit


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
        targets = parse_qs(parts.query).get('next', [])
        if targets:
            return targets[0]
    return url


def canonicalize(url: str) -> str:
    parts = urlsplit(unwrap_login(url))
    host = parts.netloc.lower()
    if host == 'facebook.com' or host.endswith('.facebook.com'):
        host = 'www.facebook.com'
    path = parts.path or '/'
    video = re.match(r'^/([^/]+)/videos/(?:.+/)?(\d+)/?$', path)
    if video:
        path = f'/{video.group(1)}/videos/{video.group(2)}/'
    elif re.match(r'^/reel/\d+/?$', path):
        path = path.rstrip('/') + '/'
    elif not path.endswith('/') and not path.endswith('.php'):
        path += '/'
    allowed = {'story_fbid', 'id', 'fbid', 'set', 'idorvanity', 'comment_id', 'reply_comment_id'}
    if path == '/watch/':
        allowed.add('v')
    query = [(key, value) for key, value in parse_qsl(parts.query) if key in allowed]
    return urlunsplit(('https', host, path, urlencode(query), ''))


parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('progress')
parser.add_argument('output')
parser.add_argument('unresolved')
args = parser.parse_args()

rows = [clean_input(line) for line in Path(args.source).read_text(encoding='utf-8').splitlines() if line.strip()]
mapping = json.loads(Path(args.progress).read_text(encoding='utf-8'))
results = []
unresolved = []

for source in rows:
    target = mapping.get(source, source)
    final = source if target.startswith('__ERROR__') else canonicalize(target)
    results.append(final)
    if target.startswith('__ERROR__') or '/share/' in final:
        unresolved.append(source)

Path(args.output).write_text('\n'.join(results) + '\n', encoding='utf-8')
Path(args.unresolved).write_text('\n'.join(unresolved) + ('\n' if unresolved else ''), encoding='utf-8')
print(json.dumps({
    'rows': len(results),
    'unique': len(set(results)),
    'duplicate_occurrences': len(results) - len(set(results)),
    'unresolved': len(unresolved),
    'tracking_remaining': sum(any(key in item for key in ('mibextid=', 'rdid=', 'share_url=', 'notif_id=')) for item in results),
}))
