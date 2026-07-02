const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const root = path.resolve(__dirname, '..');
const workbookPath = path.join(root, 'data', 'Resources and Terminology for Healthcare Indsutry Trends Website.xlsx');
const resourcesOutputPath = path.join(root, 'data', 'resources.json');
const terminologyOutputPath = path.join(root, 'data', 'terminology.json');
const signalsOutputPath = path.join(root, 'data', 'healthcare-signals.json');
const frontendDataModulePath = path.join(root, 'data.js');

const resourceSheetName = 'Healthcare Resources';
const terminologySheetName = 'Healthcare Terminology';
const signalsSheetName = "Today's Healthcare Signal";
const hyperlinkHeaders = new Set(['Link to The Source', 'Link']);
const approvedTerminologyCategories = new Set([
  'Revenue Cycle',
  'Labor',
  'Quality',
  'ERP',
  'Healthcare Consulting 101',
  'Supply Chain',
  'Clinical Optimization',
  'Physician Enterprise'
]);

function cleanValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function decodeUrl(value) {
  return cleanValue(value).replace(/&amp;/g, '&');
}

function isValidUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getDomain(value) {
  if (!isValidUrl(value)) return '';
  return new URL(value).hostname.replace(/^www\./, '');
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
        hyperlinkHeaders.has(header) && cell && cell.l && cell.l.Target
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
  const hasValidUrl = isValidUrl(url);
  const description = `Resource from ${website || 'the listed website'} focused on ${serviceLine || 'healthcare consulting'}.`;

  return {
    title,
    website,
    sourceType,
    serviceLine,
    level,
    url,
    hasValidUrl,
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

function toSignalSource(row) {
  const websiteName = cleanValue(row['Website Name']);
  const link = decodeUrl(row.Link);
  const hasValidUrl = isValidUrl(link);
  const domain = getDomain(link);

  return {
    websiteName,
    source: websiteName,
    title: `${websiteName || 'Approved healthcare source'} healthcare signal source`,
    url: link,
    hasValidUrl,
    domain,
    trustLevel: 'Approved Source',
    serviceLine: 'Healthcare Signal',
    date: 'Check source for latest updates',
    summary: `Approved healthcare signal source from the Excel workbook: ${websiteName || 'listed source'}.`,
    consultingLens: 'Use this approved source to monitor current healthcare news, policy movement, and industry signals.'
  };
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeFrontendDataModule(resources, terminology, signals) {
  const moduleSource = [
    '// Generated by scripts/excel-to-json.js from the Excel workbook.',
    '// Active frontend source for Resource Library, Learn the Language, and Today\'s Healthcare Signal.',
    '// Do not edit by hand; run npm run build:data after updating the workbook.',
    `export const healthcareResources = ${JSON.stringify(resources, null, 2)};`,
    `export const healthcareTerminology = ${JSON.stringify(terminology, null, 2)};`,
    `export const approvedSignalSources = ${JSON.stringify(signals, null, 2)};`,
    ''
  ].join('\n\n');

  fs.writeFileSync(frontendDataModulePath, moduleSource, 'utf8');
}

function main() {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }

  const workbook = xlsx.readFile(workbookPath);
  const resourceRows = getRows(workbook, resourceSheetName);
  const terminologyRows = getRows(workbook, terminologySheetName);
  const signalRows = getRows(workbook, signalsSheetName);

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
  requireHeaders(
    signalRows,
    ['Website Name', 'Link'],
    signalsSheetName
  );

  const resources = uniqueBy(
    resourceRows.map(toResource).filter((resource) => resource.title || resource.url),
    (resource) => `${resource.title.toLowerCase()}|${resource.website.toLowerCase()}|${resource.url.toLowerCase()}`
  );
  const terminology = uniqueBy(
    terminologyRows
      .map(toTerminology)
      .filter((term) => (term.term || term.definition) && approvedTerminologyCategories.has(term.category)),
    (term) => `${term.term.toLowerCase()}|${term.category.toLowerCase()}`
  );
  const signals = uniqueBy(
    signalRows.map(toSignalSource).filter((source) => source.websiteName && source.hasValidUrl),
    (source) => `${source.websiteName.toLowerCase()}|${source.domain || source.url.toLowerCase()}`
  );

  writeJson(resourcesOutputPath, resources);
  writeJson(terminologyOutputPath, terminology);
  writeJson(signalsOutputPath, signals);
  writeFrontendDataModule(resources, terminology, signals);

  console.log(`Converted ${resources.length} resources to ${path.relative(root, resourcesOutputPath)}`);
  console.log(`Converted ${terminology.length} terminology terms to ${path.relative(root, terminologyOutputPath)}`);
  console.log(`Converted ${signals.length} approved healthcare signal sources to ${path.relative(root, signalsOutputPath)}`);
  console.log(`Wrote frontend data module to ${path.relative(root, frontendDataModulePath)}`);
}

main();
