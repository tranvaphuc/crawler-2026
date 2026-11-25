set -euo pipefail
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-20261121/seed-restore.mjs
systemctl start news-discovery-health.service
