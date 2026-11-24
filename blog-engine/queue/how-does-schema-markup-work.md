---
title: How Does Schema Markup Work? 7 Myths vs. Facts
description: How does schema markup work? A plain-English look at what Google and Bing actually do with it, plus 7 myths checked against official sources.
excerpt: Schema markup labels the facts on your page so search engines don't have to guess. Here's what it really does for a small business site, and what it doesn't.
category: AI Search
readTime: 6 min read
pillar: ai-search
format: myth-vs-fact
primaryKeyword: how does schema markup work
cta: Have Mayfly Review My Site's Schema
sources:
  - title: Introduction to structured data markup in Google Search
    url: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
  - title: Schema.org (home page)
    url: https://schema.org
  - title: General structured data guidelines
    url: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
  - title: Google Confirms That Structured Data Won't Make A Site Rank Better (Search Engine Journal)
    url: https://www.searchenginejournal.com/google-confirms-that-structured-data-wont-make-a-site-rank-better/544433/
  - title: AI features and your website (Google Search Central)
    url: https://developers.google.com/search/docs/appearance/ai-features
  - title: Changes to HowTo and FAQ rich results (Google Search Central Blog)
    url: https://developers.google.com/search/blog/2023/08/howto-faq-changes
  - title: Microsoft Confirms Schema Helps Its LLMs (Copilot) Understand Your Content (Search Engine Roundtable)
    url: https://www.seroundtable.com/schema-llms-copilot-bing-microsoft-39093.html
  - title: Local Business (LocalBusiness) structured data
    url: https://developers.google.com/search/docs/appearance/structured-data/local-business
  - title: Rich Results Test (Search Console Help)
    url: https://support.google.com/webmasters/answer/7445569
faq:
  - q: Is schema markup the same as structured data?
    a: Close enough for most owners. Structured data is the general idea of describing a page in a standard, machine-readable format. Schema markup usually means doing that with the Schema.org vocabulary, which is what most Google Search structured data uses. You'll see the two terms swapped freely.
  - q: How do I check whether my website already has schema markup?
    a: Open Google's Rich Results Test and enter your homepage URL. It reads JSON-LD, Microdata and RDFa, then lists the rich result types it found plus any errors or suggestions. If it finds nothing, there's no markup on that page it can use for rich results. You can also paste raw code into the tool to test it before publishing.
  - q: Should I delete old FAQ schema from my site?
    a: Not in a hurry. Google cut back FAQ rich results in August 2023, so the markup rarely earns a bigger listing now. Keep it if it matches visible questions on the page. If those questions are gone, delete the markup so it doesn't describe content readers can't see.
  - q: Will schema markup help my business show up in ChatGPT?
    a: We can't promise that. Bing's Fabrice Canel said in March 2025 that Bing processes schema for web search and Copilot, and Google says its AI Overviews need no special schema. We don't have official ChatGPT documentation on schema to point you to, so treat accurate markup as housekeeping, not a guaranteed way in.
date: "2026-11-23"
author: Mayfly Web Design
draft: false
---

Schema markup is a block of code, usually JSON-LD, that labels the facts on your page: business name, address, hours, prices. It uses the [shared Schema.org vocabulary](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data). So how does schema markup work in practice? Google reads it to understand the page and decide whether it qualifies for rich results. What it doesn't do: [boost rankings](https://www.searchenginejournal.com/google-confirms-that-structured-data-wont-make-a-site-rank-better/544433/), [guarantee stars](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), or get you into [AI Overviews](https://developers.google.com/search/docs/appearance/ai-features) on its own.

## What is schema markup, in plain English?

Think of it as a label maker for your website. Your page already says "Open 8 to 6" somewhere. Schema tells a search engine, in a format it can't misread, that those numbers are your hours.

Google's own definition is drier. It calls structured data a [standardized format for giving information about a page and classifying its content](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data), and says most of the structured data Google Search uses relies on the Schema.org vocabulary.

