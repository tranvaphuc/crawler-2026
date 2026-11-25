set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-alt25-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-alt25-report.txt" "$root/QC-REPORT.txt"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-alt25-source-disposition.json" "$root/source-disposition.json"
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';const root='/var/lib/news-flow/qc-alt25-20261122',r=JSON.parse(fs.readFileSync(root+'/source-disposition.json')),f=JSON.parse(fs.readFileSync(root+'/final-check.json'));assert.equal(r.cases.length,25);assert.equal(new Set(r.cases.map(s=>s.site)).size,25);assert(f.aiLedgerUnchanged);assert(f.parserFiles.every(p=>p.matches));console.log(JSON.stringify({savedCases:r.cases.length,fullSourcesRestored:r.fullyRestoredSources,paidAiUsd:r.paidAiUsdInThisPass,reportSha256:createHash('sha256').update(fs.readFileSync(root+'/QC-REPORT.txt')).digest('hex')}));
NODE
tar -C "$root" -czf "$upload_dir/.qc-alt25-evidence.tar.gz" .
chown "$SUDO_USER" "$upload_dir/.qc-alt25-evidence.tar.gz"
chmod 0600 "$upload_dir/.qc-alt25-evidence.tar.gz"
