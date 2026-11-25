set -euo pipefail
if [ -f /var/lib/news-flow/category-coverage-20261123/cached-breadcrumbs.json ]; then cat /var/lib/news-flow/category-coverage-20261123/cached-breadcrumbs.json; fi
systemctl show news-category-cached-breadcrumbs-20261123 -p ActiveState,SubState,Result
journalctl -u news-category-cached-breadcrumbs-20261123 -n 2 --no-pager -o cat | cut -c 1-1200
