const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const root = path.resolve(__dirname, '..');
const workbookPath = path.join(root, 'data', 'Resources and Terminology for Healthcare Indsutry Trends Website.xlsx');
const resourcesOutputPath = path.join(root, 'data', 'resources.json');
const terminologyOutputPath = path.join(root, 'data', 'terminology.json');

const resourceSheetName = 'Healthcare Resources';
const terminologySheetName = 'Healthcare Terminology';

function cleanValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function decodeUrl(value) {
  return cleanValue(value).replace(/&amp;/g, '&');
}

function hasAnyValue(row) {
  return Object.values(row).some((value) => cleanValue(value));
}

function getRows(workbook, sheetName) {
  const actualSheetName = workbook.SheetNames.find((name) => cleanValue(name) === sheetName);
  const sheet = actualSheetName ? workbook.Sheets[actualSheetName] : null;
  if (!sheet) {
    throw new Error(`Missing required sheet: ${sheetName}`);
  }

  const range = xlsx.utils.decode_range(sheet['!ref']);
  const headers = [];

  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[xlsx.utils.encode_cell({ r: range.s.r, c: column })];
    const header = cleanValue(cell && (cell.w ?? cell.v));
    if (header) {
      headers.push({ header, column });
    }
  }

  const rows = [];
  for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const row = {};
    headers.forEach(({ header, column }) => {
      const cell = sheet[xlsx.utils.encode_cell({ r: rowIndex, c: column })];
      const value =
        header === 'Link to The Source' && cell && cell.l && cell.l.Target
          ? cell.l.Target
          : cell && (cell.w ?? cell.v);

      row[header] = cleanValue(value);
    });

    if (hasAnyValue(row)) {
      rows.push(row);
    }
  }

  return rows;
}

function requireHeaders(rows, headers, sheetName) {
  const availableHeaders = new Set(Object.keys(rows[0] || {}));
  const missingHeaders = headers.filter((header) => !availableHeaders.has(header));

  if (missingHeaders.length) {
    throw new Error(`${sheetName} is missing required column header(s): ${missingHeaders.join(', ')}`);
  }
}

function toResource(row) {
  const title = cleanValue(row['Title of Source']);
  const website = cleanValue(row.Website);
  const sourceType = cleanValue(row['What Type of Source']);
  const serviceLine = cleanValue(row['Service Line']);
  const level = cleanValue(row.Level);
  const url = decodeUrl(row['Link to The Source']);
  const description = `Resource from ${website || 'the listed website'} focused on ${serviceLine || 'healthcare consulting'}.`;

  return {
    title,
    website,
    sourceType,
    serviceLine,
    level,
    url,
    name: title,
    organization: website,
    category: sourceType,
    description
  };
}

function toTerminology(row) {
  const term = cleanValue(row['Term Name']);
  const category = cleanValue(row.Category);
  const definition = cleanValue(row.Definition);
  const sourceName = cleanValue(row.Source);
  const example = cleanValue(row['Real World Example']);

  return {
    term,
    category,
    definition,
    sourceName,
    source: sourceName,
    example
  };
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function main() {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }

  const workbook = xlsx.readFile(workbookPath);
  const resourceRows = getRows(workbook, resourceSheetName);
  const terminologyRows = getRows(workbook, terminologySheetName);

  requireHeaders(
    resourceRows,
    ['Title of Source', 'Website', 'What Type of Source', 'Service Line', 'Level', 'Link to The Source'],
    resourceSheetName
  );
  requireHeaders(
    terminologyRows,
    ['Term Name', 'Category', 'Definition', 'Source', 'Real World Example'],
    terminologySheetName
  );

  const resources = resourceRows.map(toResource).filter((resource) => resource.title || resource.url);
  const terminology = terminologyRows.map(toTerminology).filter((term) => term.term || term.definition);

  writeJson(resourcesOutputPath, resources);
  writeJson(terminologyOutputPath, terminology);

  console.log(`Converted ${resources.length} resources to ${path.relative(root, resourcesOutputPath)}`);
  console.log(`Converted ${terminology.length} terminology terms to ${path.relative(root, terminologyOutputPath)}`);
}

main();
