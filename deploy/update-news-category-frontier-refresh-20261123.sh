set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
systemctl stop news-category-hint-expansion-20261123
systemctl stop news-category-audit-20261123
cleanup() { systemctl start news-category-audit-20261123 news-category-hint-expansion-20261123; }
trap cleanup EXIT
install -m 0644 "$upload_dir/.news-category-audit-frontier-refresh-20261123.mjs" "$base/scripts/audit_news_category_coverage.mjs"
cd "$base"
runuser -u news-flow -- /opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import {DatabaseSync} from 'node:sqlite';import {loadNewsRegistry} from './src/newsFlow/registry.mjs';import {registerOriginalSources} from './src/newsFlow/baomoiOriginalBranch.mjs';import {categoryUrl} from './src/newsFlow/categoryCoverage.mjs';
const live=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),registry=await loadNewsRegistry();registerOriginalSources(live,registry);const db=new DatabaseSync('/var/lib/news-flow/category-coverage-20261123/audit.sqlite');db.exec('PRAGMA busy_timeout=20000');const rows=db.prepare("SELECT site,key,url FROM pages WHERE state='pending' AND origin='discovered'").all(),reject=db.prepare("UPDATE pages SET state='done',checked_at=?,listing=0,article_count=0,category_count=0,validation_reason='utility_or_non_editorial_url' WHERE site=? AND key=? AND state='pending'");let rejected=0;db.exec('BEGIN IMMEDIATE');try{for(const row of rows){const source=registry.sources.get(row.site);if(source&&!categoryUrl(row.url,row.url,source))rejected+=reject.run(Date.now(),row.site,row.key).changes;}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}console.log(JSON.stringify({policyRejectedWithoutHttp:rejected,remaining:db.prepare("SELECT count(*) n FROM pages WHERE state!='done'").get().n}));db.close();live.close();
NODE
systemctl start news-category-audit-20261123 news-category-hint-expansion-20261123
