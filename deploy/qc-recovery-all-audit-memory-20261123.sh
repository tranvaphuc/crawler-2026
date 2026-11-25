set -euo pipefail
systemctl set-property --runtime news-recovery-all-20261123.service MemoryMax=14G
systemctl show news-recovery-all-20261123 -p ActiveState,MemoryCurrent,MemoryMax,CPUQuotaPerSecUSec
