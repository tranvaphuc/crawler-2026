"""Reconcile remaining keyword expressions using identifiable plan topics and original cells."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3

from audit_full_plan_contents import ACTIVE, allow_keyword
from reconcile_active_plan_coverage import FOLDER, REVIEW_LOG, cell_terms
from reconcile_plan_keyword_blocks import VINGROUP_CONTEXT_TERMS, apply, choose_updates, snapshot
from reconcile_plan_keywords_deep import DB, encode, field, fold, is_result_sheet, query_key, read_book, read_json, write_json
from reconcile_plan_source_coverage import workbook_inputs
from review_active_plan_keyword_scope import candidate

AUDIT = 'active-plan-remaining-keyword-reconciliation'
PREVIEW = FOLDER / 'remaining-keyword-reconciliation-preview.json'
REPORT = FOLDER / 'remaining-keyword-reconciliation.json'
DETAIL = FOLDER / 'remaining-keyword-dispositions.jsonl'
BASE_REPORT = FOLDER / 'remaining-keyword-reconciliation-initial.json'
CLONE_PROJECTS = {'Campaign FluMist','ECCO Factory 2026','Galaxy Cinema','M-Village'}
NAME_LAYOUTS = {
    ('Masan','Mainbrand Keywords'): (1, 'DF', r'masan|chinsu|omachi|namngu|vinacafe|wake219|winmart|wincommerce|wineco|netdetergent|vissan|phuclong|vietnam3f'),
    ('Masan','Competitor Keywords'): (2, 'D', r'techcombank|thegioididong|(?:tapdoan)?kido|vocarimex|cholimex|barona|ajinomoto|ajingon|knorr|maggi|bienhoa|kenhminh|aquafina|pepsico|boncha|cungdinh|vedan|sunlight|milo|nescafe'),
    ('Enfa','Brand Tracking Keywords - Produ'): (1,'C',r'enfa(?:mil|grow|mama|lac|care|suring|biome|a\b)|enfamil|enfagrow|enfamama|nutramigen|puramino'),
    ('Vingroup','Từ khóa các thương hiệu'): (1,None,r'^(?:#)?(?:vin(?:group|homes|fast|school|pearl|wonders?|mec|com|uni|bus|speed|metal|energo|robotics|tech|pro|smart|eco|film|cons)|vefac|greenfuture|vgreen)'),
    ('Tasco','Từ khóa'): (1,None,r'vetc|savico|tasco'),
    ('Tasco','Updated_Từ khóa'): (1,None,r'vetc|savico|tasco'),
    ('VinaCapital','Keywords for BHC'): (1,'DF',r'vinacapital|quydautuvina|vcfm|vinacap'),
    ('Suzuki 2026','Keyword & Source'): (1,'CE',r'suzuki(?:vietnam|vn|xl7|swift|jimny|ertiga|carry)|(?:xl7|swift|jimny|ertiga|carry)suzuki|xl7hybrid'),
    ('Vinmec','Từ khóa bệnh viện'): (2,None,r'fv(?:hospital|hospitalsaigon)|hoanmy(?:binhduong|hospital)|tamtamduc|timtamduc|ungbuouhungviet|benhvien(?:quocte|chuyenkhoa)[a-z]{6,}'),
    ('FPT Shop 2026','Trang tính1'): (1,'D',r'fptshop|fptunitour|fstudiobyfpt'),
    ('SFinance','Từ khóa'): (1,None,r'shbfinance|shbfc'),
    ('Phú Hưng Life','Trang tính1'): (1,'AC',r'phuhung(?:life|daiphuc|ventoan|insurance)'),
}
BRAND_SECTION = {
    'ShopeeFood': ('Tracking Keyword (2026)','Tracking Keyword'),
    'Hanwha Life Insurance 2026': ('Trang tính1',),
    'Suzuki 2026': ('Keyword & Source',),
    'VinWonders': ('keyword','key update cho Vinwonders'),
    'VinaCapital': ('Keywords for BHC',),
    'BIDV': ('Keywords',),
    'Central Retail': ('Keywords - Mainbrand','Keywords - Competitors'),
}
SCOPE_SIGNATURES = {
    'shopeefood':(1,r'shopeefood|nowdoitenthanhshopeefood|nowshopeefood'),
    'grab':(2,r'grab(?:food|vietnam|vn|rides|car|express|mat|mart)'),
    'befood':(2,r'befood|benangdong'),
    'greensmfood':(2,r'greensmfood|xanhsmfood|xanhngon'),
    'gofood':(2,r'gofood|gojek|gofoodvietnam'),
    'hanwhalifevietnam':(1,r'hanwhalife(?:vietnam|vn)|hanwhalife'),
    'aia':(2,r'aia(?:vietnam|vn|exchange|healthiestschools|onebillion|vitality|hoinghi)'),
    'daiichilife':(2,r'daiichilife|daiichivietnam'),
    'baovietnhantho':(2,r'baovietnhantho|baovietlife'),
    'prudentialvietnam':(2,r'prudential(?:vietnam|vn)|pruvietnam'),
    'manulifevietnam':(2,r'manulife(?:vietnam|vn)|manulifevietnam'),
    'chubblifevietnam':(2,r'chubblife(?:vietnam|vn)|chubblife'),
    'generali':(2,r'generali(?:vietnam|vn)|generali'),
    'byd':(2,r'byd(?:autovietnam|vietnam|sealion5|seal|atto3|dolphin|m6)'),
    'geely':(2,r'geely(?:vietnam|vn|coolray)|geelycoolray|coolraycooldance'),
    'mitsubishi':(2,r'mitsubishi(?:vietnam|vn|xpander|xforce|attrage|triton|outlander)'),
    'vinwonders':(1,r'vinwonders|grandworldphuquoc|vinpearl(?:safari|harbour)|vinpalace'),
    'vinwondersphuquoc':(1,r'vinwondersphuquoc|thuycungphuquoc'),
    'thuycungtimescity':(1,r'aquariumtimescity|thuycungtimescity'),
    'showkyuchoian':(2,r'hoianmemories|kyuchoian'),
    'khudulichdoirong':(2,r'khudulichdoirong|legendpark|doirong'),
    'sunworld':(2,r'sunworld|banahills'),
    'dragoncapitalcompetitor':(2,r'dragoncapital|dcvfm|dcfund|dcapp'),
    'bidv':(1,r'bidv|bidvcard|bidvsmart'),
    'acbbank':(2,r'acb(?:bank|privilege|visa|one|card)'),
    'vietcombank':(2,r'vietcombank|vcbdigibank|vcbdigital'),
    'vietinbank':(2,r'vietinbank|vietinbankipay'),
    'techcombank':(2,r'techcombank|techcomsecurities|(?:^#)tcbs'),
    'comehome':(1,r'comehome(?:vietnam|scvivocity|vn)'),
    'govietnam':(1,r'go(?:gia|market|vietnam|nguyenxien|mytho)'),
    'coopmart':(2,r'coopmart|coopfood|coopextra|saigoncoop'),
    'bachhoaxanh':(2,r'bachhoaxanh'),
}
AMBIGUOUS_SHORT = {'vin','msn','mwg','acb','bsc','aia','iap','omni','dcapp','dcfund','#dcapp','#dcfund',
                   'appvetc','mazan','masan','jnt','thanhthanhcong','canoro','winx','cungdinh',
                   'tasco6','vinacapital','vcfm','vinacappital','vinacap','xanhngon'}
REVIEWED_FIELDS = {
    ('Vinamilk','Từ khóa VNM & đối thủ 2022','C'): (
        1, 'sureprevent suabichfino cocofresh phomaisusu suadaunanhgoldsoy'),
    ('Vinamilk','SOV và negative kw','H'): (
        2, 'hikid metaopti kidessentials iammother bubs'),
    ('Masan','Mainbrand Keywords','D'): (
        1, 'meatdeli meatlife 3fviet ponnie khaithacchebienkhoangsannuiphao'),
    ('Masan','Competitor Keywords','D'): (
        2, 'cpsuperchef xucxichdosuperchef3a denhatmigia govietnam topsmarket '
        'trangtraigosao1 nhamaycofidec'),
    ('Central Retail','Keywords - Competitors','C'): (2, 'coopsmile coopxtra'),
    ('Central Retail','Keywords - Competitors','P'): (2, 'tikivietnam'),
    ('Tasco','Updated_Từ khóa','D'): (
        1, 'sixsensesninhvanbay '
        'ctcpnhuadongnai viettrilegacylakeside ctcpdichvutonghopsaigon anamandaradalat '
        'ctcpdautuvaphattrienytevietnhat ctcpthietbiytevietnhat'),
    ('TTC Group MS','Cập nhật keyword, query 2026 (0','D'): (
        1, 'nhamaydienmattroiduchue2 nhamaydiengiovpl2 '
        'ttcplazadanang ttcimperialhotel ttcvanphongaquapark ttchotelnhatrang '
        'ttcninhchu ttcdoiduong ttcresortdoimongmo ttchoangvanthu ttclotushotel '
        'khachsanttccantho khachsanttchoian khachsanttcangkor '
        'caukinhnganthong thunglungtinhyeudalat khudulichnuitacu ttctrangbangaquapark '
        'nhahangnoittc kcnthanhthanhcongtrangbang cumcongnghiepdaoai cumcongnghieptanhoi '
        'ttcdanghuynh bentautulichvinhdam daihocyersindalat yersinbienhoa '
        'congtycophanchethanhngoc '
        'tramdungnghittcchauthanh dluxspabeauty duandonesaigon'),
    ('VinaCapital','Keywords for BHC','D'): (
        1, 'fuevn100 fuevn50g fuemitec'),
    ('Vinmec','Từ khóa bệnh viện',''): (
        2, 'benhviennamhoc bvbuudien bvdongdo hanoifrenchhospital bvquoctecity '
        'benhvienphapviet thucuctci thucucthuykhue thucuctranduyhung thucucyetkieu '
        'hungvietdaicoviet tamducphumyhung phuongchausoctrang'),
    ('Truong Son Land','Updated từ khóa','B'): (
        1, 'kcnduchoaiiislico kcnlienthanhlongan kcnlongduc kcnlongvietduchoa '
        'kcnsongtan sangolflongbien sangolftansonnhat'),
}
DRAGON_CAPITAL_NAMES = frozenset(('quydcds quydcde quydcba quydcbf quydcip '
    'quydautuchungkhoannangdongdc quydautucophieutaptrungcotucdc quydautucanbangdc '
    'quydaututraiphieudc '
    'quyetfdcvfmvn30 e1vfvn30 fuevfvnd fuedcmid quythinhan quyphucan quyvinhan '
    'quydaututraiphieugiatangthunhapcodinhdc').split())
KEYWORD_PROOF = {
    'VinaCapital': 'https://vinacapital.com/vi/investment-solutions/',
    'Dragon Capital': 'https://dautu.dragoncapital.com.vn/bang-gia-chung-chi-quy',
    'VCBF': 'https://www.vcbf.com/gioi-thieu-cong-ty-quan-ly-quy-vcbf/ve-vcbf/gioi-thieu-cong-ty/',
    'caukinhnganthong': 'https://www.ttcgroup.vn/linh-vuc-hoat-dong/du-lich-1/tin-tuc-khac-1/ngam-canh-da-lat-tu-cau-day-kinh-ngan-thong-1',
    'ttctrangbangaquapark': 'https://ttchospitality.vn/tin-tuc-su-kien/ttc-trang-bang-aqua-park-khai-truong-bo-sung-toa-do-giai-nhiet-moi-tai-tay-ninh',
    'ttcvanphongaquapark': 'https://ttchospitality.vn/tin-tuc-su-kien/ttc-trang-bang-aqua-park-khai-truong-bo-sung-toa-do-giai-nhiet-moi-tai-tay-ninh',
    'ttcimperialhotel': 'https://ttchospitality.vn/tin-tuc-su-kien/nhan-biet-fanpage-chinh-chu-he-thong-ttc-hospitality',
}
SEARCH_SCOPE_NOTES = {
    ('Vinamilk','iammother'):'Tên sản phẩm có thật. Truy vấn đứng riêng trả nhiều kết quả về phim I Am Mother của Netflix.',
    ('Vinamilk','kidessentials'):'Tên sản phẩm Nestlé có thật. Truy vấn đứng riêng lẫn cửa hàng và nội dung đồ dùng trẻ em.',
    ('Vinamilk','bubs'):'Truy vấn đứng riêng lẫn với thương hiệu kẹo BUBS và các doanh nghiệp cùng tên.',
    ('Vinamilk','humana'):'Tên trùng với doanh nghiệp bảo hiểm. Cần mẫu tìm kiếm tiếng Việt chứng minh kết quả về sữa.',
    ('Central Retail','tiki'):'Truy vấn đứng riêng lẫn tên sản phẩm, phần mềm và thương hiệu nước ngoài. Giữ cách gọi Tiki Vietnam trong plan.',
}
QUERY_CONTEXT_FIELDS = {
    ('M-Village','Keyword List'): {'D','E','G','H','J','L','M'},
    ('Golden Gate Group','Setup New Brand_04.26'): {'D','G','L','O'},
    ('Golden Gate Group','Setup Kw 122025'): {'D','L','O'},
    ('Masan','Mainbrand Keywords'): {'E'},
    ('Masan','Competitor Keywords'): {'E','F'},
    ('Masan','Phát biểu BOD'): {'C'},
    ('Masan','Alert BLĐ'): {'C'},
    ('Enfa','Industry Keywords'): {'D','E'},
    ('ShopeeFood','Tracking Keyword (2026)'): {'C','F'},
    ('Vinamilk','SOV và negative kw'): {'B','D','S'},
}
PLAN_VARIANTS = {
    'Gaz Vietnam': {
        'Ford Transit':('Ford Transic',),
        'Hyundai Solati':('hundai solati','hyndai solati','Huyndai Solati'),
    },
    'Hưng Thịnh Corp': {
        'Florita Saigon Green Living':('Florita',),
        'Angel Island Đồng Nai':('Angel Island',),
        'Bảo Lộc Sapung Residences':('Bảo Lộc Sapung Rescidences',),
        'MerryHome Quy Nhơn':('MerryHome',),
        'Merry Land Quy Nhơn':('MerryLand',),
        'Para Draco Cam Ranh':('Para draco',),
        'V-Citilight Biên Hòa':('V-Citilight',),
    },
    'Golden Gate Group': {
        'Jollibee':('Jolibe','Jollibbee','Jolliebee','Jollybee'),
        'Quán Bụi':('Bụi',),
        'Lẩu nấm Gia Khánh':('LNGK','Gia Khánh'),
        'Madame Lam':('Madam Lam',),
        'Izakaya Matsuki':('Matsuki',),
        'Cecebox':('Cece',),
        'Phổ Đình - Uraetei':('Phổ Đình','Uraetei','Uratei','Uraetei BBQ Japan','Uraetei BBQ Phổ Đình'),
        'Nhậu Tự Do':('TuDo',),
    },
    'Vinamilk': {
        'HiPP':('hiip',),
        'Meiji':('meji',),
        'TH True Milk':('TH truel milk',),
        'Nutifood':('Nutrifood',),
        'sữa Similac':('similar',),
        'sữa đặc tài lộc':('Tài lộc',),
    },
    'Vinmec': {
        'Bệnh viện Đa khoa Hồng Ngọc':('BVDK Hồng Ngọc','Bệnh viện Hồng Ngọc','BV Hồng Ngọc'),
        'Bệnh viện Đa khoa Tâm Anh':('BVDK Tâm Anh','Bệnh viện Tâm Anh','BV Tâm Anh'),
        'Bệnh viện hữu nghị Việt Đức':('Bv Việt Đức','Bệnh viện Việt Đức','Bv hữu nghị Việt Đức'),
        'Bệnh viện K Hà Nội':('K Hà Nội','Bv K Hà Nội','Bv K HN','Bệnh viện k hn'),
        'Bệnh viện Đa khoa Quốc tế Thu Cúc':('Bv Đa khoa Quốc tế Thu Cúc','Bệnh viện Thu Cúc','Bv thu cúc'),
        'Phụ sản trung ương':('Phụ sản TW','Phụ sản TU'),
        'Bệnh viện Ung bướu Hưng Việt':('BV Hưng Việt','Bệnh viện Hưng Việt','Bệnh viện ung thư Hưng Việt','Bv ung thư Hưng Việt'),
        'Bệnh viện tim mạch Tâm Đức':('BV Tâm Đức','Bệnh viện Tâm Đức','Bv tim mạch Tâm Đức'),
        'Bệnh viện Phương Châu':('BV Phương Châu','BV Quốc tế Phương Châu','BV QT Phương Châu','Đa khoa Phương Châu','BV Đa khoa Phương Châu','dk Phương Châu'),
    },
}
MANUAL_CONTEXT = re.compile(r'^(?:[356]\.? (?:labels?|sentiment)(?:\b|$)|scc label|dinh nghia|cac dinh nghia|'
                            r'quy tac|rule\b|keyword theo label|keyword sentiment labels|thu thap du lieu|link bai spam)')
CONTEXT_LABELS = {'quymo','marketing','quanly','nganh','phanloai','websiteungdungkenhdatphong','chudeck','dichvuva'
                  'trainghiemkhachhang','hinh anh thuong hieu','baomatantoan'}
RESULT_WORDS = re.compile(r'\b(?:audience|hashtag evergreen|keyword loai tru|keyword phu|siteid|editor only|'
                          r'keyword chinh|doi tuong nghien cuu|bao cao|cap nhat|cho vi du)\b')


def evidence_id(url):
    match=re.search(r'/d/([\w-]{15,})',url)
    return match[1] if match else ''


def competitor_role(subject):
    return re.search(r'\b(?:competitor|doi thu)\b',fold(subject)) is not None


def reviewed_field(project, item, key):
    match=re.fullmatch(r'([A-Z]+)([0-9]+)',item['cell'])
    if not match:
        return None, None
    col,number=match.groups()
    sheet,subject=item['sheet'],item['subject']
    if project=='VinaCapital' and sheet=='Keywords for BHC' and col=='D':
        if subject=='Dragon Capital (Competitor)' and key in DRAGON_CAPITAL_NAMES:
            return 2, KEYWORD_PROOF.get('Dragon Capital')
        if subject=='VCBF (Competitor)' and key=='vietcombankfundmanagement':
            return 2, KEYWORD_PROOF.get('VCBF')
    if project=='Vinamilk' and sheet=='SOV và negative kw' and int(number)>=31:
        return None, None
    reviewed=REVIEWED_FIELDS.get((project,sheet,col)) or REVIEWED_FIELDS.get((project,sheet,''))
    if reviewed and key in reviewed[1].split():
        return reviewed[0], KEYWORD_PROOF.get(key) or (KEYWORD_PROOF.get(project) if project=='VinaCapital' else None)
    return None, None


def scope_decision(project, item, is_result):
    sheet,word,subject=(item[k] for k in ('sheet','keyword','subject'))
    key=query_key(word)
    base=key.lstrip('#')
    normalized_sheet=fold(sheet).replace('_',' ')
    compact_subject=query_key(subject)
    location=re.fullmatch(r'([A-Z]+)[0-9]+',item['cell'])
    col=location[1] if location else ''
    if is_result:
        return 'RESULT_EXAMPLE',None,'Ô nằm trong bảng kết quả thu thập, mang ngữ cảnh của bài mẫu.'
    if project in CLONE_PROJECTS and sheet in {'Keywords','Re - Keywords'} and re.search(
            r'vinwonders|vinpearl|sunworld|grandworld|hoianmemories|doirong|banahills',key+' '+compact_subject):
        return 'OTHER_PROJECT',None,'Phần này theo dõi khu du lịch và chương trình giải trí của plan VinWonders.'
    if project=='SPX' and sheet in {'Kw VTS','Kw Vay online','Keywords ShopeePay & competitor'}:
        return 'OTHER_PROJECT',None,'Bảng này ghi phạm vi ví điện tử, trả sau và vay tiêu dùng của ShopeePay.'
    if project=='Hanh Phuc Hospital' and 'hoanmy' in base:
        return 'OTHER_PROJECT',None,'Cụm chỉ bệnh viện Hoàn Mỹ trong workbook dùng chung.'
    if project=='Vinamilk' and sheet=='SOV và negative kw' and re.fullmatch(r'H(?:3[1-9]|[4-9]\d|\d{3,})', item['cell']):
        return 'OTHER_PROJECT',None,'Khối mã cổ phiếu của benchmark tài chính tách khỏi bảng SOV nhãn hàng sữa.'
    if search_note:=SEARCH_SCOPE_NOTES.get((project,key)):
        return 'NEEDS_SCOPE',None,search_note
    if MANUAL_CONTEXT.match(normalized_sheet) or normalized_sheet.startswith(('sentiment','label mch','rule ')):
        return 'LABEL_CONTEXT',None,'Từ nằm trong bảng gán nhãn hoặc quy tắc ngữ cảnh.'
    if col in QUERY_CONTEXT_FIELDS.get((project,sheet),()):
        return 'CONTEXT_ONLY',None,'Cột dành cho subkey, điều kiện lọc hoặc ghi chú của query theo tiêu đề gốc.'
    if RESULT_WORDS.search(fold(word)) or compact_subject in CONTEXT_LABELS:
        return 'CONTEXT_ONLY',None,'Cụm mô tả phạm vi hoặc thao tác trong plan.'
    if project=='Vingroup' and any(base in {brand+term,term+brand} or (
            term not in {'gia','duan','canho','bds'} and base.startswith(brand+term))
            for brand in ('vingroup','vinhomes','vinpearl') for term in VINGROUP_CONTEXT_TERMS):
        return 'CONTEXT_ONLY',None,'Đây là chủ đề đi kèm thương hiệu. Kho đã có từ khóa thương hiệu để lấy buzz gốc.'
    if project=='Enfa' and (base.startswith('enfamilk') or re.search(
            r'(?:can|canada|do|en|ens|cset|enpire|inspire|mauxanh|mau tim|xanh|xachtay|nhapkhau|hopvang|toddle)$',base)):
        return 'NEEDS_SCOPE',None,'Dạng viết khác, thị trường hoặc quy cách hộp. Cần xác nhận giá trị tìm độc lập.'
    if project=='Suzuki 2026' and base in {'jimnysuzuki','xl7suzuki'}:
        return 'CONTEXT_ONLY',None,'Cùng mẫu xe và nội dung theo dõi đã có ở cách gọi thương hiệu trước tên mẫu.'
    if not allow_keyword({'project':project,'keyword':word}) or base in AMBIGUOUS_SHORT or len(base)<4:
        return 'NEEDS_SCOPE',None,'Tên viết tắt hoặc cụm trùng nhiều nghĩa cần bằng chứng tìm độc lập.'
    if not col:
        return 'NEEDS_SCOPE',None,'Chưa xác định được cột nguồn của cụm.'
    if layout := NAME_LAYOUTS.get((project,sheet)):
        level,columns,pattern=layout
        if (columns is None or len(col)==1 and col in columns) and re.search(pattern,base,re.I):
            if project=='VinaCapital' and competitor_role(subject):
                return 'NEEDS_SCOPE',None,'Cụm xuất hiện dưới khối đối thủ. Cần xác nhận chủ thể trước khi gán level.'
            return 'READY',level,'Ô chứa tên thương hiệu, sản phẩm hoặc chủ đề được chỉ định trong plan.'
    if sheet in BRAND_SECTION.get(project,()):
        subject_key=re.sub(r'(?:2026|2025)$','',compact_subject)
        if signature:=SCOPE_SIGNATURES.get(subject_key):
            level,pattern=signature
            if re.search(pattern,key,re.I):
                return 'READY',level,'Cụm có dấu hiệu nhận diện chủ thể khớp với tiêu đề khối trong plan.'
    if word.startswith('#'):
        return 'NEEDS_SCOPE',None,'Cần mẫu tìm riêng của hashtag cho đúng chủ thể. Bỏ khỏi luồng News.'
    if project=='ShopeeFood' and sheet=='Tracking Keyword (2026)' and col=='E':
        return 'NEEDS_SCOPE',None,'Cột Sub Keyword. Chỉ lấy nếu kết quả tìm riêng xác nhận đây là tên chiến dịch độc lập.'
    return 'NEEDS_SCOPE',None,'Cần bằng chứng cụm này tìm độc lập ra đúng chủ thể đang theo dõi.'


def stage(db):
    current=snapshot(db)
    variants={(project,query_key(variant)):word for project,mappings in PLAN_VARIANTS.items()
              for word,names in mappings.items() for variant in names
              if len(current.get((project,query_key(word)),[]))==1 and current[project,query_key(word)][0][2]=='READY'}
    pending = defaultdict(lambda: defaultdict(list))
    for line in REVIEW_LOG.open(encoding='utf-8'):
        item=json.loads(line)
        pending[evidence_id(item['plan_url'])][item['sheet']].append(item)
    candidates=defaultdict(list)
    dispositions=[]
    for ident,book in workbook_inputs(db):
        expected=pending.pop(ident,{})
        if not expected:
            continue
        path=book['file']
        if not path or not Path(path).is_file():
            pending[ident]=expected
            continue
        for sheet in read_book(path,lambda n:n in expected):
            observed=is_result_sheet(sheet['rows'])
            named_cells={c['ref']:c for row in sheet['rows'].values() for c in row.values()}
            for item in expected.pop(sheet['name']):
                p,word=(item[k] for k in ('project','keyword'))
                key=(p,query_key(word))
                cell=named_cells.get(item['cell'],{})
                state,level,reason=scope_decision(p,item,observed)
                support=None
                if state=='NEEDS_SCOPE' and (proof_level:=reviewed_field(p,item,key[1]))[0]:
                    level,support=proof_level
                    state,reason='READY','Tên riêng hoặc mã sản phẩm đã đối chiếu với đúng cột và phạm vi của plan.'
                if key in current:
                    state,reason='ALREADY_IN_CATALOG','Kho đã ghi quyết định cho cùng project và dạng viết chuẩn.'
                elif p not in book['projects']:
                    state,reason='SCOPE_CONFLICT','Workbook hiện thiếu liên kết xác nhận cho project này.'
                elif state=='NEEDS_SCOPE' and (canonical:=variants.get(key)):
                    state,reason='COVERED_BY_CANONICAL',f'Plan ghi cách gọi của cùng chủ thể. Kho dùng keyword {canonical}.'
                if state=='READY':
                    value=next((raw for raw in (cell.get('text',''),cell.get('note',''))
                                if key[1] in {query_key(w) for w in cell_terms(p,raw,'main')}),None)
                    if value is None:
                        dispositions.append({**item,'decision':'SOURCE_RECHECK',
                                             'reason':'Cụm cần đối chiếu lại với nội dung hiện tại của ô gốc.'})
                        continue
                    subject=item['subject'] or p
                    if p=='Masan' and sheet['name']=='Mainbrand Keywords':
                        subject={'D13':'Masan High-Tech Materials','D16':'Masan MEATLife'}.get(item['cell'],subject)
                    kind='cell_note' if value==cell.get('note') and value!=cell.get('text') else 'plan_named_field'
                    proof=candidate(book,sheet['name'],item['cell'],word,subject,level,kind,value.strip())
                    proof['decision']='READY'
                    if support:
                        proof['support_url']=support
                    candidates[key].append(proof)
                dispositions.append({**item,'decision':state,'reason':reason})
        if expected:
            pending[ident]=expected
    for sheets in pending.values():
        for rows in sheets.values():
            dispositions.extend({**item,'decision':'SOURCE_RECHECK','reason':'Cần mở đúng bản plan hoặc tab gốc.'} for item in rows)
    additions=[r for r in choose_updates(current,candidates) if not r['previous_status']]
    ready={(r['project'],query_key(r['keyword'])) for r in additions}
    for item in dispositions:
        if item['decision']=='READY' and (item['project'],query_key(item['keyword'])) not in ready:
            item.update(decision='SCOPE_CONFLICT',reason='Cụm có nhiều cách gán scope cần xác nhận.')
    by_project=defaultdict(Counter)
    with DETAIL.open('w',encoding='utf-8') as log:
        for item in dispositions:
            by_project[item['project']][item['decision']]+=1
            log.write(encode(item)+'\n')
    return {'input':len(dispositions),'by_project':dict(by_project),'keywords':additions,
            'decisions':dict(Counter(item['decision'] for item in dispositions))}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    with closing(sqlite3.connect(DB.resolve().as_uri()+('?mode=rw' if args.apply else '?mode=ro'),uri=True,timeout=25)) as db:
        if not args.apply:
            report=stage(db)
            write_json(PREVIEW,report)
        else:
            report=read_json(PREVIEW)
            statuses=dict(db.execute('SELECT project_name,plan_status FROM projects'))
            if any(statuses[row['project']].strip().lower() not in ACTIVE for row in report['keywords']):
                raise ValueError('Project outside the active scope')
            report['applied_at']=datetime.now(timezone.utc).isoformat()
            report['changes']=apply(db,report['keywords'],statuses,audit_id=AUDIT) if report['keywords'] else {}
            if REPORT.exists():
                if not BASE_REPORT.exists():
                    write_json(BASE_REPORT,read_json(REPORT))
                previously_added=read_json(REPORT)['keywords']
                report['changes_this_pass']=report['changes']
                report['keywords']=[*previously_added,*report['keywords']]
                report['changes']={**report['changes'],'READY':len(report['keywords'])}
            write_json(REPORT,report)
    print(encode({'input':report['input'],'decisions':report['decisions'],'changes':report.get('changes'),
                  'new_by_project':dict(Counter(r['project'] for r in report['keywords']))}))


if __name__=='__main__':
    main()
