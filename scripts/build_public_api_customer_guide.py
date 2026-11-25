from pathlib import Path
import json, re, zipfile
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/api-customer-guide-2026-10-24'
OUT.mkdir(parents=True,exist_ok=True)
D=Document();sec=D.sections[0]
sec.page_width=Inches(8.27);sec.page_height=Inches(11.69)
sec.top_margin=Inches(.64);sec.bottom_margin=Inches(.64)
sec.left_margin=sec.right_margin=Inches(.68)
for n in ['Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3']:
 s=D.styles[n];s.font.name='Arial';s.font.color.rgb=RGBColor(0,0,0)
 s.paragraph_format.widow_control=True
 for el in s.element.xpath('.//w:pBdr'):
  el.getparent().remove(el)
D.styles['Normal'].font.size=Pt(10.5)
D.styles['Normal'].paragraph_format.space_after=Pt(6)
D.styles['Normal'].paragraph_format.line_spacing=1.10
for n,size in [('Title',24),('Heading 1',17),('Heading 2',11.5)]:
 s=D.styles[n];s.font.size=Pt(size);s.font.bold=True
 s.paragraph_format.space_before=Pt(8);s.paragraph_format.space_after=Pt(7)
code_style=D.styles.add_style('API Code',WD_STYLE_TYPE.PARAGRAPH)
code_style.font.name='Courier New';code_style.font.size=Pt(8.7)
code_style.font.color.rgb=RGBColor(0,0,0)
code_style.paragraph_format.line_spacing=Pt(10.8)
code_style.paragraph_format.space_before=Pt(2);code_style.paragraph_format.space_after=Pt(7)
code_style.paragraph_format.keep_together=True
rf=OxmlElement('w:rFonts')
for key in ['ascii','hAnsi','eastAsia','cs']:rf.set(qn('w:'+key),'Courier New')
code_style.element.get_or_add_rPr().append(rf)
foot=sec.footer.paragraphs[0];foot.alignment=WD_ALIGN_PARAGRAPH.RIGHT
r=foot.add_run('API Crawler   |   24 tháng 10 năm 2026   |   Trang ');r.font.name='Arial';r.font.size=Pt(8)
f=OxmlElement('w:fldSimple');f.set(qn('w:instr'),'PAGE');foot._p.append(f)
D.core_properties.title='Hướng dẫn sử dụng API Crawler'
D.core_properties.subject='Tích hợp Facebook Threads Instagram YouTube qua HTTPS'
D.core_properties.author='API Crawler';D.core_properties.keywords='API, tích hợp, Facebook, Threads, Instagram, YouTube'
texts=[]
def p(t,b=False):
 q=D.add_paragraph();q.add_run(t).bold=b;texts.append(t);return q
def h(t):D.add_heading(t,2);texts.append('\n'+t)
def page(t):
 q=D.add_heading(t,1);q.paragraph_format.page_break_before=True;texts.append('\n\n'+t+'\n')
def code(t):
 t=t.strip('\n');D.add_paragraph(t,style='API Code');texts.append(t)
def js(o):code(json.dumps(o,ensure_ascii=False,indent=2))
def table(head,rows,widths):
 t=D.add_table(rows=1,cols=len(head));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
 for col,w in zip(t.columns,widths):col.width=Inches(w)
 for c,txt in zip(t.rows[0].cells,head):c.text=txt
 for row in rows:
  for c,txt in zip(t.add_row().cells,row):c.text=str(txt)
 for ri,row in enumerate(t.rows):
  pr=row._tr.get_or_add_trPr();e=OxmlElement('w:cantSplit');pr.append(e)
  if ri==0:pr.append(OxmlElement('w:tblHeader'))
  for ci,c in enumerate(row.cells):
   c.width=Inches(widths[ci]);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
   tc=c._tc.get_or_add_tcPr();m=OxmlElement('w:tcMar')
   for edge in ['top','bottom','left','right']:
    e=OxmlElement('w:'+edge);e.set(qn('w:w'),'100');e.set(qn('w:type'),'dxa');m.append(e)
   tc.append(m);b=OxmlElement('w:tcBorders')
   for edge in ['top','bottom','left','right']:
    e=OxmlElement('w:'+edge);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D9D9D9');b.append(e)
   tc.append(b);sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'17365D' if ri==0 else 'F2F5F8' if ri%2==0 else 'FFFFFF');tc.append(sh)
   for q in c.paragraphs:
    q.paragraph_format.space_after=Pt(2);q.paragraph_format.space_before=Pt(2);q.paragraph_format.line_spacing=1.04
    for r in q.runs:r.font.name='Arial';r.font.size=Pt(9.0);r.bold=ri==0;r.font.color.rgb=RGBColor(255,255,255) if ri==0 else RGBColor(0,0,0)
 texts.append(' | '.join(head))
 texts.extend(' | '.join(str(x) for x in row) for row in rows)
 D.add_paragraph().paragraph_format.space_after=Pt(2)

D.add_paragraph('Hướng dẫn sử dụng API Crawler',style='Title')
p('Tài liệu tích hợp cho khách hàng và trợ lý AI',True)
p('Phiên bản ngày 24 tháng 10 năm 2026')
p('Dịch vụ cung cấp API đọc dữ liệu công khai từ Facebook, Threads, Instagram và YouTube. Tài liệu này hướng dẫn gửi request, nhận diện ID, lấy bài đăng và bình luận, đọc chỉ số tương tác và xử lý các trường hợp dữ liệu chưa đầy đủ.')
p('Địa chỉ production dùng chung cho tất cả API',True)
code('https://api-v1.oneforsl.net')
p('Cần API key do bên vận hành cấp riêng. Tài liệu không chứa key thật. Mọi ví dụ response là cấu trúc rút gọn để tích hợp, không phải cam kết về nội dung, số liệu hoặc khả năng truy cập của URL tại thời điểm bạn gọi.')
h('Danh sách chức năng')
table(['Phương thức và đường dẫn','Chức năng'],[
('POST /api/social/source/posts','Lấy bài từ nguồn'),('POST /api/social/post/comments','Lấy bình luận và trả lời'),('POST /api/social/post/metrics','Lấy chỉ số tương tác'),('POST /api/social/post/info','Lấy thông tin bài đăng'),('POST /api/social/comment/info','Lấy một bình luận cụ thể'),('POST /api/social/resource/resolve','Nhận diện nguồn bài và ID'),('POST /api/social/search','Tìm kiếm Threads và YouTube'),('POST /api/facebook/post/share','Phát hiện bài Facebook chia sẻ'),('POST /api/facebook/post/details','Chi tiết Facebook và đầu ra ES5'),('GET /api/health','Kiểm tra kết nối và xác thực')],[3.8,3.05])
p('HTTP 200 chỉ xác nhận server đã xử lý request. Luôn đọc status, reason, dữ liệu, coverage và ordering trước khi kết luận thành công hoặc đã lấy hết.',True)

