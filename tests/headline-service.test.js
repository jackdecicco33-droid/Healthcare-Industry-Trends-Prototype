const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalUrl,
  chicagoDate,
  normalizeTitle,
  parseFeed,
  selectDailyHeadlines,
  uniqueArticles
} = require('../headline-service');

function article(number, hoursOld = number) {
  return {
    title: `Hospital care update ${number}`,
    publisher: 'Test Healthcare News',
    url: `https://news.test/article-${number}`,
    publishedDate: new Date(Date.parse('2026-08-03T12:00:00Z') - hoursOld * 3600000).toISOString(),
    category: 'Healthcare Signal'
  };
}

test('parses RSS healthcare feed entries', () => {
  const rss = `<rss><channel><item><title><![CDATA[Hospital &amp; payer update]]></title><link>https://news.test/story</link><pubDate>Sun, 03 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  assert.deepEqual(parseFeed(rss, 'Test Publisher'), [{
    title: 'Hospital & payer update',
    publisher: 'Test Publisher',
    url: 'https://news.test/story',
    publishedDate: 'Sun, 03 Aug 2026 10:00:00 GMT',
    category: 'Healthcare Signal'
  }]);
});

test('deduplicates articles by canonical URL and normalized title', () => {
  const original = article(1);
  const duplicates = [
    original,
    { ...article(2), url: `${original.url}?utm_source=email` },
    { ...article(3), title: '  HOSPITAL care update 1! ' }
  ];
  assert.equal(uniqueArticles(duplicates).length, 1);
  assert.equal(canonicalUrl(duplicates[1].url), canonicalUrl(original.url));
  assert.equal(normalizeTitle(duplicates[2].title), normalizeTitle(original.title));
});

test('selects exactly four recent articles and remains stable for the same day', () => {
  const now = new Date('2026-08-03T12:00:00Z');
  const candidates = Array.from({ length: 8 }, (_, index) => article(index + 1));
  const first = selectDailyHeadlines(candidates, [], now);
  assert.equal(first.length, 4);
  assert.deepEqual(selectDailyHeadlines(candidates, [], now), first);
});

test('a new day excludes the previous seven days of displayed articles', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => article(index + 1));
  const yesterday = selectDailyHeadlines(candidates, [], new Date('2026-08-03T12:00:00Z'));
  const history = yesterday.map((item) => ({ article_title: item.title, article_url: item.url }));
  const today = selectDailyHeadlines(candidates, history, new Date('2026-08-04T12:00:00Z'));
  assert.equal(today.length, 4);
  assert.equal(today.some((item) => history.some((old) => old.article_url === item.url)), false);
});

test('reuses recent history only when fewer than four eligible new articles exist', () => {
  const candidates = Array.from({ length: 4 }, (_, index) => article(index + 1));
  const history = [{ article_title: candidates[0].title, article_url: candidates[0].url }];
  const selected = selectDailyHeadlines(candidates, history, new Date('2026-08-03T12:00:00Z'));
  assert.equal(selected.length, 4);
  assert.equal(selected.at(-1).url, candidates[0].url);
});

test('uses the America/Chicago calendar date across UTC midnight', () => {
  assert.equal(chicagoDate(new Date('2026-08-04T04:30:00Z')), '2026-08-03');
  assert.equal(chicagoDate(new Date('2026-08-04T06:00:00Z')), '2026-08-04');
});
