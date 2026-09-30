// Post-build validator: JSON-LD parses and has required fields, titles/meta are within length, canonicals are apex.
// Usage: npm run build && npm run validate
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const errors = [];
const warnings = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.join(dir, e.name)] : [],
  );
}

const REQUIRED = {
  BlogPosting: ['headline', 'datePublished', 'author', 'publisher', 'image'],
  Organization: ['name'],
  FAQPage: ['mainEntity'],
  BreadcrumbList: ['itemListElement'],
  Service: ['name', 'provider'],
  LocalBusiness: ['name', 'address'],
};

function checkNode(node, file) {
  if (!node || typeof node !== 'object') return;
  if (Object.keys(node).every((k) => k === '@id')) return; // reference to a node defined elsewhere
  const types = [].concat(node['@type'] ?? []);
  for (const t of types) {
    for (const f of REQUIRED[t] ?? []) if (node[f] === undefined) errors.push(`${file}: ${t} missing "${f}"`);
    if (t === 'FAQPage') {
      const n = node.mainEntity?.length ?? 0;
      if (n < 1) errors.push(`${file}: FAQPage has no questions`);
      for (const q of node.mainEntity ?? []) if (!q.name || !q.acceptedAnswer?.text) errors.push(`${file}: FAQ item incomplete`);
    }
    if (t === 'BreadcrumbList') {
      (node.itemListElement ?? []).forEach((it, i) => {
        if (it.position !== i + 1 || !it.name || !it.item) errors.push(`${file}: breadcrumb ${i + 1} malformed`);
      });
    }
  }
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((x) => checkNode(x, file));
    else if (v && typeof v === 'object') checkNode(v, file);
  }
}

for (const file of walk(dist)) {
  const rel = path.relative(dist, file);
  if (rel === '404.html' || rel.startsWith('services/seo-geo')) continue;
  const html = fs.readFileSync(file, 'utf8');

  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (!title) errors.push(`${rel}: no <title>`);
  else if (title.length > 65) warnings.push(`${rel}: title ${title.length} chars (>65)`);
  if (!desc) errors.push(`${rel}: no meta description`);
  else if (desc.length > 160) warnings.push(`${rel}: meta description ${desc.length} chars (>160)`);
  else if (desc.length < 100) warnings.push(`${rel}: meta description ${desc.length} chars (<100)`);
  if (!canon || !canon.startsWith('https://mayflywebdesign.com/')) errors.push(`${rel}: canonical not on apex host (${canon})`);
  if (canon && canon.includes('://www.')) errors.push(`${rel}: canonical uses www`);

  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      const list = Array.isArray(j) ? j : j['@graph'] ?? [j];
      list.forEach((n) => checkNode(n, rel));
      const dump = JSON.stringify(j);
      if (dump.includes('//www.mayflywebdesign.com')) errors.push(`${rel}: schema contains www URL`);
    } catch (e) {
      errors.push(`${rel}: invalid JSON-LD (${e.message})`);
    }
  }
}

const sm = path.join(dist, 'sitemap-0.xml');
if (!fs.existsSync(sm)) errors.push('sitemap-0.xml missing');
if (fs.existsSync(path.join(dist, 'sitemap.xml'))) errors.push('stray hand-written sitemap.xml present');

warnings.forEach((w) => console.warn('warn ', w));
errors.forEach((e) => console.error('ERROR', e));
console.log(`\nvalidate-site: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
