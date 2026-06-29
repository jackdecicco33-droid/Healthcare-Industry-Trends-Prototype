const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const PDF_PATH = 'c:\\Users\\JohnDecicco\\Downloads\\CMS_Healthcare_Terminology_Guide.pdf';
const DATA_PATH = path.join(__dirname, '..', 'data', 'cms-glossary.json');
const SOURCE = 'CMS Glossary PDF';
const URL = 'https://www.cms.gov/glossary';

const CATEGORY_RULES = [
    {
        name: 'Claims, Billing & Payment',
        keywords: ['claim', 'billing', 'reimbursement', 'payment', 'charge', 'copay', 'coinsurance', 'deductible', 'premium', 'fee', 'cost report', 'drg', 'rvu', 'msp', 'benefit period']
    },
    {
        name: 'Eligibility, Enrollment & Coverage',
        keywords: ['enrollment', 'eligible', 'eligibility', 'coverage', 'covered', 'beneficiary', 'member', 'part a', 'part b', 'part c', 'part d', 'medicare advantage', 'medigap']
    },
    {
        name: 'Compliance, Legal & Program Integrity',
        keywords: ['fraud', 'abuse', 'compliance', 'audit', 'appeal', 'grievance', 'statute', 'law', 'regulation', 'hipaa', 'sanction']
    },
    {
        name: 'Quality, Safety & Outcomes',
        keywords: ['quality', 'safety', 'outcome', 'readmission', 'hcahps', 'performance', 'measure', 'accreditation']
    },
    {
        name: 'Data, Technology & Operations',
        keywords: ['data', 'code set', 'electronic', 'system', 'ehr', 'interoperability', 'administrative', 'processing', 'it', '508']
    },
    {
        name: 'Provider, Care & Clinical',
        keywords: ['physician', 'provider', 'hospital', 'clinic', 'diagnosis', 'treatment', 'clinical', 'care', 'patient']
    }
];

function getCategory(term, definition) {
    const text = `${term} ${definition}`.toLowerCase();
    for (const rule of CATEGORY_RULES) {
        if (rule.keywords.some(keyword => text.includes(keyword))) {
            return rule.name;
        }
    }
    return 'General Healthcare';
}

function normalizeWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
}

function looksLikeTermLine(line) {
    if (!line) return false;
    if (line.length < 2 || line.length > 90) return false;
    if (/^\d+$/.test(line)) return false;
    if (line.endsWith('.') || line.endsWith(';')) return false;
    if (/^(page|cms|glossary|table of contents)/i.test(line)) return false;

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length > 10) return false;

    const hasLetters = /[A-Za-z]/.test(line);
    const sentenceLike = /\b(is|are|means|refers|describes|includes|when|that|which|with)\b/i.test(line);
    const punctuationHeavy = /[,:()].*[,:()]/.test(line);
    if (!hasLetters || (sentenceLike && punctuationHeavy)) return false;

    return true;
}

function parseGlossaryLines(lines) {
    const entries = [];

    for (const line of lines) {
        const colonMatch = line.match(/^([^:]{2,80}):\s+(.{8,})$/);
        if (colonMatch) {
            entries.push({
                term: normalizeWhitespace(colonMatch[1]),
                definition: normalizeWhitespace(colonMatch[2])
            });
        }
    }

    let currentTerm = null;
    let currentDef = [];

    const pushCurrent = () => {
        if (!currentTerm) return;
        const definition = normalizeWhitespace(currentDef.join(' '));
        if (definition.length >= 8) {
            entries.push({ term: currentTerm, definition });
        }
    };

    for (const line of lines) {
        if (looksLikeTermLine(line)) {
            pushCurrent();
            currentTerm = normalizeWhitespace(line.replace(/\*+$/g, ''));
            currentDef = [];
            continue;
        }

        if (currentTerm) {
            currentDef.push(line);
        }
    }

    pushCurrent();

    const deduped = new Map();
    for (const item of entries) {
        const term = normalizeWhitespace(item.term || '');
        const definition = normalizeWhitespace(item.definition || '');
        if (!term || !definition) continue;
        if (term.length < 2 || definition.length < 8) continue;

        const key = term.toLowerCase();
        const existing = deduped.get(key);
        if (!existing || definition.length > existing.definition.length) {
            deduped.set(key, { term, definition });
        }
    }

    return Array.from(deduped.values());
}

async function run() {
    try {
        const dataBuffer = fs.readFileSync(PDF_PATH);
        const parser = new PDFParse({ data: dataBuffer });
        const data = await parser.getText();
        await parser.destroy();
        const text = data.text || '';
        const lines = text
            .split('\n')
            .map(line => normalizeWhitespace(line))
            .filter(line => line.length > 0);

        const extractedTerms = parseGlossaryLines(lines);

        const validTerms = extractedTerms
            .filter(t => t.term && t.definition.length > 5)
            .map(t => ({
                term: t.term,
                definition: t.definition,
                category: getCategory(t.term, t.definition),
                source: SOURCE,
                url: URL
            }));

        let existingData = [];
        if (fs.existsSync(DATA_PATH)) {
            const rawJson = fs.readFileSync(DATA_PATH, 'utf8').replace(/^\uFEFF/, '');
            existingData = JSON.parse(rawJson);
        }

        const termMap = new Map();
        existingData.forEach(item => termMap.set(item.term.toLowerCase(), item));
        validTerms.forEach(item => termMap.set(item.term.toLowerCase(), item)); // PDF overwrites

        const mergedTotal = Array.from(termMap.values()).sort((a, b) => a.term.localeCompare(b.term));
        fs.writeFileSync(DATA_PATH, `${JSON.stringify(mergedTotal, null, 2)}\n`, 'utf8');

        const invalidCount = extractedTerms.length - validTerms.length;
        const catStats = validTerms.reduce((acc, t) => {
            acc[t.category] = (acc[t.category] || 0) + 1;
            return acc;
        }, {});

        console.log('--- Import Statistics ---');
        console.log('extractedFromPdf:', validTerms.length);
        console.log('mergedTotal:', mergedTotal.length);
        console.log('invalidCount:', invalidCount);
        console.log('top categories:', Object.entries(catStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => `${name}: ${count}`)
            .join(', '));

    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
