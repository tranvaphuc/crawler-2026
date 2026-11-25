// Evidence decisions after contextual review; no API requests or name-based inference.
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const root='outputs/nguoinoitieng-2026-11-18';
const file='config/nguoinoitieng-reviewed-evidence.json';
const config=JSON.parse(fs.readFileSync(file,'utf8'));
const db=new DatabaseSync(root+'/celebrities.sqlite',{readOnly:true});
const get=db.prepare('SELECT name,source_url,profile_json FROM profiles WHERE source_id=?');
const external=[
 ['0s bid0','https://voh.com.vn/tieu-su-sao/andree-right-hand-anh-baus-profile-478800.html','VOH: Andree Right Hand','Bài giới thiệu ghi tên Bùi Thế Anh, ngày sinh 18/06/1987, sinh tại Toronto và quê Hải Phòng. Hai hồ sơ nguồn có cùng tên thật và ngày sinh.'],
 ['3i','https://vov.vn/nguoi-viet/nghe-si-goc-viet-thanh-danh-o-que-nha-207605.vov','VOV: Nghệ sĩ gốc Việt thành danh ở quê nhà','Bài phỏng vấn/chân dung xác định John Huy Trần là Việt kiều thế hệ thứ hai sinh tại Canada.'],
 ['beno','https://dantri.com.vn/giai-tri/petey-majik-nguyen-vung-buoc-voi-uoc-mo-20160218154536722.htm','Dân trí: Petey Majik Nguyễn vững bước với ước mơ','Bài chân dung gọi Petey Majik Nguyễn là Việt kiều Úc.'],
 ['bdjg','https://thethao247.vn/400-xemesis-la-ai-tieu-su-nam-streamer-giau-nhat-viet-nam-d329985.html','Thể thao 247: tiểu sử Xemesis','Bài giới thiệu xác định Xemesis, tên Hiếu Nghiêm, là Việt kiều Anh.'],
 ['bgoc','https://cafef.vn/cuoc-hien-tai-day-bat-ngo-cua-be-gai-duoc-dua-ruoc-bang-bmw-trong-le-day-thang-cach-day-24-nam-188241118213112452.chn','CafeF: Linda Ngô kể về gia đình','Bài dựa trên chia sẻ tuổi thơ của Linda Ngô cho biết cả cha và mẹ là người Việt Nam, sang Nga làm việc và sinh cô tại đó.'],
 ['o2','https://tuoitre.vn/nld/van-nghe/trang-phap-tiet-lo-gia-the-tram-anh-the-phiet-20210313070206368.htm','Trang Pháp chia sẻ về gia đình ngoại giao','Bài dẫn lời Trang Pháp về gia đình ngoại giao Việt Nam, ông ngoại Nguyễn Khắc Huỳnh tham gia đoàn đàm phán Paris và bà ngoại làm ngoại giao Việt Nam.'],
 ['ab5','https://vtv.vn/hua-vi-van-nhung-cot-moc-xoay-chuyen-su-nghiep-100260523095945689.htm','VTV: Hứa Vĩ Văn, những cột mốc xoay chuyển sự nghiệp','Bài chân dung nghệ sĩ xác định sinh năm 1979 tại Thành phố Hồ Chí Minh, mâu thuẫn trường nơi sinh Mỹ của nguoinoitieng.tv; giữ nguyên dữ liệu nguồn và lưu căn cứ đối chiếu riêng.'],
 ['bak5','https://htv.vn/huy-khanh-mui-khoam-di-nhung-duyen-22251403.htm','HTV: Huy Khánh mũi khoằm, dị nhưng duyên','Chân dung của HTV xác định mẹ Huy Khánh có hai dòng máu Pháp và Việt.'],
 ['abt','https://spirit.vietnamairlines.com/old/tintuc/BaoIn/636940309533982326/636940309535852367.pdf','Vietnam Airlines: Cơ trưởng Huỳnh Lý Đông Phương, VNA cầu nối về quê hương Việt Nam','Trong phỏng vấn chính thức của hãng, Đông Phương tự nhận là người gốc Việt; sinh tại Bỉ.'],
 ['bfjp','https://znews.vn/dan-em-trai-cua-sao-viet-tham-gia-nguoi-ay-la-ai-mua-3-post1108907.html','Znews: dàn em trai của sao Việt tham gia Người ấy là ai','Bài dẫn chia sẻ trực tiếp của Alan Phạm với Zing, xác định anh là Việt kiều sinh tại Australia.'],
 ['nm','https://vanvn.vn/nha-tho-nhac-si-nguyen-dinh-thi-mot-nguoi-ha-noi/','Hội Nhà văn Việt Nam: Nguyễn Đình Thi, một người Hà Nội','Nguồn Hội Nhà văn ghi quê Hà Nội và sinh tại Luang Prabang, Lào; không loại khỏi người Việt chỉ vì sinh ở nước ngoài.']
];
for(const [ids,url,title,finding] of external)for(const id of ids.split(' ')){
 const p=get.get(id);if(!p)throw Error(id);
 config[id]={expected_name:p.name,decision:'vietnamese_descent',source_url:url,source_title:title,source_type:'external_editorial_or_direct_interview',finding,reviewed_at:new Date().toISOString(),review_method:'manual_source_context_review'};
}
const local=[
 ['banf','Nguồn xác định gia đình Quang Lý quê gốc Hải Phòng; sinh tại Bangkok.'],
 ['lk','Nguồn gọi Anna Trương là ca sĩ của Việt Nam, con của nhạc sĩ Anh Quân và mẹ người Đức.'],
 ['aks','Nguồn mở đầu xác định Phạm Minh Tuấn là nhạc sĩ nổi tiếng Việt Nam, dù sinh tại Campuchia.'],
 ['ai8','Phần gia đình nguồn ghi cha mẹ Phạm Trọng Cầu quê Hà Nội, sang Campuchia sinh sống và sinh ông tại đó.'],
 ['bbl8','Nguồn mô tả Kiki Lê là người mẫu Việt Nam tham gia Asia Next Top Model; sinh tại Thụy Điển.'],
 ['bctq','Nguồn ghi sinh tại Tiền Giang, Việt Nam. Người Pháp trong đoạn tiểu sử là ông ngoại; giữ nhóm suy luận từ nơi sinh.'],
 ['bgjj','Nguồn ghi sinh tại Hà Nội, Việt Nam. Đoạn người Trung Quốc/Hàn Quốc là nói người khác nhận nhầm; giữ nhóm suy luận từ nơi sinh.']
];
for(const [id,finding] of local){
 const p=get.get(id),full=JSON.parse(p.profile_json);
 config[id]={expected_name:p.name,decision:['bctq','bgjj'].includes(id)?'vietnamese_birth_supported':'vietnamese_descent',source_url:p.source_url,source_type:'archived_profile_manual_review',finding,reviewed_at:new Date().toISOString(),review_method:'manual_archived_source_context_review',source_excerpts:full.sections.filter(s=>/Tiểu sử|gia đình|Tóm tắt/.test(s.title)).map(s=>({section:s.title,text:s.text}))};
}
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log({total_reviewed:Object.keys(config).length,new_reviews:external.reduce((n,x)=>n+x[0].split(' ').length,0)+local.length});
db.close();