page('1 Kết nối và xác thực')
p('Gửi request qua HTTPS với hai header sau. Thay YOUR_API_KEY bằng key được cấp; không gửi nguyên chuỗi placeholder.')
code('Authorization: Bearer YOUR_API_KEY\nContent-Type: application/json')
p('Lớp xác thực áp dụng cho mọi đường dẫn, kể cả health. Key phải nằm trong một header Authorization duy nhất. Key đặt trong query URL, body JSON hoặc X-API-Key không được chấp nhận.')
h('Kiểm tra nhanh bằng curl')
code('''export CRAWLER_API_KEY='YOUR_API_KEY'
curl --fail-with-body \\
  'https://api-v1.oneforsl.net/api/health' \\
  -H "Authorization: Bearer $CRAWLER_API_KEY"''')
js({'status':'ok'})
p('Đúng key trả HTTP 200. Thiếu hoặc sai key trả HTTP 401 với status=unauthorized và reason=AUTHENTICATION_REQUIRED. Không sửa key hoặc thử hàng loạt khi bị 401; kiểm tra thông tin đã được cấp.')
h('Sử dụng Postman')
p('Import collection và environment production được bên vận hành cung cấp. Chọn đúng environment, kiểm tra social_base_url và facebook_base_url đều là https://api-v1.oneforsl.net. Trong Authorization của collection chọn Bearer Token, giá trị {{AUTHEN_KEY_FOR_DOMAIN}}. Các request dùng xác thực kế thừa từ collection.')
p('Nếu nhận gói PRIVATE đã điền key, chỉ dùng trong môi trường riêng. Không gửi key cho AI bên ngoài, không ghi vào mã nguồn, ảnh chụp, log hoặc repository. Bất kỳ ai có key đều có quyền gọi API; key hiện tại không thay thế tài khoản hay phân quyền người dùng.')
h('Cách gọi một API dữ liệu')
code('''curl --fail-with-body \\
  'https://api-v1.oneforsl.net/api/social/post/metrics' \\
  -H "Authorization: Bearer $CRAWLER_API_KEY" \\
  -H 'Content-Type: application/json' \\
  --data '{"url":"https://www.youtube.com/watch?v=_Bs0iDvSXps"}' ''')
p('Không thêm cổng 3804 hoặc 3805 vào domain production. Các cổng đó chỉ phục vụ cách chạy local. Khi dùng client riêng, đặt timeout đủ dài cho tác vụ đọc bình luận; không tự lặp lại ngay khi timeout.')

page('2 Quy ước đầu vào và ID')
p('Các endpoint social, trừ search, nhận URL hoặc ID hệ thống được tra cứu trong ES5. ID luôn là chuỗi để tránh mất độ chính xác của số dài.')
table(['Trường','Kiểu và ý nghĩa'],[('url hoặc link','Chuỗi URL của nguồn bài hoặc bình luận phù hợp endpoint'),('id','Chuỗi ID hệ thống; không dùng số JSON'),('platform','facebook, threads, instagram hoặc youtube'),('type','Loại bản ghi ES5 nếu tra bằng ID'),('index','Index ES5 nếu biết; ví dụ master202643'),('kind','source, post hoặc comment; dùng cho resource/resolve')],[1.25,5.6])
js({'id':'6920202806_4000665603886005848','platform':'instagram','type':'snsTopic','index':'master202641'})
p('Nếu gửi đồng thời ID và URL thì chúng phải cùng tài nguyên. Nếu gửi cả link và url, dùng hai URL chỉ cùng một nguồn hoặc bài; không dùng link làm nhãn tùy ý.')
h('ID hệ thống và ID gốc của nền tảng')
p('Facebook post thường dùng ownerId_postId. Bình luận Facebook và Instagram có thể dùng postId_commentId. Bài Instagram hoặc Threads có thể dùng userId_mediaId. YouTube có ID chứa dấu gạch dưới, vì vậy không được tách ID của mọi channel theo cùng một quy tắc.')
p('Trong kết quả resolve, id là ID gốc đã được xác định; systemId là ID hệ thống khi có bằng chứng. Trong các luồng khác, hãy giữ cả ID cùng platform và URL; không giả định mọi trường postId đã là một ID ghép cùng định dạng.')
p('Các type hỗ trợ gồm fbPageTopic, fbUserTopic, fbGroupTopic, fbPageComment, fbUserComment, fbGroupComment, threadsTopic, threadsComment, snsTopic, snsComment, youtubeTopic và youtubeComment. snsTopic có URL Instagram được định tuyến sang Instagram.')
p('Mặc định tra cứu xét 12 index master mới nhất có dữ liệu. Nếu bản ghi nằm xa hơn, truyền index. Tên master202643 là ví dụ index theo tuần ISO trong luồng ES5 hiện tại; không tự suy đoán thành tháng. Tra cứu chỉ đọc, không ghi vào ES5.')
p('Page ID và Profile ID Facebook có thể khác nhau. API giữ hai loại riêng và chỉ chấp nhận liên kết giữa chúng khi có bằng chứng cho cùng tài nguyên.')

