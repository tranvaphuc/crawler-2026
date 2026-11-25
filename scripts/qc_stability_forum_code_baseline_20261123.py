import json,hashlib
from pathlib import Path
p=Path('/opt/forum-flow/current/src/forumFlow/runtime.mjs');root=Path('/var/lib/forum-flow/stability-20261123');b=p.read_bytes();(root/'runtime-before.mjs').write_bytes(b);print(json.dumps({'sha256':hashlib.sha256(b).hexdigest(),'text':b.decode('utf-8')}))
