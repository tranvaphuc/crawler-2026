import subprocess,shutil
from pathlib import Path
root=Path('/var/lib/forum-flow/qc-20261122')
shutil.copyfile('/tmp/forum-repair-20261119/qc_es_readback_20261122.mjs',root/'es-readback.mjs');shutil.copyfile('/tmp/forum-repair-20261119/forum-parent-manifest.json',root/'parent-manifest.json')
r=subprocess.run(['/opt/forum-flow/node/bin/node',str(root/'es-readback.mjs')],cwd='/opt/forum-flow/current',capture_output=True,text=True,timeout=180)
print(r.stdout)
if r.returncode:raise RuntimeError('ES verification failed: '+r.stderr[:1000])
