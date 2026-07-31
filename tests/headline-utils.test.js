import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHeadlineArticles } from '../headline-utils.js';

const sampleArticles = [
  { title: 'Five', url: 'https://e.test/5', date: '2026-07-05' },
  { title: 'Two', url: 'https://b.test/2', date: '2026-07-02' },
  { title: 'Four', url: 'https://d.test/4', date: '2026-07-04' },
  { title: 'One', url: 'https://a.test/1', date: '2026-07-01' },
  { title: 'Three', url: 'https://c.test/3', date: '2026-07-03' }
];

test('selects the newest primary and next three articles from five samples', () => {
  const { primary, supporting } = selectHeadlineArticles(sampleArticles);
  assert.equal(primary.title, 'Five');
  assert.deepEqual(supporting.map(article => article.title), ['Four', 'Three', 'Two']);
});

test('excludes duplicates by normalized title or canonical URL', () => {
  const duplicates = [
    ...sampleArticles,
    { title: '  FIVE! ', url: 'https://other.test/five', date: '2026-07-06' },
    { title: 'Another title', url: 'https://e.test/5?utm_source=email', date: '2026-07-07' }
  ];
  assert.equal(selectHeadlineArticles(duplicates).dataset.length, 5);
});

test('uses older records when the newest day has fewer than four articles', () => {
  const { supporting } = selectHeadlineArticles(sampleArticles);
  assert.deepEqual(supporting.map(article => article.date), ['2026-07-04', '2026-07-03', '2026-07-02']);
});

test('changing source data changes both primary and supporting cards', () => {
  const changed = [
    { title: 'New primary', url: 'https://new.test/primary', date: '2026-07-10' },
    { title: 'New support', url: 'https://new.test/support', date: '2026-07-09' },
    ...sampleArticles
  ];
  const { primary, supporting } = selectHeadlineArticles(changed);
  assert.equal(primary.title, 'New primary');
  assert.equal(supporting[0].title, 'New support');
});

test('honors a current primary while excluding it from supporting articles', () => {
  const { primary, supporting } = selectHeadlineArticles(sampleArticles, sampleArticles[2]);
  assert.equal(primary.title, 'Four');
  assert.ok(!supporting.some(article => article.url === primary.url));
});
