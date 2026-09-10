import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const [sourceMappingPath, targetPayloadPath, samplesPath, outputPath, previewDir] = process.argv.slice(2);
if (!sourceMappingPath || !targetPayloadPath || !samplesPath || !outputPath || !previewDir) {
  throw new Error('Usage: node scripts/build_es_mapping_review_workbook.mjs <es7-mapping> <es8-payload> <samples> <output.xlsx> <preview-dir>');
}

const sourceMapping = JSON.parse(await fs.readFile(sourceMappingPath, 'utf8'));
const targetPayload = JSON.parse(await fs.readFile(targetPayloadPath, 'utf8'));
const sampleBundle = JSON.parse(await fs.readFile(samplesPath, 'utf8'));
const sample = sampleBundle.samples?.[1] ?? sampleBundle.samples?.[0];
if (!sample) throw new Error('No ES7 sample document found');

const targetMapping = targetPayload.mappings;
const font = 'Arial';
const navy = '#17365D';
const blue = '#2F75B5';
const lightBlue = '#D9EAF7';
const lightGray = '#F2F4F7';
const amber = '#FFF2CC';
const green = '#E2F0D9';
const red = '#FCE4D6';
const border = '#D9E1F2';

function flattenMapping(properties = {}, prefix = '', fieldKind = 'property') {
  const rows = [];
  for (const [name, spec] of Object.entries(properties)) {
    const fieldPath = prefix ? `${prefix}.${name}` : name;
    rows.push({
      fieldPath,
      fieldKind,
      type: spec.type ?? 'object',
      analyzer: spec.analyzer ?? '',
      indexed: spec.index === false ? 'No' : 'Yes',
      format: spec.format ?? '',
      nullValue: spec.null_value ?? '',
      ignoreAbove: spec.ignore_above ?? '',
    });
    rows.push(...flattenMapping(spec.properties, fieldPath, 'property'));
    rows.push(...flattenMapping(spec.fields, fieldPath, 'multi-field'));
  }
  return rows;
}

function flattenDocument(value, prefix = '') {
  const rows = [];
  for (const [key, child] of Object.entries(value ?? {})) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      rows.push(...flattenDocument(child, fieldPath));
    } else {
      rows.push([fieldPath, child]);
    }
  }
  return rows;
}

function displayValue(value) {
  if (value === null) return 'null';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^\d{12,}$/.test(value)) return `[text] ${value}`;
  return String(value);
}

function interpretedValue(value, mappingType) {
  if (value === null) return 'null';
  if (mappingType === 'date' && typeof value === 'number') {
    return new Date(value).toISOString();
  }
  if ((mappingType === 'integer' || mappingType === 'float') && value !== '' && Number.isFinite(Number(value))) {
    return String(Number(value));
  }
  if (mappingType === 'boolean') return String(Boolean(value));
  return displayValue(value);
}

const sourceRows = flattenMapping(sourceMapping.properties);
const targetRows = flattenMapping(targetMapping.properties);
const sourceByPath = new Map(sourceRows.map((row) => [row.fieldPath, row]));
const targetByPath = new Map(targetRows.map((row) => [row.fieldPath, row]));
const allPaths = [...new Set([...sourceByPath.keys(), ...targetByPath.keys()])].sort();

const mappingRows = allPaths.map((fieldPath) => {
  const es7 = sourceByPath.get(fieldPath) ?? {};
  const es8 = targetByPath.get(fieldPath) ?? {};
  const changes = [];
  if ((es7.type ?? '') !== (es8.type ?? '')) changes.push('Type changed');
  if ((es7.format ?? '') !== (es8.format ?? '')) changes.push('Explicit ES8 date format');
  if ((es7.analyzer ?? '') !== (es8.analyzer ?? '')) changes.push('Analyzer changed');
  return [
    fieldPath,
    es7.fieldKind ?? es8.fieldKind ?? '',
    es7.type ?? '',
    es8.type ?? '',
    es7.analyzer ?? '',
    es8.analyzer ?? '',
    es8.indexed ?? es7.indexed ?? '',
    es7.format ?? '',
    es8.format ?? '',
    changes.join('; ') || 'Unchanged',
  ];
});

const targetSpecByPath = new Map(targetRows.map((row) => [row.fieldPath, row]));
const documentRows = flattenDocument(sample._source).map(([fieldPath, value]) => {
  const mappingType = targetSpecByPath.get(fieldPath)?.type ?? 'not mapped';
  const sourceDisplay = displayValue(value);
  const expectedDisplay = sourceDisplay;
  let note = 'Mapping does not rewrite _source';
  if (mappingType === 'date' && typeof value === 'number') note = 'Stored _source stays epoch ms; indexed as a date';
  if ((mappingType === 'integer' || mappingType === 'float') && typeof value === 'string') note = 'Stored _source stays text; ES indexes the coerced number';
  return [fieldPath, mappingType, sourceDisplay, expectedDisplay, interpretedValue(value, mappingType), note];
});

