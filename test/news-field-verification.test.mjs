import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyNewsFields,sharedDescriptionWarnings} from '../src/web/newsFieldVerification.mjs';
const first='Đây là đoạn nội dung chính cần giữ đầy đủ khi trích xuất bài báo. '.repeat(8);
const last='Đây là đoạn cuối khác biệt, không được bỏ sót khi parser chỉ lấy phần đầu bài. '.repeat(8);
const html=`<meta name="description" content="Mô tả gốc"><h1>Tiêu đề bài báo</h1><div class="afcbc-body"><p>${first}</p><p>${last}</p><div class="related"><p>${'Bài liên quan '.repeat(100)}</p></div></div>`;
test('independent paragraph check catches a missing final section',()=>{
 const r=verifyNewsFields(html,{_source:{content:first,description:'Mô tả gốc'}});
 assert(r.issues.some(i=>i.code==='native_paragraph_coverage_requires_review'));
});
test('related article blocks do not inflate expected article text',()=>{
 const r=verifyNewsFields(html,{_source:{content:first+'\n'+last,description:'Mô tả gốc'}});
 assert.equal(r.issues.length,0);assert.equal(r.paragraphEvidence.coverage,1);
});
test('missing metadata description keeps visible sapo as evidence, not fabricated output',()=>{
 const r=verifyNewsFields('<div class="knc-sapo">Mô tả hiển thị của bài</div>',{_source:{content:'Bài'}});
 assert.equal(r.issues[0].code,'missing_description');assert.equal(r.issues[0].nativeSapoAvailable,true);
});
test('line breaks inside a native paragraph match parser text with newlines',()=>{
 const lines=['70g creamcheese','25g đường cát trắng','50g sữa chua','2.5g gelatin','20g sữa','70g whipping cream'];
 const native=`<meta name="description" content="Mô tả gốc"><div class="afcbc-body"><p>${lines.join('<br>')}</p><p>${last}</p></div>`;
 const r=verifyNewsFields(native,{_source:{content:lines.join('\n')+'\n'+last,description:'Mô tả gốc'}});
 assert.equal(r.issues.length,0);
});
test('OneCMS comment acknowledgement is excluded from article paragraph coverage',()=>{
 const native=`<meta name="description" content="Mô tả gốc"><div class="c-news-detail"><p>${first}</p><p>${last}</p><div class="c-comments"><div class="c-comment-input onecms__comments"><p>${'Thông báo đã gửi bình luận '.repeat(30)}</p></div></div></div>`;
 const r=verifyNewsFields(native,{_source:{content:first+'\n'+last,description:'Mô tả gốc'}});
 assert.equal(r.issues.length,0);
});
test('identical site description across different articles requires review',()=>{
 const r=sharedDescriptionWarnings(['Bài thứ nhất','Bài thứ hai','Bài thứ ba'].map(title=>({title,description:'Tin tức mới nhất, chính thống, chính xác'})));
 assert.equal(r.length,1);assert.equal(r[0].distinctTitles,3);
});
test('repeated snapshots of the same headline do not trigger shared-description review',()=>{
 assert.equal(sharedDescriptionWarnings(Array.from({length:5},()=>({title:'Một bài báo',description:'Mô tả của bài báo đó'}))).length,0);
});
test('publisher attribution footer does not count as missing article prose',()=>{
 const page=`<meta name="description" content="Mô tả gốc"><h1>Tiêu đề bài báo</h1><div class="detail-content"><p>${first}</p><p>${last}</p><blockquote class="footer_nesw_detail"><p>${'Bạn đang đọc bài viết tại chuyên mục của báo. '.repeat(30)}</p></blockquote></div>`;
 const r=verifyNewsFields(page,{_source:{content:first+'\n'+last,description:'Mô tả gốc'}});
 assert.equal(r.issues.length,0);assert.equal(r.paragraphEvidence.coverage,1);
 const missing=verifyNewsFields(page,{_source:{content:first,description:'Mô tả gốc'}});
 assert(missing.issues.some(i=>i.code==='native_paragraph_coverage_requires_review'));
});
