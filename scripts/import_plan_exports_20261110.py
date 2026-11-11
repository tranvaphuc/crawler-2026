import json,shutil
from pathlib import Path
root=Path('outputs/project-refresh-2026-11-10')
exports=Path(r'C:\Users\PC Master Race\AppData\Local\Packages\sandbox.{50ace3be-9cde-4fb1-b460-3f4a98af64a5}\AC\Temp/browser-use/exports')
pairs='''1UjesStmfSyEGlkz7uZxnedFlMBYMzx_7 5a9ee3e7
1XOcFK9gj-BHEjwybrZhVRFFSKqhzaKD- b447a500
16kOOa0VfsmI8_xu3GzTkfZ8_8TA4m4XCDsOMpLPEpaY 80375a92
1I0haFMpVKsaBbKAODVkmZs7lQaPv6srKukrFkB3PGCE 6f202e88
1qtPtqt5uLoQpVS1Nz7uP8T3dZedJO7-_324kQYmbRcQ ecfc9f86
1pPbyrUE2pM2GV-xvJhls-dbBIIIYrBN3 5f6e4e69
1s2wR3QeQKMSucVWA057OxDuGNZL75GOUwzbzQdCdo90 24edb458
11SdAdAnz-xDF6qirpF60tm_NNyjZhfazMEPwl0-F8qA 80d2b05f
1uTOprtd1sNS6AwomoUua9CkMwLwqps_kOKn2WzO6RdI 041850bb
1qOZ3wE5EE6fnuW0adEqxkadCN_r_PtRt 5d27529b
16OhKOMqK5d2j6fI09GxKyfXh5L3WEkbZmUALe8dLlDw c8a0d55d
16TxfaiBTC_Any2fh7waSigAKTIw0QXlT2e0TQEWMwtc b504f17c
1bTyhAioydp8VYuxDTy7C3IB0MfRWz5NNiEpvzqC_eTI da1bbba2
1JasrqiKayEa-B7mJuCZMNUupQKxw-HxG 8279aa22
1fwbd6FhuaGVOI8AxzRE4q221S7c6J06-xyz5cEdXR4U 15321b4a
1RqSTrluCrdcQr_l9EVnVBhTsr-gTMF5bzdRnea0vI3A 31c501e9
1tk3vuCTFXaXB0GaB8cNj8qf5XfJsfZNm97I9Jhil190 cdc66287
1uIztEWs1t8tJRQVxzliDWqE7LoQtUmMD 7b9f8c06
1hxH0NXza4pbPaHJdWdpRzUEHFjbkTZeKtecNveuoC2w 2a00c04f
156GwnHyfUNbR-Oaaq54ej4Sdt8KAI-PD 8ca8290c
11hh8FHz0Lo7DTymeY4MGYqPcOb4UE1tw 1d8237af
1eDKII-n55B2oF1m-t8C6f_kGWvPlXQsXsHRkqw5JT3I 3e75108a'''
for line in pairs.splitlines():
 id,token=line.split(); files=list(exports.glob('*'+token+'*.xlsx'));assert len(files)==1,(id,files)
 shutil.copyfile(files[0],root/'plans'/(id+'.xlsx'))
a=json.loads((root/'plans-manifest.json').read_text(encoding='utf-8'))
for d in a:
 if Path(d['file']).exists():
  if d.get('status')!='DOWNLOADED':d['downloadMethod']='AUTHENTICATED_BROWSER'
  d['status']='DOWNLOADED';d.pop('error',None)
(root/'plans-manifest.json').write_text(json.dumps(a,ensure_ascii=False,indent=2),encoding='utf-8')
print('Available plans:',sum(d['status']=='DOWNLOADED' for d in a))
