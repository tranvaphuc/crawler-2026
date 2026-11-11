import json,collections,csv
from pathlib import Path
r=Path('outputs/project-refresh-2026-11-10');d=r/'completion'
rows=json.loads((d/'keywords-final.json').read_text(encoding='utf8'));ev=json.loads((d/'search-evidence-final.json').read_text(encoding='utf8'));g=collections.defaultdict(set)
for x in rows:g[(x['project'],x['query'])].add(x['level'])
assert all(len(v)==1 for v in g.values()),[(k,v) for k,v in g.items() if len(v)>1]
assert all(x['query'] in {e['query'] for e in ev} for x in rows)
plans=list(csv.DictReader((r/'plan-access-check-2026-11-11.csv').open(encoding='utf-8-sig')));(d/'plan-access-final.json').write_text(json.dumps(plans,ensure_ascii=False),encoding='utf8')
s=Path(r/'artifact-runtime/build.mjs').read_text(encoding='utf8');helper=s[s.index('function sheet('):s.index('const overview=')];raw=s[s.index('function chunks('):s.index("const keySheet=")]
head="""import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root=new URL('../',import.meta.url),read=async n=>JSON.parse(await fs.readFile(new URL(n,root),'utf8'));
const [summary,projects,keys,evidence,sources,topics,excluded,groups,subjects,plans,aliases]=await Promise.all(['completion/keyword-final-summary.json','completion/projects-final-summary.json','completion/keywords-final.json','completion/search-evidence-final.json','completion/sources-final-audit.json','completion/topic-decisions-final.json','completion/keywords-excluded-final.json','keywords-separated-groups.json','subjects-leveled.json','completion/plan-access-final.json','completion/keyword-alias-dispositions.json'].map(read));
const wb=Workbook.create(),expected={};
const clean=v=>{if(v==null)return '';let s=typeof v==='object'?JSON.stringify(v):v;if(typeof s==='string'&&s.startsWith('='))s="'"+s;return s;};
const join=v=>(v||[]).join(' | ');
"""
body="""
sheet('Tong_quan',['Hạng mục','Kết quả / cách sử dụng'],[
['Ngày chốt','11/11/2026'],['Dự án có list cuối',summary.projectsWithFinalQueries],['Dự án đang chạy có list',`${summary.activeProjectsWithFinal} / ${summary.activeProjects}`],['Keyword theo dự án',summary.finalRows],['Level 1 / Level 2',`${summary.level1} / ${summary.level2}`],['Query khác nhau',summary.uniqueQueries],['Bằng chứng query / nền tảng',summary.verifiedQueryPlatformPairs],['Source mới đã nhập trước đối soát',5133],['Source chờ đã kiểm tra hết',4772],['Source đủ điều kiện sau xử lý',106],['Source còn tắt có lý do',4666],['Định nghĩa level','Level 1 = chủ thể main của dự án; Level 2 = competitor. Main/sub là cấu trúc keyword, không quyết định level.'],['Dùng list cuối','Lọc Status = running hoặc running trial trong Keyword_chot. Chỉ dùng nền tảng có bằng chứng; không suy rộng YouTube sang Facebook/TikTok/Threads.'],['Key gốc','1.658 nhóm, 27.160 ô gốc đã tách main/sub/exclude/hashtag; CSV giữ nguyên toàn bộ nội dung và tọa độ.'],['Ngành Mỹ Phẩm','Quy ước dự án theo dõi toàn ngành: toàn bộ nhãn trong phạm vi là main Level 1. Plan không xác định brand mốc để chia competitor.'],['Tocanan CI','Dùng plan Sony 7 brands cập nhật 04/11/2026; plan theo dõi Threads, bằng chứng search hiện có trên YouTube, chưa xác nhận Threads.'],['SPX','Plan liên kết chứa ShopeePay/TikTokPay, khác phạm vi logistics/marketing SPX trong roster. Giữ nguồn gốc; không gán key ví điện tử cho SPX.'],['Source tắt','Không có worker tương ứng, chặn truy cập, thiếu ID, không tồn tại hoặc sai chủ thể: ghi riêng từng dòng trong Source_kiemtra; không còn trạng thái chờ duyệt.'],['Hai plan không lấy được','30SHINE: file đã bị xóa. ADFC: phuc.tran@kompa.ai không có quyền. 42 plan stop được bỏ qua theo yêu cầu.'],['Giới hạn search','Bằng chứng là kết quả quan sát 10–11/11/2026 trên nền tảng ghi từng query, không bảo đảm kết quả tương lai.']
],[36,125],'BẢN CHỐT • Keyword đã có kết quả đúng chủ thể; source đã có quyết định xử lý.');
sheet('Keyword_chot',['Dự án','Chủ thể','Level','Query cuối','Nền tảng đã kiểm tra','Status dự án','Key gốc','Căn cứ level','Bằng chứng kết quả','Search URL','Plan URL','Sheet / ô / topic'],keys.map(k=>[k.project,k.subject,k.level,k.query,join(k.platforms),k.projectStatus,join(k.originalKeywords),join(k.roleEvidence),join(k.searchEvidence),join(k.searchUrls),join(k.plans),join(k.origins)]),[28,32,10,43,25,18,48,65,90,65,60,48],'List sử dụng cuối. Chủ thể có nhiều sản phẩm có thể có nhiều query hẹp; không tự tìm lại bằng key quá rộng.');
sheet('Tong_hop_du_an',['Dự án','Project ID','Status','Query cuối','Level 1','Level 2','Kết quả','Plan URL'],projects.map(p=>[p.project,p.projectIds,p.status,p.finalQueries,p.level1,p.level2,p.state,p.url]),[32,30,18,14,12,12,60,65]);
"""
tail="""
sheet('Source_kiemtra',['Nền tảng','Tên source','URL gốc','ID chuẩn','Chạy được','Quyết định cuối','Lý do / ghi chú','Dự án','ID gốc','Bằng chứng','Plan / sheet / ô'],sources.map(x=>[x.platform,x.name,x.url,x.canonicalId,x.eligible?'Có':'Tắt',x.decision,x.note,join(x.projects),x.sourceId,x.evidence,join(x.origins.map(o=>o.project+': '+o.sheet+'!'+o.cell))]),[18,35,62,42,15,40,85,45,42,75,65],'4.772 source từng chờ đã kiểm tra và cập nhật hệ thống. Alias được tắt, trỏ về ID chuẩn; nguồn không có worker tiếp tục tắt có lý do.');
sheet('Kiem_tra_search',['Nền tảng','Query đã test','Quyết định','Bằng chứng quan sát','Search URL','Ngày kiểm tra'],evidence.map(e=>[e.platform,e.query,e.outcome,e.evidence,e.url,e.checkedDate]),[18,45,18,100,70,20],'Mỗi dòng xác nhận query / nền tảng cụ thể. Không suy rộng sang nền tảng chưa kiểm tra.');
const rejectedTopics=topics.filter(t=>t.decision==='EXCLUDED');
sheet('Key_da_loai',['Dự án','Chủ thể','Level','Query / tên gốc','Lý do loại','Nguồn'],[...excluded.map(x=>[x.project,x.subject,x.level,x.query,x.reason,x.planUrl+' '+x.origin]),...rejectedTopics.map(x=>[x.project,x.subject,x.level,x.subject,x.reason,x.evidence])],[30,40,10,50,90,65],'Không đưa các mục này vào list search. Một số là mã hoặc nhóm phân tích, một số chưa có kết quả xác nhận đúng chủ thể.');
sheet('Chu_the_level',['Dự án','Project ID','Chủ thể gốc','Topic ID','Vai trò gốc','Level gốc','Căn cứ','Monitoring plan'],subjects.map(t=>[t.project,t.projectIds,t.subject,t.topicId,t.role,t.level,t.evidence,t.planUrl]),[30,29,40,29,18,12,55,60],'Bản roster gốc để đối chiếu; level cuối và các sửa nhãn mâu thuẫn nằm ở Keyword_chot.');
sheet('Plan_khong_lay',['Dự án','Status','Tài khoản retry','Kết quả','Ghi chú','Plan URL'],plans.map(p=>[p.Project,p.ProjectStatus,p.Account,p.Result,p.Note,p.PlanURL]),[30,18,32,35,90,70],'Hai plan đang chạy không truy cập được sau khi thử bằng phuc.tran@kompa.ai; 42 plan stop bỏ qua theo yêu cầu.');
sheet('Alias_da_xu_ly',['Dự án','Chủ thể','Level','Candidate cũ','Quyết định','Query cuối','Nguồn'],aliases.map(x=>[x.project,x.subject,x.level,x.previousCandidate,x.decision,join(x.finalQueries),x.planUrl+' '+x.origin]),[28,35,10,60,42,65,65],'Toàn bộ 6.085 candidate cũ đã có quyết định gộp về query đã kiểm tra hoặc loại khỏi list cuối.');
for(const sh of wb.worksheets.items){if(sh.name!=='Key_goc'){let n=expected[sh.name];sh.getRangeByIndexes(5,0,Math.max(n,1),sh.name==='Keyword_chot'?12:2).format.wrapText=true;sh.getRangeByIndexes(5,0,Math.max(n,1),1).format.rowHeight=64;}}
wb.recalculate();
console.log((await wb.inspect({kind:'region',sheetId:'Keyword_chot',range:'A5:F9',maxChars:1800,tableMaxRows:5,tableMaxCols:6})).ndjson);
for(const name of ['Tong_quan','Keyword_chot','Tong_hop_du_an','Key_goc','Source_kiemtra','Kiem_tra_search','Key_da_loai','Chu_the_level','Plan_khong_lay','Alias_da_xu_ly']){
 const img=await wb.render({sheetName:name,range:name==='Tong_quan'?'A1:B11':'A1:F9',scale:1,format:'png'});await fs.writeFile(new URL('completion/preview-'+name+'.png',root),new Uint8Array(await img.arrayBuffer()));
}
const out=await SpreadsheetFile.exportXlsx(wb);await out.save(fileURLToPath(new URL('du-an-source-keyword-2026-11-10.xlsx',root)));
await fs.writeFile(new URL('workbook-build-check.json',root),JSON.stringify({expected,separatedDisplayRows:separated.length},null,2));console.log('EXPORTED '+JSON.stringify(expected));
"""
(r/'artifact-runtime/build.mjs').write_text(head+helper+body+raw+tail,encoding='utf8')
