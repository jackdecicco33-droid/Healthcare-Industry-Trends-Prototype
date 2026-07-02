const state = {
  resources: [],
  services: [],
  sources: [],
  search: '',
  service: 'all',
  level: 'all',
  category: 'all',
  visibleResourceCount: 6,
  showResources: false,
  sourceSearch: '',
  resourcesError: '',
  terminologyError: ''
};

const els = {
  coverServiceDropdown: document.querySelector('#coverServiceDropdown'),
  coverEnterBtn: document.querySelector('#coverEnterBtn'),
  serviceLineGrid: document.querySelector('#serviceLineGrid'),
  resourceGrid: document.querySelector('#resourceGrid'),
  sourceGrid: document.querySelector('#sourceGrid'),
  serviceFilter: document.querySelector('#serviceFilter'),
  levelFilter: document.querySelector('#levelFilter'),
  categoryFilter: document.querySelector('#categoryFilter'),
  resourceShowMore: document.querySelector('#resourceShowMore'),
  sourceSearch: document.querySelector('#sourceSearch'),
  resetFilters: document.querySelector('#resetFilters'),
  resultsSummary: document.querySelector('#resultsSummary'),
  resourceCount: document.querySelector('#resourceCount'),
  sourceCount: document.querySelector('#sourceCount'),
  serviceCount: document.querySelector('#serviceCount')
};

const trustDescriptions = [
  { test: /cms\.gov|ahrq\.gov|bls\.gov|medicaid\.gov/i, label: 'Government / primary source', why: 'Official public-sector source for policy, data, regulations, or healthcare program guidance.' },
  { test: /hfma|aaham|aapc|ahrmm|ascm|ismworld|mgma|amga|nahq|ache|aha\.org|shrm|himss|acdis|ahima|nursingworld/i, label: 'Professional association', why: 'Used by healthcare, finance, operations, clinical, supply chain, or workforce professionals for education and field standards.' },
  { test: /coursera|edx|udemy|linkedin/i, label: 'Learning platform', why: 'Useful for self-paced learning and skill refreshers; validate course relevance against current role or project needs.' },
  { test: /beckers|modernhealthcare|healthcaredive|revcycleintelligence|hpnonline|fiercehealthcare/i, label: 'Industry media', why: 'Helpful for tracking market trends, executive priorities, provider news, and operational issues.' },
  { test: /gartner|advisory|kaufmanhall|mckinsey|deloitte|pwc|kpmg|ey/i, label: 'Research / consulting insight', why: 'Useful for market perspective, benchmarks, transformation themes, and executive-level framing.' },
  { test: /hlth|viveevent|jpmorgan|conference|events|webinars/i, label: 'Conference / forum', why: 'Useful for trend sensing, networking, executive topics, and current industry priorities.' },
  { test: /bookshop|amazon/i, label: 'Book / marketplace link', why: 'Useful for locating books; trust should be based on the author, publisher, and professional relevance.' }
];

