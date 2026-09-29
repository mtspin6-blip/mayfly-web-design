/**
 * Portfolio index — single source of truth for the /work/ grid and every
 * case-study page (hero facts, next-project nav, schema).
 *
 * `status` is load-bearing and must stay honest:
 *   'shipped' — a real product, publicly live, screenshots are the real thing.
 *   'building' — our own product, in active development; its public launch
 *               site is live, the product itself isn't released yet.
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
    slug:        'quiver',
    name:        'Quiver',
    industry:    'iOS App & AI Infrastructure',
    location:    'Great Falls, MT',
    status:      'building',
    statusLabel: 'Launching Dec 2026',
    tagline:     'An iOS app that breaks down the posts creators save — and hands the whole library to Claude, ChatGPT, or any AI tool.',
    scope:       ['iOS App', 'Backend & MCP Server', 'Design System', 'Launch Site'],
    liveUrl:     'https://quivercontent.app',
    liveLabel:   'quivercontent.app',
    cardBlurb:   'Share-sheet saving, AI format breakdowns that read on-screen text, and a live MCP server for Claude, ChatGPT, and Cursor.',
    accent:      '#14213D',
  },
];
