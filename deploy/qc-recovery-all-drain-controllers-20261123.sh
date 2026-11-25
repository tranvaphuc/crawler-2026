set -euo pipefail
for unit in news-recovery-stage-v4-20261123 news-recovery-redirect-recovery-20261123; do
  if systemctl is-active --quiet "$unit"; then systemctl stop "$unit"; fi
done
systemctl show news-recovery-stage-v4-20261123 news-recovery-redirect-recovery-20261123 -p Id,ActiveState,MainPID,Result
