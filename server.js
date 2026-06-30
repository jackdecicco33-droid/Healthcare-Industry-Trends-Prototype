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
    role: row.role || 'Not provided',
    sourceType: row.source_type || 'Insight',
    title: row.title || 'Untitled Employee Insight',
    link: row.link || '',
    takeaways: row.takeaways || 'No Takeaway Provided',
    audience: row.audience || 'General audience',
    submittedAt: row.submitted_at || row.created_at || ''
  };
}

function insightToRow(insight = {}) {
  return {
    id: createInsightId(),
    role: insight.role || 'Not provided',
    source_type: insight.sourceType || insight.source_type || 'Insight',
    title: insight.title || 'Untitled Employee Insight',
    link: insight.link || '',
    takeaways: insight.takeaways || 'No Takeaway Provided',
    audience: insight.audience || 'General audience',
    submitted_at: new Date().toISOString()
  };
}

async function readInsights() {
  const client = requireSupabase();
  const { data, error } = await client
    .from(INSIGHTS_TABLE)
    .select('id, role, source_type, title, link, takeaways, audience, submitted_at, created_at')
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
      .select('id, role, source_type, title, link, takeaways, audience, submitted_at, created_at')
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
    if (!supabase) {
      console.warn('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
  });
}

startServer().catch((error) => {
  console.error('Unable to start server:', error);
  process.exit(1);
});
