const TIMEZONE = 'America/Chicago';
const HEADLINE_COUNT = 4;
const HISTORY_DAYS = 7;

const APPROVED_FEEDS = [
  { publisher: "Becker's Hospital Review", url: 'https://www.beckershospitalreview.com/feed/' },
  { publisher: 'Healthcare Dive', url: 'https://www.healthcaredive.com/feeds/news/' },
  { publisher: 'Fierce Healthcare', url: 'https://www.fiercehealthcare.com/rss/xml' },
  { publisher: 'KFF Health News', url: 'https://kffhealthnews.org/feed/' }
];

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
  const entries = String(xml || '').match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  return entries.map((entry) => ({
    title: readTag(entry, ['title']),
    publisher,
    url: readLink(entry),
    publishedDate: readTag(entry, ['pubDate', 'published', 'updated', 'dc:date']),
    category: 'Healthcare Signal'
  }));
}

function normalizeTitle(value) {
  return decodeXml(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach((key) => url.searchParams.delete(key));
    url.hash = '';
    return `${url.origin}${url.pathname.replace(/\/$/, '')}${url.search}`.toLowerCase();
  } catch {
    return '';
  }
}

function chicagoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isHealthcareArticle(article) {
  const title = normalizeTitle(article.title);
  if (!title || !normalizeUrl(article.url)) return false;
  if (/\b(sponsored|advertisement|partner content|press release)\b/.test(title)) return false;
  return /\b(health|hospital|medical|medicare|medicaid|patient|physician|clinical|payer|insurance|pharma|care|nursing|fda|cms)\b/.test(title);
}

function prepareCandidates(articles, recentRows, now = new Date()) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const historyUrls = new Set(recentRows.map((row) => normalizeUrl(row.article_url || row.url)));
  const historyTitles = new Set(recentRows.map((row) => normalizeTitle(row.title)));
  const diagnostics = { fetched: articles.length, invalid: 0, duplicates: 0, recentHistory: 0 };
  const eligible = [];

  for (const article of articles) {
    if (!isHealthcareArticle(article)) { diagnostics.invalid += 1; continue; }
    const urlKey = normalizeUrl(article.url);
    const titleKey = normalizeTitle(article.title);
    if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) { diagnostics.duplicates += 1; continue; }
    seenUrls.add(urlKey); seenTitles.add(titleKey);
    const timestamp = Date.parse(article.publishedDate);
    if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 3600000) { diagnostics.invalid += 1; continue; }
    const wasRecent = historyUrls.has(urlKey) || historyTitles.has(titleKey);
    if (wasRecent) diagnostics.recentHistory += 1;
    eligible.push({ ...article, timestamp, wasRecent });
  }
  eligible.sort((a, b) => b.timestamp - a.timestamp);
  return { eligible, diagnostics };
}

function chooseNewPublishers(candidates, count, selected = []) {
  const usedPublishers = new Set(selected.map((article) => article.publisher));
  for (const article of candidates) {
    if (selected.length >= count) break;
    if (!usedPublishers.has(article.publisher) && !selected.includes(article)) {
      selected.push(article); usedPublishers.add(article.publisher);
    }
  }
  return selected;
}

function fillNewest(candidates, count, selected = []) {
  for (const article of candidates) {
    if (selected.length >= count) break;
    if (!selected.includes(article)) selected.push(article);
  }
  return selected;
}

function selectDailyHeadlines(articles, recentRows = [], now = new Date()) {
  const { eligible, diagnostics } = prepareCandidates(articles, recentRows, now);
  const unused = eligible.filter((article) => !article.wasRecent);
  const selected = [];
  for (const days of [2, 7, 14, Number.POSITIVE_INFINITY]) {
    const cutoff = now.getTime() - days * 86400000;
    chooseNewPublishers(unused.filter((article) => article.timestamp >= cutoff), HEADLINE_COUNT, selected);
    if (selected.length === HEADLINE_COUNT) break;
  }
  if (selected.length < HEADLINE_COUNT) fillNewest(unused, HEADLINE_COUNT, selected);
  if (selected.length < HEADLINE_COUNT) fillNewest(eligible, HEADLINE_COUNT, selected);
  return {
    articles: selected.slice(0, HEADLINE_COUNT).map(({ timestamp, wasRecent, ...article }) => article),
    diagnostics: { ...diagnostics, eligible: unused.length, selected: Math.min(selected.length, HEADLINE_COUNT) }
  };
}

function configuredFeeds(value) {
  if (!value) return APPROVED_FEEDS;
  return value.split(',').map((entry) => {
    const [publisher, ...url] = entry.trim().split('|');
    return { publisher: publisher.trim(), url: url.join('|').trim() };
  }).filter((feed) => feed.publisher && /^https?:\/\//i.test(feed.url));
}

module.exports = { APPROVED_FEEDS, HEADLINE_COUNT, HISTORY_DAYS, TIMEZONE, chicagoDate, configuredFeeds, normalizeTitle, normalizeUrl, parseFeed, selectDailyHeadlines };
