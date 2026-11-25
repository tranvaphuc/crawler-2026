from pathlib import Path
import argparse
import json
import re
from urllib.parse import parse_qs, parse_qsl, urlencode, urlsplit, urlunsplit


def unwrap_facebook_login(url: str) -> str:
    parts = urlsplit(url)
    if parts.path == '/login.php':
        targets = parse_qs(parts.query).get('next', [])
        if targets:
            return targets[0]
    return url


def canonicalize_facebook(url: str) -> str:
    parts = urlsplit(unwrap_facebook_login(url))
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
    return urlunsplit(('https', 'www.facebook.com', path, urlencode(query), ''))


def canonicalize(url: str) -> str:
    parts = urlsplit(url)
    host = parts.netloc.lower()
    if host == 'facebook.com' or host.endswith('.facebook.com'):
        return canonicalize_facebook(url)
    path = parts.path or '/'
    if not path.endswith('/') and not path.endswith('.php'):
        path += '/'
    if host == 'threads.com' or host.endswith('.threads.com'):
        return urlunsplit(('https', 'www.threads.com', path, '', ''))
    if host == 'instagram.com' or host.endswith('.instagram.com'):
        return urlunsplit(('https', 'www.instagram.com', path, '', ''))
    if host == 'tiktok.com' or host.endswith('.tiktok.com'):
        return urlunsplit(('https', 'www.tiktok.com', path, '', ''))
    return urlunsplit((parts.scheme or 'https', parts.netloc, parts.path or '/', parts.query, ''))


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
    failed = target.startswith('__ERROR__') or 'error=invalid_post' in target
    final = source if failed else canonicalize(target)
    final_parts = urlsplit(final)
    missing_threads_post_id = (
        (final_parts.netloc == 'threads.com' or final_parts.netloc.endswith('.threads.com'))
        and re.match(r'^/@[^/]+/post/?$', final_parts.path) is not None
    )
    still_short = any(marker in final for marker in ('/share/', 'www.tt.site/t/')) or missing_threads_post_id
    results.append(final)
    if failed or still_short:
        unresolved.append(source)

Path(args.output).write_text('\n'.join(results) + '\n', encoding='utf-8')
Path(args.unresolved).write_text('\n'.join(unresolved) + ('\n' if unresolved else ''), encoding='utf-8')
print(json.dumps({
    'rows': len(results),
    'unique': len(set(results)),
    'duplicate_occurrences': len(results) - len(set(results)),
    'unresolved': len(unresolved),
    'tracking_remaining': sum('?' in item or '#' in item for item in results),
}, ensure_ascii=False))
