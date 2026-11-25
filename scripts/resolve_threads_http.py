from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import argparse
import json
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('progress')
parser.add_argument('--workers', type=int, default=8)
args = parser.parse_args()

rows = [line.strip() for line in Path(args.source).read_text(encoding='utf-8').splitlines() if line.strip()]


def resolve(url: str) -> tuple[str, str]:
    for _ in range(2):
        process = subprocess.run(
            ['curl', '-L', '-sS', '--max-time', '25', '-o', '/dev/null', '-w', '%{url_effective}', url],
            capture_output=True,
            text=True,
        )
        final = process.stdout.strip()
        if process.returncode == 0 and final:
            return url, final
    return url, '__ERROR__' + (process.stderr.strip() or f'curl exit {process.returncode}')


resolved = {}
with ThreadPoolExecutor(max_workers=args.workers) as executor:
    futures = [executor.submit(resolve, url) for url in rows]
    for index, future in enumerate(as_completed(futures), 1):
        source, target = future.result()
        resolved[source] = target
        if index % 20 == 0 or index == len(rows):
            print(f'progress {index}/{len(rows)}', flush=True)

ordered = {url: resolved[url] for url in rows}
Path(args.progress).write_text(json.dumps(ordered, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({
    'rows': len(rows),
    'errors': sum(value.startswith('__ERROR__') for value in ordered.values()),
    'invalid_post': sum('error=invalid_post' in value for value in ordered.values()),
}, ensure_ascii=False), flush=True)
