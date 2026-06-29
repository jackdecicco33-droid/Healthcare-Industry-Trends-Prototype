const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const INSIGHTS_FILE = path.join(DATA_DIR, 'insights.json');
const WEBHOOK_SECRET = process.env.FORMS_WEBHOOK_SECRET;

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

function ensureInsightIds(insights) {
  let changed = false;
  const normalizedInsights = insights.map((insight) => {
    if (insight && insight.id) {
      return insight;
    }

    changed = true;
    return {
      id: createInsightId(),
      ...insight
    };
  });

  return { insights: normalizedInsights, changed };
}

async function readInsights() {
  try {
    const data = await fs.readFile(INSIGHTS_FILE, 'utf-8');
    const insights = JSON.parse(data);
    if (!Array.isArray(insights)) {
      return [];
    }

    const result = ensureInsightIds(insights);

    if (result.changed) {
      await writeInsights(result.insights);
    }

    return result.insights;
  } catch (error) {
    return [];
  }
}

async function writeInsights(insights) {
  await fs.writeFile(INSIGHTS_FILE, JSON.stringify(insights, null, 2), 'utf-8');
}

// Endpoint to submit a new insight
app.post('/api/submit-insight', async (req, res) => {
  try {
    if (WEBHOOK_SECRET && req.get('x-webhook-secret') !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, role, sourceType, title, link, rating, takeaways, whyItMatters, audience } = req.body;

    // Validate required fields
    if (!name || !title || !takeaways) {
      return res.status(400).json({ error: 'Missing required fields: name, title, takeaways' });
    }

    const newInsight = {
      id: createInsightId(),
      name,
      role: role || 'Not provided',
      sourceType: sourceType || 'Insight',
      title,
      link: link || '',
      rating: rating || 'Not rated',
      takeaways,
      whyItMatters: whyItMatters || 'Not provided',
      audience: audience || 'General audience',
      submittedAt: new Date().toISOString()
    };

    const insights = await readInsights();

    // Add new insight
    insights.push(newInsight);

    // Write back to file
    await writeInsights(insights);

    res.status(200).json({ success: true, insight: newInsight });
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
    const insights = await readInsights();
    const index = insights.findIndex(insight => insight.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Insight not found' });
    }

    const [deletedInsight] = insights.splice(index, 1);
    await writeInsights(insights);

    res.json({ success: true, deletedInsight, insights });
  } catch (error) {
    console.error('Error deleting insight:', error);
    res.status(500).json({ error: 'Failed to delete insight' });
  }
});

async function startServer() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(INSIGHTS_FILE);
  } catch {
    await fs.writeFile(INSIGHTS_FILE, '[]', 'utf-8');
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Insights storage: ${INSIGHTS_FILE}`);
  });
}

startServer().catch((error) => {
  console.error('Unable to start server:', error);
  process.exit(1);
});
