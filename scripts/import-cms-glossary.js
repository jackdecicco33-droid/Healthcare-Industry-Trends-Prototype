const fs = require('fs');
const path = require('path');

const CMS_GLOSSARY_URL = 'https://www.cms.gov/glossary';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'cms-glossary.json');
const ITEMS_PER_PAGE = 30;
const MAX_PAGES = 120;
const EMPTY_PAGE_LIMIT = 2;
const DUPLICATE_PAGE_LIMIT = 2;

function decodeHtml(value = '') {
  const entities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"'
  };

  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|td|th|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

function createCmsGlossaryItem(term, definition) {
  return {
    term,
    definition,
    category: 'CMS Glossary',
    source: 'CMS Glossary',
    url: CMS_GLOSSARY_URL
  };
}

function extractByViewsTable(html) {
  const terms = [];
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    const titleMatch = row.match(/<td[^>]*views-field-title[^>]*>([\s\S]*?)<\/td>/i);
    const bodyMatch = row.match(/<td[^>]*views-field-body[^>]*>([\s\S]*?)<\/td>/i);
    if (!titleMatch || !bodyMatch) continue;

    const term = decodeHtml(titleMatch[1]).replace(/\*$/, '').trim();
    const definition = decodeHtml(bodyMatch[1]);
    if (term && definition) {
      terms.push(createCmsGlossaryItem(term, definition));
    }
  }

  return terms;
}

function extractByGenericTable(html) {
  const terms = [];
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => match[1]);
    if (cells.length < 2) continue;

    const term = decodeHtml(cells[0]).replace(/\*$/, '').trim();
    const definition = decodeHtml(cells.slice(1).join(' '));
    const looksLikeHeader = /^(term|definition|sort|view)$/i.test(term);
    if (term && definition && !looksLikeHeader && term.length < 180) {
      terms.push(createCmsGlossaryItem(term, definition));
    }
  }

  return terms;
}

function extractByDefinitionList(html) {
  const terms = [];
  const items = html.match(/<(article|div|li)\b[^>]*(?:class="[^"]*(?:glossary|views-row)[^"]*"|data-[^=]+="[^"]*")[^>]*>[\s\S]*?<\/\1>/gi) || [];

  for (const item of items) {
    const headingMatch =
      item.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i) ||
      item.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const paragraphMatch = item.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!headingMatch || !paragraphMatch) continue;

    const term = decodeHtml(headingMatch[1]).replace(/\*$/, '').trim();
    const definition = decodeHtml(paragraphMatch[1]);
    if (term && definition && term.length < 160) {
      terms.push(createCmsGlossaryItem(term, definition));
    }
  }

  return terms;
}

function parseGlossaryPage(html, pageNumber) {
  const terms = [
    ...extractByViewsTable(html),
    ...extractByGenericTable(html),
    ...extractByDefinitionList(html)
  ];

  const unique = new Map();
  for (const item of terms) {
    unique.set(item.term.toLowerCase(), item);
  }

  const pageTerms = [...unique.values()];
  if (!pageTerms.length) {
    console.warn(`No CMS glossary terms found on page ${pageNumber}. CMS may have changed the page structure or blocked the request.`);
  }

  return pageTerms;
}

async function fetchGlossaryPage(pageIndex) {
  const pageNumber = pageIndex + 1;
  const url = `${CMS_GLOSSARY_URL}?page=${pageIndex}&items_per_page=${ITEMS_PER_PAGE}&viewmode=list`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; HealthcareGlossaryImporter/1.0; +https://www.cms.gov/glossary)'
      }
    });
  } catch (error) {
    throw new Error(`Could not reach CMS glossary page ${pageNumber}. Check your internet connection or CMS.gov availability. ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`CMS glossary page ${pageNumber} returned HTTP ${response.status}. CMS.gov may be blocking the request or the URL may have changed.`);
  }

  const html = await response.text();
  return parseGlossaryPage(html, pageNumber);
}

function dedupeAndSort(terms) {
  const byTerm = new Map();

  for (const item of terms) {
    if (!item.term || !item.definition) continue;
    const key = item.term.trim().toLowerCase();
    if (!byTerm.has(key)) {
      byTerm.set(key, {
        term: item.term.trim(),
        definition: item.definition.trim(),
        category: 'CMS Glossary',
        source: 'CMS Glossary',
        url: CMS_GLOSSARY_URL
      });
    }
  }

  return [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term));
}

function saveTerms(terms) {
  const json = `${JSON.stringify(terms, null, 2)}\n`;
  if (!json.trim().startsWith('[') || !json.trim().endsWith(']')) {
    throw new Error('Generated CMS glossary JSON is not an array. Output was not saved.');
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, json, 'utf8');
}

async function main() {
  console.log(`Importing CMS glossary terms from ${CMS_GLOSSARY_URL}`);

  const allTerms = [];
  let emptyPages = 0;
  let duplicatePages = 0;
  const seenTerms = new Set();

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const pageTerms = await fetchGlossaryPage(pageIndex);

    if (!pageTerms.length) {
      emptyPages += 1;
      if (emptyPages >= EMPTY_PAGE_LIMIT) {
        console.log(`Stopping after ${EMPTY_PAGE_LIMIT} empty CMS glossary pages.`);
        break;
      }
      continue;
    }

    emptyPages = 0;
    const newTerms = pageTerms.filter(item => !seenTerms.has(item.term.toLowerCase()));
    for (const item of newTerms) {
      seenTerms.add(item.term.toLowerCase());
    }

    if (!newTerms.length) {
      duplicatePages += 1;
      console.log(`Page ${pageIndex + 1}: found ${pageTerms.length} terms, but all were duplicates.`);
      if (duplicatePages >= DUPLICATE_PAGE_LIMIT) {
        console.log(`Stopping after ${DUPLICATE_PAGE_LIMIT} duplicate CMS glossary pages.`);
        break;
      }
      continue;
    }

    duplicatePages = 0;
    allTerms.push(...pageTerms);
    console.log(`Page ${pageIndex + 1}: found ${pageTerms.length} terms (${newTerms.length} new)`);
  }

  const terms = dedupeAndSort(allTerms);
  if (!terms.length) {
    throw new Error('No CMS glossary terms were imported. CMS.gov may have changed the page structure or blocked automated requests.');
  }

  saveTerms(terms);
  console.log(`Imported ${terms.length} unique CMS glossary terms into ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error('CMS glossary import failed.');
  console.error(error.message);
  process.exit(1);
});
