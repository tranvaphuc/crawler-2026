#!/usr/bin/env bash
set -u
export PATH=/opt/news-flow/node/bin:$PATH
release=/opt/news-flow/releases/20261115-03
test "$(readlink -f /opt/news-flow/current)" = /opt/news-flow/releases/20261115-02 || exit 1
runuser -u news-flow -- env PATH="$PATH" bash -c "cd '$release'; /opt/news-flow/node/bin/node --test test/*.test.mjs > /var/lib/news-flow/parse-event-batch-tests-verified.tap 2>&1"
result=$?
tail -n 35 /var/lib/news-flow/parse-event-batch-tests-verified.tap
printf 'TEST_PROCESS_EXIT=%s\n' "$result"
if test "$result" = 0; then printf '%s\n' verified > "$release/.parse-event-batch-verified"; fi
exit "$result"