page('3 Lấy bài đăng từ nguồn')
code('POST /api/social/source/posts')
p('Dùng để đọc bài từ Facebook Page User Group, hồ sơ Threads hoặc Instagram, và kênh YouTube. Mặc định yêu cầu bài mới nhất trước; khả năng xác minh thứ tự phụ thuộc nguồn.')
js({'url':'https://www.facebook.com/1794121197534939','sourceType':'page','count':50,'limit':20,'order':'latest','since':'2026-10-20T00:00:00+07:00'})
table(['Tham số','Giá trị'],[('url hoặc link','URL nguồn; hoặc dùng id kèm platform và type/index'),('sourceType','Facebook: page, user hoặc group; nên điền rõ'),('count','Tổng muốn lấy: số nguyên 1 đến 20000 hoặc "all"'),('limit','Số bản ghi mỗi trang: nên dùng 1 đến 100'),('order','latest mặc định; hoặc platform_default'),('since hoặc stopBefore','Mốc ISO 8601 có múi giờ; chỉ dành cho nguồn'),('cursor','Giá trị từ pagination.nextCursor cho trang sau')],[1.55,5.3])
p('Mẫu phản hồi rút gọn')
js({'status':'partial','platform':'facebook','count':1,'items':[{'id':'1557540236390860','type':'post','platform':'facebook'}],'pagination':{'nextCursor':'CURSOR_FROM_RESPONSE','hasMore':True,'complete':False}})
p('Đọc source, items, ordering, coverage, dateFilter và limits nếu có. Bài thiếu thời gian bị loại khi lọc since và có thể được báo SOURCE_DATES_UNAVAILABLE. Gặp một bài cũ không đủ để dừng nếu nguồn xếp hạng hoặc có bài ghim; chỉ tin cờ earlyStopVerified khi API đã xác minh.')
p('YouTube hiện lấy mục Videos, chưa gộp Shorts, phát trực tiếp và Community. Các luồng Meta có thể chỉ trả cửa sổ dữ liệu công khai.')

page('4 Lấy bình luận và trả lời')
code('POST /api/social/post/comments')
p('Dùng cùng một endpoint cho bốn channel. includeReplies=true yêu cầu lấy cả bình luận gốc và trả lời. Mặc định order=oldest, nhưng cần đọc ordering để biết thứ tự đã được xác minh đến phạm vi nào.')
js({'url':'https://www.instagram.com/p/DeFOCuYv75Y/','count':500,'limit':100,'includeReplies':True,'order':'oldest'})
table(['Tham số','Ý nghĩa'],[('url hoặc id','Bài đăng cần đọc; ID hệ thống cần platform và type/index'),('count','Tổng comment cộng reply muốn lấy, qua nhiều trang'),('limit','Kích thước trang trả ra, nên từ 1 đến 100'),('includeReplies','Boolean; mặc định true'),('order','oldest mặc định; hoặc platform_default'),('cursor','Giá trị nguyên vẹn từ pagination.nextCursor')],[1.45,5.4])
h('Muốn lấy tối đa điền gì')
p('Điền count="all". Trần hiện tại là 20.000 bản ghi trong một lượt thu thập. Đây không phải số lượng vô hạn và không phải cam kết đọc được mọi bình luận mà nền tảng lưu.')
h('Cách đọc phản hồi')
p('items chứa bình luận hoặc trả lời. count là số bản ghi trong phản hồi hiện tại; rootComments và replies phân biệt hai loại. parentId giữ quan hệ trả lời khi có dữ liệu. Kiểm tra ID trước khi ghép vào bài và dedup theo platform, tài nguyên cha và ID bản ghi.')
p('Khi phase=collecting, count có thể bằng 0 trong lúc server đang gom để sắp xếp cũ nhất trước. Nếu còn nextCursor thì tiếp tục; không kết luận bài không có comment. stagedCount là lượng đã gom, không phải lượng đã giao cho client.')
p('Facebook yêu cầu xác nhận chế độ CHRONOLOGICAL_UNFILTERED_INTENT_V1. COMMENT_SORT_UNAVAILABLE nghĩa là chưa xác minh được chế độ All comments; không coi là dữ liệu rỗng. Bình luận bị ẩn, hạn chế quyền xem hoặc đã xóa có thể không truy cập được.')

page('5 Phân trang và điều kiện dừng')
p('limit và count trong request có vai trò khác nhau: limit là kích thước một trang, count là tổng muốn nhận qua các trang. count trong response là số bản ghi trả ở lần gọi đó. limits.totalReturned là tổng đã giao trong lượt nếu có.')
p('Để tương thích, limit lớn hơn 100 đến 20.000 được hiểu là tổng mong muốn với trang 100; limit="all" cũng bật chế độ tối đa. Tích hợp mới nên tách rõ count và limit.')
h('Quy trình lấy trang tiếp theo')
p('Giữ nguyên URL hoặc ID, platform, type/index, count, limit, order, includeReplies và since. Chỉ thêm hoặc thay cursor bằng pagination.nextCursor của phản hồi ngay trước. Không tạo cursor thủ công và không gửi lại trang đầu thay cho trang tiếp.')
code('''body = request_ban_dau_khong_co_cursor
lap:
    result = goi_api(body)
    kiem_tra_HTTP_va_status(result)
    luu_items_khong_trung(result.items)
    neu co loi can dung: ket_thuc
    neu khong co pagination.nextCursor: ket_thuc
    body.cursor = pagination.nextCursor''')
