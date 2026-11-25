set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
python3 - "$upload_dir/.category-final-tests.tar.gz" "$base" <<'PY'
import tarfile,sys
from pathlib import Path
with tarfile.open(sys.argv[1]) as t:
 for name in ['test/news-category-backfill-admission.test.mjs','test/news-category-import-reconciliation.test.mjs']:
  (Path(sys.argv[2])/name).write_bytes(t.extractfile(name).read())
PY
cd "$base"
/opt/news-flow/node/bin/node --test test/news-category-coverage.test.mjs test/news-category-checkpoint.test.mjs test/news-category-import-reconciliation.test.mjs test/news-category-backfill-admission.test.mjs test/news-discovery-health.test.mjs test/news-three-flow.test.mjs test/news-flow-durable-completion.test.mjs test/news-parser-throughput.test.mjs test/news-strict-publication.test.mjs > /var/lib/news-flow/category-coverage-20261123/final-runtime-tests.tap 2>&1
tail -n 12 /var/lib/news-flow/category-coverage-20261123/final-runtime-tests.tap
