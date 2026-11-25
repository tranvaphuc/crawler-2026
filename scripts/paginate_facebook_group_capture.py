#!/usr/bin/env python3
"""Replay a captured group-feed request and follow its returned cursors.

Uses the original HAR locally so redacted tokens need not be pasted into code.
Python standard library only. No browser, login automation, or automatic retries.
"""
import argparse
import copy
import http.cookiejar
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

QUERY = 'GroupsCometFeedRegularStoriesPaginationQuery'


def parse_chunks(text):
    text = text.lstrip()
    if text.startswith('for (;;);'):
        text = text[len('for (;;);'):].lstrip()
    decoder = json.JSONDecoder()
    chunks = []
    while text:
        value, end = decoder.raw_decode(text)
        if not isinstance(value, dict):
            raise ValueError('Expected GraphQL JSON objects')
        chunks.append(value)
        text = text[end:].lstrip()
    return chunks


def merge_chunks(chunks):
    root = {}
    for chunk in chunks:
        data = chunk.get('data')
        if not isinstance(data, dict):
            continue
        target = root
        for key in chunk.get('path', []):
            if isinstance(target, list):
                while len(target) <= key:
                    target.append({})
                target = target[key]
            else:
                target = target.setdefault(key, {})
        target.update(copy.deepcopy(data))
    return root


def get(value, path, default=None):
    for key in path.split('.'):
        if not isinstance(value, dict):
            return default
        value = value.get(key)
    return default if value is None else value


def extract_posts(root):
    posts = []
    for edge in get(root, 'node.group_feed.edges', []):
        story = edge.get('node', {})
        if not story.get('post_id'):
            continue
        content = get(story, 'comet_sections.content.story', {})
        timestamp = story.get('creation_time')
        posts.append({
            'post_id': story['post_id'],
            'url': story.get('permalink_url'),
            'created_time': timestamp,
            'created_at': datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
                if timestamp is not None else None,
            'authors': [{k: actor.get(k) for k in ('id', 'name', 'url')}
                        for actor in story.get('actors', [])],
            'text': get(content, 'message.text'),
            'attachments': story.get('attachments', []),
            'feedback': get(story, 'comet_sections.feedback.story.story_ufi_container.'
                'story.feedback_context.feedback_target_with_context.'
                'comet_ufi_summary_and_actions_renderer.feedback', {}),
        })
    return posts


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def export_links(posts, output, limit):
    rows = []
    for post in posts[:limit]:
        timestamp = post.get('created_time')
        rows.append({
            'link': post.get('url'),
            'time': datetime.fromtimestamp(timestamp, ZoneInfo('Asia/Ho_Chi_Minh')).isoformat()
                if timestamp is not None else None,
            'author': ', '.join(a.get('name') or a.get('id') or ''
                                for a in post.get('authors', [])),
        })
    write_json(output / 'link-time-author.json', rows)
    (output / 'link-time-author.txt').write_text('\n'.join(
        f"{r['link']} | {r['time']} | {r['author']}" for r in rows) + '\n')


