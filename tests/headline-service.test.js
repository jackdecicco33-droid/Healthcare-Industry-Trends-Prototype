const test = require('node:test');
const assert = require('node:assert/strict');
const { chicagoDate, normalizeTitle, normalizeUrl, parseFeed, selectDailyHeadlines } = require('../headline-service');

const NOW = new Date('2026-08-03T18:00:00Z');
function article(number, publisher = `Publisher ${number}`, hoursOld = number) {
  return {
    title: `Hospital care update ${number}`,
    publisher,
    url: `https://news.test/article-${number}`,
    publishedDate: new Date(NOW.getTime() - hoursOld * 3600000).toISOString(),
    category: 'Healthcare Signal'
  };
}

test('parses an RSS entry', () => {
  const xml = '<rss><channel><item><title><![CDATA[Hospital &amp; payer update]]></title><link>https://news.test/story</link><pubDate>Sun, 03 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>';
  assert.equal(parseFeed(xml, 'Publisher')[0].title, 'Hospital & payer update');
});

test('normalizes tracking URLs and titles for duplicate detection', () => {
  assert.equal(normalizeUrl('https://news.test/story?utm_source=email'), normalizeUrl('https://news.test/story'));
  assert.equal(normalizeTitle(' Hospital—Care! '), normalizeTitle('hospital care'));
});

test('selects exactly four stable, publisher-diverse articles', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => article(index + 1));
  const first = selectDailyHeadlines(candidates, [], NOW).articles;
  assert.equal(first.length, 4);
  assert.equal(new Set(first.map((item) => item.publisher)).size, 4);
  assert.deepEqual(selectDailyHeadlines(candidates, [], NOW).articles, first);
});

test('next day excludes the prior daily set', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => article(index + 1));
  const dayOne = selectDailyHeadlines(candidates, [], NOW).articles;
  const history = dayOne.map((item) => ({ title: item.title, article_url: item.url }));
  const dayTwo = selectDailyHeadlines(candidates, history, new Date(NOW.getTime() + 86400000)).articles;
  assert.equal(dayTwo.length, 4);
  assert.equal(dayTwo.some((item) => history.some((old) => old.article_url === item.url)), false);
});

test('reuses history only as an emergency fallback', () => {
  const candidates = Array.from({ length: 4 }, (_, index) => article(index + 1));
  const history = [{ title: candidates[0].title, article_url: candidates[0].url }];
  const selected = selectDailyHeadlines(candidates, history, NOW).articles;
  assert.equal(selected.length, 4);
  assert.equal(selected.some((item) => item.url === candidates[0].url), true);
});

test('uses the America/Chicago date across UTC midnight', () => {
  assert.equal(chicagoDate(new Date('2026-08-04T04:30:00Z')), '2026-08-03');
  assert.equal(chicagoDate(new Date('2026-08-04T06:00:00Z')), '2026-08-04');
});
