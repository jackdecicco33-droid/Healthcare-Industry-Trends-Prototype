const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const INSIGHTS_FILE = path.join(DATA_DIR, 'insights.json');
const WEBHOOK_SECRET = process.env.FORMS_WEBHOOK_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

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

    // Read existing insights
    let insights = [];
    try {
      const data = await fs.readFile(INSIGHTS_FILE, 'utf-8');
      insights = JSON.parse(data);
    } catch (e) {
      console.log('insights.json not found or invalid, starting fresh');
    }

    // Add new insight
    insights.push(newInsight);

    // Write back to file
    await fs.writeFile(INSIGHTS_FILE, JSON.stringify(insights, null, 2), 'utf-8');

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
    const data = await fs.readFile(INSIGHTS_FILE, 'utf-8');
    const insights = JSON.parse(data);
    res.json(insights);
  } catch (error) {
    res.json([]);
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
