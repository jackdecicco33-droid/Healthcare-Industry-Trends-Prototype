const fs = require('fs');
const path = require('path');

const resources = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'resources.json'), 'utf8')
);

const resourcesByUrl = new Map();
for (const resource of resources) {
  const matches = resourcesByUrl.get(resource.url) || [];
  matches.push(resource.name);
  resourcesByUrl.set(resource.url, matches);
}

const urls = [...resourcesByUrl.keys()];
const results = [];
let nextIndex = 0;

async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; HealthcareResourceLinkAudit/1.0)',
        accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8'
      }
    });

    return {
      url,
      status: response.status,
      finalUrl: response.url,
      category: response.status === 404 || response.status === 410
        ? 'broken'
        : response.status >= 200 && response.status < 400
          ? 'working'
          : response.status === 401 || response.status === 403 || response.status === 429
            ? 'manual'
            : 'error'
    };
  } catch (error) {
    return {
      url,
      status: null,
      finalUrl: null,
      category: 'manual',
      error: error.name === 'AbortError' ? 'Timed out' : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function worker() {
  while (nextIndex < urls.length) {
    const index = nextIndex++;
    const result = await checkUrl(urls[index]);
    results[index] = result;
    process.stdout.write('.');
  }
}

async function main() {
  await Promise.all(Array.from({ length: 8 }, worker));
  process.stdout.write('\n');

  const report = results.map(result => ({
    ...result,
    resources: resourcesByUrl.get(result.url)
  }));

  const counts = report.reduce((summary, result) => {
    summary[result.category] = (summary[result.category] || 0) + 1;
    return summary;
  }, {});

  console.log(JSON.stringify({ checked: report.length, counts, results: report }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
