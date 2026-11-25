set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
tar -C /var/lib/news-flow -czf "$upload_dir/.vnexpress-miss-20261123.tar.gz" vnexpress-miss-20261123
chown "$SUDO_USER" "$upload_dir/.vnexpress-miss-20261123.tar.gz"
chmod 0600 "$upload_dir/.vnexpress-miss-20261123.tar.gz"
