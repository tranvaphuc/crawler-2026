# News fix — 19/11/2026

Deployed release: `/opt/news-flow/releases/20261119-requested7-fixes-01`.

`runtime.patch` applies against the recorded server baseline, which is newer than the original local repository snapshot. `manifest.json` records before/after checksums for production files. `news-runtime-fix.tar.gz` contains the exact runtime changes, source configurations, fixtures and tests used for staging.

`deployment-result.json` and `es-verification.json` record successful deployment and exact URL verification for all seven articles. `check-5-links.http` is the ES5 Dev Tools request for the five URLs in the follow-up.

`activate.sh` switches the prepared release only after successful tests and live qualification, and creates a rollback script on the server. `recover.sh` processes only the four missing URLs through the normal processor and outbox. These are task-specific operational records, not scripts to rerun against an arbitrary release.

Full explanation: [news-requested-7-2026-11-19.md](../../docs/news-requested-7-2026-11-19.md).