function classifySource(source) {
  const target = `${source.url || ''} ${source.domain || ''} ${(source.resourceNames || []).join(' ')}`;
  return trustDescriptions.find(item => item.test.test(target)) || {
    label: 'Reference source',
    why: 'Useful as a directional resource; verify the specific page, author, and publication date before citing in client-facing work.'
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

let resourceCategories = [];

const RESOURCE_BATCH_SIZE = 6;

const healthcareIndustryNews = [
  {
    title: "CMS policy and payment updates remain a key signal for provider strategy",
    source: "CMS Newsroom",
    date: "Update regularly",
    serviceLine: "Revenue Cycle / Quality",
    trustLevel: "Primary Source",
    summary:
      "CMS updates are important because payment policy, quality reporting, reimbursement rules, and value-based care programs can directly affect how hospitals operate and get paid.",
    consultingLens:
      "Revenue Cycle teams should watch for billing and reimbursement impact. Quality teams should watch for reporting and performance requirements. Strategy teams should watch for broader operating model implications.",
    url: "https://www.cms.gov/newsroom"
  },
  {
    title: "Hospital finance and margin pressure continue to shape executive priorities",
    source: "Becker’s Hospital Review",
    date: "Update regularly",
    serviceLine: "Revenue Cycle / Strategy",
    trustLevel: "Industry News",
    summary:
      "Hospital finance stories help users understand what executives are paying attention to, including cost pressure, reimbursement challenges, denials, labor expense, and revenue performance.",
    consultingLens:
      "Consultants should connect finance news back to cash acceleration, denial prevention, payer strategy, operating expense, and margin improvement opportunities.",
    url: "https://www.beckershospitalreview.com/finance.html"
  },
  {
    title: "Healthcare workforce trends remain central to hospital operations",
    source: "BLS Healthcare Occupations",
    date: "Update regularly",
    serviceLine: "Workforce / Labor",
    trustLevel: "Primary Data",
    summary:
      "Healthcare employment and wage data can help users understand labor-market pressure, staffing challenges, compensation trends, and workforce planning needs.",
    consultingLens:
      "Workforce consultants should watch wage pressure, role shortages, staffing mix, overtime reliance, turnover risk, and how labor constraints affect operations.",
    url: "https://www.bls.gov/ooh/healthcare/"
  },
  {
    title: "Healthcare quality and patient safety remain key performance priorities",
    source: "AHRQ",
    date: "Update regularly",
    serviceLine: "Quality / Clinical Optimization",
    trustLevel: "Primary Source",
    summary:
      "AHRQ resources help users understand patient safety, evidence-based improvement, care delivery research, and practical tools for quality performance.",
    consultingLens:
      "Quality consultants should connect safety and quality topics to readmissions, harm events, patient experience, process redesign, and performance improvement initiatives.",
    url: "https://www.ahrq.gov/"
  },
  {
    title: "Healthcare policy analysis helps explain Medicare, Medicaid, affordability, and coverage trends",
    source: "KFF",
    date: "Update regularly",
    serviceLine: "Policy / Strategy",
    trustLevel: "Policy Research",
    summary:
      "Policy analysis helps users understand the larger forces affecting health systems, including coverage, government programs, affordability, and access.",
    consultingLens:
      "Strategy and revenue cycle teams should translate policy movement into implications for payer mix, reimbursement, patient access, affordability, and health-system planning.",
    url: "https://www.kff.org/"
  }
];

let healthcareTerms = [];

const terminologyRoles = [
  'Healthcare Consulting 101',
  'Revenue Cycle',
  'Clinical Optimization',
  'ERP',
  'Labor',
  'Supply Chain',
  'Quality',
  'Physician Enterprise'
];

function renderTerminologyDictionary() {
  const grid = document.getElementById("terminologyGrid");
  const searchInput = document.getElementById("termSearch");
  const categoryTabs = document.getElementById("terminologyServiceTabs");
  const countLabel = document.getElementById("dictionaryResultsCount");
  const loadMoreButton = document.getElementById("terminologyLoadMore");

  if (!grid || !searchInput || !countLabel) {
    return;
  }

  let selectedCategory = null;
  let visibleTerminologyCount = RESOURCE_BATCH_SIZE;

  function resetVisibleTerminologyCount() {
    visibleTerminologyCount = RESOURCE_BATCH_SIZE;
  }

  function getTermRoles(item) {
    return [item.category || item.serviceLine || 'Healthcare Consulting 101'];
  }

  function renderCategoryTabs() {
    if (!categoryTabs) return;
    const availableCategories = uniqueSorted(healthcareTerms.map(item => item.category));
    const orderedCategories = [
      ...terminologyRoles.filter(role => availableCategories.includes(role)),
      ...availableCategories.filter(category => !terminologyRoles.includes(category))
    ];
    categoryTabs.innerHTML = [
      '<button type="button" data-category="All">All terms</button>',
      ...orderedCategories.map(role => `<button type="button" data-category="${escapeHtml(role)}">${escapeHtml(role)}</button>`)
    ].join('');
  }

  function getSelectedCategory() {
    if (selectedCategory) return selectedCategory;
    if (!categoryTabs) return null;
    const activeTab = categoryTabs.querySelector('button.active');
    return activeTab ? activeTab.dataset.category : null;
  }

  function getSearchParts(item) {
    const term = item.term || item.title || '';
    const expandedTerm = term.replace(/\([^)]*\)/g, ' ');

    return {
      term: term.toLowerCase(),
      expandedTerm: expandedTerm.toLowerCase()
    };
  }

  function matchesTerminologySearch(searchValue, searchParts) {
    if (!searchValue) return true;
    return searchParts.term.includes(searchValue) || searchParts.expandedTerm.includes(searchValue);
  }

  function getFilteredTerms() {
    const searchValue = searchInput.value.trim().toLowerCase();
    const selectedCategory = getSelectedCategory();

    return healthcareTerms
      .filter((item) => {
      const itemRoles = getTermRoles(item);
      const matchesCategory =
        !selectedCategory || selectedCategory === "All" || itemRoles.includes(selectedCategory);

      const searchParts = getSearchParts(item);
      const matchesSearch =
        matchesTerminologySearch(searchValue, searchParts);

      return matchesCategory && matchesSearch;
    })
      .sort((a, b) => {
        if (!searchValue) return a.term.localeCompare(b.term);

        const aParts = getSearchParts(a);
        const bParts = getSearchParts(b);
        const score = (parts) => {
          if (parts.term === searchValue) return 0;
          if (parts.term.startsWith(searchValue) || parts.expandedTerm.startsWith(searchValue)) return 1;
          if (parts.term.includes(searchValue) || parts.expandedTerm.includes(searchValue)) return 2;
          return 3;
        };

        return score(aParts) - score(bParts) || a.term.localeCompare(b.term);
      });
  }

  function getCategoryTerms() {
    const currentCategory = getSelectedCategory();
    if (!currentCategory || currentCategory === 'All') {
      return healthcareTerms;
    }

    return healthcareTerms.filter(item => getTermRoles(item).includes(currentCategory));
  }

  function renderTerminologyCards() {
    const searchValue = searchInput.value.trim().toLowerCase();
    const selectedLine = getSelectedCategory();
    const categoryTerms = getCategoryTerms();

    if (state.terminologyError) {
      countLabel.textContent = "";
      grid.innerHTML = `<div class="no-terms-message">${escapeHtml(state.terminologyError)}</div>`;
      if (loadMoreButton) loadMoreButton.hidden = true;
      console.log("active terminology category filter", selectedLine || "All");
      console.log("rendered terminology count", 0);
      return;
    }

    const filteredTerms = getFilteredTerms();
    const visibleTerms = filteredTerms.slice(0, visibleTerminologyCount);
    const hasMoreTerms = visibleTerminologyCount < filteredTerms.length;
    const activeCount = filteredTerms.length;
    console.log("active terminology category filter", selectedLine || "All");
    console.log("visible terminology count", visibleTerminologyCount);
    console.log("matching terminology count", activeCount);
    console.log("rendered terminology count", visibleTerms.length);

    if (selectedLine && selectedLine !== 'All' && categoryTerms.length === 0) {
      countLabel.textContent = "";
      grid.innerHTML = `
        <div class="no-terms-message">
          No terms are currently available for this category.
        </div>
      `;
      if (loadMoreButton) loadMoreButton.hidden = true;
      return;
    }

    if (searchValue && activeCount === 0) {
      countLabel.textContent = "";
      grid.innerHTML = `
        <div class="no-terms-message">
          No matching terminology found.
        </div>
      `;
      if (loadMoreButton) loadMoreButton.hidden = true;
      return;
    }

    if (!activeCount) {
      countLabel.textContent = "";
      grid.innerHTML = `
        <div class="no-terms-message">
          No terminology terms are available yet.
        </div>
      `;
      if (loadMoreButton) loadMoreButton.hidden = true;
      return;
    }

    countLabel.textContent = `Showing ${visibleTerms.length} of ${activeCount} matching term${activeCount === 1 ? "" : "s"}`;

    grid.innerHTML = visibleTerms
      .map(
        (item) => {
          const roles = getTermRoles(item);
          const serviceLine = roles.join(' / ');
          const sourceName = item.sourceName || item.source || 'Source not provided';
          const example =
            item.example ||
            `A consultant may hear this term during ${serviceLine.toLowerCase()} discussions and use it to understand the topic.`;

          return `
          <article class="term-card">
            <div class="term-card-header">
              <span class="term-service-badge">${escapeHtml(serviceLine)}</span>
              <span class="term-level-badge">${escapeHtml(sourceName)}</span>
            </div>

            <h3>${escapeHtml(item.term)}</h3>

            <div class="term-block">
              <strong>Definition</strong>
              <p>${escapeHtml(item.definition)}</p>
            </div>

            <div class="term-block term-example">
              <strong>Real World Example</strong>
              <p>${escapeHtml(example)}</p>
            </div>

            <div class="term-block term-why">
              <strong>Source</strong>
              <p>${escapeHtml(sourceName)}</p>
            </div>

            ${item.url ? `
              <a class="term-source-link" href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">
                View source →
              </a>
            ` : ''}
          </article>
        `;
        }
      )
      .join("");
    const renderedTermCards = Array.from(grid.querySelectorAll(".term-card"));
    if (renderedTermCards.length > visibleTerms.length) {
      renderedTermCards.slice(visibleTerms.length).forEach(card => card.remove());
    }
    console.log("terminology DOM card count", grid.querySelectorAll(".term-card").length);

    if (loadMoreButton) {
      loadMoreButton.hidden = !hasMoreTerms;
    }
  }

  function bindServiceTabs() {
    if (!categoryTabs) return;
    categoryTabs.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        categoryTabs.querySelectorAll('button').forEach((btn) => {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');
        selectedCategory = button.dataset.category || null;
        resetVisibleTerminologyCount();
        renderTerminologyCards();
      });
    });
  }

  const clearButton = document.getElementById('clearTerminology');
  searchInput.addEventListener("input", () => {
    resetVisibleTerminologyCount();
    renderTerminologyCards();
  });
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      selectedCategory = null;
      if (categoryTabs) {
        categoryTabs.querySelectorAll('button').forEach((btn) => {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        });
      }
      resetVisibleTerminologyCount();
      renderTerminologyCards();
    });
  }
  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', () => {
      visibleTerminologyCount += RESOURCE_BATCH_SIZE;
      renderTerminologyCards();
    });
  }

  renderCategoryTabs();
  bindServiceTabs();
  renderTerminologyCards();
}

