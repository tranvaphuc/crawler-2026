set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-public24-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-public24-source-disposition.json" "$root/source-disposition.json"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-public24-report.txt" "$root/QC-REPORT.txt"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-public24-run.mjs" "$root/run.mjs"
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import assert from 'node:assert/strict';const root='/var/lib/news-flow/qc-public24-20261123',r=JSON.parse(fs.readFileSync(root+'/source-disposition.json'));assert.equal(r.cases.length,24);assert.equal(r.remaining,23);assert(fs.readFileSync(root+'/run.mjs','utf8').includes('maxAgeHours:Infinity'));console.log(JSON.stringify({reportStored:true,cohort:r.cases.length,remaining:r.remaining,qcAgePolicy:'all_history'}));
NODE
