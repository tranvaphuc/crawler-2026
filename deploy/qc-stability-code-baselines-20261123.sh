set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o "$SUDO_USER" -m 0600 /opt/news-flow/current/scripts/run_baomoi_original_branch.mjs "$upload_dir/.qc-stability-live-original-runner.mjs"
install -o "$SUDO_USER" -m 0600 /opt/news-flow/current/src/newsFlow/baomoiOriginalBranch.mjs "$upload_dir/.qc-stability-live-original-module.mjs"
sha256sum /opt/news-flow/current/scripts/run_baomoi_original_branch.mjs /opt/news-flow/current/src/newsFlow/baomoiOriginalBranch.mjs
