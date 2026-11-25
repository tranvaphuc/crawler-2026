set -euo pipefail
systemctl show news-flow-parse -p ActiveState -p SubState -p NRestarts -p ExecMainStatus
journalctl -u news-flow-parse --since '6 minutes ago' --no-pager -o cat | tail -n 18 | cut -c 1-3500
