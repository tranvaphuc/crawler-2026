set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-complete27-20261122
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import dns from 'node:dns/promises';import {spawnSync} from 'node:child_process';const r={at:new Date().toISOString(),dns:[],tls:[]};for(const name of ['2saigon.vn','www.2saigon.vn']){const x={name};for(const type of ['A','AAAA'])try{x[type]=await dns.resolve(name,type);}catch(e){x[type+'Error']=e.code;}r.dns.push(x);}for(const domain of ['dailo.vn','kinhteplus.com.vn','tieudungso.vn']){const p=spawnSync('timeout',['6','openssl','s_client','-connect',domain+':443','-servername',domain,'-verify_return_error','-showcerts'],{input:'',encoding:'utf8',maxBuffer:100000}),pem=p.stdout?.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0],x={domain,exitCode:p.status,errors:(p.stderr||'').split('\n').filter(s=>/error:|verify error|depth=/.test(s)).slice(0,7)};if(pem)x.leaf=spawnSync('openssl',['x509','-noout','-subject','-issuer','-dates'],{input:pem,encoding:'utf8'}).stdout;r.tls.push(x);}fs.writeFileSync('/var/lib/news-flow/qc-complete27-20261122/final-dns-tls.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));
NODE
install -o "$SUDO_USER" -m 0600 "$root/final-dns-tls.json" "$upload_dir/.qc27-complete-final-dns-tls.json"