p('Cursor lưu trong RAM, hết hạn sau 30 phút và mất khi dịch vụ khởi động lại. Nếu cursor hết hạn, bắt đầu lượt mới và dedup các bản ghi đã lưu. Không giả định cursor còn hợp lệ sau một lần triển khai server.')
table(['Trường hợp','Hành động'],[('phase=collecting hoặc filtering','Có thể chưa có items; tiếp tục khi có nextCursor'),('limits.stopReason=COUNT_REACHED','Đã đạt số lượng yêu cầu, chưa chứng minh hết nguồn'),('pagination.reason=REQUESTED_COUNT_REACHED','Lượt bị giới hạn bởi count, không phải native exhaustion'),('SINCE_REACHED','Chạm điều kiện thời gian đã được xác minh'),('Không có nextCursor nhưng coverage chưa complete','Đã hết phần đọc được hoặc chưa có phân trang; giữ trạng thái partial'),('Có retryCursor','Giữ vị trí lỗi; chỉ thử lại sau khi xử lý nguyên nhân')],[2.8,4.05])
p('Phân biệt pagination.complete, coverage.complete và ordering.verified; không thay thế các cờ này bằng nhau. Gọi lặp cùng cursor có thể nhận lại trang đã được đệm nên client vẫn cần dedup.')

page('6 Lấy chỉ số tương tác')
code('POST /api/social/post/metrics')
js({'url':'https://www.youtube.com/watch?v=_Bs0iDvSXps'})
p('Có thể thay URL bằng ID hệ thống kèm platform và type/index. Kết quả giữ link/url đầu vào khi luồng hỗ trợ và có resolvedUrl để chỉ URL đã dùng đọc dữ liệu. Không lấy analytics riêng tư của chủ tài khoản.')
table(['Trường trong metrics','Diễn giải'],[('reactions','Tổng phản ứng công khai khi xác định được'),('likes','Lượt thích; có thể là thành phần hoặc cùng nguồn với reactions'),('shares','Lượt chia sẻ khi nền tảng trả rõ'),('comment','Chỉ số bình luận công khai; tên trường là comment'),('views','Lượt xem công khai nếu có'),('saved','Lượt lưu nếu công khai; thường không có'),('reshares','Chỉ số reshare mà nền tảng trả'),('repost','Lượt đăng lại mà nền tảng trả'),('quotes','Lượt trích dẫn hoặc đăng kèm ý kiến nếu có')],[1.3,5.55])
js({'status':'partial','platform':'youtube','identityVerified':True,'metrics':{'reactions':None,'shares':None,'comment':None,'views':12345,'saved':None,'reshares':None,'repost':None,'likes':None,'quotes':None}})
p('Số 12345 chỉ minh họa kiểu số, không phải số liệu xác nhận của video mẫu. null nghĩa là chưa có giá trị công khai đáng tin cậy; không đổi thành 0. Chỉ 0 được trả rõ mới là giá trị 0.')
p('metricStatus mô tả available, not_public, not_returned hoặc conflicting theo từng chỉ số. evidence và extraMetrics bổ sung bằng chứng/trường nguồn. Không cộng likes với reactions và không tự cộng reshares, repost, quotes vì chúng có thể chồng lấp.')
p('status=partial có thể là đã lấy được một số chỉ số nhưng thiếu các chỉ số khác. identityVerified=true xác nhận tài nguyên đã khớp, không xác nhận mọi counter đều đầy đủ.')

page('7 Lấy thông tin bài đăng')
code('POST /api/social/post/info')
p('Endpoint dùng chung để đọc thông tin bài hoặc video. Đầu ra của Facebook và các nền tảng khác có một số tên trường khác nhau; chỉ đọc các trường thực sự có trong phản hồi.')
js({'id':'6920202806_4000665603886005848','platform':'instagram','type':'snsTopic','index':'master202641'})
table(['Nhóm dữ liệu','Trường thường gặp'],[('Định danh','post.id, post.url, post.type; Facebook có postId/ownerId'),('Nội dung','text hoặc content; YouTube có title và shortDescription được ánh xạ sang text'),('Tác giả','author.id/name/username với Meta và YouTube; Facebook có thể trả author dạng chuỗi'),('Thời gian','createdAt hoặc created_time; publishedDate nếu chỉ có ngày'),('Tệp đính kèm','attachments, thumbnails hoặc media tùy nền tảng'),('Tương tác','metrics hoặc interactions tùy định dạng'),('Xác minh','identityVerified, systemIdentity, evidence nếu có')],[1.45,5.4])
p('Mẫu cấu trúc rút gọn của bài Instagram')
js({'status':'partial','platform':'instagram','identityVerified':True,'post':{'id':'4000665603886005848','url':'https://www.instagram.com/p/DeFOCuYv75Y/','type':'post','text':'Nội dung công khai nếu có','createdAt':None,'author':{'id':'6920202806','username':None}}})
p('Không thay thời điểm đăng bị thiếu bằng checkedAt. checkedAt là lúc API kiểm tra. YouTube có thể có publishedDate chỉ là ngày và createdAt=null. URL ảnh/video có thể hết hạn; không dùng nó như ID vĩnh viễn.')
p('Nếu ID và URL không khớp, SYSTEM_ID_URL_MISMATCH loại dữ liệu của tài nguyên khác. SYSTEM_NATIVE_ID_UNVERIFIED nghĩa là chưa đủ bằng chứng xác minh ID gốc; không ép nhận kết quả đó là thành công.')

page('8 Lấy một bình luận cụ thể')
code('POST /api/social/comment/info')
p('Dùng khi đã có ID hoặc URL của một comment/reply, không dùng để thay thế luồng lấy toàn bộ bình luận. Nên cung cấp ID hệ thống cùng type và index khi có.')
js({'id':'4010681799144319866_18117754451045497','platform':'instagram','type':'snsComment','index':'master202643'})
p('Mẫu cấu trúc rút gọn')
js({'status':'partial','platform':'instagram','id':'18117754451045497','identityVerified':True,'comment':{'id':'18117754451045497','type':'comment','parentId':None,'text':'Nội dung bình luận nếu đọc được','createdAt':None,'likes':None},'coverage':{'complete':False,'scope':'bounded_public_comment_window'}})
p('Có thể dùng URL bình luận có comment_id trên Facebook, lc trên YouTube, hoặc dạng URL được bộ nhận diện hỗ trợ. Với reply Facebook, nên ưu tiên ID hệ thống đã có trong ES5 để tránh chỉ nhận diện được comment cha từ URL.')
p('API tìm mục tiêu trong một cửa sổ dữ liệu công khai có giới hạn. COMMENT_NOT_IN_PUBLIC_WINDOW nghĩa là chưa gặp bình luận trong phần đã đọc, không chứng minh nó đã bị xóa hoặc không tồn tại.')
p('Trả lời Threads cũng là một bài Threads. URL đơn thuần không luôn chứng minh được đó là bình luận; bản ghi threadsComment cung cấp thêm ngữ cảnh. parentIdScope=es5_system_id cho biết parentId là ID hệ thống, không mặc định là ID gốc của nền tảng.')
p('Nếu status báo auth_required, security_checkpoint hoặc rate_limited thì xử lý nguyên nhân trước. Không đổi comment=null thành một bình luận trống hoặc trạng thái đã xóa.')

