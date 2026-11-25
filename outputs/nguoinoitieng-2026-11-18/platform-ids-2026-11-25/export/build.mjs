import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';

const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(dir);
const lines=async p=>(await fs.readFile(p,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const summary=JSON.parse(await fs.readFile(root+'/summary.json','utf8'));
const people=await lines(root+'/people-platform-ids.jsonl'),accounts=await lines(root+'/accounts.jsonl');
const status=r=>r.status==='resolved'?'Đã có ID':r.status==='pending'?'Chưa xử lý':'Chưa tra được';
const label={profile_id:'UID hồ sơ',page_id:'Page ID',url_account_id:'ID trong URL',channel_id:'Channel ID',user_id:'User ID'};
const date=r=>r.observed_at||r.checked_at?new Date(r.observed_at||r.checked_at):null;
const personRows=people.flatMap(p=>p.accounts.map(a=>[p.name,p.occupations.join(', '),a.platform,a.original_url,a.id||null,label[a.id_type]||null,a.profile_id||null,a.page_id||null,status(a),a.reason||null,date(a),p.source_urls.join('\n'),p.classification_strength==='explicit_or_external_evidence'?'Có bằng chứng Việt/gốc Việt':'Suy luận từ nơi sinh Việt Nam']));
const accountRows=accounts.map(a=>[a.platform,a.url,a.id||null,label[a.id_type]||null,a.profile_id||null,a.page_id||null,status(a),a.reason||null,a.method||null,date(a),a.person_ids.length]);
assert.equal(personRows.length,summary.input_link_occurrences);assert.equal(accountRows.length,summary.unique_accounts);
const wb=Workbook.create(),main=wb.worksheets.add('Theo nguoi'),unique=wb.worksheets.add('Tai khoan');
main.tabColor='#25385B';unique.tabColor='#637492';
const uniqEnd=accountRows.length+8,mainEnd=personRows.length+10;
function base(sheet,range,title,headerRow,headers,rows,widths){
 sheet.showGridLines=false;sheet.getRange(range).format.font={name:'Arial',size:10,color:'#202939'};
 sheet.getRange('A2').values=[[title]];sheet.getRange('A2').format.font={name:'Arial',size:14,bold:true,color:'#17243C'};
 sheet.getRange(`A${headerRow}`).write([headers,...rows]);
 const last=String.fromCharCode(64+headers.length),end=headerRow+rows.length;
 const table=sheet.tables.add(`A${headerRow}:${last}${end}`,true,sheet===main?'PeoplePlatformIds':'UniquePlatformAccounts');table.showFilterButton=true;
 sheet.getRange(`A${headerRow}:${last}${headerRow}`).format={fill:'#25385B',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:30,horizontalAlignment:'center',verticalAlignment:'center',wrapText:true};
 sheet.getRange(`A${headerRow+1}:${last}${end}`).format.rowHeight=21;
 for(let i=0;i<widths.length;i++)sheet.getRangeByIndexes(headerRow-1,i,rows.length+1,1).format.columnWidth=widths[i];
 sheet.freezePanes.freezeRows(headerRow);sheet.freezePanes.freezeColumns(sheet===main?1:2);
}
base(main,`A2:M${mainEnd}`,'ID mạng xã hội từ nguoinoitieng.tv',10,['Tên','Nghề nghiệp','Nền tảng','Link gốc','ID','Loại ID','UID hồ sơ Facebook','Page ID Facebook','Trạng thái','Lý do chưa có ID','Thời điểm tra (UTC)','Hồ sơ nguồn','Căn cứ Việt/gốc Việt'],personRows,[27,26,15,58,24,20,25,24,20,43,24,65,35]);
base(unique,`A2:K${uniqEnd}`,'Tài khoản đã gộp link trùng',8,['Nền tảng','URL chuẩn hóa','ID','Loại ID','UID hồ sơ Facebook','Page ID Facebook','Trạng thái','Lý do chưa có ID','Cách lấy ID','Thời điểm tra (UTC)','Số người cùng link'],accountRows,[15,58,24,20,25,24,20,43,34,24,23]);
main.getRange('A4:B6').values=[['Người trong danh sách',summary.input_people],['Người thuộc 5 nền tảng',summary.people_with_requested_platform],['Link trước gộp trùng',personRows.length]];
main.getRange('D4:D6').values=[['Tài khoản đã có ID'],['Tài khoản chưa tra được'],['Tài khoản chưa xử lý']];
main.getRange('E4:E6').formulas=[
 [`=COUNTIF('Tai khoan'!$G$9:$G$${uniqEnd},"Đã có ID")`],
 [`=COUNTIF('Tai khoan'!$G$9:$G$${uniqEnd},"Chưa tra được")`],
 [`=COUNTIF('Tai khoan'!$G$9:$G$${uniqEnd},"Chưa xử lý")`]
];
main.getRange('B4:B6').setNumberFormat('#,##0');main.getRange('E4:E6').setNumberFormat('#,##0');
main.getRange('G4').values=[['UID hồ sơ và Page ID Facebook được giữ riêng.']];
main.getRange('G5').values=[['Không có Threads. 2 người chỉ có Twitter/X không thuộc lần tra này.']];
main.getRange('G6').values=[['ID trong URL và kết quả lưu trước đây chưa xác minh lại hoạt động.']];
main.getRange('A8').values=[['Nguồn hồ sơ: nguoinoitieng.tv, crawl chốt ngày 19/11/2026.']];
main.getRange('D8').values=[['Link do website ghi nhận, chưa xác minh chính chủ.']];
unique.getRange('A4:B5').values=[['Tài khoản riêng biệt',accounts.length],['Cập nhật (UTC)',new Date(summary.updated_at)]];
unique.getRange('B4').setNumberFormat('#,##0');unique.getRange('B5').setNumberFormat('yyyy-mm-dd hh:mm:ss');
unique.getRange('D4').values=[['Một tài khoản có thể được nhiều hồ sơ nguồn sử dụng.']];
unique.getRange('D5').values=[['Chưa tra được ID không có nghĩa tài khoản đã bị xóa.']];
// Values remain strings in XLSX. An integer display format also prevents
// the preview renderer from abbreviating numeric-looking identifier strings.
main.getRange(`E11:H${mainEnd}`).setNumberFormat('0');unique.getRange(`C9:F${uniqEnd}`).setNumberFormat('0');
main.getRange(`K11:K${mainEnd}`).setNumberFormat('yyyy-mm-dd hh:mm:ss');unique.getRange(`J9:J${uniqEnd}`).setNumberFormat('yyyy-mm-dd hh:mm:ss');unique.getRange(`K9:K${uniqEnd}`).setNumberFormat('0');
for(const [sheet,col,start,end]of [[main,'I',11,mainEnd],[unique,'G',9,uniqEnd]])sheet.getRange(`${col}${start}:${col}${end}`).conditionalFormats.add('containsText',{text:'Chưa tra được',format:{fill:'#FFF2D9',font:{color:'#805200'}}});
wb.recalculate();
const actual=main.getRange('E4:E6').values.flat();assert.deepEqual(actual,[summary.counts.resolved||0,(summary.counts.unresolved||0)+(summary.counts.blocked||0),summary.counts.pending||0]);
const checks=await wb.inspect({kind:'table',range:"'Theo nguoi'!A4:F6",include:'values,formulas',tableMaxRows:3,tableMaxCols:6});await fs.writeFile(dir+'/inspection.ndjson',checks.ndjson);
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!',options:{useRegex:true,maxResults:20}});await fs.writeFile(dir+'/formula-check.ndjson',errors.ndjson);
for(const [sheet,range,name]of [['Theo nguoi','A2:I15','preview-people.png'],['Tai khoan','A2:G13','preview-accounts.png']]){
 const preview=await wb.render({sheetName:sheet,range,scale:1,format:'png'});await fs.writeFile(dir+'/'+name,new Uint8Array(await preview.arrayBuffer()));
}
const file=await SpreadsheetFile.exportXlsx(wb);await file.save(root+'/nguoinoitieng-platform-ids.xlsx');
console.log(JSON.stringify({output:root+'/nguoinoitieng-platform-ids.xlsx',rows:personRows.length,unique_accounts:accounts.length,summary:actual}));
