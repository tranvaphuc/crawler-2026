set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import ES from 'elasticsearch';const error=new ES.errors.RequestTimeout('Request Timeout after 15000ms');console.log(JSON.stringify({name:error.name,message:error.message,displayName:error.displayName,status:error.status,statusCode:error.statusCode,constructor:error.constructor.name}));
NODE
