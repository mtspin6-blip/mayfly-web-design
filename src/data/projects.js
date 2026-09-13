/**
 * Portfolio index — single source of truth for the /work/ grid and every
 * case-study page (hero facts, next-project nav, schema).
 *
 * `status` is load-bearing and must stay honest:
 *   'shipped' — a real product, publicly live, screenshots are the real thing.
 *   'concept' — an illustrative build for a Montana business type we target.
 *               No client, therefore no metrics, testimonials, or logos. Ever.
 */

export const projects = [
  {
    slug:        'larkspur-construction',
    name:        'Larkspur Construction Group',
    industry:    'Commercial & Custom Residential GC',
    location:    'Bozeman, MT',
    status:      'concept',
    statusLabel: 'Concept Build',
    tagline:     'A 45-person general contractor whose real bottleneck was not leads — it was hiring.',
    scope:       ['Website Design', 'Local SEO', 'Recruiting Funnel'],
    cardBlurb:   'Project portfolio, trade-by-trade capability pages, and a careers funnel built to win crews — not just clients.',
    accent:      '#47598F',
  },
  {
    slug:        'ninebark-ranch',
    name:        'Ninebark Ranch',
    industry:    'Guest Ranch & Lodge',
    location:    'Paradise Valley, MT',
    status:      'concept',
    statusLabel: 'Concept Build',
    tagline:     'An all-inclusive guest ranch selling a $6,400 week — to a guest who will never call first.',
    scope:       ['Website Design', 'Booking Flow', 'SEO + GAIO'],
    cardBlurb:   'Cinematic stay pages, season-aware rates, and an inquiry flow tuned for a high-consideration booking.',
    accent:      '#B5713A',
  },
  {
    slug:        'riverline',
    name:        'Riverline',
    industry:    'Fly Fishing Conditions Platform',
    location:    'Northern Rockies',
    status:      'shipped',
    statusLabel: 'Shipped Product',
    tagline:     'A live conditions dashboard and AI trip planner covering 16 rivers across four states and provinces.',
    scope:       ['Product Design', 'Full-Stack Build', 'AI Integration'],
    liveUrl:     'https://riverline.app',
    liveLabel:   'riverline.app',
    cardBlurb:   'Real-time streamflow, hatch forecasts, and an LLM guide trained on every fly, hatch, and outfitter report.',
    accent:      '#1F5140',
  },
  {
    slug:        'cairn',
    name:        'Cairn',
    industry:    'iOS App & AI Infrastructure',
    location:    'Great Falls, MT',
    status:      'shipped',
    statusLabel: 'Shipped Product',
    tagline:     'An iOS app that turns saved video into structured context Claude and ChatGPT can retrieve mid-conversation.',
    scope:       ['iOS App', 'Backend & MCP Server', 'Design System'],
    cardBlurb:   'Native share extension, transcription pipeline, semantic search, and a live MCP server AI assistants query directly.',
    accent:      '#41697B',
  },
];

/**
 * Secondary industry explorations shown as a compact strip below the main
 * grid. These are positioning tiles, not case studies — no detail pages.
 */
export const explorations = [
  { name: 'Clearwater Outfitters', industry: 'Fly Fishing Outfitter',  city: 'Missoula' },
  { name: 'Highline Brewing Co.',  industry: 'Brewery & Taproom',      city: 'Great Falls' },
  { name: 'Peak HVAC Services',    industry: 'Home Services & Trades', city: 'Billings' },
  { name: 'Ridgeline Coffee',      industry: 'Café & Roastery',        city: 'Missoula' },
  { name: 'Big Sky Dental',        industry: 'Dental Practice',        city: 'Bozeman' },
  { name: 'Bitterroot Realty',     industry: 'Real Estate Brokerage',  city: 'Hamilton' },
];