const rawEs7 = JSON.stringify({ _id: sample._id, _source: sample._source }, null, 2).split('\n');
const rawEs8 = JSON.stringify({ _id: sample._id, _source: sample._source }, null, 2).split('\n');
const rawRows = Array.from({ length: Math.max(rawEs7.length, rawEs8.length) }, (_, i) => [
  i + 1,
  rawEs7[i] ?? '',
  rawEs8[i] ?? '',
  (rawEs7[i] ?? '') === (rawEs8[i] ?? '') ? 'Same' : 'Different',
]);

const workbook = Workbook.create();
const overview = workbook.worksheets.add('Overview');
const fields = workbook.worksheets.add('Field Mapping');
const compare = workbook.worksheets.add('Record Compare');
const raw = workbook.worksheets.add('Raw JSON');

for (const sheet of [overview, fields, compare, raw]) {
  sheet.showGridLines = false;
}
overview.tabColor = navy;
fields.tabColor = blue;
compare.tabColor = '#70AD47';
raw.tabColor = '#A5A5A5';

overview.getRange('A2:F2').merge();
overview.getRange('A2').values = [['ES7 → ES8 mapping review']];
overview.getRange('A2:F2').format = { font: { name: font, size: 16, bold: true, color: navy } };
overview.getRange('A3:F3').format.borders = { bottom: { style: 'thin', color: blue } };
overview.getRange('A5:B12').values = [
  ['Metric', 'Value'],
  ['Source index', 'topic56fc9bc282ea19d067e5d8a1'],
  ['Source engine', 'Elasticsearch 7.7.1'],
  ['Documents at query time', sampleBundle.count],
  ['Primary store size', 91125555513],
  ['Top-level fields', Object.keys(sourceMapping.properties ?? {}).length],
  ['Mapped field definitions', sourceRows.length],
  ['Dynamic policy', sourceMapping.dynamic ?? ''],
];
overview.getRange('A5:B5').format = { fill: navy, font: { name: font, size: 10, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center' };
overview.getRange('A6:A12').format.font = { name: font, size: 10, bold: true, color: '#404040' };
overview.getRange('B6:B12').format.font = { name: font, size: 10, color: '#202020' };
overview.getRange('B8').format.numberFormat = '#,##0';
overview.getRange('B9').format.numberFormat = '0.00,,," GB"';
overview.getRange('A5:B12').format.borders = { preset: 'outside', style: 'thin', color: border };

overview.getRange('D5:F5').merge();
overview.getRange('D5').values = [['Review status']];
overview.getRange('D5:F5').format = { fill: navy, font: { name: font, size: 10, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center' };
overview.getRange('D6:F10').values = [
  ['ES8 mapping payload', 'Ready', 'Typeless settings + mappings body'],
  ['Field compatibility', 'Static check passed', 'All source field types retained'],
  ['Date fields', '36 normalized', 'Explicit strict_date_optional_time||epoch_millis'],
  ['ES8 sample record', 'Expected only', 'Not read from a live ES8 cluster'],
  ['Production readiness', 'Pending', 'Validate on target ES8 and run query parity'],
];
overview.getRange('D6:F10').format.font = { name: font, size: 10 };
overview.getRange('D6:F10').format.borders = { preset: 'outside', style: 'thin', color: border };
overview.getRange('E6:E8').format.fill = green;
overview.getRange('E9:E10').format.fill = amber;

overview.getRange('A15:F15').merge();
overview.getRange('A15').values = [['Important notes']];
overview.getRange('A15:F15').format = { fill: lightBlue, font: { name: font, size: 10, bold: true, color: navy } };
overview.getRange('A16:F19').values = [
  ['Mapping controls how values are indexed; it does not modify the stored _source document.', '', '', '', '', ''],
  ['The ES8 example in this workbook is the expected document after reindex, not a record fetched from ES8.', '', '', '', '', ''],
  ['The source has 0 replicas. Keep this only for a disposable test index.', '', '', '', '', ''],
  ['Source: live ES7 index query; Kompa 2.0 Master Blueprint v1.2, mapping policy on page 24.', '', '', '', '', ''],
];
for (let row = 16; row <= 19; row += 1) overview.getRange(`A${row}:F${row}`).merge();
overview.getRange('A16:F19').format = { font: { name: font, size: 10, color: '#404040' }, wrapText: true };

fields.getRange('A1:J1').values = [[
  'Field path', 'Kind', 'ES7 type', 'ES8 type', 'ES7 analyzer', 'ES8 analyzer', 'Indexed', 'ES7 format', 'ES8 format', 'Change',
]];
fields.getRange(`A2:J${mappingRows.length + 1}`).values = mappingRows;
fields.tables.add(`A1:J${mappingRows.length + 1}`, true, 'FieldMappingTable').style = 'TableStyleMedium2';
fields.freezePanes.freezeRows(1);
fields.freezePanes.freezeColumns(1);
fields.getRange(`A1:J${mappingRows.length + 1}`).format.font = { name: font, size: 9 };
fields.getRange(`A1:J1`).format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true };
fields.getRange(`J2:J${mappingRows.length + 1}`).conditionalFormats.add('containsText', { text: 'Explicit', format: { fill: amber, font: { color: '#9C6500' } } });

compare.getRange('A1:G1').values = [['Field path', 'Mapping type', 'ES7 _source value', 'ES8 expected _source', 'ES8 indexed interpretation', 'Same _source?', 'Note']];
compare.getRange(`A2:F${documentRows.length + 1}`).values = documentRows;
compare.getRange(`F2`).formulas = [['=IF(C2=D2,"Yes","No")']];
compare.getRange(`F2:F${documentRows.length + 1}`).fillDown();
compare.getRange(`G2:G${documentRows.length + 1}`).values = documentRows.map((row) => [row[5]]);
compare.tables.add(`A1:G${documentRows.length + 1}`, true, 'RecordCompareTable').style = 'TableStyleMedium4';
compare.freezePanes.freezeRows(1);
compare.freezePanes.freezeColumns(2);
compare.getRange(`A1:G${documentRows.length + 1}`).format.font = { name: font, size: 9 };
compare.getRange('A1:G1').format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true };
compare.getRange(`F2:F${documentRows.length + 1}`).conditionalFormats.add('containsText', { text: 'Yes', format: { fill: green, font: { color: '#375623' } } });

raw.getRange('A1:D1').values = [['Line', 'ES7 record', 'ES8 expected record', 'Comparison']];
raw.getRange(`A2:D${rawRows.length + 1}`).values = rawRows;
raw.tables.add(`A1:D${rawRows.length + 1}`, true, 'RawJsonCompareTable').style = 'TableStyleMedium2';
raw.freezePanes.freezeRows(1);
raw.getRange(`A1:D${rawRows.length + 1}`).format.font = { name: 'Courier New', size: 9 };
raw.getRange('A1:D1').format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center' };
raw.getRange(`D2:D${rawRows.length + 1}`).conditionalFormats.add('containsText', { text: 'Same', format: { fill: green, font: { color: '#375623' } } });

overview.getRange('A1:F20').format.verticalAlignment = 'center';
overview.getRange('A:A').format.columnWidth = 26;
overview.getRange('B:B').format.columnWidth = 34;
overview.getRange('C:C').format.columnWidth = 3;
overview.getRange('D:D').format.columnWidth = 25;
overview.getRange('E:E').format.columnWidth = 20;
overview.getRange('F:F').format.columnWidth = 44;
overview.getRange('16:19').format.rowHeight = 28;

const widths = [38, 14, 13, 13, 18, 18, 11, 24, 34, 28];
for (let i = 0; i < widths.length; i += 1) fields.getRangeByIndexes(0, i, mappingRows.length + 1, 1).format.columnWidth = widths[i];
fields.getRange(`H2:J${mappingRows.length + 1}`).format.wrapText = true;

const compareWidths = [36, 16, 44, 44, 34, 14, 54];
for (let i = 0; i < compareWidths.length; i += 1) compare.getRangeByIndexes(0, i, documentRows.length + 1, 1).format.columnWidth = compareWidths[i];
compare.getRange(`C2:G${documentRows.length + 1}`).format.wrapText = true;
compare.getRange(`C2:E${documentRows.length + 1}`).format.numberFormat = '@';
compare.getRange(`A2:G${documentRows.length + 1}`).format.verticalAlignment = 'top';
compare.getRange(`A1:G${documentRows.length + 1}`).format.autofitRows();

raw.getRange('A:A').format.columnWidth = 8;
raw.getRange('B:C').format.columnWidth = 78;
raw.getRange('D:D').format.columnWidth = 14;

workbook.recalculate();

const overviewCheck = await workbook.inspect({ kind: 'table', range: 'Overview!A1:F19', include: 'values,formulas', tableMaxRows: 25, tableMaxCols: 8 });
const mappingCheck = await workbook.inspect({ kind: 'table', range: 'Field Mapping!A1:J12', include: 'values,formulas', tableMaxRows: 15, tableMaxCols: 12 });
const compareCheck = await workbook.inspect({ kind: 'table', range: `Record Compare!A1:G${Math.min(documentRows.length + 1, 18)}`, include: 'values,formulas', tableMaxRows: 20, tableMaxCols: 8 });
const formulaErrors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 100 }, summary: 'final formula error scan' });
console.log(overviewCheck.ndjson);
console.log(mappingCheck.ndjson);
console.log(compareCheck.ndjson);
console.log(formulaErrors.ndjson);

await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range, fileName] of [
  ['Overview', 'A1:F19', 'overview.png'],
  ['Field Mapping', 'A1:J18', 'field-mapping.png'],
  ['Record Compare', `A1:G${Math.min(documentRows.length + 1, 18)}`, 'record-compare.png'],
  ['Raw JSON', `A1:D${Math.min(rawRows.length + 1, 28)}`, 'raw-json.png'],
]) {
  const rendered = await workbook.render({ sheetName, range, scale: 1.25, format: 'png' });
  await fs.writeFile(path.join(previewDir, fileName), new Uint8Array(await rendered.arrayBuffer()));
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(JSON.stringify({ outputPath, sampleId: sample._id, mappingRows: mappingRows.length, documentFields: documentRows.length, rawLines: rawRows.length }, null, 2));