function getDailyNewsIndex() {
  const startDate = new Date("2026-01-01T00:00:00");
  const today = new Date();

  startDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const oneDay = 1000 * 60 * 60 * 24;
  const dayDifference = Math.floor((today - startDate) / oneDay);

  return Math.abs(dayDifference) % healthcareIndustryNews.length;
}

function renderHealthcareIndustryWatch() {
  const featuredNewsCard = document.getElementById("featuredNewsCard");
  const newsGrid = document.getElementById("newsGrid");
  const newsUpdatedLabel = document.getElementById("newsUpdatedLabel");

  if (!featuredNewsCard || !newsGrid) {
    return;
  }

  const todayIndex = getDailyNewsIndex();
  const featured = healthcareIndustryNews[todayIndex];

  const supportingArticles = healthcareIndustryNews
    .filter((_, index) => index !== todayIndex)
    .slice(0, 3);

  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  const lensSentence = String(featured.consultingLens || '').split('. ').filter(Boolean)[0] || featured.consultingLens;
  const takeaways = [
    `Primary signal: ${featured.title}`,
    `Consulting lens: ${String(lensSentence || '').replace(/\.$/, '')}.`,
    ...supportingArticles.slice(0, 2).map(article => `Watch next: ${article.title} (${article.source}).`)
  ];

  featuredNewsCard.innerHTML = `
    <div class="news-meta-row">
      <span class="news-pill green">${featured.trustLevel}</span>
      <span class="news-pill">${featured.serviceLine}</span>
      <span class="news-pill">${featured.source}</span>
    </div>

    <h3>${featured.title}</h3>

    <p class="news-summary">${featured.summary}</p>

    <div class="consulting-lens-box">
      <strong>Consulting lens</strong>
      <p>${featured.consultingLens}</p>
    </div>

    <div class="watch-summary inline-watch-summary" aria-label="Biggest takeaways">
      <div class="watch-summary-header">
        <p class="eyebrow">Summary</p>
        <h4>Biggest Takeaways</h4>
        <p>
          Today highlights ${featured.source} with implications for ${featured.serviceLine}.
          Use these points to frame client conversations and internal team updates.
        </p>
      </div>
      <ul class="watch-takeaway-list">
        ${takeaways.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>

    <div class="news-actions">
      <a class="news-button" href="${featured.url}" target="_blank" rel="noopener noreferrer">
        Read source →
      </a>
      <span class="news-source-text">Featured for ${formattedDate}</span>
    </div>
  `;

  newsGrid.innerHTML = supportingArticles
    .map(
      article => `
        <article class="mini-news-card">
          <span class="news-pill">${article.serviceLine}</span>
          <h4>${article.title}</h4>
          <p>${article.summary}</p>
          <a href="${article.url}" target="_blank" rel="noopener noreferrer">
            View source →
          </a>
        </article>
      `
    )
    .join("");

  if (newsUpdatedLabel) {
    newsUpdatedLabel.textContent = `Daily rotation shown for ${formattedDate}`;
  }
}

