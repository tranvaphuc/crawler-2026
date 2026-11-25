set -euo pipefail
nproc
uptime
free -m
systemctl show news-category-audit-20261123 news-category-primary-review-20261123 -p Id,MemoryCurrent,CPUQuotaPerSecUSec,CPUUsageNSec
