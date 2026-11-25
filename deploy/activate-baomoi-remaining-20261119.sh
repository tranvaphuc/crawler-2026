set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=/opt/news-flow/releases/20261119-baomoi-media-06
release=/opt/news-flow/releases/20261119-baomoi-remaining-07b
test "$(readlink -f /opt/news-flow/current)" = "$previous"
install -m 644 "$upload_dir/.baomoi-remaining-recovery.mjs" "$release/scripts/apply_baomoi_remaining_recovery_20261119.mjs"
install -m 644 "$upload_dir/.baomoi-remaining-es.mjs" "$release/scripts/verify_baomoi_remaining_es_20261119.mjs"
python3 - <<'PY'
import json,pathlib
r=json.loads(pathlib.Path('/var/lib/news-flow/baomoi-remaining-20261119/candidate-verification.json').read_text());assert len(r['rows'])==46 and sum(x['outcome']=='verified' for x in r['rows'])==45
print('ACTIVATION_GATES_OK_45_VERIFIED_1_PUBLISHER_404')
PY
install -m 644 "$upload_dir/.baomoi-remaining-mapping.mjs" "$release/scripts/install_baomoi_media_mapping_20261119.mjs"
cd "$release"
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/install_baomoi_media_mapping_20261119.mjs
systemctl stop news-flow-seed.service news-flow-parse.service news-flow-import.service
rollback(){ ln -sfn "$previous" /opt/news-flow/current; systemctl start news-flow-import.service news-flow-seed.service news-flow-parse.service; }
trap rollback ERR
ln -sfn "$release" /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/apply_baomoi_remaining_recovery_20261119.mjs
systemctl start news-flow-import.service news-flow-seed.service news-flow-parse.service
systemctl is-active news-flow-seed.service news-flow-parse.service news-flow-import.service
trap - ERR
readlink -f /opt/news-flow/current
echo BAOMOI_REMAINING_FIX_ACTIVE
