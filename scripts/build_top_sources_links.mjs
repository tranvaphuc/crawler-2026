import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";


const sourcePath = "/Users/phuctran/Downloads/Dashboard_28761_Top-Sources_2026-09-02-16-52-46.xlsx";
const outputDir = path.resolve("outputs/01a07164-8064-7313-962f-0d73887aa809");
const outputPath = path.join(outputDir, "Dashboard_28761_Top-Sources_with-links.xlsx");
const previewDir = path.resolve("outputs/top_sources_preview");

const links = JSON.parse(await fs.readFile("outputs/top_sources_links.json", "utf8"));
const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Top Sources");

await fs.mkdir(previewDir, { recursive: true });
const before = await workbook.render({ sheetName: "Top Sources", range: "A1:B15", scale: 1.5, format: "png" });
await fs.writeFile(path.join(previewDir, "before.png"), new Uint8Array(await before.arrayBuffer()));

sheet.getRange("C1").copyFrom(sheet.getRange("B1"), "all");
sheet.getRange("C1").values = [["Link"]];
sheet.getRange(`C2:C${links.length + 1}`).values = links.map((link) => [link]);
sheet.getRange(`C1:C${links.length + 1}`).setNumberFormat("@");
sheet.getRange(`C1:C${links.length + 1}`).format.columnWidth = 42;

for (const table of [...sheet.tables.items]) table.delete();
const table = sheet.tables.add(`A1:C${links.length + 1}`, true, "TopSourcesTable");
table.style = "TableStyleLight1";
table.showBandedColumns = false;
table.showFilterButton = true;

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const check = await workbook.inspect({
  kind: "table",
  range: "'Top Sources'!A1:C15",
  include: "values,formulas",
  tableMaxRows: 15,
  tableMaxCols: 3,
  maxChars: 6000,
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
  maxChars: 3000,
});
const after = await workbook.render({ sheetName: "Top Sources", range: "A1:C15", scale: 1.5, format: "png" });
await fs.writeFile(path.join(previewDir, "after.png"), new Uint8Array(await after.arrayBuffer()));

console.log(JSON.stringify({ outputPath, rows: links.length, links: links.filter(Boolean).length }));
console.log(check.ndjson);
console.log(errors.ndjson);