page('9 Nhận diện tài nguyên và ID')
code('POST /api/social/resource/resolve')
p('Nhận URL nguồn hoặc bài, hoặc ID hệ thống đã có. Kết quả giúp định tuyến request đúng nền tảng và phân biệt source, post, comment trước khi gọi API dữ liệu.')
js({'url':'https://www.facebook.com/1794121197534939','kind':'source'})
p('Nếu tra bằng ID nguồn, cần kind=source')
js({'id':'6920202806','platform':'instagram','kind':'source','type':'snsTopic','index':'master202641'})
table(['Trường kết quả','Cách sử dụng'],[('platform','Chọn channel tương ứng'),('kind','source, post hoặc comment'),('type','Loại tài nguyên đã phân loại; không luôn là ES5 _type'),('id','ID gốc xác định được'),('systemId và systemType','ID và loại bản ghi hệ thống khi có'),('idVerified và evidence','Trạng thái và bằng chứng xác minh ID'),('verificationScope','stored_record, url_structure hoặc phạm vi tương ứng'),('liveStatus','not_checked nếu chưa xác nhận truy cập hiện tại')],[2.0,4.85])
p('Khi verificationScope=stored_record và liveStatus=not_checked, API đã khớp bản ghi lưu trong ES5. Điều đó không xác nhận URL còn sống ở thời điểm gọi. Bằng chứng cấu trúc URL cũng không tương đương xác minh live.')
p('Facebook ưu tiên Page ID chuẩn từ metadata có delegate_page.id; không lấy nhầm Profile ID chỉ vì nó xuất hiện trong redirect. Với Instagram, tra source số cần đối chiếu ID tác giả và username trước khi dựng URL. Không dùng tên hiển thị để đoán ID.')
p('Nếu chỉ có link tìm kiếm, URL không xác định rõ tài nguyên hoặc bản ghi không duy nhất, giữ trạng thái chưa xác định và bổ sung dữ liệu đầu vào; không tự tạo ID.')

page('10 Kiểm tra bài Facebook chia sẻ')
code('POST /api/facebook/post/share')
p('Chỉ dành cho Facebook. Khác các API social, endpoint này yêu cầu đúng một trường input, url hoặc id, giá trị chuỗi. Không gửi đồng thời hai trong ba trường.')
js({'id':'61588342686925_122131613781278089'})
p('URL permalink.php, URL /posts/ và dạng ownerId_postId được hỗ trợ theo bộ chuẩn hóa. ID ở endpoint Facebook này được đọc trực tiếp từ URL/chuỗi định danh, không phải cơ chế tra cứu ES5 chung của các endpoint social.')
p('Mẫu response khi đủ bằng chứng bài chia sẻ')
js({'ok':True,'status':'resolved','isShare':True,'reason':'ATTACHED_OR_REPOSTED_STORY','post':{'id':'OWNER_POST','postId':'POST','ownerId':'OWNER'},'originalPost':{'id':'ORIGINAL_OWNER_ORIGINAL_POST','ownerId':'ORIGINAL_OWNER','postId':'ORIGINAL_POST'},'evidence':{'field':'trường nguồn được API xác minh'}})
p('Các ID viết hoa ở ví dụ là placeholder, không dùng làm đầu vào thật. Bài được xác định chia sẻ từ attached/reposted story hoặc cờ repost rõ ràng trong payload khớp bài mục tiêu; không chỉ dựa vào câu chữ “đã chia sẻ”.')
table(['Giá trị','Ý nghĩa'],[('isShare=true','Có bằng chứng đây là bài chia sẻ'),('isShare=false','Có bằng chứng rõ ràng bài không có attached story'),('isShare=null','Chưa xác định; không chuyển thành false'),('originalPost=null','Không có bài gốc xác minh được trong phản hồi'),('originalPost.id=null','Có thể biết bài gốc nhưng chưa xác minh chủ sở hữu chuẩn')],[2.2,4.65])
p('Chỉ sử dụng originalPost.id dạng owner_post khi API xác minh được owner chuẩn. profilePostId không tự thay thế canonical ID. Kiểm tra identityReason nếu chưa xác minh được ID gốc.')
p('Các endpoint Facebook cũ có thể trả status=unknown cùng ok=false và reason như AUTH_OR_SECURITY_REQUIRED, RATE_LIMITED hoặc POST_UNAVAILABLE. Đó không phải kết luận bài không phải share.')

page('11 Chi tiết Facebook và xuất ES5')
code('POST /api/facebook/post/details')
js({'id':'1000419343151470_122138942931244237'})
p('Cũng dùng đúng một trường input/url/id. Kết quả chính có ok, status, post, isShare, originalPost, shareDetection và transport tùy điều kiện đọc. post chứa phần thông tin công khai đã khớp bài, có thể gồm content, createdAt, author, ownerId, pageId, profileId, media, attachments và interactions.')
p('Đầu ra không phải bản xuất toàn bộ bình luận. Muốn lấy comment/reply, gọi /api/social/post/comments riêng.')
h('Định dạng phục vụ import ES5')
js({'id':'1794121197534939_1557540236390860','format':'es5','source':{'type':'page','id':'1794121197534939','name':'RangDong Vietnam'}})
p('format chỉ nhận es5 và chỉ dùng với endpoint details. source.type là page, user hoặc group. Nếu không đủ bằng chứng tự xác định loại nguồn, cần truyền source rõ ràng. Không dùng Profile ID thay cho Page ID đã được xác minh.')
js({'ok':True,'format':'es5','documents':[{'_index':'master202643','_type':'fbPageTopic','_id':'SOURCE_POST','_source':{'siteId':'SOURCE','publishedDate':'2026-10-20T00:00:00.000Z'}}],'rejected':[],'warnings':[]})
p('Ví dụ ES5 chỉ minh họa cấu trúc. _index được tính theo tuần ISO của thời điểm đăng và múi giờ xử lý; không cố định master202643 cho mọi bài. API chỉ tạo documents, không tự import/ghi vào ES5.')
p('Cần có thời gian đăng hợp lệ để tạo tài liệu ES5. Đọc rejected và warnings kể cả khi HTTP 200; ok=false hoặc rejected có phần tử không được coi là import thành công. Một số lỗi input của endpoint Facebook cũ dùng error/message thay cho reason.')