That vocabulary isn't one company's pet project. [Schema.org](https://schema.org) is a shared vocabulary that site owners use to label their pages. That's a lot of labels.

You can write it three ways: JSON-LD, Microdata or RDFa. Google [generally recommends JSON-LD](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) if your setup allows it, and says all three are equally fine when done correctly. We'd pick JSON-LD. It sits in one tidy block instead of being sprinkled through your page.

Here's what that block looks like. It's an illustration for a made-up Missoula fly shop, not a real business and not a client. The properties come straight from [Google's LocalBusiness documentation](https://developers.google.com/search/docs/appearance/structured-data/local-business).

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Example Fly Shop",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "100 Example Street",
    "addressLocality": "Missoula",
    "addressRegion": "MT",
    "postalCode": "59801",
    "addressCountry": "US"
  },
  "telephone": "+1-406-555-0100",
  "url": "https://www.example.com",
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 46.87215,
    "longitude": -113.99400
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      "opens": "08:00",
      "closes": "18:00"
    }
  ],
  "priceRange": "$$"
}
```

Line by line. `@context` says you're using the Schema.org vocabulary. `@type` says what kind of thing this is. Google [lists](https://developers.google.com/search/docs/appearance/structured-data/local-business) `name` and `address` as properties for a local business. The rest are recommended: `telephone`, `url`, `geo`, `openingHoursSpecification` and `priceRange`. Two fussy details from the same page. Coordinates in `geo` need at least five decimal places. And `priceRange` has to stay under 100 characters.

## How does schema markup actually work behind the scenes?

It's a note to the crawler, and the note has to agree with the page. Here's the sequence.

1. The code sits in your page's source, usually inside a script tag. Visitors never see it, so your design doesn't change.
2. Google's crawler reads it alongside your visible text. The two have to match, and Google's [general guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) say not to mark up content readers can't see.
3. Google checks the markup against the rules for each feature. A LocalBusiness block without `name` and `address` is [missing required properties](https://developers.google.com/search/docs/appearance/structured-data/local-business).
4. Google decides whether to show a rich result. Being eligible isn't a promise, as Google [says plainly](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).
5. You verify it with the [Rich Results Test](https://support.google.com/webmasters/answer/7445569), which reads all three formats and shows the rich result types it found plus any errors or suggestions.

Now for the folklore.

## Does schema markup make your site rank higher?

Myth one says schema is a ranking trick. It isn't. Google's John Mueller said in April 2025 that structured data won't make a site rank better, [echoing a 2018 statement](https://www.searchenginejournal.com/google-confirms-that-structured-data-wont-make-a-site-rank-better/544433/) that there's no generic ranking boost. If someone sells it to you that way, push back.

It still has a job. Schema helps Google understand a page, and rich results can change how your listing looks in search. Whether that earns you more clicks depends on your business and your searchers, so don't count on a specific lift.

## Does valid markup guarantee stars and rich results?

Myth two says valid code means stars. Valid markup gets you in line. It doesn't get you served. Google states it [doesn't guarantee structured data will show up](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) in search results, even when it passes the Rich Results Test.

Site quality matters too, and so does following Google's policies. A clean test result means you did your part, but whether stars, prices or hours actually appear next to your listing on a given search is Google's call, not yours.

## Is FAQ schema still a shortcut to bigger listings?

Myth three says FAQ schema gets you a bigger listing. Google [changed how FAQ and HowTo rich results appear](https://developers.google.com/search/blog/2023/08/howto-faq-changes). A Great Falls roofer shouldn't expect one.

What about old markup already on your site? Keep it if it still matches questions people can see on the page. We wouldn't add new FAQ schema hoping for a bigger listing. We also wouldn't burn an afternoon deleting it.

## Do I need special schema to appear in Google AI Overviews?

Myth four says AI Overviews need special markup. They don't. Google's [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) page says there's no special schema.org structured data to add for AI Overviews or AI Mode. No new machine-readable files or AI text files either.

What it does still recommend is the boring basic: make sure your structured data matches the visible text on the page. Accurate beats clever. For the bigger picture on how AI tools pick sources, our explainer on [generative engine optimization](/blog/what-is-generative-engine-optimization/) covers it.

## Do AI assistants ignore schema completely?

Myth five says AI assistants ignore schema completely. At least one says otherwise. At SMX Munich in March 2025, Bing's Fabrice Canel said schema helps Microsoft's LLMs, including Copilot, understand content. He also said Bing processes schema for both web search and its LLMs, as Search Engine Land reported. [Search Engine Roundtable](https://www.seroundtable.com/schema-llms-copilot-bing-microsoft-39093.html) covered the same confirmation.

Keep that in proportion. It's a conference statement as reported by trade press, not formal documentation, and it's about Bing, so it tells you nothing about ChatGPT or any other assistant and we won't pretend it does.

## Can you mark up anything you want?

Myth six says you can mark up anything you want. This is the one that can actually hurt you. Google's guidelines say [don't mark up content that isn't visible to readers](https://developers.google.com/search/docs/appearance/structured-data/sd-policies). Spammy structured data can lead to a manual action that removes your rich result eligibility.

Say a plugin adds five-star review markup to your homepage, but no reviews appear anywhere on that page. That's exactly the mismatch the rules warn about. Same page, one more trap: don't block pages that carry structured data from Googlebot in your robots.txt file. If Google can't crawl it, the markup does nothing.

## Is more markup always better?

Myth seven says more markup is always better. No. Most owners don't need dozens of schema types. Google says it's [more important to supply fewer but complete and accurate recommended properties](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) than to fill in every field.

For a local business, start with one solid LocalBusiness block like the sample above. Name, address, phone and hours should match your site and your [Google Business Profile](/blog/how-to-get-google-business-profile/) word for word. Put your effort there first. It fits with the rest of [how local SEO works](/blog/how-does-local-seo-work/).

## Where does schema help, and where doesn't it?

Here's the whole picture on one screen, built only from the sources above.

| Where you show up | Does schema help? | Is it required? | What the source actually says | Source |
|---|---|---|---|---|
| Google classic rankings | No direct boost | No | Structured data won't make a site rank better (Mueller, April 2025) | [Search Engine Journal](https://www.searchenginejournal.com/google-confirms-that-structured-data-wont-make-a-site-rank-better/544433/) |
| Google rich results (general) | Yes, makes a page eligible | Yes, for rich results | No guarantee it shows, even after passing the Rich Results Test | [Google guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) |
| FAQ and HowTo rich results | Rarely, for small businesses | N/A | Google changed how FAQ and HowTo rich results appear in August 2023 | [Google blog](https://developers.google.com/search/blog/2023/08/howto-faq-changes) |
| Google AI Overviews and AI Mode | Not a special requirement | No | No special schema or AI text files needed. Keep markup matching visible text | [Google AI features](https://developers.google.com/search/docs/appearance/ai-features) |
| Bing search and Copilot | Reportedly yes | Not stated | Bing processes schema for web search and LLMs (Canel, SMX Munich 2025) | Search Engine Land |
| Google local business details | Yes, clarifies your facts | Name and address required for the markup | Recommends telephone, openingHoursSpecification, geo, url and priceRange | [Google LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business) |

Want to check your own site this week? It takes about ten minutes.

- Run your homepage through the [Rich Results Test](https://support.google.com/webmasters/answer/7445569) and note any errors.
- Confirm the name, address and phone in the markup match what's printed on the page.
- Remove markup for anything that isn't actually on the page, like reviews or hours you no longer keep.
- Re-test after every edit.

If you'd rather have someone else look, book a free call and we'll go over your site's markup with you, page by page, and tell you plainly what's worth fixing and what you can leave alone. Schema also comes up in our [SEO and AI search work](/services/seo-gaio/) and when we build a [website](/services/website-design/).
