from __future__ import annotations

import os
import re
import zipfile
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs/01a07164-8064-7313-962f-0d73887aa809/customer-docs/MongoDB_Customer_Access_Guide.docx"
FORBIDDEN = "kom" + "pa"


def read_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        result[key.strip()] = value
    return result


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=110, start=130, bottom=110, end=130) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color="D9D9D9", size="6") -> None:
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), size)
        tag.set(qn("w:color"), color)


def repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def prevent_row_split(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    cant_split.set(qn("w:val"), "true")
    tr_pr.append(cant_split)


def set_repeat_header_text(row) -> None:
    repeat_table_header(row)
    for cell in row.cells:
        set_cell_shading(cell, "17365D")
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        for paragraph in cell.paragraphs:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in paragraph.runs:
                run.font.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
                run.font.size = Pt(9.5)


def add_page_number(paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run("Trang ")
    run.font.size = Pt(9)
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char1, instr_text, fld_char2])


def add_code(doc: Document, text: str) -> None:
    paragraph = doc.add_paragraph(style="Code")
    paragraph.add_run(text)


def add_bullet(doc: Document, text: str) -> None:
    paragraph = doc.add_paragraph(style="List Bullet")
    paragraph.add_run(text)


def add_table(doc: Document, headers: list[str], rows: list[list[str]], widths: list[float]):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    for i, (header, width) in enumerate(zip(headers, widths)):
        table.rows[0].cells[i].width = Inches(width)
        table.rows[0].cells[i].text = header
    set_repeat_header_text(table.rows[0])
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        prevent_row_split(table.rows[-1])
        for col_index, (value, width) in enumerate(zip(values, widths)):
            cell = cells[col_index]
            cell.width = Inches(width)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            set_cell_margins(cell)
            if row_index % 2:
                set_cell_shading(cell, "F3F6FA")
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = 1.05
            run = paragraph.add_run(str(value))
            run.font.size = Pt(9.25)
            if col_index == 0:
                run.font.name = "Aptos Mono"
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return table


def configure_styles(doc: Document) -> None:
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor(35, 35, 35)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.15

    title = styles["Title"]
    title.font.name = "Aptos Display"
    title.font.size = Pt(28)
    title.font.bold = True
    title.font.color.rgb = RGBColor(0, 0, 0)
    title.paragraph_format.space_after = Pt(12)
    title_p_pr = title.element.get_or_add_pPr()
    existing_border = title_p_pr.find(qn("w:pBdr"))
    if existing_border is not None:
        title_p_pr.remove(existing_border)
    title_border = OxmlElement("w:pBdr")
    title_bottom = OxmlElement("w:bottom")
    title_bottom.set(qn("w:val"), "nil")
    title_border.append(title_bottom)
    title_p_pr.append(title_border)

    for style_name, size in (("Heading 1", 17), ("Heading 2", 13)):
        style = styles[style_name]
        style.font.name = "Aptos Display"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(14)
        style.paragraph_format.space_after = Pt(7)

    if "Code" not in styles:
        code = styles.add_style("Code", WD_STYLE_TYPE.PARAGRAPH)
    else:
        code = styles["Code"]
    code.font.name = "Aptos Mono"
    code.font.size = Pt(9)
    code.font.color.rgb = RGBColor(25, 25, 25)
    code.paragraph_format.left_indent = Inches(0.18)
    code.paragraph_format.right_indent = Inches(0.18)
    code.paragraph_format.space_before = Pt(4)
    code.paragraph_format.space_after = Pt(9)
    code.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    p_pr = code.element.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), "F2F2F2")
    p_pr.append(shd)