page('12 Tìm kiếm theo từ khóa')
code('POST /api/social/search')
p('Hỗ trợ Threads và YouTube. Mỗi từ khóa yêu cầu tối đa 20 kết quả một lần gọi. limit của search phải là 20; không dùng giới hạn lớn hoặc count="all" để yêu cầu tìm kiếm không giới hạn.')
js({'platform':'youtube','keyword':'cà phê','limit':20,'order':'latest'})
p('keyword là chuỗi sau khi bỏ khoảng trắng đầu/cuối, dài từ 1 đến 200 ký tự. order là latest mặc định hoặc relevance nếu bạn chủ động chọn.')
h('Nhiều từ khóa')
js({'platform':'threads','keywords':['HAPAS','thời trang'],'limit':20,'order':'latest'})
p('keywords là mảng từ 1 đến 10 từ khóa. Không gửi đồng thời keyword và keywords. Chế độ mảng không nhận cursor chung. Nếu cần phân trang một từ khóa, dùng chế độ keyword đơn và giữ nguyên đầu vào khi gửi nextCursor.')
table(['Trường mảng kết quả','Ý nghĩa'],[('results','Kết quả riêng của các từ khóa đã xử lý'),('successfulKeywords','Số kết quả có status ok hoặc partial'),('failedKeywords','Số kết quả đã xử lý nhưng không thành công'),('unstartedKeywords','Từ khóa chưa được bắt đầu khi lượt phải dừng'),('status=checked','Đã xử lý đủ số từ khóa, không nghĩa mọi từ khóa thành công')],[2.3,4.55])
p('Tìm kiếm mới nhất hiện chưa được xác minh ổn định. sort_unavailable hoặc LATEST_SORT_UNVERIFIED nghĩa là không được khẳng định đã lấy 20 bài mới nhất. Không tự đổi sang relevance hoặc gắn nhãn latest cho kết quả chưa được xác minh.')
p('Kết quả ít hơn 20 không tự chứng minh đã hết bài phù hợp. Kiểm tra scope, ordering và pagination trước khi mô tả độ đầy đủ cho người dùng.')

page('13 Trạng thái dữ liệu và mức độ đầy đủ')
p('HTTP status mô tả xử lý giao thức. status trong JSON mô tả kết quả đọc nền tảng. Không dùng điều kiện HTTP 200 làm tiêu chí duy nhất.')
table(['status','Cách hiểu'],[('ok','Có kết quả hợp lệ; vẫn đọc coverage và ordering'),('partial','Có dữ liệu hoặc tiến độ nhưng chưa chứng minh đầy đủ'),('resolved','Đã nhận diện được tài nguyên theo phạm vi bằng chứng'),('unavailable','Chưa lấy được dữ liệu trong điều kiện hiện tại'),('sort_unavailable','Chưa hỗ trợ hoặc chưa xác minh thứ tự yêu cầu'),('unauthorized','Thiếu hoặc sai API key của dịch vụ này'),('invalid_input','Đầu vào không hợp lệ'),('auth_required','Nền tảng đích yêu cầu đăng nhập hoặc quyền truy cập'),('security_checkpoint','Nền tảng đích yêu cầu kiểm tra bảo mật'),('rate_limited','Nền tảng đang giới hạn request'),('proxy_error','Lỗi proxy hoặc kết nối qua proxy'),('busy','Dịch vụ hoặc pool đang hết năng lực xử lý'),('error','Có lỗi thực thi cần xem reason')],[1.65,5.2])
p('Facebook share/details còn có status=unknown và ok=false; đọc reason để phân biệt nguyên nhân. Endpoint search nhiều từ khóa có envelope checked/partial, đồng thời cần đọc status từng phần tử trong results.')
h('Ba trường xác minh khác nhau')
p('identityVerified hoặc idVerified xác nhận ID; ordering.verified xác nhận thứ tự trong scope tương ứng; coverage.complete xác nhận độ đầy đủ trong phạm vi trả về. Một cờ true không kéo theo hai cờ còn lại true.')
p('count=0 chỉ có nghĩa không có bản ghi được giao trong response đó. Nó có thể do đang collecting/filtering, lỗi, quyền xem hoặc không có dữ liệu công khai. Không tự gán trạng thái nguồn die, bài bị xóa hay không có comment.')
p('metricStatus có giá trị not_public, not_returned hoặc conflicting thì giữ counter null. Không lấy số hiển thị rút gọn như 1.2K để khẳng định một số đếm chính xác.')

