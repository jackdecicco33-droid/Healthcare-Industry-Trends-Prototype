const HEADLINE_TIMEZONE = 'America/Chicago';
const DAILY_HEADLINE_COUNT = 4;
const RECENT_HISTORY_DAYS = 7;

const DEFAULT_HEADLINE_FEEDS = [
  { publisher: 'Healthcare Dive', url: 'https://www.healthcaredive.com/feeds/news/' },
  { publisher: 'KFF Health News', url: 'https://kffhealthnews.org/feed/' },
  { publisher: 'Fierce Healthcare', url: 'https://www.fiercehealthcare.com/rss/xml' },
  { publisher: "Becker's Hospital Review", url: 'https://www.beckershospitalreview.com/feed/' }
];

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readTag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return decodeXml(match[1]);
  }
  return '';
}

function readLink(block) {
  const textLink = readTag(block, ['link', 'guid']);
  if (/^https?:\/\//i.test(textLink)) return textLink;
  const atomLink = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  return atomLink ? decodeXml(atomLink[1]) : '';
}

function parseFeed(xml, publisher) {
  const blocks = String(xml || '').match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  return blocks.map((block) => ({
    title: readTag(block, ['title']),
    publisher,
    url: readLink(block),
    publishedDate: readTag(block, ['pubDate', 'published', 'updated', 'dc:date']),
    category: 'Healthcare Signal'
  }));
}

function normalizeTitle(value) {
  return decodeXml(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach((key) => url.searchParams.delete(key));
    url.hash = '';
    return `${url.origin}${url.pathname.replace(/\/$/, '')}${url.search}`.toLowerCase();
  } catch {
    return '';
  }
}

function isEligibleArticle(article) {
  const title = normalizeTitle(article.title);
  const url = canonicalUrl(article.url);
  if (!title || !url) return false;
  if (/\b(sponsored|advertisement|partner content|press release)\b/.test(title)) return false;
  return /\b(health|hospital|medical|medicare|medicaid|patient|physician|clinical|payer|insurance|pharma|care|nursing|fda|cms)\b/.test(title);
}

function uniqueArticles(articles) {
  const urls = new Set();
  const titles = new Set();
  return articles.filter((article) => {
    const url = canonicalUrl(article.url);
    const title = normalizeTitle(article.title);
    if (!url || !title || urls.has(url) || titles.has(title)) return false;
    urls.add(url);
    titles.add(title);
    return true;
  });
}

function chicagoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HEADLINE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function selectDailyHeadlines(articles, recentRows = [], now = new Date()) {
  const historyUrls = new Set(recentRows.map((row) => canonicalUrl(row.article_url || row.url)));
  const historyTitles = new Set(recentRows.map((row) => normalizeTitle(row.article_title || row.title)));
  const eligible = uniqueArticles(articles.filter(isEligibleArticle))
    .map((article) => ({ ...article, timestamp: Date.parse(article.publishedDate) }))
    .filter((article) => Number.isFinite(article.timestamp) && article.timestamp <= now.getTime() + 60 * 60 * 1000)
    .sort((a, b) => b.timestamp - a.timestamp);
  const unused = eligible.filter((article) => !historyUrls.has(canonicalUrl(article.url)) && !historyTitles.has(normalizeTitle(article.title)));
  const selected = [];
  const windows = [2, 4, 7, 14, 30, Number.POSITIVE_INFINITY];

  for (const days of windows) {
    const cutoff = now.getTime() - days * 86400000;
    for (const article of unused) {
      if (selected.length === DAILY_HEADLINE_COUNT) break;
      if (article.timestamp >= cutoff && !selected.includes(article)) selected.push(article);
    }
  }

  if (selected.length < DAILY_HEADLINE_COUNT) {
    for (const article of eligible) {
      if (selected.length === DAILY_HEADLINE_COUNT) break;
      if (!selected.includes(article)) selected.push(article);
    }
  }

  return selected.slice(0, DAILY_HEADLINE_COUNT).map(({ timestamp, ...article }) => article);
}

function parseFeedConfiguration(value) {
  if (!value) return DEFAULT_HEADLINE_FEEDS;
  return value.split(',').map((entry) => {
    const [publisher, ...urlParts] = entry.trim().split('|');
    return { publisher: publisher.trim(), url: urlParts.join('|').trim() };
  }).filter((feed) => feed.publisher && /^https?:\/\//i.test(feed.url));
}

module.exports = {
  DAILY_HEADLINE_COUNT,
  DEFAULT_HEADLINE_FEEDS,
  HEADLINE_TIMEZONE,
  RECENT_HISTORY_DAYS,
  canonicalUrl,
  chicagoDate,
  normalizeTitle,
  parseFeed,
  parseFeedConfiguration,
  selectDailyHeadlines,
  uniqueArticles
};
