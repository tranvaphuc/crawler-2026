set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-alt25-20261122
install -o news-flow -g news-flow -m 0640 "$upload_dir/.qc-alt25-page-url-test.mjs" /opt/news-flow/current/test/news-structured-page-url.test.mjs
cd /opt/news-flow/current
ROOT="$root" /opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {createHash} from 'node:crypto';const root=process.env.ROOT,sha=x=>createHash('sha256').update(x).digest('hex'),changes=[
{file:'src/web/configurableNewsParser.mjs',replacements:[["item.mainEntityOfPage?.['@id'])||item['@id']","item.mainEntityOfPage?.['@id']||item.mainEntityOfPage?.url)||item['@id']",1],["a.mainEntityOfPage?.['@id']);try{const u=new URL(declared,url)","a.mainEntityOfPage?.['@id']||a.mainEntityOfPage?.url);try{const u=new URL(declared,url)",1]]},
{file:'src/web/newsStrictPublication.mjs',replacements:[["[a.url,a.mainEntityOfPage?.['@id'],typeof a.mainEntityOfPage==='string'?a.mainEntityOfPage:null,a['@id']]","[a.url,a.mainEntityOfPage?.['@id'],a.mainEntityOfPage?.url,typeof a.mainEntityOfPage==='string'?a.mainEntityOfPage:null,a['@id']]",2]]},
{file:'src/web/newsPublicationPageIdentity.mjs',replacements:[["[a.url, a.mainEntityOfPage?.['@id'], typeof a.mainEntityOfPage === 'string' ? a.mainEntityOfPage : null, a['@id']]","[a.url, a.mainEntityOfPage?.['@id'], a.mainEntityOfPage?.url, typeof a.mainEntityOfPage === 'string' ? a.mainEntityOfPage : null, a['@id']]",1]]}];fs.mkdirSync(root+'/parser-before',{recursive:true});fs.mkdirSync(root+'/parser-candidate',{recursive:true});const report={at:new Date().toISOString(),files:[]};for(const row of changes){const before=fs.readFileSync(row.file,'utf8');let after=before;for(const [old,next,count] of row.replacements){if(after.split(old).length-1!==count)throw Error('PATCH_BASELINE_MISMATCH:'+row.file);after=after.split(old).join(next);}const name=row.file.split('/').at(-1),backup=root+'/parser-before/'+name,candidate=root+'/parser-candidate/'+name;fs.writeFileSync(backup,before,{mode:0o600});fs.writeFileSync(candidate,after,{mode:0o600});report.files.push({file:'/opt/news-flow/current/'+row.file,backup,candidate,beforeSha:sha(before),afterSha:sha(after)});}fs.writeFileSync(root+'/parser-patch-plan.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
NODE
set +e
/opt/news-flow/node/bin/node --test test/news-structured-page-url.test.mjs > "$root/parser-before-tests.txt" 2>&1
baseline_exit=$?
set -e
if test "$baseline_exit" -ne 1; then echo UNEXPECTED_BASELINE_TEST_RESULT; exit 1; fi
tail -n 9 "$root/parser-before-tests.txt"
install -o "$SUDO_USER" -m 0600 "$root/parser-patch-plan.json" "$upload_dir/.qc-alt25-parser-patch-plan.json"
