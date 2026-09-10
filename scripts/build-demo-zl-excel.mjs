import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const sourcePath = "/Users/phuctran/Workspace/crawler-2026/output/demo_zl_1_normalized.json";
const outputDir = "/Users/phuctran/Workspace/crawler-2026/outputs/demo-zl-normalized";
const outputPath = `${outputDir}/demo_zl_1_normalized.xlsx`;
const previewDir = `${outputDir}/previews`;

const records = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const headers = ["UserId", "Gender", "Birthday", "Location", "Relationship"];
const escapeCsv = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
};
const csvText = [
  headers.map(escapeCsv).join(","),
  ...records.map((item) => headers.map((key) => escapeCsv(item[key])).join(",")),
].join("\n");
const lastRow = records.length + 1;

const workbook = await Workbook.fromCSV(csvText, { sheetName: "Dữ liệu" });
const data = workbook.worksheets.getItem("Dữ liệu");
const summary = workbook.worksheets.add("Tổng quan");

data.showGridLines = false;
data.freezePanes.freezeRows(1);
data.getRange("A1:E1").format = {
  fill: "#0F4C5C",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#083344" },
};
data.getRange("A1:E1").format.rowHeight = 28;
data.getRange(`A2:A${lastRow}`).format.numberFormat = "@";
data.getRange(`C2:C${lastRow}`).format.numberFormat = "0";
data.getRange(`A1:A${lastRow}`).format.columnWidth = 22;
data.getRange(`B1:B${lastRow}`).format.columnWidth = 12;
data.getRange(`C1:C${lastRow}`).format.columnWidth = 12;
data.getRange(`D1:D${lastRow}`).format.columnWidth = 25;
data.getRange(`E1:E${lastRow}`).format.columnWidth = 27;
data.getRange(`A2:E${Math.min(lastRow, 2000)}`).conditionalFormats.add("expression", {
  formula: "=MOD(ROW(),2)=0",
  format: { fill: "#F3F8F9" },
});

