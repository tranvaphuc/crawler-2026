set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
for name in threeFlowReview threeFlowState; do
  install -o "$SUDO_USER" -m 0600 "/opt/news-flow/current/src/newsFlow/$name.mjs" "$upload_dir/.qc27-baseline-$name.mjs"
done
install -o "$SUDO_USER" -m 0600 /opt/news-flow/current/test/news-three-flow.test.mjs "$upload_dir/.qc27-baseline-news-three-flow.test.mjs"