page('14 Lỗi HTTP và cách thử lại')
table(['HTTP','Xử lý'],[('200','Đọc status và reason; vẫn có thể là lỗi nền tảng hoặc partial'),('400','Sửa JSON, loại dữ liệu, URL, limit hoặc cursor không hợp lệ'),('401','Kiểm tra Bearer API key; không phải đăng nhập Facebook'),('404','Không có bản ghi tham chiếu hoặc đường dẫn không tồn tại'),('409','Tham chiếu mơ hồ hoặc ID và URL xung đột'),('413','Body quá lớn; giảm payload'),('415','Encoding hoặc charset không được hỗ trợ'),('422','Tham chiếu có dữ liệu nhưng chưa dùng được cho thao tác'),('500','Lỗi nội bộ; ghi reason đã lọc, không ghi key'),('503','Dịch vụ bận hoặc tra cứu tham chiếu chưa khả dụng')],[.75,6.1])
p('Reverse proxy có thể trả lỗi mạng hoặc body không phải JSON, ví dụ gateway timeout. Client phải xử lý được trường hợp không parse được JSON. Không giả định mọi phản hồi lỗi đều có cùng envelope.')
h('Những mã cần nhận diện')
p('AUTHENTICATION_REQUIRED: thiếu/sai key của API. SYSTEM_REFERENCE_NOT_FOUND: không tìm thấy bản ghi hệ thống. ES5_LOOKUP_INCOMPLETE hoặc ES5_LOOKUP_UNAVAILABLE: tra cứu chưa hoàn tất/không khả dụng. SYSTEM_ID_URL_MISMATCH: sai tài nguyên. SYSTEM_NATIVE_ID_UNVERIFIED: chưa chứng minh ID gốc. COMMENT_SORT_UNAVAILABLE: chưa xác nhận All comments. COMMENT_NOT_IN_PUBLIC_WINDOW: chưa gặp comment mục tiêu trong phần công khai đã đọc.')
h('Chính sách gọi lại')
p('Tuân thủ Retry-After của HTTP hoặc retryAfterMs trong JSON nếu có. Retry-After có thể được trả trên HTTP 200 khi status là lỗi nền tảng. Với busy, chờ rồi gọi lại có giới hạn. Với invalid_input, sửa request trước.')
p('Khi gặp auth_required, security_checkpoint hoặc rate_limited, dừng các request tiếp theo tới cùng nền tảng và báo người vận hành. Không tự đổi proxy, đổi tài khoản hay đổi chế độ sort để vượt chặn. Không tự lặp toàn bộ queue khi một request lỗi.')
p('Chỉ dùng retryCursor nếu response có trả và nguyên nhân đã được xử lý. Nếu timeout mà không biết server đã xử lý đến đâu, lưu trạng thái chưa xác định, tránh lặp ngay hàng loạt; giữ dedup khi bắt đầu lượt mới.')

page('15 Ví dụ nguồn và bài theo channel')
p('Các mẫu dưới đây là URL/ID đã dùng trong bộ dữ liệu hoặc kiểm tra trước đó. Chúng phục vụ điền request; khả năng truy cập và counter có thể thay đổi. Không suy ra link luôn sống từ việc được liệt kê.')
h('Facebook')
code('''Source Page:
https://www.facebook.com/1794121197534939
Post:
https://www.facebook.com/1794121197534939/posts/1557540236390860
System ID: 1794121197534939_1557540236390860
Type: fbPageTopic    Index: master202641''')
h('Threads')
code('''Source:
https://www.threads.com/@jucudidi
Post:
https://www.threads.com/@jucudidi/post/DeqZhSYGkt5
System ID: 77605733333_4011130656764087161
Type: threadsTopic    Index: master202643''')
p('Mẫu bài Threads này trước đó chưa đọc được trong phản hồi công khai; không xem nó là mẫu đảm bảo thành công. Bài đối chứng từng đọc được: https://www.threads.com/@dthh___n/post/DSl1YphAcpY .')
h('Instagram')
code('''Source:
https://www.instagram.com/shopmichaelangelos/
Post:
https://www.instagram.com/p/DeFOCuYv75Y/
System ID: 6920202806_4000665603886005848
Type: snsTopic    Index: master202641''')
p('Nguồn và bài mẫu Instagram ở đây dùng để thử các thao tác riêng; không giả định bài thuộc nguồn nếu chưa kiểm tra author ID.')
h('YouTube')
code('''Source:
https://www.youtube.com/channel/UCECgx1uTr_Pkguhm58-WhlA
Video:
https://www.youtube.com/watch?v=_Bs0iDvSXps
Type: youtubeTopic''')
p('Với Facebook Group dùng /groups/GROUP_ID và sourceType=group; với User dùng URL hồ sơ số cùng sourceType=user.')

page('16 Ví dụ tích hợp bằng JavaScript')
p('Ví dụ chạy phía backend với fetch. API key được nạp từ biến môi trường của bên tích hợp, không đưa vào mã frontend công khai. Hàm trả cả response JSON khi status chưa thành công để bên gọi quyết định xử lý.')
code('''const base = 'https://api-v1.oneforsl.net';
const key = process.env.CRAWLER_API_KEY;
if (!key) throw new Error('Missing API key');

async function callApi(path, body) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(130000)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('Response is not JSON'); }
  return {
    httpStatus: response.status,
    retryAfter: response.headers.get('retry-after'),
    data
  };
}

const result = await callApi('/api/social/post/metrics', {
  url: 'https://www.youtube.com/watch?v=_Bs0iDvSXps'
});
if (result.httpStatus === 401) {
  throw new Error('Check API key');
}
// Inspect result.data.status, reason and metricStatus.
// Do not log Authorization or the API key.''')
p('Đây là mã gọi đơn, chưa phải một vòng tự retry hoặc thu thập toàn bộ. Khi xây vòng phân trang, áp dụng điều kiện ở mục 5 và chính sách dừng ở mục 14. Giao diện nên phân biệt “đang gom”, “có một phần dữ liệu”, “không truy cập được” và “đã xác minh xong trong phạm vi”.')
p('Bắt đầu thử tuần tự hoặc mức đồng thời thấp. Dịch vụ/pool có thể trả busy, không có cam kết một số request/giây cố định trong tài liệu này. Lưu request ID nội bộ của ứng dụng để đối chiếu nhưng không lưu secret trong log.')