summary.showGridLines = false;
summary.getRange("A1:H2").merge();
summary.getRange("A1").values = [["TỔNG QUAN DỮ LIỆU ZALO ĐÃ CHUẨN HÓA"]];
summary.getRange("A1:H2").format = {
  fill: "#0F4C5C",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A3:H3").merge();
summary.getRange("A3").values = [["Nguồn: demo_zl_1_normalized.json • Gender và Relationship đã chuyển sang tiếng Anh • Birthday chỉ giữ năm"]];
summary.getRange("A3:H3").format = {
  fill: "#E6F4F1",
  font: { italic: true, color: "#335C67" },
  horizontalAlignment: "center",
};

summary.getRange("A5:B5").merge();
summary.getRange("C5:D5").merge();
summary.getRange("E5:F5").merge();
summary.getRange("G5:H5").merge();
summary.getRange("A5").values = [["Tổng bản ghi"]];
summary.getRange("C5").values = [["Có giới tính"]];
summary.getRange("E5").values = [["Có năm sinh"]];
summary.getRange("G5").values = [["Có địa điểm"]];
summary.getRange("A6:B7").merge();
summary.getRange("C6:D7").merge();
summary.getRange("E6:F7").merge();
summary.getRange("G6:H7").merge();
summary.getRange("A6").formulas = [[`=COUNTA('Dữ liệu'!$A$2:$A$${lastRow})`]];
summary.getRange("C6").formulas = [[`=COUNTA('Dữ liệu'!$B$2:$B$${lastRow})`]];
summary.getRange("E6").formulas = [[`=COUNT('Dữ liệu'!$C$2:$C$${lastRow})`]];
summary.getRange("G6").formulas = [[`=COUNTA('Dữ liệu'!$D$2:$D$${lastRow})`]];
summary.getRange("A5:H5").format = {
  fill: "#D9EAF0",
  font: { bold: true, color: "#163A43" },
  horizontalAlignment: "center",
};
summary.getRange("A6:H7").format = {
  fill: "#F8FBFC",
  font: { bold: true, color: "#0F4C5C", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  numberFormat: "#,##0",
  borders: { preset: "outside", style: "thin", color: "#B7CDD3" },
};

summary.getRange("A10:B10").values = [["Gender", "Số lượng"]];
summary.getRange("A11:A13").values = [["male"], ["female"], ["missing"]];
summary.getRange("B11").formulas = [[`=COUNTIF('Dữ liệu'!$B$2:$B$${lastRow},A11)`]];
summary.getRange("B12").formulas = [[`=COUNTIF('Dữ liệu'!$B$2:$B$${lastRow},A12)`]];
summary.getRange("B13").formulas = [[`=COUNTBLANK('Dữ liệu'!$B$2:$B$${lastRow})`]];

const relationships = [
  "single", "married", "in a relationship", "engaged", "it's complicated",
  "divorced", "separated", "widowed", "in an open relationship",
  "in a civil union", "in a domestic partnership", "missing",
];
summary.getRange("D10:E10").values = [["Relationship", "Số lượng"]];
summary.getRange(`D11:D${10 + relationships.length}`).values = relationships.map((v) => [v]);
for (let index = 0; index < relationships.length - 1; index += 1) {
  const row = 11 + index;
  summary.getRange(`E${row}`).formulas = [[`=COUNTIF('Dữ liệu'!$E$2:$E$${lastRow},D${row})`]];
}
summary.getRange(`E${10 + relationships.length}`).formulas = [[`=COUNTBLANK('Dữ liệu'!$E$2:$E$${lastRow})`]];

summary.getRange("G10:H10").values = [["Độ đầy đủ", "Số lượng"]];
summary.getRange("G11:G13").values = [["Có Relationship"], ["Thiếu Location"], ["Thiếu Birthday"]];
summary.getRange("H11").formulas = [[`=COUNTA('Dữ liệu'!$E$2:$E$${lastRow})`]];
summary.getRange("H12").formulas = [[`=COUNTBLANK('Dữ liệu'!$D$2:$D$${lastRow})`]];
summary.getRange("H13").formulas = [[`=COUNTBLANK('Dữ liệu'!$C$2:$C$${lastRow})`]];

for (const range of ["A10:B10", "D10:E10", "G10:H10"]) {
  summary.getRange(range).format = {
    fill: "#0F4C5C",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: "#083344" },
  };
}
for (const range of ["A11:B13", `D11:E${10 + relationships.length}`, "G11:H13"]) {
  summary.getRange(range).format.borders = {
    insideHorizontal: { style: "thin", color: "#DDE7EA" },
    bottom: { style: "thin", color: "#B7CDD3" },
  };
}
summary.getRange("B11:B13").format.numberFormat = "#,##0";
summary.getRange(`E11:E${10 + relationships.length}`).format.numberFormat = "#,##0";
summary.getRange("H11:H13").format.numberFormat = "#,##0";
summary.getRange("A1:H25").format.font.name = "Aptos";
summary.getRange("A1:A25").format.columnWidth = 18;
summary.getRange("B1:B25").format.columnWidth = 14;
summary.getRange("C1:C25").format.columnWidth = 4;
summary.getRange("D1:D25").format.columnWidth = 27;
summary.getRange("E1:E25").format.columnWidth = 14;
summary.getRange("F1:F25").format.columnWidth = 4;
summary.getRange("G1:G25").format.columnWidth = 22;
summary.getRange("H1:H25").format.columnWidth = 14;
summary.freezePanes.freezeRows(3);

await fs.mkdir(previewDir, { recursive: true });
const summaryPreview = await workbook.render({ sheetName: "Tổng quan", range: "A1:H22", scale: 1.25, format: "png" });
await fs.writeFile(`${previewDir}/tong-quan.png`, new Uint8Array(await summaryPreview.arrayBuffer()));
const dataPreview = await workbook.render({ sheetName: "Dữ liệu", range: "A1:E15", scale: 1.1, format: "png" });
await fs.writeFile(`${previewDir}/du-lieu.png`, new Uint8Array(await dataPreview.arrayBuffer()));

const summaryInspect = await workbook.inspect({ kind: "region", sheetId: "Tổng quan", range: "A1:H22", maxChars: 6000 });
const dataInspect = await workbook.inspect({ kind: "region", sheetId: "Dữ liệu", range: "A1:E8", maxChars: 3000 });
const formulaErrors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 50 }, maxChars: 3000 });
console.log(JSON.stringify({ rowCount: records.length, summaryInspect, dataInspect, formulaErrors }, null, 2));

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`SAVED ${outputPath}`);
