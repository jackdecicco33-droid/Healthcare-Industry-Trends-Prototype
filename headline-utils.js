function normalizedTitle(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid']
      .forEach(parameter => url.searchParams.delete(parameter));
    url.searchParams.sort();
    return url.toString();
  } catch {
    return String(value || '').trim().toLowerCase();
  }
}

function publicationTime(article) {
  const value = article?.date;
  if (!value || /check (article|source)/i.test(String(value))) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

export function prepareHeadlineDataset(articles) {
  const seenUrls = new Set();
  const seenTitles = new Set();

  return (Array.isArray(articles) ? articles : [])
    .filter(article => article?.title && article?.url)
    .filter(article => {
      const urlKey = normalizedUrl(article.url);
      const titleKey = normalizedTitle(article.title);
      if (!urlKey || !titleKey || seenUrls.has(urlKey) || seenTitles.has(titleKey)) return false;
      seenUrls.add(urlKey);
      seenTitles.add(titleKey);
      return true;
    })
    .sort((a, b) => publicationTime(b) - publicationTime(a));
}

export function selectHeadlineArticles(articles, primaryArticle = null, supportingCount = 3) {
  const dataset = prepareHeadlineDataset(articles);
  const requestedUrl = normalizedUrl(primaryArticle?.url);
  const requestedTitle = normalizedTitle(primaryArticle?.title);
  const primary = dataset.find(article =>
    (requestedUrl && normalizedUrl(article.url) === requestedUrl) ||
    (requestedTitle && normalizedTitle(article.title) === requestedTitle)
  ) || dataset[0] || null;
  const supporting = dataset.filter(article => article !== primary).slice(0, supportingCount);
  return { primary, supporting, dataset };
}
