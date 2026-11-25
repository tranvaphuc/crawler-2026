set -euo pipefail
journalctl -u news-category-audit-20261123 -n 35 --no-pager | cut -c 1-1600
ps -eo pid,etime,args | rg 'apply_news_category_coverage|audit_news_category_coverage' || true
