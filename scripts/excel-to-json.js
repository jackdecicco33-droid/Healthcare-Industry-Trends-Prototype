const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const root = path.resolve(__dirname, '..');
const workbookPath = path.join(root, 'data', 'Resources and Terminology for Healthcare Indsutry Trends Website.xlsx');
const resourcesOutputPath = path.join(root, 'data', 'resources.json');
const terminologyOutputPath = path.join(root, 'data', 'terminology.json');
const signalsOutputPath = path.join(root, 'data', 'healthcare-signals.json');
const skippedSignalsOutputPath = path.join(root, 'data', 'healthcare-signals-skipped.json');
const frontendDataModulePath = path.join(root, 'data.js');

const resourceSheetName = 'Healthcare Resources';
const terminologySheetName = 'Healthcare Terminology';
const signalsSheetName = "Today's Healthcare Signal";
const hyperlinkHeaders = new Set(['Link to The Source', 'Link']);
const genericSignalPaths = new Set(['', '/', '/news', '/news/', '/articles', '/articles/', '/topics', '/topics/', '/resources', '/resources/']);
const genericSignalPathSegments = new Set(['topic', 'topics', 'category', 'categories', 'tag', 'tags']);

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

function getDirectSignalUrlIssue(value) {
  if (!isValidUrl(value)) return 'Missing or invalid URL';

  const parsed = new URL(value);
  const pathName = parsed.pathname.replace(/\/+$/, '') || '/';
  if (genericSignalPaths.has(parsed.pathname.toLowerCase()) || genericSignalPaths.has(pathName.toLowerCase())) {
    return 'URL appears to be a publisher homepage, topic page, or general listing page';
  }

  const pathSegments = parsed.pathname
    .split('/')
    .map((segment) => segment.toLowerCase())
    .filter(Boolean);
  if (pathSegments.some((segment) => genericSignalPathSegments.has(segment))) {
    return 'URL appears to be a topic, category, tag, or listing page rather than a direct article';
  }

  return '';
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

function toSignalArticle(row, rowNumber) {
  const title = cleanValue(row['Title of Source']);
  const website = cleanValue(row.Website);
  const link = decodeUrl(row['Link to The Source']);
  const directUrlIssue = getDirectSignalUrlIssue(link);
  const domain = getDomain(link);

  return {
    rowNumber,
    title,
    website,
    websiteName: website,
    source: website,
    url: link,
    hasValidUrl: !directUrlIssue,
    domain,
    directUrlIssue,
    trustLevel: 'Direct Article',
    serviceLine: 'Healthcare Signal',
    date: 'Check article for publication date',
    summary: `Article from ${website || domain || 'the listed source'}.`,
    consultingLens: 'Use this direct healthcare signal to monitor current healthcare news, policy movement, and industry trends.'
  };
}

function toSkippedSignal(article) {
  return {
    rowNumber: article.rowNumber,
    title: article.title,
    website: article.website,
    url: article.url,
    reason: article.directUrlIssue || 'Missing title or direct URL'
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
    ['Title of Source', 'Website', 'Link to The Source'],
    signalsSheetName
  );

  const resources = uniqueBy(
    resourceRows.map(toResource).filter((resource) => resource.title || resource.url),
    (resource) => `${resource.title.toLowerCase()}|${resource.url.toLowerCase()}`
  );
  const terminology = uniqueBy(
    terminologyRows
      .map(toTerminology)
      .filter((term) => term.term || term.definition),
    (term) => `${term.term.toLowerCase()}|${term.category.toLowerCase()}`
  );
  const signalArticles = signalRows.map((row, index) => toSignalArticle(row, index + 2));
  const signals = uniqueBy(
    signalArticles.filter((article) => article.title && article.hasValidUrl),
    (article) => `${article.title.toLowerCase()}|${article.url.toLowerCase()}`
  );
  const skippedSignals = signalArticles
    .filter((article) => !article.title || !article.hasValidUrl)
    .map(toSkippedSignal);

  writeJson(resourcesOutputPath, resources);
  writeJson(terminologyOutputPath, terminology);
  writeJson(signalsOutputPath, signals);
  writeJson(skippedSignalsOutputPath, skippedSignals);
  writeFrontendDataModule(resources, terminology, signals);

  console.log(`Converted ${resources.length} resources to ${path.relative(root, resourcesOutputPath)}`);
  console.log(`Converted ${terminology.length} terminology terms to ${path.relative(root, terminologyOutputPath)}`);
  console.log(`Converted ${signals.length} healthcare signal articles to ${path.relative(root, signalsOutputPath)}`);
  console.log(`Skipped ${skippedSignals.length} healthcare signal row(s); wrote ${path.relative(root, skippedSignalsOutputPath)}`);
  skippedSignals.forEach((item) => {
    console.log(`Skipped signal row ${item.rowNumber}: ${item.reason}${item.title ? ` | ${item.title}` : ''}${item.website ? ` | ${item.website}` : ''}${item.url ? ` | ${item.url}` : ''}`);
  });
  console.log(`Wrote frontend data module to ${path.relative(root, frontendDataModulePath)}`);
}

main();
