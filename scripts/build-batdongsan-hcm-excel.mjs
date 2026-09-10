import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = path.resolve(
  process.argv[2] || "./output/batdongsan-hcm-5-pages.json",
);
const outputPath = path.resolve(
  process.argv[3] || "./outputs/batdongsan-hcm-5-pages/batdongsan-hcm-5-pages.xlsx",
);
const previewDirectory = path.resolve(
  process.argv[4] || "./outputs/batdongsan-hcm-5-pages/previews",
);

const source = JSON.parse(await fs.readFile(inputPath, "utf8"));
const listings = source.listings || [];

function parseLocaleNumber(value) {
  const raw = String(value || "").replace(/[^\d.,-]/g, "");
  if (!raw) return null;
  if (raw.includes(",")) return Number(raw.replace(/\./g, "").replace(",", "."));
  if ((raw.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(raw)) {
    return Number(raw.replace(/\./g, ""));
  }
  return Number(raw);
}

function parseMoney(value) {
  const number = parseLocaleNumber(value);
  if (!Number.isFinite(number)) return null;
  const text = String(value || "").toLowerCase();
  if (text.includes("tỷ")) return number * 1_000_000_000;
  if (text.includes("triệu")) return number * 1_000_000;
  if (text.includes("nghìn") || text.includes("ngàn")) return number * 1_000;
  return number;
}

function parseDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12));
}

function propertyType(url) {
  const slug = new URL(url).pathname.split("/").filter(Boolean)[0] || "";
  const labels = [
    ["ban-dat-nen-du-an", "Đất nền dự án"],
    ["ban-can-ho-chung-cu", "Căn hộ chung cư"],
    ["ban-nha-biet-thu-lien-ke", "Biệt thự, liền kề"],
    ["ban-nha-mat-pho", "Nhà mặt phố"],
    ["ban-nha-rieng", "Nhà riêng"],
    ["ban-kho-nha-xuong", "Kho, nhà xưởng"],
    ["ban-trang-trai-khu-nghi-duong", "Trang trại, nghỉ dưỡng"],
    ["ban-shophouse-nha-pho-thuong-mai", "Shophouse"],
    ["ban-loai-bat-dong-san-khac", "BĐS khác"],
    ["ban-dat", "Đất"],
  ];
  return labels.find(([prefix]) => slug.startsWith(prefix))?.[1] || "BĐS khác";
}

const headers = [
  "STT",
  "Trang",
  "Mã tin",
  "Loại BĐS",
  "Tiêu đề",
  "Giá (VND)",
  "Giá hiển thị",
  "Giá/m² (VND)",
  "Giá/m² hiển thị",
  "Diện tích (m²)",
  "Phòng ngủ",
  "Phòng tắm",
  "Số tầng",
  "Mặt tiền (m)",
  "Đường vào (m)",
  "Hướng nhà",
  "Hướng ban công",
  "Pháp lý",
  "Nội thất",
  "Dự án",
  "Địa chỉ",
  "Người đăng",
  "Điện thoại",
  "Ngày đăng",
  "Ngày hết hạn",
  "Loại tin",
  "Số ảnh",
  "Ảnh đầu tiên",
  "Mô tả",
  "Link bài",
];

const rows = listings.map((item, index) => [
  index + 1,
  item.listPage,
  String(item.id || ""),
  propertyType(item.finalUrl || item.sourceUrl),
  item.title || "",
  parseMoney(item.price),
  item.price || "",
  parseMoney(item.pricePerSquareMeter),
  item.pricePerSquareMeter || "",
  parseLocaleNumber(item.area),
  parseLocaleNumber(item.specifications?.["Số phòng ngủ"] || item.bedrooms),
  parseLocaleNumber(item.specifications?.["Số phòng tắm, vệ sinh"]),
  parseLocaleNumber(item.specifications?.["Số tầng"]),
  parseLocaleNumber(item.specifications?.["Mặt tiền"]),
  parseLocaleNumber(item.specifications?.["Đường vào"]),
  item.specifications?.["Hướng nhà"] || "",
  item.specifications?.["Hướng ban công"] || "",
  item.specifications?.["Pháp lý"] || "",
  item.specifications?.["Nội thất"] || "",
  item.project || "",
  item.address || "",
  item.contact?.name || "",
  item.contact?.phone || "",
  parseDate(item.metadata?.postedAt),
  parseDate(item.metadata?.expiresAt),
  item.metadata?.listingType || "",
  item.images?.length || 0,
  item.images?.[0] || "",
  item.description || "",
  item.finalUrl || item.sourceUrl || "",
]);

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Tổng quan");
const data = workbook.worksheets.add("Danh sách");

