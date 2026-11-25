import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=new URL('../outputs/source-audit-followup-2026-10-22/',import.meta.url);
const queueFile=process.argv[2]?pathToFileURL(process.argv[2]):new URL('facebook-unstarted.json',root);
const queue=JSON.parse(await fs.readFile(queueFile,'utf8'));
const indices=new Set(queue.map(r=>r.index));
const statusFile=process.argv[3]?pathToFileURL(process.argv[3]):new URL('pass-finalizer-status.json',root);
// A resumed pass must ignore checkpoints from prior attempts for the same indices.
const checkedAfter=process.argv[4]||null;
if(checkedAfter&&!Number.isFinite(Date.parse(checkedAfter)))throw Error('Invalid pass cutoff');
const save=state=>fs.writeFile(statusFile,JSON.stringify({updatedAt:new Date().toISOString(),pid:process.pid,...state},null,2));
const execute=(program,args)=>{const result=spawnSync(program,args,{encoding:'utf8',maxBuffer:4*1024*1024});if(result.status!==0)throw Error((result.stderr||result.stdout||'Command failed').slice(-3000));return result.stdout;};
const validator=String.raw`
import json,sys,zipfile,xml.etree.ElementTree as E
from pathlib import Path
p=Path(sys.argv[1]); ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
expected=json.loads((p/'workbook-check.json').read_text())['sheetCounts']; verified=[]
with zipfile.ZipFile(p/'source-audit.xlsx') as z:
 ss=[''.join(v.itertext()) for v in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)] if 'xl/sharedStrings.xml' in z.namelist() else []
 def value(c):
  v=c.find('s:v',ns)
  return ss[int(v.text)] if c.get('t')=='s' else ''.join(c.find('s:is',ns).itertext()) if c.get('t')=='inlineStr' else v.text if v is not None else ''
 for i,meta in enumerate(expected,1):
  sheet=E.fromstring(z.read(f'xl/worksheets/sheet{i}.xml')); rows=sheet.findall('s:sheetData/s:row',ns)
  assert len(rows)==meta['rows']+1,(meta['name'],'row count')
  assert not sheet.findall('.//s:c[@t="e"]',ns),(meta['name'],'formula errors')
  if meta['name']=='News_Forum_Website':
   assert [value(c) for c in rows[0]]==['type','domain','link','status','note']
   domains=[value(list(r)[1]) for r in rows[1:]]; assert len(domains)==len(set(domains))
  else:
   ids=[]
   for row in rows[1:]:
    cells=list(row); ident=value(cells[2])
    if ident: assert cells[2].get('t') in ('s','inlineStr','str'); ids.append(ident)
    if meta['name']=='GG_Reviews' and value(cells[3]): assert cells[3].get('t') in ('s','inlineStr','str')
   assert len(ids)==len(set(ids)),(meta['name'],'duplicate IDs')
  verified.append(meta)
result={'checkedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'sheets':verified,'formulaErrors':0,'IDsStoredAsText':True,'duplicateIDs':0}
(p/'automatic-workbook-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'validatedSheets':len(verified),'errors':0}))
`;
try {
 while(true){
  const latest=new Map();
  for(const line of (await fs.readFile(new URL('browser-updates.jsonl',root),'utf8')).split('\n').filter(Boolean)){try{const r=JSON.parse(line);if(indices.has(r.index)&&(!checkedAfter||Date.parse(r.checkedAt)>=Date.parse(checkedAfter)))latest.set(r.index,r);}catch{}}
  const terminal=[...latest.values()].find(r=>/AUTH_OR_SECURITY_REQUIRED|RATE_LIMITED/.test(r.note||''));
  const complete=latest.size===indices.size;
  await save({state:complete||terminal?'exporting':'waiting_for_browser_pass',expected:indices.size,saved:latest.size,remaining:indices.size-latest.size,completeCurrentFacebookPass:complete,allChannelsComplete:false,stopReason:terminal?.note||null});
  if(complete||terminal){
   execute(process.execPath,[new URL('source_audit_followup.mjs',import.meta.url).pathname]);
   execute(process.execPath,[new URL('build-workbook.mjs',root).pathname]);
   const validation=execute('/Users/phuctran/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',['-c',validator,root.pathname]);
   await save({state:complete?'exported_current_pass':'exported_partial_pass',expected:indices.size,saved:latest.size,remaining:indices.size-latest.size,completeCurrentFacebookPass:complete,allChannelsComplete:false,stopReason:terminal?.note||null,validation:JSON.parse(validation),workbook:new URL('source-audit.xlsx',root).pathname});
   break;
  }
  await new Promise(resolve=>setTimeout(resolve,15000));
 }
} catch(error){await save({state:'export_failed',allChannelsComplete:false,error:error.message});throw error;}
