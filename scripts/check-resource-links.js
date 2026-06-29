const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESOURCES_PATH = path.join(DATA_DIR, 'resources.json');
const REPORT_PATH = path.join(DATA_DIR, 'resource-link-audit.json');
const URL_FIELDS = ['url', 'link', 'sourceUrl', 'href'];
const TIMEOUT_MS = 15000;
const CONCURRENCY = 8;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function normalizeUrl(value) {
  return String(value || '').trim();
}

function getResourceUrls(resource) {
  return URL_FIELDS
    .filter(field => Object.prototype.hasOwnProperty.call(resource, field))
    .map(field => ({ field, url: normalizeUrl(resource[field]) }));
}

function isInvalidUrl(url) {
  if (!url) return true;

  try {
    const parsed = new URL(url);
    return !['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return true;
  }
}

function hasSuspiciousErrorDestination(finalUrl) {
  const value = String(finalUrl || '').toLowerCase();
  return /(?:^|\/)(404|not-found|notfound|page-not-found|error|unavailable|missing)(?:[/?#-]|$)/i.test(value);
}

function pageLooksUnavailable(html) {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, 5000);

  return [
    'page not found',
    '404 not found',
    'content not found',
    'resource not found',
    'this page is unavailable',
    'the page you requested could not be found',
    'the requested url was not found',
    'this course is no longer available',
    'this page no longer exists'
  ].some(pattern => text.includes(pattern));
}

async function requestUrl(url, method) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: method === 'HEAD'
          ? '*/*'
          : 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; HealthcareResourceLinkAudit/1.0)'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function classifyHttpResponse(response, originalUrl, bodyLooksUnavailable = false) {
  const statusCode = response.status;
  const finalUrl = response.url || originalUrl;
  const redirected = finalUrl !== originalUrl;

  if ([404, 410].includes(statusCode)) {
    return {
      status: 'broken',
      issue: `HTTP ${statusCode}`
    };
  }

  if (statusCode >= 500) {
    return {
      status: 'broken',
      issue: `HTTP ${statusCode} server error`
    };
  }

  if (hasSuspiciousErrorDestination(finalUrl)) {
    return {
      status: 'broken',
      issue: 'Redirected to a generic error or unavailable page'
    };
  }

  if (bodyLooksUnavailable) {
    return {
      status: 'broken',
      issue: 'Page content appears to be unavailable or not found'
    };
  }

  if ([401, 403, 429].includes(statusCode)) {
    return {
      status: 'manual-review',
      issue: `HTTP ${statusCode}; site may block automated checks`
    };
  }

  if (statusCode >= 200 && statusCode < 400) {
    return {
      status: redirected ? 'redirected' : 'working',
      issue: redirected ? 'Redirected but reachable' : ''
    };
  }

  return {
    status: 'manual-review',
    issue: `Unexpected HTTP ${statusCode}`
  };
}

function classifyFetchError(error) {
  if (error.name === 'AbortError') {
    return 'Connection timeout';
  }

  const message = String(error.message || error);
  if (/ENOTFOUND|getaddrinfo|DNS|fetch failed/i.test(message)) {
    return 'DNS lookup failure or network fetch failure';
  }

  return message;
}

async function checkUrl(url) {
  if (isInvalidUrl(url)) {
    return {
      status: 'broken',
      statusCode: '',
      finalUrl: '',
      issue: url ? 'Invalid URL' : 'Empty URL'
    };
  }

  try {
    let response = await requestUrl(url, 'HEAD');

    if ([403, 405, 501].includes(response.status)) {
      response = await requestUrl(url, 'GET');
    }

    let bodyLooksUnavailable = false;
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('text/html')) {
      try {
        const html = await response.text();
        bodyLooksUnavailable = pageLooksUnavailable(html);
      } catch {
        bodyLooksUnavailable = false;
      }
    }

    const classification = classifyHttpResponse(response, url, bodyLooksUnavailable);
    return {
      status: classification.status,
      statusCode: response.status,
      finalUrl: response.url || url,
      issue: classification.issue
    };
  } catch (error) {
    return {
      status: 'broken',
      statusCode: '',
      finalUrl: '',
      issue: classifyFetchError(error)
    };
  }
}

function toResult(resource, urlInfo, audit) {
  return {
    name: resource.name || resource.title || '',
    organization: resource.organization || '',
    category: resource.category || '',
    serviceLine: resource.serviceLine || '',
    url: urlInfo.url,
    status: audit.status,
    statusCode: audit.statusCode,
    finalUrl: audit.finalUrl,
    issue: audit.issue
  };
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
      process.stdout.write('.');
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, runWorker));
  process.stdout.write('\n');
  return results;
}

async function main() {
  const resources = readJson(RESOURCES_PATH);
  const linkItems = [];

  for (const resource of resources) {
    for (const urlInfo of getResourceUrls(resource)) {
      linkItems.push({ resource, urlInfo });
    }
  }

  const results = await runPool(linkItems, async ({ resource, urlInfo }) => {
    const audit = await checkUrl(urlInfo.url);
    return toResult(resource, urlInfo, audit);
  });

  const summary = {
    checkedAt: new Date().toISOString(),
    totalResources: resources.length,
    totalLinksChecked: results.length,
    workingLinks: results.filter(result => result.status === 'working').length,
    brokenLinks: results.filter(result => result.status === 'broken').length,
    redirectedLinks: results.filter(result => result.status === 'redirected').length,
    results
  };

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`Total links checked: ${summary.totalLinksChecked}`);
  console.log(`Working links: ${summary.workingLinks}`);
  console.log(`Broken links: ${summary.brokenLinks}`);
  console.log(`Redirected links: ${summary.redirectedLinks}`);
  console.log(`Report saved to: ${REPORT_PATH}`);
}

main().catch(error => {
  console.error('Resource link audit failed.');
  console.error(error);
  process.exit(1);
});
