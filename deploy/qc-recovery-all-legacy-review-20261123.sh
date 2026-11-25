set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
python3 "$upload_dir/.qc-recovery-all-legacy-review.py"