function normalize(value) {
  return String(value || '').toLowerCase();
}

function getLevelGroup(level) {
  const normalizedLevel = normalize(level);

  if (normalizedLevel.includes('consultant') && !normalizedLevel.includes('manager') && !normalizedLevel.includes('director')) {
    return 'Consultant / Senior Consultant';
  }

  if (normalizedLevel.includes('manager') || normalizedLevel.includes('sr. consultant') || normalizedLevel.includes('senior consultant') || normalizedLevel.includes('associate director') || normalizedLevel.includes('mc/ad')) {
    return 'Managing Consultant / Associate Director';
  }

  return 'Director +';
}

function translateResourceCategory(resource) {
  return resource.sourceType || resource.category || 'Resource';
}

function resourceMatches(resource) {
  const haystack = normalize([
    resource.title,
    resource.website,
    resource.sourceType,
    resource.name,
    resource.organization,
    resource.description,
    resource.serviceLine,
    resource.level,
    resource.category,
    resource.url
  ].join(' '));
  const matchesSearch = !state.search || haystack.includes(normalize(state.search));
  const matchesService = state.service === 'all' || resource.serviceLine === state.service;
  const matchesLevel = state.level === 'all' || getLevelGroup(resource.level) === state.level;
  const matchesCategory = state.category === 'all' || translateResourceCategory(resource) === state.category;
  return matchesSearch && matchesService && matchesLevel && matchesCategory;
}

function hasActiveResourceFilters() {
  return state.service !== 'all' || state.level !== 'all' || state.category !== 'all';
}

function resetVisibleResourceCount() {
  state.visibleResourceCount = RESOURCE_BATCH_SIZE;
}

function sourceMatches(source) {
  const haystack = normalize([
    source.domain,
    source.url,
    ...(source.resourceNames || []),
    ...(source.serviceLines || []),
    ...(source.categories || []).map(translateSourceBucket)
  ].join(' '));
  return !state.sourceSearch || haystack.includes(normalize(state.sourceSearch));
}

function translateSourceBucket(category) {
  const bucketMap = {
    'Credentials to Start': 'Consultant / Senior Consultant',
    'Manager-Level Credentials': 'Managing Consultant / Associate Director',
    'Practice Leadership': 'Director +'
  };

  return bucketMap[category] || category;
}