page('17 Hướng dẫn cho AI tích hợp')
p('Có thể đưa nguyên tài liệu này cho AI viết client. Cấp key cho chương trình chạy qua biến môi trường hoặc secret store; không chèn key thật vào prompt, source code hay dữ liệu mẫu.')
h('Yêu cầu bắt buộc khi sinh client')
for t in [
'Chỉ gọi các endpoint và phương thức được liệt kê. Dùng HTTPS production và Authorization Bearer. Không tự thêm một endpoint đăng nhập hoặc endpoint ghi dữ liệu chưa có.',
'Giữ ID là chuỗi. Phân biệt native ID, systemId, Page ID và Profile ID; không tự tách mọi ID ở dấu gạch dưới hoặc dựng ID từ tên.',
'Đọc cả HTTP status và JSON status. Có nhánh riêng cho envelope social, Facebook share/details, search nhiều từ khóa và lỗi không phải JSON.',
'Đọc items/post/comment chỉ khi có dữ liệu phù hợp và ID được xác minh. Giữ null khi thiếu chỉ số; không thay lỗi thành số 0, false hoặc đã xóa.',
'Phân trang bằng cursor nguyên vẹn và giữ nguyên tham số gắn với lượt. Gom dữ liệu có dedup; count bao gồm cả root và reply trong luồng comment.',
'Không dừng vì count=0 nếu phase=collecting/filtering và còn nextCursor. Không gọi một lượt bị cap là đã lấy hết nguồn.',
'Tuân thủ Retry-After/cooldown. Dừng ở auth/security/rate limit; không tự đổi proxy hoặc fallback Most relevant để tạo kết quả trông như thành công.',
'Không hứa đủ toàn bộ comment, thứ tự toàn cục hoặc kết quả mới nhất nếu coverage/ordering chưa xác nhận. Ghi rõ phạm vi dữ liệu trong đầu ra gửi người dùng.'
]:p('• '+t)
h('Kịch bản kiểm thử client tối thiểu')
p('Đúng key và thiếu/sai key; body sai JSON; URL/ID xung đột; dữ liệu partial; metric null và 0; trang collecting rỗng còn cursor; cursor hết hạn; busy/Retry-After; comment không trong cửa sổ công khai; resolver chỉ khớp stored_record.')
p('Mục tiêu của client là giữ đúng dữ liệu và trạng thái đã xác minh, không biến một phản hồi chưa đầy đủ thành khẳng định nguồn chết hoặc đã crawl xong.')

page('18 Phạm vi hỗ trợ hiện tại')
table(['Khả năng','Phạm vi cần lưu ý'],[('Đọc nguồn','Bốn channel; Facebook có Page User Group'),('Thứ tự bài mới nhất','Có yêu cầu latest; đọc ordering để biết mức xác minh'),('All comments và reply','Có luồng đọc; khả năng phân trang/phạm vi công khai khác nhau'),('Oldest comments','Có thể cần gom trước; chưa bảo đảm toàn bộ thứ tự trên mọi channel'),('Threads và Instagram','Một số luồng chỉ có cửa sổ công khai; phân trang bổ sung chưa được xác minh đầy đủ'),('YouTube source','Mục Videos; chưa gộp mọi loại nội dung'),('Search latest','Có thể báo sort_unavailable; không tự trả relevance thay thế'),('Lưu và analytics riêng tư','Không lấy khi nền tảng không công khai'),('Định danh qua ES5','Chỉ đọc và ánh xạ bản ghi; không đồng nghĩa link hiện tại còn truy cập được')],[2.0,4.85])
p('Mỗi lần gọi thực thi bằng HTTP ẩn danh qua proxy ở phía dịch vụ. Client không phải mở tab trình duyệt và không gửi cookie/tài khoản mạng xã hội. Tab ẩn danh chỉ phục vụ quan sát request trong quá trình phát triển.')
p('API trả dữ liệu khả dụng theo phản hồi công khai tại thời điểm kiểm tra. Chính sách nền tảng, quyền xem, vùng mạng, dữ liệu bị kiểm duyệt hoặc thay đổi request gốc có thể làm cùng một URL trả kết quả khác ở các lần gọi.')
p('Tài liệu mô tả hợp đồng của phiên bản đã triển khai, không phải báo cáo chứng minh mọi URL, mọi channel và mọi biến thể đều đã vượt qua kiểm thử production. Khi cần đối chiếu lỗi, gửi endpoint, body đã bỏ secret, HTTP status, status/reason và checkedAt cho bên vận hành.')
p('Không gửi Authorization, API key, proxy credential, cookie, token hoặc toàn bộ HTML/HAR khi báo lỗi. Nếu key đã lộ, yêu cầu bên vận hành thay key trước khi tiếp tục sử dụng.')

path=OUT/'Huong-dan-su-dung-API-Crawler.docx'
D.save(path)
text='HƯỚNG DẪN SỬ DỤNG API CRAWLER\nProduction https://api-v1.oneforsl.net\nPhiên bản 24/10/2026\n\n'+'\n\n'.join(texts)
(OUT/'Huong-dan-API-cho-AI.txt').write_text(text,encoding='utf-8')
# Ensure sharing artifacts contain no configured authentication or SSH/database secrets.
env={}
for line in (ROOT/'.env').read_text().splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  k,v=line.split('=',1);env[k.strip()]=v.strip().strip('"').strip("'")
with zipfile.ZipFile(path) as z:xml='\n'.join(z.read(n).decode('utf-8','ignore') for n in z.namelist() if n.endswith('.xml'))
for name in ['AUTHEN_KEY_FOR_DOMAIN','SSH_CRAWL_PASS','ES5_HOST','MONGO_URI']:
 v=env.get(name,'')
 if len(v)>=8:assert v not in text and v not in xml,'Secret detected in sharing document'
assert all(s in text for s in ['/api/social/source/posts','/api/social/post/comments','/api/social/post/metrics','/api/social/post/info','/api/social/comment/info','/api/social/resource/resolve','/api/social/search','/api/facebook/post/share','/api/facebook/post/details'])
(OUT/'document-validation.json').write_text(json.dumps({'businessEndpoints':9,'healthEndpoint':True,'keyRedactionPassed':True,'sections':18,'format':'docx','sharingTextCompanion':True},indent=2))
print(path)
