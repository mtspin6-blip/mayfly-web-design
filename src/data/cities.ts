// City landing pages. Each entry is written by hand with content specific to that city.
// Rules: no invented clients, results or local presence; numbers only from cited sources.
export interface City {
  slug: string;
  name: string;
  based: boolean; // Mayfly is physically based in Missoula only
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  localContext: { heading: string; paragraphs: string[] };
  searches: { heading: string; intro: string; items: string[] };
  checklist: { heading: string; intro: string; items: { name: string; why: string }[] };
  workWith: string;
  faqs: { q: string; a: string }[];
  sources: { title: string; url: string }[];
  neighbors: string[]; // other city slugs to link
}

export const CITIES: City[] = [
  {
    slug: 'missoula',
    name: 'Missoula',
    based: true,
    title: 'Web Design in Missoula, MT | Mayfly Web Design',
    metaDescription:
      'Missoula web designer building fast, mobile-first websites from $59/month with $0 upfront. Local to Missoula, MT. See plans and book a free call.',
    h1: 'Web design in Missoula, Montana',
    intro:
      "Mayfly is based in Missoula, so this is home turf. We build fast, mobile-first websites for Missoula businesses on a simple subscription: $59 a month for a one-page Starter site or $99 a month for up to five pages, with $0 upfront.",
    localContext: {
      heading: 'What makes a Missoula website different?',
      paragraphs: [
        "Missoula has a college-town rhythm. The University of Montana pulls a wave of new residents and visitors every fall, and a lot of them are searching on their phones for a dentist, a bike shop, a plumber or a place to eat before they know a single local name. If your site loads slowly on a phone or hides your hours, that person taps the next result.",
        "It's also an outdoors town. Rafting, fishing, trail running and hunting shape what people buy and when. Seasonal businesses do best when the site can change with the calendar: winter hours, summer bookings, a clear note when you're closed for elk season. That's a content update, not a rebuild, and it's included in every Mayfly plan.",
      ],
    },
    searches: {
      heading: 'What are Missoula customers actually searching for?',
      intro: 'A few patterns worth building your pages around:',
      items: [
        'Service plus "Missoula" plus a need ("emergency plumber Missoula", "same day dentist Missoula")',
        '"Near me" searches on a phone, often standing in a parking lot or a kitchen',
        'Questions from newcomers ("where to get a Montana driver license", "best vet in Missoula")',
        'Seasonal searches that spike around move-in weeks, hunting season and summer visitors',
      ],
    },
    checklist: {
      heading: 'What should a Missoula small business website include?',
      intro: 'The short list we build around:',
      items: [
        { name: 'A click-to-call button that works on a phone', why: 'Most local searches happen on mobile, and calling is the fastest way to become a customer.' },
        { name: 'Your real service area, named', why: 'Say Missoula, Lolo, Frenchtown, Hamilton or Bonner if you serve them. Vague copy ranks for nothing.' },
        { name: 'Hours that are easy to change', why: 'Seasonal and holiday hours are the number one thing local sites get wrong.' },
        { name: 'A Google Business Profile that matches the site', why: 'Same name, address, phone and hours everywhere. Mismatches confuse Google Maps.' },
        { name: 'Page speed under three seconds', why: 'Static sites on Cloudflare load fast without plugins. Speed is a ranking factor and a patience test.' },
      ],
    },
    workWith:
      "Mayfly is a Missoula company, so you're talking to a local, not a call center. The discovery call happens over video, you get a written spec before we build, a launch in one to two weeks, and small text and photo updates every month after that.",
    faqs: [
      { q: 'How much does a website cost for a Missoula business?', a: 'Starter is $59 a month for a one-page site and Business is $99 a month for up to five pages. Both are $0 upfront with a 6-month minimum. You can buy the site outright later for $750 (Starter) or $1,500 (Business).' },
      { q: 'Do you build websites for businesses outside Missoula?', a: 'Yes. Everything runs over video and email, so Mayfly works with businesses across Montana, including Bozeman, Great Falls and Billings.' },
      { q: 'Will my site show up on Google for Missoula searches?', a: 'Every site ships with basic SEO, a Google Business Profile plan and local schema markup. No one can promise a ranking, but a fast, clear, locally specific site gives you a fair shot.' },
    ],
    sources: [
      { title: 'Montana Free Press: 2020 census counts for Montana counties and cities', url: 'https://montanafreepress.org/2021/08/12/census-releases-detailed-montana-population-data/' },
    ],
    neighbors: ['bozeman', 'great-falls', 'billings'],
  },
  {
    slug: 'bozeman',
    name: 'Bozeman',
    based: false,
    title: 'Web Design in Bozeman, MT | Mayfly Web Design',
    metaDescription:
      'Web design for Bozeman, MT small businesses: fast, mobile-first sites from $59/month, $0 upfront. Built for the Gallatin Valley. Book a free call.',
    h1: 'Web design for Bozeman businesses',
    intro:
      "Mayfly builds websites for Bozeman and Gallatin Valley businesses from our Missoula base. Plans start at $59 a month for a one-page site or $99 a month for up to five pages, $0 upfront, all handled over video and email.",
    localContext: {
      heading: 'What makes a Bozeman website different?',
      paragraphs: [
        "Bozeman is growing fast. Its 2020 census count of 53,293 pushed it past the federal 50,000 mark for a metropolitan area, according to the Montana Free Press. Fast growth means a steady stream of newcomers who don't know local names yet and search cold: contractors, landscapers, vets, restaurants, physical therapists.",
        "Bozeman also sits at the door to a lot of visitor traffic: Yellowstone, Big Sky, and the Gallatin and Madison rivers. Guides, lodging, gear shops and restaurants get customers who plan a trip from a phone weeks ahead. For those businesses the site is the storefront, and booking has to be one tap away.",
      ],
    },
    searches: {
      heading: 'What are Bozeman customers searching for?',
      intro: 'Patterns we design around:',
      items: [
        'Newcomer searches: "contractor Bozeman", "vet accepting new patients Bozeman"',
        'Trip planning: "fly fishing guide near Bozeman", "where to stay near Big Sky"',
        'Student and campus-adjacent searches tied to the Montana State University calendar',
        'Compare-and-choose searches ("best" plus a trade plus "Bozeman") where reviews and clear pricing win',
      ],
    },
    checklist: {
      heading: 'What should a Bozeman business website include?',
      intro: 'What we put first for Gallatin Valley businesses:',
      items: [
        { name: 'A booking or inquiry path in one tap', why: 'Visitors plan ahead and compare a few options. The easiest one to book usually wins.' },
        { name: 'Seasonal content you can change yourself or ask us to', why: 'Summer river season and winter ski season are different businesses. The homepage should reflect the current one.' },
        { name: 'Clear pricing or price ranges', why: 'Newcomers comparing options bounce from sites that hide cost. Say what a typical job or trip runs.' },
        { name: 'Service areas beyond city limits', why: 'Belgrade, Four Corners, Big Sky and Livingston are separate searches. Name the ones you actually serve.' },
        { name: 'Reviews pulled from your real customers', why: 'Show real Google reviews. Never invented ones. Bozeman shoppers read them closely.' },
      ],
    },
    workWith:
      "Mayfly doesn't have a Bozeman office. We work with Bozeman owners over video and email, which keeps the price low. You approve a written spec before we build, launch takes one to two weeks, and small changes are included every month.",
    faqs: [
      { q: 'Are you a Bozeman web design company?', a: 'No. Mayfly is based in Missoula and serves Bozeman remotely. The discovery call, review rounds and launch walkthrough all happen over video and email.' },
      { q: 'How much does a Bozeman business website cost?', a: 'Starter is $59 a month for a one-page site and Business is $99 a month for up to five pages, both with $0 upfront and a 6-month minimum. Booking integration is $99 setup plus $29 a month.' },
      { q: 'Can the site handle seasonal businesses like guides and lodging?', a: 'Yes. Seasonal hours, rates and availability notes are regular content updates, and small text and photo changes are included each month.' },
    ],
    sources: [
      { title: 'Montana Free Press: 2020 census counts for Montana counties and cities', url: 'https://montanafreepress.org/2021/08/12/census-releases-detailed-montana-population-data/' },
    ],
    neighbors: ['missoula', 'great-falls', 'billings'],
  },
  {
    slug: 'great-falls',
    name: 'Great Falls',
    based: false,
    title: 'Web Design in Great Falls, MT | Mayfly Web Design',
    metaDescription:
      'Great Falls, MT web design: fast, mobile-first websites from $59/month with $0 upfront. Built for local trades and shops. Book a free call today.',
    h1: 'Web design for Great Falls businesses',
    intro:
      "Mayfly builds websites for Great Falls businesses from our Missoula base. Plans start at $59 a month for a one-page site or $99 a month for up to five pages, $0 upfront, with the whole process handled over video and email.",
    localContext: {
      heading: 'What makes a Great Falls website different?',
      paragraphs: [
        "Great Falls is Montana's third largest city, at about 60,000 people in the 2020 census per the Census Bureau's QuickFacts. It's a real regional hub for north-central Montana: people drive in from smaller towns for the plumber, the tire shop, the dentist and the furniture store, so your site is competing for a wide service area, not just city limits.",
        "Malmstrom Air Force Base brings a steady flow of military families who move in and out. Households arriving on a move often research services online before they land, so a site that answers \"do you work with newcomers, and how do I book\" up front does real work. The Missouri River and the city's history draw visitors too, which helps restaurants, lodging and shops.",
      ],
    },
    searches: {
      heading: 'What are Great Falls customers searching for?',
      intro: 'A few patterns to build around:',
      items: [
        'Trade searches with "Great Falls" and a specific job ("furnace repair Great Falls", "roof leak Great Falls")',
        'Relocation searches from arriving families ("dentist near Malmstrom", "daycare Great Falls")',
        'Regional searches from surrounding towns that use "Great Falls" as the anchor',
        'Simple "open now" and "phone number" lookups on mobile',
      ],
    },
    checklist: {
      heading: 'What should a Great Falls business website include?',
      intro: 'What we put first for Great Falls businesses:',
      items: [
        { name: 'A named service radius', why: 'List the towns you cover, like Belt, Fort Benton, Cascade or Choteau, so regional customers know you come to them.' },
        { name: 'A clear "new to town" path', why: 'A short section for people relocating, with how to book and what to bring, converts arrivals who have no local referral.' },
        { name: 'Phone-first layout', why: 'Many local jobs still start with a call. Make the number the biggest thing on a phone screen.' },
        { name: 'Accurate hours and holiday notes', why: 'Wrong hours cost more trust than any design problem.' },
        { name: 'A Google Business Profile that matches', why: 'Same name, address and phone on the site, the profile and every directory.' },
      ],
    },
    workWith:
      "Mayfly is in Missoula and serves Great Falls remotely. That's what keeps the price at $59 or $99 a month. You get a written spec to approve before we build, a launch in one to two weeks, and small monthly updates included.",
    faqs: [
      { q: 'Do you have an office in Great Falls?', a: 'No. Mayfly is based in Missoula and works with Great Falls businesses over video and email. There is no travel fee because there is no travel.' },
      { q: 'How much does a Great Falls small business website cost?', a: 'Starter is $59 a month for a one-page site and Business is $99 a month for up to five pages. Both are $0 upfront with a 6-month minimum and can be bought outright later.' },
      { q: 'Can you help my business show up for searches from nearby towns?', a: 'Yes. Naming your real service area on the site and in your Google Business Profile is the starting point, and the Local SEO plan builds on it with monthly work.' },
    ],
    sources: [
      { title: 'U.S. Census Bureau QuickFacts: Great Falls city, Montana', url: 'https://www.census.gov/quickfacts/geo/chart/greatfallscitymontana/PST045221' },
    ],
    neighbors: ['missoula', 'bozeman', 'billings'],
  },
  {
    slug: 'billings',
    name: 'Billings',
    based: false,
    title: 'Web Design in Billings, MT | Mayfly Web Design',
    metaDescription:
      'Billings, MT web design: fast, mobile-first websites from $59/month with $0 upfront. Built for Montana\'s largest city. Book a free call.',
    h1: 'Web design for Billings businesses',
    intro:
      "Mayfly builds websites for Billings businesses from our Missoula base. Plans start at $59 a month for a one-page site or $99 a month for up to five pages, $0 upfront, handled entirely over video and email.",
    localContext: {
      heading: 'What makes a Billings website different?',
      paragraphs: [
        "Billings is Montana's largest city, with about 117,000 residents in the 2020 census according to the Montana Free Press. Bigger city means more competition per search: dozens of roofers, dentists and restaurants all fighting for the same page one. A generic site gets buried, so the details matter more here than in a smaller market.",
        "It's also the commercial hub for eastern Montana and northern Wyoming. Healthcare, agriculture, energy and retail all draw customers from a hundred miles out. Many Billings businesses serve a region, not a neighborhood, which changes how the service area, the pages and the Google Business Profile should be set up.",
      ],
    },
    searches: {
      heading: 'What are Billings customers searching for?',
      intro: 'Patterns we design around:',
      items: [
        'Competitive service searches ("roofer Billings", "commercial cleaning Billings") where page one is crowded',
        'Regional searches from customers in surrounding towns and neighboring Wyoming',
        'Specific-need searches ("same day", "emergency", "open Sunday") that a clear page can win',
        'Comparison searches where reviews, photos and visible pricing decide the click',
      ],
    },
    checklist: {
      heading: 'What should a Billings business website include?',
      intro: 'What we put first in a bigger, more competitive market:',
      items: [
        { name: 'A separate page per service', why: 'In a crowded market, one page per job you want ("roof repair", "roof replacement") beats one page listing everything.' },
        { name: 'Specific proof', why: 'Real photos of your work, real licenses and insurance, and real Google reviews. Nothing invented.' },
        { name: 'A named regional service area', why: 'Say which towns and counties you cover so distant customers know you serve them.' },
        { name: 'Fast mobile load', why: 'In a crowded results page, a slow site loses to the next one before it finishes loading.' },
        { name: 'Structured data on the site', why: 'Local business and service schema help Google and AI assistants read what you do and where.' },
      ],
    },
    workWith:
      "Mayfly is based in Missoula and works with Billings businesses remotely. Because the Business plan supports up to five pages, it fits a service company that needs a page per job. Add the Local SEO plan later if you want monthly search work on top.",
    faqs: [
      { q: 'Are you a Billings web design company?', a: 'No. Mayfly is based in Missoula and serves Billings remotely, over video and email, which is how we keep the monthly price low.' },
      { q: 'What does a website cost for a Billings business?', a: 'Starter is $59 a month for a one-page site and Business is $99 a month for up to five pages, with $0 upfront and a 6-month minimum. Local SEO is $299 a month if you want ongoing search work.' },
      { q: 'Is a five-page site enough in a competitive market like Billings?', a: 'For most small service businesses, yes, if each page targets one specific job or question. Extra pages are $149 each, and bigger builds are quoted.' },
    ],
    sources: [
      { title: 'Montana Free Press: 2020 census counts for Montana counties and cities', url: 'https://montanafreepress.org/2021/08/12/census-releases-detailed-montana-population-data/' },
    ],
    neighbors: ['missoula', 'bozeman', 'great-falls'],
  },
];
