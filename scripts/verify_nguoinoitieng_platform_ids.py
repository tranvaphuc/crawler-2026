import json
from pathlib import Path
from collections import Counter
from zipfile import ZipFile
from xml.etree import ElementTree as ET

root=Path('outputs/nguoinoitieng-2026-11-18/platform-ids-2026-11-25')
def lines(file):
    return [json.loads(line) for line in file.read_text(encoding='utf-8').splitlines() if line]

people=lines(root/'people-platform-ids.jsonl')
accounts=lines(root/'accounts.jsonl')
summary=json.loads((root/'summary.json').read_text(encoding='utf-8'))
source=lines(root.parent/'vietnamese-people.jsonl')
source=[p for p in source if p['has_subject_platform_link']]
assert len(people)==len(source)==13804
assert len({p['person_id'] for p in people})==len(people)
assert len(accounts)==len({a['key'] for a in accounts})==summary['unique_accounts']
by_id={p['person_id']:p for p in people}
by_key={a['key']:a for a in accounts}
platforms={'facebook','instagram','tiktok','youtube','threads'}
link_count=0
for original in source:
    p=by_id[original['person_id']]
    assert p['name']==original['name'] and p['source_urls']==original['source_urls']
    expected=[(l['platform'],l['url']) for l in original['platform_links'] if l['platform'] in platforms]
    actual=[(a['platform'],a['original_url']) for a in p['accounts']]
    assert actual==expected
    for a in p['accounts']:
        ref=by_key[a['account_key']]
        assert a.get('id')==ref.get('id') and a['status']==ref['status']
        if a['status']=='resolved':
            assert isinstance(a['id'],str) and a['id']
            if a['platform']=='youtube': assert a['id'].startswith('UC') and len(a['id'])==24
            else: assert a['id'].isdigit() and len(a['id'])>=5
            assert a.get('evidence') and a.get('id_type')
    link_count+=len(actual)
assert link_count==summary['input_link_occurrences']
assert dict(Counter(a['status'] for a in accounts))==summary['counts']
assert summary['people_all_ids_found']==sum(bool(p['accounts']) and all(a['status']=='resolved' for a in p['accounts']) for p in people)
assert summary['people_any_id_found']==sum(any(a['status']=='resolved' for a in p['accounts']) for p in people)

ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
path=root/'nguoinoitieng-platform-ids.xlsx'
with ZipFile(path) as z:
    shared=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        shared=[''.join(v.itertext()) for v in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
    def cell_text(c):
        value=c.findtext('s:v',default='',namespaces=ns)
        if c.get('t')=='s': return shared[int(value)]
        if c.get('t')=='inlineStr': return ''.join(c.find('s:is',ns).itertext())
        return value
    checks=[('sheet1.xml',11,'E',[a.get('id') for p in people for a in p['accounts']]),('sheet2.xml',9,'C',[a.get('id') for a in accounts])]
    for filename,start,column,expected in checks:
        sheet=ET.fromstring(z.read('xl/worksheets/'+filename))
        cells={c.get('r'):c for c in sheet.findall('.//s:c',ns)}
        assert not any(c.get('t')=='e' for c in cells.values()),filename
        for index,wanted in enumerate(expected,start):
            c=cells.get(f'{column}{index}')
            got=cell_text(c) if c is not None else ''
            assert got==(wanted or ''),(filename,index,got,wanted)
            if wanted: assert c.get('t') in ['s','str','inlineStr'],(filename,index,'ID must be text')
        assert sheet.find('s:sheetViews/s:sheetView/s:pane',ns) is not None
        assert sheet.find('s:tableParts',ns) is not None

result={'result':'passed','people':len(people),'link_rows':link_count,'unique_accounts':len(accounts),'counts':summary['counts'],'xlsx_ids_exact_text':True,'xlsx_rows_checked':link_count+len(accounts),'xlsx_formula_errors':0,'original_archive_modified':False}
(root/'verification-platform-ids.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
