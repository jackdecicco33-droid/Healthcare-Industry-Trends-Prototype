const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESOURCES_PATH = path.join(DATA_DIR, 'resources.json');
const AUDIT_PATH = path.join(DATA_DIR, 'resource-link-audit.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'resources.cleaned.json');
const URL_FIELDS = ['url', 'link', 'sourceUrl', 'href'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function normalize(value) {
  return String(value || '').trim();
}

function getResourceUrls(resource) {
  return URL_FIELDS
    .filter(field => Object.prototype.hasOwnProperty.call(resource, field))
    .map(field => normalize(resource[field]));
}

function makeResourceKey(resource, url) {
  return [
    normalize(resource.name || resource.title),
    normalize(resource.organization),
    normalize(url)
  ].join('|').toLowerCase();
}

function main() {
  if (!fs.existsSync(AUDIT_PATH)) {
    throw new Error(`Audit file not found: ${AUDIT_PATH}. Run npm run check:links first.`);
  }

  const resources = readJson(RESOURCES_PATH);
  const audit = readJson(AUDIT_PATH);
  const brokenResults = (audit.results || []).filter(result => result.status === 'broken');
  const brokenKeys = new Set(
    brokenResults.map(result => makeResourceKey(result, result.url))
  );

  const cleaned = [];
  const removed = [];

  for (const resource of resources) {
    const urls = getResourceUrls(resource);
    const isBroken = urls.some(url => brokenKeys.has(makeResourceKey(resource, url)));

    if (isBroken) {
      removed.push({
        name: resource.name || resource.title || '',
        organization: resource.organization || '',
        urls
      });
      continue;
    }

    cleaned.push(resource);
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf8');

  console.log(`Original resources: ${resources.length}`);
  console.log(`Broken audit results: ${brokenResults.length}`);
  console.log(`Resources removed from cleaned copy: ${removed.length}`);
  console.log(`Cleaned file written to: ${OUTPUT_PATH}`);
  console.log('Original data/resources.json was not changed.');
}

main();