summary.showGridLines = false;
data.showGridLines = false;

summary.getRange("A1:H1").merge();
summary.getRange("A1").values = [["BẤT ĐỘNG SẢN TP.HCM — 5 TRANG ĐẦU"]];
summary.getRange("A1:H1").format = {
  fill: "#A61B1B",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A1:H1").format.rowHeight = 34;

summary.getRange("A3:H3").merge();
summary.getRange("A3").values = [[`Nguồn: ${source.source} | Thu thập: ${source.collectedAt}`]];
summary.getRange("A3:H3").format = {
  fill: "#F7E8E8",
  font: { color: "#5B1A1A", italic: true },
  verticalAlignment: "center",
};

summary.getRange("A5:H5").values = [[
  "Tổng tin",
  null,
  "Có giá",
  null,
  "Giá TB (tỷ)",
  null,
  "Diện tích TB",
  null,
]];
summary.getRange("A6:H6").formulas = [[
  "=COUNTA('Danh sách'!$C$2:$C$104)",
  null,
  "=COUNT('Danh sách'!$F$2:$F$104)",
  null,
  "=AVERAGE('Danh sách'!$F$2:$F$104)/1000000000",
  null,
  "=AVERAGE('Danh sách'!$J$2:$J$104)",
  null,
]];
for (const rangeAddress of [
  "A5:B5", "A6:B6",
  "C5:D5", "C6:D6",
  "E5:F5", "E6:F6",
  "G5:H5", "G6:H6",
]) {
  summary.getRange(rangeAddress).merge();
}
for (const rangeAddress of ["A5:B6", "C5:D6", "E5:F6", "G5:H6"]) {
  summary.getRange(rangeAddress).format = {
    fill: "#FFF7F1",
    borders: { preset: "outside", style: "thin", color: "#E8B4A8" },
  };
}
summary.getRange("A5:H5").format.font = { bold: true, color: "#7A1C1C" };
summary.getRange("A6:H6").format.font = { bold: true, color: "#222222", size: 14 };
summary.getRange("A6:D6").format.numberFormat = "#,##0";
summary.getRange("E6:H6").format.numberFormat = "#,##0.0";
summary.getRange("A5:H6").format.horizontalAlignment = "center";

summary.getRange("A9:B9").values = [["Trang danh sách", "Số tin duy nhất"]];
summary.getRange("A10:A14").values = [[1], [2], [3], [4], [5]];
summary.getRange("B10").formulas = [["=COUNTIF('Danh sách'!$B$2:$B$104,A10)"]];
summary.getRange("B10:B14").fillDown();

const typeNames = [...new Set(rows.map((row) => row[3]))].sort();
summary.getRange(`D9:E${9 + Math.max(typeNames.length, 1)}`).values = [
  ["Loại bất động sản", "Số tin"],
  ...typeNames.map((type) => [type, null]),
];
if (typeNames.length) {
  summary.getRange("E10").formulas = [["=COUNTIF('Danh sách'!$D$2:$D$104,D10)"]];
  summary.getRange(`E10:E${9 + typeNames.length}`).fillDown();
}

for (const headerRange of ["A9:B9", "D9:E9"]) {
  summary.getRange(headerRange).format = {
    fill: "#7A1C1C",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
  };
}
summary.getRange("A10:B14").format.borders = {
  preset: "inside",
  style: "thin",
  color: "#E6E6E6",
};
if (typeNames.length) {
  summary.getRange(`D10:E${9 + typeNames.length}`).format.borders = {
    preset: "inside",
    style: "thin",
    color: "#E6E6E6",
  };
}
summary.getRange("A19:H19").merge();
summary.getRange("A19").values = [[
  "Ghi chú: Giá và số điện thoại được giữ đúng trạng thái hiển thị công khai trên trang. Các trường số đã được chuẩn hóa để lọc/tính toán trong Excel.",
]];
summary.getRange("A19:H19").format = {
  fill: "#F2F2F2",
  font: { color: "#555555", italic: true },
  wrapText: true,
};
summary.getRange("A19:H19").format.rowHeight = 34;
summary.getRange("A:H").format.columnWidth = 17;
summary.getRange("A:A").format.columnWidth = 21;
summary.getRange("D:D").format.columnWidth = 25;
summary.freezePanes.freezeRows(3);

const lastRow = rows.length + 1;
const lastColumn = "AD";
data.getRange(`A1:${lastColumn}${lastRow}`).values = [headers, ...rows];
data.getRange(`A1:${lastColumn}1`).format = {
  fill: "#A61B1B",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
data.getRange(`A1:${lastColumn}1`).format.rowHeight = 32;
data.freezePanes.freezeRows(1);
data.freezePanes.freezeColumns(4);

const table = data.tables.add(`A1:${lastColumn}${lastRow}`, true, "BatdongsanHcmTable");
table.style = "TableStyleMedium2";
table.showBandedRows = true;
table.showFilterButton = true;

data.getRange(`A2:D${lastRow}`).format.horizontalAlignment = "center";
data.getRange(`F2:F${lastRow}`).format.numberFormat = "#,##0";
data.getRange(`H2:H${lastRow}`).format.numberFormat = "#,##0";
data.getRange(`J2:O${lastRow}`).format.numberFormat = "#,##0.0";
data.getRange(`X2:Y${lastRow}`).format.numberFormat = "yyyy-mm-dd";
data.getRange(`AA2:AA${lastRow}`).format.numberFormat = "#,##0";
data.getRange(`E2:E${lastRow}`).format.wrapText = true;
data.getRange(`AC2:AC${lastRow}`).format.wrapText = true;
data.getRange(`A2:${lastColumn}${lastRow}`).format.rowHeight = 48;

const widths = {
  A: 7, B: 7, C: 12, D: 20, E: 44, F: 17, G: 16, H: 17, I: 18, J: 15,
  K: 12, L: 12, M: 10, N: 13, O: 13, P: 13, Q: 16, R: 22, S: 30, T: 22,
  U: 48, V: 22, W: 16, X: 14, Y: 14, Z: 20, AA: 9, AB: 42, AC: 60, AD: 55,
};
for (const [column, width] of Object.entries(widths)) {
  data.getRange(`${column}:${column}`).format.columnWidth = width;
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(previewDirectory, { recursive: true });

const summaryPreview = await workbook.render({
  sheetName: "Tổng quan",
  range: "A1:H19",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(
  path.join(previewDirectory, "tong-quan.png"),
  new Uint8Array(await summaryPreview.arrayBuffer()),
);

const dataPreview = await workbook.render({
  sheetName: "Danh sách",
  range: "A1:J8",
  scale: 1.2,
  format: "png",
});
await fs.writeFile(
  path.join(previewDirectory, "danh-sach.png"),
  new Uint8Array(await dataPreview.arrayBuffer()),
);

const inspectSummary = await workbook.inspect({
  kind: "table",
  range: "Tổng quan!A1:H19",
  include: "values,formulas",
  tableMaxRows: 18,
  tableMaxCols: 8,
});
console.log(inspectSummary.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, rows: rows.length, previewDirectory }, null, 2));
