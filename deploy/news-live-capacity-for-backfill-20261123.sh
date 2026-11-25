set -euo pipefail
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id,CPUQuotaPerSecUSec,MemoryCurrent,TasksCurrent,MainPID
journalctl -u news-flow-parse --since '5 minutes ago' --no-pager -o cat | python3 -c 'import json,sys; rows=[]; errors=[]
for line in sys.stdin:
 try:
  r=json.loads(line)
  if r.get("mode")=="three_flows": rows.append({k:r.get(k) for k in ["flow","working","completed","parserCpuWorkers","httpConcurrency","writeBatch","queue"]})
  if r.get("error"):errors.append({k:r.get(k) for k in ["error","role","newsDbOperation"]})
 except (ValueError,TypeError):pass
print(json.dumps({"latest":rows[-2:],"errors":errors[-8:]}))'
