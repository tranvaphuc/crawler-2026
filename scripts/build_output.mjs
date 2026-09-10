import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";


const sourcePath = "/Users/phuctran/Desktop/check_xxxx.xlsx";
const workDir = path.resolve("outputs/phone_language_work");
const outputDir = path.resolve("outputs/01a07164-8064-7313-962f-0d73887aa809");
const outputPath = path.join(outputDir, "check_xxxx_phone_language.xlsx");


function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}


const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const dataSheet = workbook.worksheets.getItem("Data");

await fs.mkdir(workDir, { recursive: true });
const before = await workbook.render({ sheetName: "Data", range: "A1:C12", scale: 1.5, format: "png" });
await fs.writeFile(path.join(workDir, "before.png"), new Uint8Array(await before.arrayBuffer()));

const rowText = await fs.readFile(path.join(workDir, "row_results.csv"), "utf8");
const lines = rowText.split(/\r?\n/);
dataSheet.getRange("D1:E1").values = [["Số điện thoại", "Language"]];
const chunkSize = 20000;
let written = 0;
for (let start = 1; start < lines.length; start += chunkSize) {
  const block = [];
  const end = Math.min(lines.length, start + chunkSize);
  for (let i = start; i < end; i += 1) {
    if (!lines[i]) continue;
    const firstComma = lines[i].indexOf(",");
    const lastComma = lines[i].lastIndexOf(",");
    const phone = lines[i].slice(firstComma + 1, lastComma);
    const language = lines[i].slice(lastComma + 1);
    block.push([phone, language]);
  }
  if (block.length) {
    const row1 = 2 + written;
    const row2 = row1 + block.length - 1;
    dataSheet.getRange(`D${row1}:E${row2}`).values = block;
    written += block.length;
  }
}

dataSheet.getRange(`D1:D${written + 1}`).setNumberFormat("@");
dataSheet.getRange("D1:E1").format = {
  fill: "#1F4E78",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
dataSheet.getRange(`D2:D${written + 1}`).format.columnWidth = 24;
dataSheet.getRange(`E2:E${written + 1}`).format.columnWidth = 14;
dataSheet.freezePanes.freezeRows(1);

const topRows = parseCsv(await fs.readFile(path.join(workDir, "top_sites.csv"), "utf8"));
const topSheet = workbook.worksheets.add("Top 500 Việt Nam");
topSheet.showGridLines = false;
topSheet.getRange("A1:F1").merge();
topSheet.getRange("A1").values = [["Top 500 site có nhiều số điện thoại trong content tiếng Việt"]];
topSheet.getRange("A2:F2").merge();
topSheet.getRange("A2").values = [["Xếp hạng theo số điện thoại duy nhất; dùng lượt xuất hiện và số content tiếng Việt để phân hạng khi bằng nhau."]];
topSheet.getRange("A4:F4").values = [[
  "Hạng",
  "SiteId",
  "SiteName",
  "Số điện thoại duy nhất",
  "Lượt xuất hiện SĐT",
  "Số content tiếng Việt",
]];
const topValues = topRows.slice(1).filter((r) => r.length >= 6).map((r) => [
  Number(r[0]),
  r[1],
  r[2],
  Number(r[3]),
  Number(r[4]),
  Number(r[5]),
]);
topSheet.getRange(`A5:F${4 + topValues.length}`).values = topValues;
topSheet.getRange("A1").format = { font: { bold: true, size: 16, color: "#1F2937" } };
topSheet.getRange("A2").format = { font: { italic: true, size: 10, color: "#5B6573" } };
topSheet.getRange("A4:F4").format = {
  fill: "#1F4E78",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
};
topSheet.getRange(`A5:F${4 + topValues.length}`).format = {
  font: { color: "#1F2937", size: 10 },
  verticalAlignment: "center",
};
topSheet.getRange(`A5:A${4 + topValues.length}`).format.horizontalAlignment = "center";
topSheet.getRange(`D5:F${4 + topValues.length}`).format.horizontalAlignment = "right";
topSheet.getRange(`A5:A${4 + topValues.length}`).setNumberFormat("#,##0");
topSheet.getRange(`B5:B${4 + topValues.length}`).setNumberFormat("@");
topSheet.getRange(`D5:F${4 + topValues.length}`).setNumberFormat("#,##0");
topSheet.getRange(`A1:A${4 + topValues.length}`).format.columnWidth = 8;
topSheet.getRange(`B1:B${4 + topValues.length}`).format.columnWidth = 22;
topSheet.getRange(`C1:C${4 + topValues.length}`).format.columnWidth = 56;
topSheet.getRange(`D1:F${4 + topValues.length}`).format.columnWidth = 22;
topSheet.getRange("1:1").format.rowHeight = 28;
topSheet.getRange("2:2").format.rowHeight = 22;
topSheet.getRange("4:4").format.rowHeight = 34;
topSheet.freezePanes.freezeRows(4);
topSheet.tables.add(`A4:F${4 + topValues.length}`, true, "TopVietnamSites").style = "TableStyleMedium2";

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const dataCheck = await workbook.inspect({
  kind: "table",
  range: "Data!A1:E12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 5,
  maxChars: 8000,
});
const topCheck = await workbook.inspect({
  kind: "table",
  range: "'Top 500 Việt Nam'!A1:F15",
  include: "values,formulas",
  tableMaxRows: 15,
  tableMaxCols: 6,
  maxChars: 8000,
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
  maxChars: 5000,
});
const dataPreview = await workbook.render({ sheetName: "Data", range: "A1:E12", scale: 1.2, format: "png" });
const topPreview = await workbook.render({ sheetName: "Top 500 Việt Nam", range: "A1:F18", scale: 1.4, format: "png" });
await fs.writeFile(path.join(workDir, "data_preview.png"), new Uint8Array(await dataPreview.arrayBuffer()));
await fs.writeFile(path.join(workDir, "top_preview.png"), new Uint8Array(await topPreview.arrayBuffer()));

console.log(JSON.stringify({ outputPath, written, topRows: topValues.length }));
console.log(dataCheck.ndjson);
console.log(topCheck.ndjson);
console.log(errors.ndjson);
