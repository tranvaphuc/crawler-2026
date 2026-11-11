import json,csv,zipfile,collections
from pathlib import Path
r=Path('outputs/project-refresh-2026-11-10');d=r/'completion'
for name in ['keyword-alias-dispositions','topic-decisions-final','projects-final-summary']:
 data=json.loads((d/(name+'.json')).read_text(encoding='utf8'));cols=list(dict.fromkeys(k for row in data for k in row))
 with (d/(name+'.csv')).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=cols);w.writeheader();w.writerows({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v for k,v in x.items()} for x in data)
readme='BẢN CHỐT 11/11/2026\nkeyword-final.csv: list search dùng cuối, Level 1 main / Level 2 competitor. Chỉ xác nhận nền tảng đã ghi bằng chứng.\nkeywords-original-cells.csv: toàn bộ main/sub/exclude/hashtag nguyên bản và tọa độ.\nsource-audit-final.csv: 4772 source chờ đã xử lý; eligible=False có lý do, không có worker thì không bật.\nplan-access-check-2026-11-11.csv: 2 plan đang chạy không lấy được; 42 plan stop bỏ qua.\nNgành Mỹ Phẩm: quy ước theo dõi toàn ngành nên tất cả nhãn trong phạm vi là Level 1; plan không có brand mốc.\nTocanan CI: dùng 7 brand trong plan hiện hành Sony main; search kiểm tra YouTube, chưa xác nhận Threads.\nSPX: plan liên kết chứa ví điện tử khác phạm vi roster; không gán key ví cho SPX.\nKey gốc và các vùng không có header được lưu nguyên bản để tra cứu, không phải list search đã xác nhận.\n'
(d/'HUONG-DAN.txt').write_text(readme,encoding='utf-8-sig')
files=[r/'keywords-original-cells.csv',r/'keywords-review.csv',r/'subjects-leveled.csv',r/'project-source-inventory.csv',r/'plan-access-check-2026-11-11.csv',r/'keyword-unparsed-rows.json']
files += [d/n for n in ['keyword-final.csv','keyword-excluded-final.csv','source-audit-final.csv','keyword-alias-dispositions.csv','topic-decisions-final.csv','projects-final-summary.csv','search-evidence-final.json','recovered-browser-observations.json','source-apply-verification.json','keyword-final-summary.json','HUONG-DAN.txt']]
with zipfile.ZipFile(r/'du-lieu-chi-tiet-2026-11-10.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in files:assert p.exists(),p;z.write(p,p.name)
print('PACKAGED',len(files))
