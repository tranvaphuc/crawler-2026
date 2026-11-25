set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
python3 "$upload_dir/.qc-recovery-all-redirect-history-patch.py"
systemctl restart news-flow-seed news-flow-parse
