set -euo pipefail
python3 - <<'PY'
from pathlib import Path
import json
found=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  args=(p/'cmdline').read_bytes().rstrip(b'\0').split(b'\0')
  if args not in ([b'python3',b'-u',b'-'],[b'/usr/bin/python3',b'-u',b'-']):continue
  files=[]
  for f in (p/'fd').iterdir():
   try:files.append(str(f.readlink()))
   except OSError:pass
  if '/var/lib/news-flow/category-coverage-20261123/audit.sqlite' in files and '/var/lib/news-flow/news-flow-runtime/write.sqlite' in files:found.append({'pid':int(p.name),'auditWatch':True})
 except (OSError,PermissionError):continue
print(json.dumps(found))
PY