def build_document() -> Path:
    env = read_env(ROOT / ".env")
    required = [
        "MONGO_OMACHI_HOST",
        "MONGO_OMACHI_PORT",
        "MONGO_OMACHI_READ_ONLY_USER",
        "MONGO_OMACHI_READ_ONLY_PASS",
    ]
    missing = [key for key in required if not env.get(key)]
    if missing:
        raise RuntimeError(f"Missing environment variables: {', '.join(missing)}")

    host = env["MONGO_OMACHI_HOST"]
    port = env["MONGO_OMACHI_PORT"]
    username = env["MONGO_OMACHI_READ_ONLY_USER"]
    password = env["MONGO_OMACHI_READ_ONLY_PASS"]
    database = env.get("MONGO_OMACHI_DB", "omachi")
    collection = env.get("MONGO_OMACHI_COLLECTION", "buzzes")
    uri = (
        f"mongodb://{username}:{password}@{host}:{port}/{database}"
        f"?authSource={database}&authMechanism=SCRAM-SHA-256&directConnection=true"
    )

    for value in (host, port, username, password, database, collection, uri):
        if FORBIDDEN in value.lower():
            raise RuntimeError("Forbidden text detected in connection data")

    doc = Document()
    configure_styles(doc)
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.72)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.72)
    section.right_margin = Inches(0.72)

    doc.core_properties.title = "Hướng dẫn truy cập dữ liệu MongoDB"
    doc.core_properties.subject = "Thông tin kết nối chỉ đọc và từ điển dữ liệu"
    doc.core_properties.author = "Data Engineering"
    doc.core_properties.keywords = "MongoDB, read only, data dictionary"
    doc.core_properties.comments = "Customer access guide"

    header = section.header.paragraphs[0]
    header.text = "HƯỚNG DẪN TRUY CẬP DỮ LIỆU MONGODB"
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for run in header.runs:
        run.font.name = "Aptos"
        run.font.size = Pt(8)
        run.font.bold = True
        run.font.color.rgb = RGBColor(70, 70, 70)
    add_page_number(section.footer.paragraphs[0])

    title = doc.add_paragraph(style="Title")
    title.add_run("Hướng dẫn truy cập dữ liệu MongoDB")
    subtitle = doc.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(18)
    run = subtitle.add_run("Tài khoản chỉ đọc và từ điển dữ liệu")
    run.font.name = "Aptos Display"
    run.font.size = Pt(15)
    run.font.color.rgb = RGBColor(65, 65, 65)

    intro = doc.add_paragraph()
    intro.add_run(
        "Tài liệu này cung cấp thông tin cần thiết để kết nối tới bộ dữ liệu buzz, "
        "thực hiện truy vấn chỉ đọc và diễn giải các trường dữ liệu. Tài khoản được cấp "
        "không có quyền thêm, sửa hoặc xóa dữ liệu."
    )

    doc.add_heading("Thông tin kết nối", level=1)
    connection_rows = [
        ["Máy chủ", host],
        ["Cổng", port],
        ["Cơ sở dữ liệu", database],
        ["Collection", collection],
        ["Tài khoản", username],
        ["Mật khẩu", password],
        ["Cơ sở dữ liệu xác thực", database],
        ["Cơ chế xác thực", "SCRAM-SHA-256"],
        ["Quyền truy cập", "Chỉ đọc trên cơ sở dữ liệu được cấp"],
    ]
    add_table(doc, ["Thông số", "Giá trị"], connection_rows, [2.05, 4.85])

    doc.add_heading("Chuỗi kết nối", level=2)
    add_code(doc, uri)
    paragraph = doc.add_paragraph()
    paragraph.add_run("Lưu ý bảo mật ").bold = True
    paragraph.add_run(
        "Không chia sẻ tài khoản hoặc chuỗi kết nối trên kênh công khai. Nếu địa chỉ IP truy cập được giới hạn, "
        "hãy đề nghị đơn vị vận hành bổ sung IP trước khi kết nối."
    )

    doc.add_heading("Kết nối bằng MongoDB Compass", level=1)
    for text in (
        "Mở MongoDB Compass và chọn New Connection.",
        "Dán chuỗi kết nối ở mục Chuỗi kết nối rồi chọn Connect.",
        f"Mở cơ sở dữ liệu {database} và collection {collection}.",
    ):
        add_bullet(doc, text)

    doc.add_heading("Kết nối bằng mongosh", level=1)
    add_code(
        doc,
        f"mongosh --host {host} --port {port} --authenticationDatabase {database} "
        f"-u {username} -p",
    )
    doc.add_paragraph("Nhập mật khẩu khi mongosh hiển thị yêu cầu. Sau khi kết nối, chạy:")
    add_code(doc, f"use {database}\ndb.{collection}.findOne()")

    doc.add_heading("Truy vấn mẫu", level=1)
    doc.add_paragraph("Lấy 20 bản ghi mới nhất theo ngày xuất bản:")
    add_code(doc, f'db.{collection}.find({{}}).sort({{ publishedDate: -1 }}).limit(20)')
    doc.add_paragraph("Lọc theo cảm xúc và chỉ lấy các trường cần thiết:")
    add_code(
        doc,
        f'db.{collection}.find(\n'
        '  { sentiment: "Positive" },\n'
        '  { _id: 0, id: 1, title: 1, content: 1, publishedDate: 1, sentiment: 1, labels: 1 }\n'
        ')',
    )
    doc.add_paragraph("Lọc theo nhãn:")
    add_code(doc, f'db.{collection}.find({{ labels: "Hương vị" }}).limit(20)')

    doc.add_heading("Quy ước dữ liệu", level=1)
    for text in (
        "Trường id là khóa nghiệp vụ duy nhất. Nên dùng id khi đồng bộ hoặc đối soát dữ liệu.",
        "Một số trường là tùy chọn và có thể không xuất hiện nếu nguồn không cung cấp dữ liệu.",
        "Các trường đếm tương tác có thể là Number hoặc chuỗi số. Ứng dụng nên chuyển về kiểu số trước khi tính toán.",
        "publishedDate sử dụng chuỗi thời gian ISO 8601 theo UTC.",
    ):
        add_bullet(doc, text)

    core_fields = [
        ["_id", "ObjectId", "Có", "Khóa nội bộ do MongoDB tạo."],
        ["id", "String", "Có", "Mã duy nhất của buzz. Field này có unique index."],
        ["title", "String", "Không", "Tiêu đề của nội dung."],
        ["content", "String", "Có", "Nội dung chính của buzz."],
        ["description", "String", "Có", "Mô tả đi kèm nội dung; có thể là chuỗi rỗng."],
        ["contentSummary", "String", "Không", "Nội dung tóm tắt khi nguồn cung cấp."],
        ["publishedDate", "String", "Có", "Thời điểm nội dung được xuất bản, định dạng ISO 8601 UTC."],
        ["url", "String", "Có", "Địa chỉ URL của buzz."],
        ["link", "String", "Không", "Liên kết bổ sung do nguồn dữ liệu cung cấp."],
        ["picture", "String", "Không", "URL ảnh đại diện hoặc ảnh đính kèm."],
        ["place", "String", "Không", "Địa điểm gắn với nội dung nếu có."],
    ]
    doc.add_heading("Các trường nội dung", level=1)
    add_table(doc, ["Field", "Kiểu", "Bắt buộc", "Định nghĩa"], core_fields, [1.55, 1.0, 0.85, 3.5])

    source_fields = [
        ["author", "String", "Không", "Tên tác giả hoặc tên tài khoản đăng nội dung."],
        ["authorId", "String", "Có", "Mã tài khoản tác giả tại nền tảng nguồn."],
        ["siteId", "String", "Có", "Mã nguồn, trang, nhóm, kênh hoặc website."],
        ["siteName", "String", "Có", "Tên hiển thị của nguồn."],
        ["parentId", "String", "Không", "Mã nội dung cha, thường dùng cho bình luận hoặc phản hồi."],
        ["parentDate", "String", "Không", "Thời điểm xuất bản của nội dung cha, định dạng ISO 8601 UTC."],
    ]
    doc.add_heading("Các trường tác giả và nguồn", level=1)
    add_table(doc, ["Field", "Kiểu", "Bắt buộc", "Định nghĩa"], source_fields, [1.55, 1.0, 0.85, 3.5])

    metric_fields = [
        ["likes", "Number hoặc String", "Có", "Số lượt thích tại thời điểm thu thập."],
        ["comments", "Number hoặc String", "Có", "Số lượt bình luận tại thời điểm thu thập."],
        ["shares", "Number hoặc String", "Có", "Số lượt chia sẻ tại thời điểm thu thập."],
        ["interactions", "Number hoặc String", "Có", "Tổng tương tác do nguồn dữ liệu cung cấp."],
        ["views", "Number", "Không", "Số lượt xem khi nền tảng cung cấp chỉ số này."],
    ]
    doc.add_heading("Các trường tương tác", level=1)
    add_table(doc, ["Field", "Kiểu", "Bắt buộc", "Định nghĩa"], metric_fields, [1.55, 1.25, 0.85, 3.25])

    enrich_fields = [
        ["sentiment", "String", "Không", "Cảm xúc đã chuẩn hóa. Giá trị hợp lệ gồm Positive, Nega, Neutral và None."],
        ["labels", "Array String", "Không", "Danh sách nhãn phân loại nội dung. Mảng có thể rỗng."],
        ["isDeleted", "Boolean", "Không", "Cho biết nội dung được đánh dấu đã xóa tại nguồn phân loại."],
    ]
    doc.add_heading("Các trường phân loại", level=1)
    add_table(doc, ["Field", "Kiểu", "Bắt buộc", "Định nghĩa"], enrich_fields, [1.55, 1.15, 0.85, 3.35])

    doc.add_heading("Giá trị sentiment", level=2)
    sentiment_rows = [
        ["Positive", "Tích cực"],
        ["Nega", "Tiêu cực"],
        ["Neutral", "Trung tính"],
        ["None", "Chưa xác định hoặc không có giá trị"],
    ]
    add_table(doc, ["Giá trị", "Ý nghĩa"], sentiment_rows, [1.65, 5.25])

    doc.add_heading("Giá trị labels", level=2)
    labels = [
        "Chất lượng Sản phẩm",
        "Hương vị",
        "Bao bì & Đóng gói",
        "Giá cả & Khuyến mãi",
        "Kênh Phân phối & Hậu cần",
        "Thương hiệu & Quảng cáo",
        "Hỗ trợ & Dịch vụ K.Hàng",
        "Trò chơi nhỏ - trực tuyển",
        "Ban lãnh đạo",
        "Cổ phiếu, chứng khoán",
        "Nguồn gốc &Thành phần",
        "Trải nghiệm sử dụng",
        "So sánh thương hiệu",
        "Tuyển dụng & Nhân sự",
        "Doanh thu & Lợi nhuận",
        "Khác",
    ]
    label_rows = [
        [str(i + 1), labels[i], str(i + 9), labels[i + 8]]
        for i in range(8)
    ]
    add_table(doc, ["STT", "Nhãn", "STT", "Nhãn"], label_rows, [0.55, 2.9, 0.55, 2.9])

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)

    with zipfile.ZipFile(OUTPUT) as archive:
        for name in archive.namelist():
            payload = archive.read(name)
            if FORBIDDEN.encode("utf-8") in payload.lower():
                raise RuntimeError(f"Forbidden text detected in DOCX entry {name}")
    return OUTPUT


if __name__ == "__main__":
    print(build_document())