function populateFilter(select, values, allLabel) {
  select.innerHTML = `<option value="all">${allLabel}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
}

function renderServiceLines() {
  if (!els.serviceLineGrid) return;
  els.serviceLineGrid.innerHTML = state.services.map(service => `
    <article class="service-card" id="service-${service.id}">
      <h3>${escapeHtml(service.serviceLine)}</h3>
      <p>${escapeHtml(service.whatThisServiceLineDoes || service.description || '')}</p>
      <div class="pill-row">
        ${(service.focusPills || []).map(pill => `<span class="pill">${escapeHtml(pill)}</span>`).join('')}
      </div>
      <p class="small-label">What consultants look for</p>
      <ul class="mini-list">
        ${(service.consultantsLookFor || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </article>
  `).join('');
}

function renderResourcesLegacy() {
  console.log("active resource service line filter", state.service);
  console.log("active resource level filter", state.level);

  if (state.resourcesError) {
    els.resultsSummary.textContent = "";
    els.resourceGrid.innerHTML = `<div class="empty-state">${escapeHtml(state.resourcesError)}</div>`;
    if (els.resourceShowMore) els.resourceShowMore.hidden = true;
    console.log("rendered resources count", 0);
    return;
  }

  const results = state.resources.filter(resourceMatches);
  const visibleResults = results.slice(0, state.visibleResourceCount);
  const hasMoreResults = state.visibleResourceCount < results.length;

  els.resultsSummary.textContent = `Showing ${visibleResults.length} of ${results.length} matching resource${results.length === 1 ? '' : 's'}`;
  if (!results.length) {
    const message = state.resources.length
      ? 'No resources match those filters. Try resetting filters or using a broader keyword.'
      : 'Resource Library data is unavailable. Add data/resources.json by running the Excel import.';
    els.resourceGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    if (els.resourceShowMore) els.resourceShowMore.hidden = true;
    console.log("rendered resources count", 0);
    return;
  }
  els.resourceGrid.innerHTML = visibleResults.map(resource => `
    <article class="resource-card">
      <div class="tag-stack">
        <span class="tag">${escapeHtml(resource.serviceLine)}</span>
        <span class="tag">${escapeHtml(getLevelGroup(resource.level))}</span>
      </div>
      <h3>${escapeHtml(resource.title || resource.name)}</h3>
      <p class="resource-meta">${escapeHtml(translateResourceCategory(resource))} · ${escapeHtml(resource.organization || 'Resource')}</p>
      <p class="resource-desc">${escapeHtml(resource.description || 'Use this source to build healthcare consulting domain fluency.')}</p>
      <a class="resource-link" href="${escapeAttribute(resource.url)}" target="_blank" rel="noopener">Open resource →</a>
    </article>
  `).join('');

  if (els.resourceShowMore) {
    els.resourceShowMore.hidden = !hasMoreResults;
  }
}

function renderResources() {
  console.log("active resource service filter", state.service);
  console.log("active resource level filter", state.level);

  if (state.resourcesError) {
    els.resultsSummary.textContent = "";
    els.resourceGrid.innerHTML = `<div class="empty-state">${escapeHtml(state.resourcesError)}</div>`;
    if (els.resourceShowMore) els.resourceShowMore.hidden = true;
    console.log("rendered resources count", 0);
    return;
  }

  const results = state.resources.filter(resourceMatches);
  const visibleResults = results.slice(0, state.visibleResourceCount);
  const hasMoreResults = state.visibleResourceCount < results.length;

  els.resultsSummary.textContent = `Showing ${visibleResults.length} of ${results.length} matching resource${results.length === 1 ? '' : 's'}`;
  if (!results.length) {
    const message = state.resources.length
      ? 'No resources match those filters. Try resetting filters or using a broader keyword.'
      : 'Resource Library data is unavailable. Add data/resources.json by running the Excel import.';
    els.resourceGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    if (els.resourceShowMore) els.resourceShowMore.hidden = true;
    console.log("rendered resources count", 0);
    return;
  }

  els.resourceGrid.innerHTML = visibleResults.map(resource => `
    <article class="resource-card">
      <div class="tag-stack">
        <span class="tag">${escapeHtml(resource.serviceLine)}</span>
        <span class="tag">${escapeHtml(getLevelGroup(resource.level))}</span>
      </div>
      <h3>${escapeHtml(resource.title || resource.name)}</h3>
      <p class="resource-meta">${escapeHtml(resource.sourceType || translateResourceCategory(resource))} · ${escapeHtml(resource.website || resource.organization || 'Resource')}</p>
      <p class="resource-desc">${escapeHtml(resource.description || 'Use this source to build healthcare consulting domain fluency.')}</p>
      <a class="resource-link" href="${escapeAttribute(resource.url)}" target="_blank" rel="noopener">Open resource →</a>
    </article>
  `).join('');
  console.log("rendered resources count", visibleResults.length);

  if (els.resourceShowMore) {
    els.resourceShowMore.hidden = !hasMoreResults;
  }
}

function renderCategoryButtons() {
  const container = document.getElementById('categoryButtons');
  if (!container) return;
  container.innerHTML = resourceCategories.map(cat => `<button type="button" class="category-button" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('');
  container.querySelectorAll('.category-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const cat = e.currentTarget.getAttribute('data-cat');
      state.category = cat;
      // update select to reflect the chosen category
      if (els.categoryFilter) els.categoryFilter.value = cat;
      // mark active
      container.querySelectorAll('.category-button').forEach(b => b.classList.toggle('active', b === e.currentTarget));
      resetVisibleResourceCount();
      renderResources();
      document.querySelector('#resourceLibrary').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function renderSources() {
  const results = state.sources.filter(sourceMatches);
  if (!results.length) {
    els.sourceGrid.innerHTML = '<div class="empty-state">No sources match that search.</div>';
    return;
  }
  els.sourceGrid.innerHTML = results.map(source => {
    const trust = classifySource(source);
    const names = (source.resourceNames || []).slice(0, 4).join(', ');
    const lines = (source.serviceLines || []).slice(0, 4).join(', ');
    const levelGroups = uniqueSorted((source.categories || []).map(translateSourceBucket).filter(value => ['Consultant / Senior Consultant', 'Managing Consultant / Associate Director', 'Director +'].includes(value))).join(', ');
    return `
      <article class="source-card">
        <p class="small-label">${escapeHtml(trust.label)}</p>
        <h3>${escapeHtml(source.domain || source.url)}</h3>
        <p>${escapeHtml(trust.why)}</p>
        <p><strong>Appears as:</strong> ${escapeHtml(names || 'Source link')}</p>
        <p><strong>Level group(s):</strong> ${escapeHtml(levelGroups || 'Shared')}</p>
        <p><strong>Service lines:</strong> ${escapeHtml(lines || 'Shared')}</p>
        <a href="${escapeAttribute(source.url)}" target="_blank" rel="noopener">Visit source →</a>
      </article>
    `;
  }).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function bindEvents() {
  if (els.coverEnterBtn) {
    els.coverEnterBtn.addEventListener('click', () => {
      const selectedService = els.coverServiceDropdown ? els.coverServiceDropdown.value : 'all';
      if (selectedService !== 'all') {
        state.service = selectedService;
        if (els.serviceFilter) els.serviceFilter.value = selectedService;
        resetVisibleResourceCount();
        renderResources();
        const el = document.querySelector('#resourceLibrary');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        const el = document.querySelector('#resourceLibrary');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  if (els.coverServiceDropdown) {
    els.coverServiceDropdown.addEventListener('keypress', event => {
      if (event.key === 'Enter' && els.coverEnterBtn) {
        els.coverEnterBtn.click();
      }
    });
  }

  if (els.serviceFilter) {
    els.serviceFilter.addEventListener('change', event => { state.service = event.target.value; resetVisibleResourceCount(); renderResources(); });
  }
  if (els.levelFilter) {
    els.levelFilter.addEventListener('change', event => { state.level = event.target.value; resetVisibleResourceCount(); renderResources(); });
  }
  if (els.categoryFilter) {
    els.categoryFilter.addEventListener('change', event => {
      state.category = event.target.value;
      const container = document.getElementById('categoryButtons');
      if (container) {
        container.querySelectorAll('.category-button').forEach(b => b.classList.toggle('active', b.getAttribute('data-cat') === state.category));
      }
      resetVisibleResourceCount();
      renderResources();
    });
  }
  if (els.resourceShowMore) {
    els.resourceShowMore.addEventListener('click', () => {
      state.visibleResourceCount += RESOURCE_BATCH_SIZE;
      renderResources();
    });
  }
  if (els.sourceSearch) {
    els.sourceSearch.addEventListener('input', event => { state.sourceSearch = event.target.value; renderSources(); });
  }
  const insightSourceFilter = document.getElementById('insightSourceFilter');
  const insightRoleFilter = document.getElementById('insightRoleFilter');
  if (insightSourceFilter) {
    insightSourceFilter.addEventListener('change', loadInsights);
  }
  if (insightRoleFilter) {
    insightRoleFilter.addEventListener('change', loadInsights);
  }
  if (els.resetFilters) {
    els.resetFilters.addEventListener('click', () => {
      state.service = 'all';
      state.level = 'all';
      state.category = 'all';
      resetVisibleResourceCount();
      if (els.serviceFilter) els.serviceFilter.value = 'all';
      if (els.levelFilter) els.levelFilter.value = 'all';
      if (els.categoryFilter) els.categoryFilter.value = 'all';
      document.querySelectorAll('#categoryButtons .category-button').forEach(button => button.classList.remove('active'));
      renderResources();
    });
  }
}

async function loadJson(path, fallback = []) {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      console.warn(`Failed to load ${path}: ${response.status} ${response.statusText}`);
      return fallback;
    }
    return await response.json();
  } catch (error) {
    console.warn(`Failed to load ${path}:`, error);
    return fallback;
  }
}

async function loadDataJson(path, label) {
  console.log(`${label} fetch started`);
  try {
    const response = await fetch(path);
    console.log(`${label} response status`, response.status);

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`raw ${label} data`, data);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn(`Unable to load ${label} data from ${path}:`, error);
    return null;
  }
}

function normalizeResourceData(data) {
  return (Array.isArray(data) ? data : [])
    .map(resource => {
      const title = resource.title || resource.name || '';
      const website = resource.website || resource.organization || '';
      const sourceType = resource.sourceType || resource.category || '';
      const serviceLine = resource.serviceLine || '';
      const level = resource.level || '';

      return {
        ...resource,
        title,
        name: title,
        website,
        organization: website,
        sourceType,
        category: sourceType,
        serviceLine,
        level,
        url: resource.url || '',
        description:
          resource.description ||
          `Resource from ${website || 'the listed website'} focused on ${serviceLine || 'healthcare consulting'}.`
      };
    })
    .filter(resource => resource.title || resource.url);
}

function normalizeTerminologyData(data) {
  return (Array.isArray(data) ? data : [])
    .map(item => {
      const sourceName = item.sourceName || item.source || '';
      return {
        ...item,
        term: item.term || item.title || '',
        category: item.category || item.serviceLine || '',
        definition: item.definition || '',
        sourceName,
        source: sourceName,
        example: item.example || item.realWorldExample || ''
      };
    })
    .filter(item => item.term || item.definition);
}

async function init() {
  const rawResources = await loadDataJson('./data/resources.json', 'resources');
  const services = await loadJson('./data/service-lines.json', []);
  const sources = await loadJson('./data/source-index.json', []);
  const rawTerminology = await loadDataJson('./data/terminology.json', 'terminology');
  const resources = normalizeResourceData(rawResources);
  const terminology = normalizeTerminologyData(rawTerminology);
  console.log("normalized resources count", resources.length);
  console.log("normalized terminology count", terminology.length);

  state.resourcesError = rawResources === null || !resources.length
    ? 'Resource Library data is unavailable. Run npm run build:data to regenerate data/resources.json from the workbook.'
    : '';
  state.terminologyError = rawTerminology === null || !terminology.length
    ? 'Terminology data is unavailable. Run npm run build:data to regenerate data/terminology.json from the workbook.'
    : '';

  state.resources = resources;
  state.services = services;
  state.sources = sources;
  healthcareTerms = terminology.sort((a, b) => a.term.localeCompare(b.term));

  const serviceLineNames = uniqueSorted(services.map(item => item.serviceLine));
  const resourceServiceLines = uniqueSorted(resources.map(item => item.serviceLine));
  const resourceLevels = uniqueSorted(resources.map(item => getLevelGroup(item.level)));
  resourceCategories = uniqueSorted(resources.map(item => item.sourceType || translateResourceCategory(item)));

  populateFilter(els.serviceFilter, resourceServiceLines, 'All service lines');
  if (els.coverServiceDropdown) populateFilter(els.coverServiceDropdown, serviceLineNames, 'All service lines');
  populateFilter(els.levelFilter, resourceLevels, 'All levels');
  populateFilter(els.categoryFilter, resourceCategories, 'All source types');

  if (els.resourceCount) els.resourceCount.textContent = resources.length;
  if (els.sourceCount) els.sourceCount.textContent = sources.length;
  if (els.serviceCount) els.serviceCount.textContent = services.length;

  renderHealthcareIndustryWatch();
  renderServiceLines();
  renderSources();
  renderCategoryButtons();
  renderTerminologyDictionary();
  renderResources();
  bindEvents();
  resetInsightFilters();
  loadInsights();
  
  // Auto-refresh insights every 5 seconds to catch new form submissions
  setInterval(() => {
    loadInsights();
  }, 5000);
}

function disabledLegacyLocalInsightSubmission() {
    /* Legacy local-only submission path disabled.
    saveInsightLocally(insight);
    addInsightToPage(insight);

    form.reset();

    if (successMessage) {
      successMessage.textContent = '✓ Insight submitted and shown below.';
      setTimeout(() => {
        successMessage.textContent = '';
      }, 4000);
    }

    document.getElementById('employee-insights')?.scrollIntoView({ behavior: 'smooth' });
    */
}

function saveInsightLocally(insight) {
  try {
    const stored = localStorage.getItem('localInsights');
    const insights = stored ? JSON.parse(stored) : [];
    insights.push(insight);
    localStorage.setItem('localInsights', JSON.stringify(insights));
  } catch (e) {
    console.warn('localStorage not available', e);
  }
}

function loadLocalInsights() {
  try {
    const stored = localStorage.getItem('localInsights');
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn('localStorage not available', e);
    return [];
  }
}

function addInsightToPage(insight) {
  const container = document.getElementById('insightsContainer');
  if (!container) return;

  const insightHtml = `
    <article class="insight-card">
      <span class="insight-tag">${escapeHtml(insight.sourceType || 'Insight')}</span>
      <h3>${escapeHtml(insight.title || 'Untitled Insight')}</h3>
      <p><strong>Role:</strong> ${escapeHtml(insight.role || 'Not provided')}</p>
      <p><strong>Key Takeaway:</strong> ${escapeHtml(insight.takeaways || 'No takeaway provided.')}</p>
      <p><strong>Best For:</strong> ${escapeHtml(insight.audience || 'General audience')}</p>
      ${insight.link ? `<a class="insight-link" href="${escapeAttribute(insight.link)}" target="_blank">View Source</a>` : ''}
    </article>
  `;

  if (container.innerHTML.trim() === '<p>No employee insights have been submitted yet.</p>' || container.innerHTML.trim() === '') {
    container.innerHTML = insightHtml;
  } else {
    container.insertAdjacentHTML('beforeend', insightHtml);
  }
}

function resetInsightFilters() {
  const sourceFilter = document.getElementById("insightSourceFilter");
  const roleFilter = document.getElementById("insightRoleFilter");

  if (sourceFilter) sourceFilter.value = "all";
  if (roleFilter) roleFilter.value = "all";
}

const INSIGHTS_API_ENDPOINT = "https://healthcare-industry-trends-prototype.onrender.com/api/insights";
const INSIGHTS_FALLBACK_FILE = "insights.json";

function normalizeAudience(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value !== "string") {
    return value || "";
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.join(', ');
      }
    } catch (error) {
      console.warn("Unable to parse insight audience value.", error);
    }
  }

  return trimmed;
}

function normalizeInsightsData(data) {
  const rawInsights = Array.isArray(data)
    ? data
    : Array.isArray(data?.insights)
      ? data.insights
      : [];

  return rawInsights.map(insight => ({
    id: insight?.id || "",
    title: insight?.title || "Untitled Insight",
    sourceType: insight?.sourceType || "Insight",
    role: insight?.role || "Not provided",
    takeaways: insight?.takeaways || "No takeaway provided.",
    audience: normalizeAudience(insight?.audience) || "General audience",
    link: insight?.link || "",
    submittedAt: insight?.submittedAt || ""
  }));
}

async function fetchInsightsFrom(path, { logBackend = false } = {}) {
  if (logBackend) {
    console.log("backend fetch started");
    console.log("exact API URL being fetched", path);
  }

  const response = await fetch(path, { cache: "no-store" });

  if (logBackend) {
    console.log("response status", response.status);
  }

  if (!response.ok) {
    throw new Error(`Failed to load insights from ${path}: ${response.status}`);
  }

  const data = await response.json();

  if (logBackend) {
    console.log("raw API data", data);
  }

  const insights = normalizeInsightsData(data);

  if (logBackend) {
    console.log("normalized insight data", insights);
  }

  return insights;
}

function renderEmployeeInsights(insights, container) {
  console.log("rendering employee insights count:", insights.length);

  if (!insights.length) {
    container.innerHTML = "<p>No employee insights match those filters yet.</p>";
    return;
  }

  container.innerHTML = insights
    .map((insight) => {
      return `
        <article class="insight-card">
          <span class="insight-tag">${escapeHtml(insight.sourceType || "Insight")}</span>
          <h3>${escapeHtml(insight.title || "Untitled Insight")}</h3>
          <p><strong>Role / Service Line:</strong> ${escapeHtml(insight.role || "Not provided")}</p>
          <p><strong>Key Takeaway:</strong> ${escapeHtml(insight.takeaways || "No takeaway provided.")}</p>
          <p><strong>Best For:</strong> ${escapeHtml(insight.audience || "General audience")}</p>
          ${
            insight.link
              ? `<a class="insight-link" href="${escapeAttribute(insight.link)}" target="_blank">View Source</a>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

async function loadInsights() {
  const container = document.getElementById("insightsContainer");
  const status = document.getElementById("insightsStatus");
  const sourceFilter = document.getElementById("insightSourceFilter")?.value || "all";
  const roleFilter = document.getElementById("insightRoleFilter")?.value || "all";

  if (!container) return;

  try {
    let insights = [];

    try {
      insights = await fetchInsightsFrom(INSIGHTS_API_ENDPOINT, { logBackend: true });
    } catch (apiError) {
      console.warn("Backend insights unavailable; loading local fallback.", apiError);
      insights = await fetchInsightsFrom(INSIGHTS_FALLBACK_FILE);
    }

    insights = normalizeInsightsData(insights);

    if (!insights || insights.length === 0) {
      container.innerHTML = "<p>No employee insights have been submitted yet.</p>";
      if (status) {
        status.textContent = "No employee insights have been submitted yet.";
      }
      return;
    }

    const filteredInsights = insights.filter(insight => {
      const matchesSource = sourceFilter === "all" || insight.sourceType === sourceFilter;
      const matchesRole = roleFilter === "all" || insight.role === roleFilter;
      return matchesSource && matchesRole;
    });

    if (!filteredInsights.length) {
      container.innerHTML = "<p>No employee insights match those filters yet.</p>";
      console.log("rendering employee insights count:", 0);
      console.log("number of rendered insights", 0);
      if (status) {
        status.textContent = "Showing employee insights.";
      }
      return;
    }

    renderEmployeeInsights(filteredInsights, container);

    console.log("number of rendered insights", filteredInsights.length);

    if (status) {
      status.textContent = "Showing employee insights.";
    }
  } catch (error) {
    console.error(error);
    container.innerHTML = "<p>Unable to load employee insights right now.</p>";
    if (status) {
      status.textContent = "Unable to load employee insights right now.";
    }
  }
}

function startApp() {
  init().catch(error => {
    console.error(error);
    document.body.insertAdjacentHTML('afterbegin', '<div class="empty-state">The site could not load its data files. Run it with a local server like Vite instead of opening index.html directly.</div>');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
