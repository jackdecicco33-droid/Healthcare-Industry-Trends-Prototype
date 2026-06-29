const fs = require('fs');
const path = require('path');

let PDFDocument;
try {
  PDFDocument = require('pdfkit');
} catch (error) {
  console.error('PDF generation requires the "pdfkit" package.');
  console.error('Run "npm install" from the project folder, then try again.');
  process.exit(1);
}

const DATA_PATH = path.join(__dirname, '..', 'data', 'resources.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'assets', 'Healthcare_Resource_Library_Guide.pdf');
const URL_FIELDS = ['url', 'link', 'sourceUrl', 'href'];

const colors = {
  navy: '#073f68',
  blue: '#16527a',
  green: '#5b9b3f',
  slate: '#526978',
  border: '#d9e7f2'
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function clean(value, fallback = 'Not provided') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function getResourceUrl(resource) {
  for (const field of URL_FIELDS) {
    const value = clean(resource[field], '');
    if (value) return value;
  }
  return '';
}

function groupResources(resources) {
  const grouped = new Map();

  for (const resource of resources) {
    const serviceLine = clean(resource.serviceLine, 'General Healthcare');
    const category = clean(resource.category, 'General resources');

    if (!grouped.has(serviceLine)) grouped.set(serviceLine, new Map());
    const categoryMap = grouped.get(serviceLine);
    if (!categoryMap.has(category)) categoryMap.set(category, []);
    categoryMap.get(category).push(resource);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([serviceLine, categoryMap]) => [
      serviceLine,
      [...categoryMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, items]) => [
          category,
          items.sort((a, b) => clean(a.name || a.title).localeCompare(clean(b.name || b.title)))
        ])
    ]);
}

function ensureSpace(doc, neededHeight = 90) {
  if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function addFooter(doc) {
  const pageRange = doc.bufferedPageRange();
  for (let index = pageRange.start; index < pageRange.start + pageRange.count; index += 1) {
    doc.switchToPage(index);
    const pageNumber = index + 1;
    doc
      .fontSize(8)
      .fillColor(colors.slate)
      .text(
        `Healthcare Resource Library Guide  |  Page ${pageNumber}`,
        doc.page.margins.left,
        doc.page.height - 36,
        { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
      );
  }
}

function addTitlePage(doc, resources) {
  const generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  doc
    .fillColor(colors.green)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('Healthcare Advisory Resource Hub', { align: 'center' })
    .moveDown(1.5)
    .fillColor(colors.navy)
    .fontSize(30)
    .text('Healthcare Resource Library Guide', { align: 'center' })
    .moveDown()
    .font('Helvetica')
    .fontSize(13)
    .fillColor(colors.slate)
    .text(`Generated ${generatedDate}`, { align: 'center' })
    .moveDown(2)
    .fontSize(11)
    .text(
      `This guide includes ${resources.length} resources currently listed in the website Resource Library. Resources are organized by service line and resource category.`,
      { align: 'center', lineGap: 4 }
    );
}

function addTableOfContents(doc, grouped) {
  doc.addPage();
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(colors.navy)
    .text('Table of Contents')
    .moveDown(0.8);

  for (const [serviceLine, categories] of grouped) {
    ensureSpace(doc, 45);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(colors.blue)
      .text(serviceLine);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(colors.slate)
      .text(categories.map(([category, items]) => `${category} (${items.length})`).join('  •  '), {
        lineGap: 2
      })
      .moveDown(0.5);
  }
}

function addResource(doc, resource) {
  const name = clean(resource.name || resource.title, 'Untitled resource');
  const organization = clean(resource.organization || resource.source, 'Resource');
  const serviceLine = clean(resource.serviceLine, 'General Healthcare');
  const level = clean(resource.level, 'All levels');
  const category = clean(resource.category, 'General resources');
  const description = clean(resource.description, 'No description provided.');
  const url = getResourceUrl(resource);

  ensureSpace(doc, 145);

  const startY = doc.y;
  doc
    .roundedRect(doc.page.margins.left, startY, doc.page.width - doc.page.margins.left - doc.page.margins.right, 1, 0)
    .fill(colors.border);

  doc
    .moveDown(0.8)
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(colors.navy)
    .text(name, { lineGap: 2 })
    .moveDown(0.2)
    .font('Helvetica')
    .fontSize(9)
    .fillColor(colors.slate)
    .text(`Organization/source: ${organization}`)
    .text(`Service line: ${serviceLine}`)
    .text(`Level: ${level}`)
    .text(`Resource category: ${category}`)
    .moveDown(0.3)
    .fontSize(10)
    .fillColor('#263f50')
    .text(description, { lineGap: 3 });

  if (url) {
    doc
      .moveDown(0.25)
      .fontSize(9)
      .fillColor(colors.green)
      .text(`Link: ${url}`, { link: url, underline: true });
  }

  doc.moveDown(0.9);
}

function addResources(doc, grouped) {
  for (const [serviceLine, categories] of grouped) {
    doc.addPage();
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(colors.navy)
      .text(serviceLine)
      .moveDown(0.6);

    for (const [category, resources] of categories) {
      ensureSpace(doc, 70);
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor(colors.green)
        .text(category)
        .font('Helvetica')
        .fontSize(9)
        .fillColor(colors.slate)
        .text(`${resources.length} resource${resources.length === 1 ? '' : 's'}`)
        .moveDown(0.4);

      for (const resource of resources) {
        addResource(doc, resource);
      }
    }
  }
}

async function main() {
  const resources = readJson(DATA_PATH);
  const grouped = groupResources(resources);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 54, right: 54, bottom: 54, left: 54 },
    bufferPages: true,
    info: {
      Title: 'Healthcare Resource Library Guide',
      Author: 'Healthcare Advisory Resource Hub',
      Subject: 'Current website Resource Library export'
    }
  });

  const stream = fs.createWriteStream(OUTPUT_PATH);
  doc.pipe(stream);

  addTitlePage(doc, resources);
  addTableOfContents(doc, grouped);
  addResources(doc, grouped);
  addFooter(doc);
  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  console.log(`Generated resource library PDF with ${resources.length} resources.`);
  console.log(`Saved to: ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error('Failed to generate Healthcare Resource Library Guide PDF.');
  console.error(error);
  process.exit(1);
});
