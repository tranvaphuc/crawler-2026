set -euo pipefail
umask 077
upload_dir=$(getent passwd "${SUDO_USER:?}" | cut -d: -f6)
previous=/opt/news-flow/releases/20261119-baomoi-media-06
release=/opt/news-flow/releases/20261119-baomoi-remaining-07b
test "$(readlink -f /opt/news-flow/current)" = "$previous"
test ! -e "$release"
stage=$(mktemp -d /var/lib/news-flow/baomoi-remaining-stage.XXXXXX)
tar -xzf "$upload_dir/.baomoi-remaining-patch.tar.gz" -C "$stage"
cp -a "$previous" "$release"
python3 "$stage/scripts/patch_baomoi_remaining_release_20261119.py" "$release" "$stage"
cd "$release"
/opt/news-flow/node/bin/node --test test/news-baomoi-media.test.mjs test/news-baomoi-remaining.test.mjs test/news-native-video-empty-description.test.mjs test/news-strict-publication.test.mjs test/news-publisher-dispatch-redirect.test.mjs test/news-field-verification.test.mjs > /var/lib/news-flow/baomoi-remaining-20261119/server-tests.tap 2>&1 || { tail -n 70 /var/lib/news-flow/baomoi-remaining-20261119/server-tests.tap; exit 1; }
tail -n 9 /var/lib/news-flow/baomoi-remaining-20261119/server-tests.tap
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/verify_baomoi_remaining_candidate_20261119.mjs > /var/lib/news-flow/baomoi-remaining-20261119/candidate.log 2>&1 || { tail -n 35 /var/lib/news-flow/baomoi-remaining-20261119/candidate.log; exit 1; }
tail -n 3 /var/lib/news-flow/baomoi-remaining-20261119/candidate.log
