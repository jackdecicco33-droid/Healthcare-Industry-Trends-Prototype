const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  DAILY_HEADLINE_COUNT,
  HEADLINE_TIMEZONE,
  RECENT_HISTORY_DAYS,
  chicagoDate,
  parseFeed,
  parseFeedConfiguration,
  selectDailyHeadlines
} = require('./headline-service');

const app = express();
const PORT = process.env.PORT || 3001;
const WEBHOOK_SECRET = process.env.FORMS_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INSIGHTS_TABLE = 'employee_insights';
const DAILY_HEADLINES_TABLE = 'daily_headline_sets';
const HEADLINE_FEEDS = parseFeedConfiguration(process.env.HEADLINE_RSS_FEEDS);
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

function requireWebhookSecret(req, res, next) {
  if (!WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Admin secret is not configured' });
  }

  if (req.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

function createInsightId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `insight-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  return supabase;
}

function rowToInsight(row = {}) {
  return {
    id: row.id || '',
    name: row.name || 'Anonymous',
    role: row.role || 'Not provided',
    sourceType: row.source_type || 'Insight',
    title: row.title || 'Untitled Employee Insight',
    link: row.link || '',
    rating: row.rating || 'Not rated',
    takeaways: row.takeaways || 'No Takeaway Provided',
    whyItMatters: row.why_it_matters || 'Not provided',
    audience: row.audience || 'General audience',
    submittedAt: row.submitted_at || row.created_at || ''
  };
}

function insightToRow(insight = {}) {
  return {
    id: createInsightId(),
    name: insight.name || 'Anonymous',
    role: insight.role || 'Not provided',
    source_type: insight.sourceType || insight.source_type || 'Insight',
    title: insight.title || 'Untitled Employee Insight',
    link: insight.link || '',
    rating: insight.rating || 'Not rated',
    takeaways: insight.takeaways || 'No Takeaway Provided',
    why_it_matters: insight.whyItMatters || insight.why_it_matters || 'Not provided',
    audience: insight.audience || 'General audience',
    submitted_at: new Date().toISOString()
  };
}

async function readInsights() {
  const client = requireSupabase();
  const { data, error } = await client
    .from(INSIGHTS_TABLE)
    .select('id, name, role, source_type, title, link, rating, takeaways, why_it_matters, audience, submitted_at, created_at')
    .order('submitted_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(rowToInsight);
}

function logSupabaseError(action, error) {
  console.error(`Supabase error ${action}:`, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code
  });
}

function getFirstValue(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }

  return '';
}

function setNoCacheHeaders(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Expires: '0',
    Pragma: 'no-cache',
    'Surrogate-Control': 'no-store'
  });
}

function headlineRowToArticle(row = {}) {
  return {
    title: row.article_title || '',
    publisher: row.publisher || 'Healthcare Source',
    url: row.article_url || '',
    publishedDate: row.published_date || '',
    category: row.category || 'Healthcare Signal'
  };
}

async function readDailyHeadlineRows(displayDate) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(DAILY_HEADLINES_TABLE)
    .select('id, display_date, article_title, article_url, publisher, published_date, category, created_at')
    .eq('display_date', displayDate)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function readRecentHeadlineRows(displayDate) {
  const end = new Date(`${displayDate}T12:00:00Z`);
  const start = new Date(end.getTime() - RECENT_HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
  const client = requireSupabase();
  const { data, error } = await client
    .from(DAILY_HEADLINES_TABLE)
    .select('display_date, article_title, article_url')
    .gte('display_date', start)
    .lt('display_date', displayDate);
  if (error) throw error;
  return data || [];
}

async function fetchCurrentFeedArticles() {
  const results = await Promise.allSettled(HEADLINE_FEEDS.map(async (feed) => {
    const response = await fetch(feed.url, {
      headers: {
        Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml',
        'User-Agent': 'HealthcareIndustryTrends/1.0'
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return parseFeed(await response.text(), feed.publisher);
  }));
  const articles = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') articles.push(...result.value);
    else console.warn(`Headline feed failed (${HEADLINE_FEEDS[index].publisher}):`, result.reason?.message || result.reason);
  });
  console.log(`Headline feeds: ${HEADLINE_FEEDS.length} configured, ${results.filter((result) => result.status === 'fulfilled').length} succeeded, ${articles.length} entries fetched.`);
  return articles;
}

async function getOrCreateDailyHeadlines(now = new Date()) {
  const displayDate = chicagoDate(now);
  const storedRows = await readDailyHeadlineRows(displayDate);
  if (storedRows.length === DAILY_HEADLINE_COUNT) {
    return { generatedDate: displayDate, timezone: HEADLINE_TIMEZONE, articles: storedRows.map(headlineRowToArticle) };
  }

  const [feedArticles, recentRows] = await Promise.all([
    fetchCurrentFeedArticles(),
    readRecentHeadlineRows(displayDate)
  ]);
  const selected = selectDailyHeadlines(feedArticles, recentRows, now);
  console.log(`Daily headlines ${displayDate}: ${feedArticles.length} fetched, ${recentRows.length} recent-history rows checked, ${selected.length} selected.`);
  if (selected.length !== DAILY_HEADLINE_COUNT) {
    throw new Error(`Unable to build a complete ${DAILY_HEADLINE_COUNT}-article daily headline set.`);
  }

  const client = requireSupabase();
  if (storedRows.length) {
    const { error: deleteError } = await client.from(DAILY_HEADLINES_TABLE).delete().eq('display_date', displayDate);
    if (deleteError) throw deleteError;
  }
  const { error: insertError } = await client.from(DAILY_HEADLINES_TABLE).insert(selected.map((article) => ({
    display_date: displayDate,
    article_title: article.title,
    article_url: article.url,
    publisher: article.publisher,
    published_date: article.publishedDate || null,
    category: article.category || 'Healthcare Signal'
  })));
  if (insertError && insertError.code !== '23505') throw insertError;

  const savedRows = await readDailyHeadlineRows(displayDate);
  if (savedRows.length !== DAILY_HEADLINE_COUNT) throw new Error('The persisted daily headline set is incomplete.');
  return { generatedDate: displayDate, timezone: HEADLINE_TIMEZONE, articles: savedRows.map(headlineRowToArticle) };
}

// Power Automate sends Microsoft Forms responses here. The public website does not call this route.
app.post('/api/submit-insight', requireWebhookSecret, async (req, res) => {
  try {
    const body = req.body || {};
    const newInsight = insightToRow({
      name: getFirstValue(body, ['name', 'submittedBy', 'submitted_by']),
      role: getFirstValue(body, ['role', 'serviceLine', 'service_line']),
      sourceType: getFirstValue(body, ['sourceType', 'source_type', 'source']),
      title: getFirstValue(body, ['title']),
      link: getFirstValue(body, ['link', 'url']),
      rating: getFirstValue(body, ['rating', 'reliabilityRating', 'reliability_rating']),
      takeaways: getFirstValue(body, ['takeaways', 'keyTakeaway', 'key_takeaway']),
      whyItMatters: getFirstValue(body, ['whyItMatters', 'why_it_matters']),
      audience: getFirstValue(body, ['audience', 'bestFor', 'best_for'])
    });

    const client = requireSupabase();
    const { data, error } = await client
      .from(INSIGHTS_TABLE)
      .insert(newInsight)
      .select('id, name, role, source_type, title, link, rating, takeaways, why_it_matters, audience, submitted_at, created_at')
      .single();

    if (error) {
      logSupabaseError('saving Power Automate insight', error);
      return res.status(500).json({ error: 'Failed to save insight to Supabase' });
    }

    res.status(200).json({ success: true, insight: rowToInsight(data) });
  } catch (error) {
    logSupabaseError('saving Power Automate insight', error);
    res.status(500).json({ error: 'Failed to save insight to Supabase' });
  }
});

app.get('/api/insights', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const insights = await readInsights();
    res.json(insights);
  } catch (error) {
    logSupabaseError('loading public insights', error);
    res.status(500).json({ error: 'Failed to load insights from Supabase' });
  }
});

app.get('/api/daily-headlines', async (req, res) => {
  setNoCacheHeaders(res);
  try {
    res.json(await getOrCreateDailyHeadlines());
  } catch (error) {
    logSupabaseError('loading daily headlines', error);
    res.status(503).json({ error: 'Current daily headlines are temporarily unavailable' });
  }
});

app.post('/api/admin/refresh-daily-headlines', requireWebhookSecret, async (req, res) => {
  setNoCacheHeaders(res);
  try {
    res.json(await getOrCreateDailyHeadlines());
  } catch (error) {
    logSupabaseError('refreshing daily headlines', error);
    res.status(503).json({ error: 'Unable to refresh daily headlines' });
  }
});

app.get('/api/admin/insights', requireWebhookSecret, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const insights = await readInsights();
    res.json({ insights, responses: insights });
  } catch (error) {
    logSupabaseError('loading admin insights', error);
    res.status(500).json({ error: 'Failed to load insights from Supabase' });
  }
});

app.delete('/api/admin/insights/:id', requireWebhookSecret, async (req, res) => {
  try {
    const id = req.params.id;
    const client = requireSupabase();
    const { data, error } = await client
      .from(INSIGHTS_TABLE)
      .delete()
      .eq('id', id)
      .select('id, name, role, source_type, title, link, rating, takeaways, why_it_matters, audience, submitted_at, created_at')
      .maybeSingle();

    if (error) {
      logSupabaseError('deleting insight', error);
      return res.status(500).json({ error: 'Failed to delete insight from Supabase' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Insight not found' });
    }

    res.json({ success: true, deletedInsight: rowToInsight(data) });
  } catch (error) {
    logSupabaseError('deleting insight', error);
    res.status(500).json({ error: 'Failed to delete insight from Supabase' });
  }
});

async function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Insights storage: Supabase employee_insights');
    console.log(`Daily headlines storage: Supabase ${DAILY_HEADLINES_TABLE} (${HEADLINE_TIMEZONE})`);
    if (!supabase) {
      console.warn('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
  });
}

startServer().catch((error) => {
  console.error('Unable to start server:', error);
  process.exit(1);
});
