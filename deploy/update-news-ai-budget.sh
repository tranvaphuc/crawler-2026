#!/usr/bin/env bash
set -euo pipefail
umask 077
python3 - <<'PY'
from pathlib import Path
import os,shutil
p=Path('/etc/news-flow/ai.env');backup=Path('/var/lib/news-flow/diagnostics/news-ai-budget-before-2usd.env')
if not backup.exists():shutil.copy2(p,backup);os.chmod(backup,0o600)
text=p.read_text();lines=text.splitlines();new=[];seen=False
for line in lines:
 if line.startswith('AI_DAILY_BUDGET_USD='):
  if not seen:new.append('AI_DAILY_BUDGET_USD=2');seen=True
 else:new.append(line)
if not seen:new.append('AI_DAILY_BUDGET_USD=2')
stage=p.with_name('ai.env.budget-stage');stage.write_text('\n'.join(new)+'\n');stat=p.stat();os.chown(stage,stat.st_uid,stat.st_gid);os.chmod(stage,stat.st_mode&0o777);os.replace(stage,p)
print('NEWS_SHARED_AI_DAILY_BUDGET_USD=2')
PY
writer_pid=$(systemctl show news-flow-import.service -p MainPID --value)
systemctl restart news-flow-seed.service news-flow-parse.service
for name in seed parse import; do systemctl is-active --quiet "news-flow-$name.service"; done
test "$(systemctl show news-flow-import.service -p MainPID --value)" = "$writer_pid"
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p MainPID -p ActiveState -p NRestarts