def positive_int(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError('Must be at least 1')
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--har', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--target', type=positive_int, default=20)
    parser.add_argument('--group-id', help='Start a different group from cursor=null')
    parser.add_argument('--max-pages', type=positive_int, default=8,
                        help='Maximum additional HTTP requests')
    parser.add_argument('--delay', type=float, default=2)
    parser.add_argument('--offline', action='store_true', help='Only extract the saved response')
    args = parser.parse_args()
    if args.delay < 0:
        parser.error('--delay must be non-negative')
    har = json.loads(args.har.read_text())
    entries = []
    for entry in har['log']['entries']:
        request = entry['request']
        form = dict(urllib.parse.parse_qsl(request.get('postData', {}).get('text', ''),
                                         keep_blank_values=True))
        if form.get('fb_api_req_friendly_name') == QUERY:
            entries.append((entry, form))
    if not entries:
        parser.error(f'No {QUERY} request in HAR')
    entry, form = entries[-1]
    url = entry['request']['url']
    parsed_url = urllib.parse.urlsplit(url)
    if (parsed_url.scheme, parsed_url.hostname, parsed_url.path) != (
            'https', 'www.facebook.com', '/api/graphql/'):
        parser.error('HAR endpoint must be https://www.facebook.com/api/graphql/')
    excluded = {'host', 'content-length', 'accept-encoding', 'connection',
                'cookie', 'authorization'}
    headers = {h['name']: h['value'] for h in entry['request']['headers']
               if not h['name'].startswith(':') and h['name'].lower() not in excluded}
    for value in form.values():
        if value == '[REDACTED]':
            parser.error('Use the original HAR, not the redacted request JSON')
    variables = json.loads(form['variables'])
    if args.group_id and not args.group_id.isdigit():
        parser.error('--group-id must contain only digits')
    if args.group_id and args.offline:
        parser.error('--group-id needs network access; cannot use --offline')
    args.out.mkdir(parents=True, exist_ok=True)
    raw = entry['response']['content']['text']
    if entry['response']['content'].get('encoding') == 'base64':
        import base64
        raw = base64.b64decode(raw).decode('utf-8')
    chunks = parse_chunks(raw)
    root = merge_chunks(chunks)
    posts = {p['post_id']: p for p in extract_posts(root)}
    (args.out / 'page-000.response.jsonl').write_text(raw)
    write_json(args.out / 'page-000.merged.json', root)
    page_info = get(root, 'node.group_feed.page_info', {})
    trace = [{'page': 0, 'source': 'captured_response', 'posts': len(posts)}]
    fresh_group = args.group_id is not None
    if fresh_group:
        variables['id'] = args.group_id
        variables['youthIntegrityHostID'] = args.group_id
        variables['cursor'] = None
        for name in list(headers):
            if name.lower() == 'referer':
                headers[name] = f'https://www.facebook.com/groups/{args.group_id}/'
            elif name.lower() == 'x-fb-navigation-chain':
                del headers[name]
        # Never mix the original group's seed posts or cursor into a new group.
        posts = {}
        page_info = {'has_next_page': True, 'end_cursor': None}
        trace = []
        (args.out / 'page-000.response.jsonl').unlink(missing_ok=True)
        (args.out / 'page-000.merged.json').unlink(missing_ok=True)
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    seen_cursors = set()
    reason = 'offline_only' if args.offline else 'max_pages_reached'
    try:
        for page in range(1, 1 if args.offline else args.max_pages + 1):
            if len(posts) >= args.target:
                reason = 'target_reached'
                break
            if not page_info.get('has_next_page'):
                reason = 'no_next_page'
                break
            cursor = page_info.get('end_cursor')
            first_request = fresh_group and page == 1
            if not first_request and (not cursor or cursor in seen_cursors):
                reason = 'missing_or_repeated_cursor'
                break
            seen_cursors.add(cursor)
            variables['cursor'] = cursor
            form['variables'] = json.dumps(variables, separators=(',', ':'))
            # Preserve the browser's requested count and all other query variables.
            time.sleep(args.delay)
            request = urllib.request.Request(url,
                data=urllib.parse.urlencode(form).encode(), headers=headers, method='POST')
            try:
                with opener.open(request, timeout=45) as response:
                    status = response.status
                    final_url = response.url
                    raw = response.read().decode('utf-8', errors='replace')
            except urllib.error.HTTPError as error:
                raw = error.read().decode('utf-8', errors='replace')
                (args.out / f'page-{page:03}.error.txt').write_text(raw)
                trace.append({'page': page, 'http_status': error.code})
                reason = f'http_error_{error.code}'
                break
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                trace.append({'page': page, 'network_error': str(error)})
                reason = 'network_error'
                break
            (args.out / f'page-{page:03}.response.txt').write_text(raw)
            if '/login' in final_url or '/checkpoint' in final_url:
                reason = 'login_or_checkpoint_required'
                trace.append({'page': page, 'http_status': status, 'reason': reason})
                break
            try:
                chunks = parse_chunks(raw)
            except (ValueError, json.JSONDecodeError):
                reason = 'non_json_response'
                trace.append({'page': page, 'http_status': status, 'reason': reason})
                break
            root = merge_chunks(chunks)
            write_json(args.out / f'page-{page:03}.merged.json', root)
            new_posts = extract_posts(root)
            before = len(posts)
            for post in new_posts:
                posts[post['post_id']] = post
            errors = [error for chunk in chunks for error in chunk.get('errors', [])]
            trace.append({'page': page, 'http_status': status,
                          'returned_posts': len(new_posts), 'new_posts': len(posts) - before,
                          'total_posts': len(posts), 'errors': errors})
            print(f'Page {page}: {len(new_posts)} returned, '
                  f'{len(posts) - before} new, {len(posts)} total', flush=True)
            write_json(args.out / 'progress.json', trace)
            if len(posts) >= args.target:
                reason = 'target_reached'
                break
            if not new_posts:
                reason = 'graphql_error' if errors else 'no_posts_returned'
                break
            if len(posts) == before:
                reason = 'no_new_posts'
                break
            page_info = get(root, 'node.group_feed.page_info', {})
    finally:
        values = list(posts.values())
        times = [p['created_time'] for p in values if p['created_time'] is not None]
        result = {'group_id': variables.get('id'), 'query': QUERY,
                  'requested_count': args.target, 'extracted_count': len(values),
                  'target_reached': len(values) >= args.target,
                  'requested_sorting': variables.get('sortingSetting'),
                  'returned_order_is_chronological': len(times) == len(values) and
                      all(a >= b for a, b in zip(times, times[1:])),
                  'latest_posts_verified': False, 'stop_reason': reason,
                  'pages': trace, 'posts': values}
        write_json(args.out / 'posts.json', result)
        export_links(values, args.out, args.target)
        print(json.dumps({'extracted_count': len(values), 'stop_reason': reason,
                          'output': str((args.out / 'posts.json').resolve())}))


if __name__ == '__main__':
    main()
