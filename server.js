const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;
const WEBHOOK_SECRET = process.env.FORMS_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INSIGHTS_TABLE = 'employee_insights';
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

// Endpoint to submit a new insight
app.post('/api/submit-insight', async (req, res) => {
  try {
    if (WEBHOOK_SECRET && req.get('x-webhook-secret') !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, role, sourceType, title, link, rating, takeaways, whyItMatters, audience } = req.body || {};

    const newInsight = insightToRow({
      name,
      role,
      sourceType,
      title,
      link,
      rating,
      takeaways,
      whyItMatters,
      audience
    });

    const client = requireSupabase();
    const { data, error } = await client
      .from(INSIGHTS_TABLE)
      .insert(newInsight)
      .select('id, name, role, source_type, title, link, rating, takeaways, why_it_matters, audience, submitted_at, created_at')
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json({ success: true, insight: rowToInsight(data) });
  } catch (error) {
    console.error('Error saving insight:', error);
    res.status(500).json({ error: 'Failed to save insight' });
  }
});

// Endpoint to get all insights (for debugging)
app.get('/api/insights', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const insights = await readInsights();
    res.json(insights);
  } catch (error) {
    res.json([]);
  }
});

app.get('/api/admin/insights', requireWebhookSecret, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const insights = await readInsights();
    res.json({ insights });
  } catch (error) {
    console.error('Error loading admin insights:', error);
    res.status(500).json({ error: 'Failed to load insights' });
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
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: 'Insight not found' });
    }

    res.json({ success: true, deletedInsight: rowToInsight(data) });
  } catch (error) {
    console.error('Error deleting insight:', error);
    res.status(500).json({ error: 'Failed to delete insight' });
  }
});

async function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Insights storage: Supabase table ${INSIGHTS_TABLE}`);
    if (!supabase) {
      console.warn('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
  });
}

startServer().catch((error) => {
  console.error('Unable to start server:', error);
  process.exit(1);
});
