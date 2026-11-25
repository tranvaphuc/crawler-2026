set -euo pipefail
tail -n 24 /var/lib/news-flow/vnexpress-parser-qualification.log | cut -c 1-1000
