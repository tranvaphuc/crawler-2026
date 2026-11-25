from pathlib import Path
import argparse
import json
import re
from urllib.parse import parse_qsl, parse_qs, urlencode, urlsplit, urlunsplit


def unwrap_login(url: str) -> str:
    parts = urlsplit(url)
    if parts.path == '/login.php':
        targets = parse_qs(parts.query).get('next', [])
        if targets:
            return targets[0]
    return url


def canonicalize(url: str) -> str:
    url = unwrap_login(url)
    parts = urlsplit(url)
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
parser.add_argument('progress')
parser.add_argument('output')
parser.add_argument('unresolved')
args = parser.parse_args()

mapping = json.loads(Path(args.progress).read_text(encoding='utf-8'))
results = []
unresolved = []
for source, target in mapping.items():
    final = canonicalize(target) if not target.startswith('__ERROR__') else source
    results.append(final)
    if '/share/' in final or target.startswith('__ERROR__'):
        unresolved.append(source)

Path(args.output).write_text('\n'.join(results) + '\n', encoding='utf-8')
Path(args.unresolved).write_text('\n'.join(unresolved) + ('\n' if unresolved else ''), encoding='utf-8')
print(json.dumps({
    'rows': len(results),
    'unique': len(set(results)),
    'unresolved': len(unresolved),
    'tracking_remaining': sum(any(key in item for key in ('mibextid=', 'rdid=', 'share_url=')) for item in results),
}))
