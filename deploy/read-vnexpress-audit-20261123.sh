set -euo pipefail
tail -n 14 /var/lib/news-flow/vnexpress-miss-audit.log | cut -c 1-1800
