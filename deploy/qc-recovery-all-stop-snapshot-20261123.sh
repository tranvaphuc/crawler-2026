set -euo pipefail
python3 - <<'PY'
import os,signal
from pathlib import Path
pid=2003252;p=Path('/proc')/str(pid)/'cmdline'
if p.exists():
 args=p.read_bytes().split(b'\0');assert args[0].endswith(b'python3') and args[1].endswith(b'/.qc-recovery-all-snapshot.py')
 os.kill(pid,signal.SIGTERM);print('STOPPED_OWN_READ_ONLY_SNAPSHOT')
PY
