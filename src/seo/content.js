// Phase 06 Module C: the AI Content Studio. Drafts are built only from the business's verified facts. Every sentence
// that makes a checkable claim (numbers, years, prices, licences, guarantees, "best", rankings) is listed for a person
// to confirm before it can be published. Claims that promise search rankings are refused outright.
// Without an AI provider the studio writes plain, modest template drafts and says so.
import { tokens } from './keywords.js';

export const CONTENT_KINDS = {
  landing: 'Landing page', service: 'Service page', industry: 'Industry page', location: 'Service-area page', faq: 'FAQ content', blog: 'Blog article', product: 'Product description',
  meta: 'Meta title and description', schema: 'Schema markup', links: 'Internal-link suggestions', alt: 'Image alt text', refresh: 'Content refresh'
};
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'page';
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

const RULES = [
  [/\b(guarantee[ds]?|guaranteed)\b.*\b(rank|ranking|google|first page|page one|top of search)|\b(rank|ranking)\b.*\bguarantee/i, 'blocked', 'Promises about Google rankings cannot be made and are removed.'],
  [/\b(#\s?1|number one|no\.? ?1|best|leading|top[- ]rated|cheapest|lowest price|award[- ]winning|most trusted|unbeatable)\b/i, 'review', 'Comparative or superlative claim: keep it only if you can prove it.'],
  [/\b(guarantee[ds]?|warrant(y|ies)|100\s?%|always|never fail)\b/i, 'review', 'A promise customers can hold you to: confirm the terms.'],
  [/\b(licen[cs]ed|certified|accredited|insured|registered|qualified|member of)\b/i, 'review', 'Licence, insurance or accreditation claim: confirm it is current.'],
  [/\$\s?\d|\b\d+\s?(dollars|aud)\b/i, 'review', 'Price: confirm it matches your current prices.'],
  [/\b(since|established|founded)\s+(in\s+)?(19|20)\d{2}\b|\b\d+\+?\s+years?\b/i, 'review', 'Years in business or experience: confirm the figure.'],
  [/\b\d{2,}\+?\s+(customers|clients|jobs|projects|homes|reviews|five-star)\b|\b\d+(\.\d)?\s?(stars?|★)/i, 'review', 'A count or rating: confirm it from your records.'],
  [/\b(same[- ]day|within \d+ (minutes|hours)|24\/7|24 hours?)\b/i, 'review', 'Response-time promise: confirm you can always meet it.']
];

// Each sentence is checked. A claim backed by a verified fact (for example a licence number or price in the business
// facts) is marked verified; the rest need a person.
export function checkClaims(text, facts = {}) {
  const verified = [facts.licence, facts.abn, facts.phone, ...(facts.prices || []).map((p) => String(p.price)), facts.founded_year, facts.rating_source && String(facts.rating)].filter(Boolean).map(String);
  const sentences = String(text || '').replace(/\n+/g, '. ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) for (const [re, level, reason] of RULES) if (re.test(s)) { const backed = level === 'review' && verified.some((v) => v && s.includes(v)); out.push({ text: clip(s, 240), level: backed ? 'verified' : level, reason: backed ? 'Matches a verified business fact.' : reason }); break; }
  return out;
}
export const removeBlocked = (text) => String(text || '').split(/(?<=[.!?])\s+/).filter((sentence) => !RULES[0][0].test(sentence)).join(' ').trim();

// Template drafts: plain and factual. Only facts the business gave are used; gaps are left as clear placeholders.
function template(kind, { topic, facts, keywords = [], page = null }) {
  const name = facts.business_name || 'Your business', services = facts.services || [], areas = facts.areas || [];
  const area = areas[0] || '', t = topic || services[0] || 'our services', kw = keywords[0] || t;
  const contact = [facts.phone && `call ${facts.phone}`, facts.email && `email ${facts.email}`].filter(Boolean).join(' or ') || 'contact us';
  const where = areas.length ? ` across ${list(areas.slice(0, 6))}` : '';
  const faqs = [
    [`How do I book ${t.toLowerCase()}?`, `You can ${contact}. Tell us what you need and where, and we will confirm a time with you.`],
    [`Which areas do you cover for ${t.toLowerCase()}?`, areas.length ? `We work${where}. If you are nearby, ask us and we will tell you straight away.` : '[Add the areas you serve in Business facts.]'],
    [`How much does ${t.toLowerCase()} cost?`, (facts.prices || []).length ? `Our current prices: ${facts.prices.slice(0, 4).map((p) => `${p.name} ${p.price}`).join('; ')}. We confirm the price before any work starts.` : 'Every job is different, so we give you a written quote before any work starts.']
  ];
  const heroTitle = `${t}${area ? ' in ' + area : ''}`;
  const base = { method: 'template', slug: slugify(kind === 'blog' ? t : heroTitle) };
  switch (kind) {
    case 'service': case 'landing': case 'location': case 'industry': {
      const intro = kind === 'industry' ? `${name} works with ${t.toLowerCase()} businesses${where}. Here is how we help and how to get started.` : kind === 'location' ? `${name} provides ${services.slice(0, 3).join(', ').toLowerCase() || 'our services'} in ${t}. ${facts.address ? '' : 'We travel to you; we do not have an office in every area we serve.'}` : `${name} provides ${t.toLowerCase()}${where}. Tell us what you need and we will give you a clear quote before any work starts.`;
      return { ...base, title: heroTitle, meta_title: clip(`${heroTitle} | ${name}`, 60), meta_description: clip(`${intro} ${contact.replace(/^./, (c) => c.toUpperCase())}.`, 155),
        blocks: [{ type: 'hero', heading: heroTitle, text: intro, cta_label: 'Get a quote', cta_href: '#contact' },
          { type: 'text', heading: `What our ${t.toLowerCase()} includes`, text: '[Describe what the job includes, in your own words: the steps, what you bring, how long it usually takes.]' },
          services.length > 1 ? { type: 'services', heading: 'Other services', items: services.filter((s) => s !== t).slice(0, 6) } : null,
          areas.length ? { type: 'areas', heading: 'Areas we serve', items: areas.slice(0, 20) } : null,
          { type: 'faq', heading: 'Questions', items: faqs.map(([q, a]) => ({ q, a })) },
          { type: 'contact', heading: 'Get in touch', phone: facts.phone || '', email: facts.email || '', address: facts.address || '' }].filter(Boolean) };
    }
    case 'faq': return { ...base, title: `${t}: common questions`, meta_title: clip(`${t} questions | ${name}`, 60), meta_description: clip(`Answers to common questions about ${t.toLowerCase()} from ${name}.`, 155), blocks: [{ type: 'faq', heading: `${t}: common questions`, items: faqs.map(([q, a]) => ({ q, a })) }] };
    case 'blog': return { ...base, title: clip(`${kw.replace(/^./, (c) => c.toUpperCase())}: what to know`, 70), meta_title: clip(`${kw}: what to know | ${name}`, 60), meta_description: clip(`A plain guide to ${kw} from ${name}: what to check, what it involves and when to call a professional.`, 155),
      blocks: [{ type: 'hero', heading: `${kw.replace(/^./, (c) => c.toUpperCase())}: what to know`, text: '[One or two sentences answering the question directly.]' }, { type: 'text', heading: 'What to check first', text: '[Your practical advice.]' }, { type: 'text', heading: 'When to call a professional', text: `If you are unsure, ${contact}.` }] };
    case 'product': return { ...base, title: t, meta_title: clip(`${t} | ${name}`, 60), meta_description: clip(`${t} from ${name}. [Add the key features and price.]`, 155), blocks: [{ type: 'text', heading: t, text: '[What it is, who it suits, key features and what is included.]' }] };
    case 'meta': return { ...base, title: page?.title || t, meta_title: clip(`${page?.h1?.[0] || t}${area ? ' in ' + area : ''} | ${name}`, 60), meta_description: clip(`${page?.h1?.[0] || t} from ${name}${where}. ${contact.replace(/^./, (c) => c.toUpperCase())} for a quote.`, 155), blocks: [] };
    case 'alt': return { ...base, title: 'Image alt text', alt: (page?.images || []).filter((i) => i.alt === undefined).slice(0, 30).map((i) => ({ src: i.src, alt: altFromName(i.src, t) })), blocks: [] };
    case 'refresh': return { ...base, title: page?.title || t, suggestions: refreshSuggestions(page, keywords, facts), blocks: [] };
    default: return { ...base, title: t, blocks: [] };
  }
}
function altFromName(src, topic) { const n = decodeURIComponent(String(src).split('/').pop() || '').replace(/\.[a-z0-9]+(\?.*)?$/i, '').replace(/[-_]+/g, ' ').replace(/\b(img|image|dsc|photo|pic|\d{3,})\b/gi, '').replace(/\s+/g, ' ').trim(); return n.length >= 4 ? n.replace(/^./, (c) => c.toUpperCase()) : `[Describe this ${topic ? topic.toLowerCase() + ' ' : ''}photo]`; }
function refreshSuggestions(page, keywords, facts) {
  if (!page) return ['Choose a page to refresh.'];
  const out = [], text = (page.text || '').toLowerCase();
  if ((page.words || 0) < 300) out.push(`The page has ${page.words || 0} words. Add useful detail: steps, costs, areas, questions people ask.`);
  for (const k of keywords.slice(0, 5)) if (!tokens(k).every((t) => text.includes(t))) out.push(`Cover "${k}" in a heading or paragraph.`);
  for (const a of (facts.areas || []).slice(0, 5)) if (!text.includes(a.toLowerCase())) out.push(`Mention that you serve ${a}, if you do.`);
  if (!page.description) out.push('Add a meta description.');
  if (!(page.headings || []).some((h) => h.level === 2)) out.push('Break the page up with h2 headings.');
  out.push('Check every price, licence and promise on the page is still true, and update the date if the content changed.');
  return out;
}

// Schema markup from verified facts only.
export function schemaFor(kind, facts, draft = {}) {
  const biz = { '@context': 'https://schema.org', '@type': facts.schema_type || 'LocalBusiness', name: facts.business_name, url: facts.website_url || undefined, telephone: facts.phone || undefined, email: facts.email || undefined,
    address: facts.address ? { '@type': 'PostalAddress', streetAddress: facts.address, addressCountry: 'AU' } : undefined,
    areaServed: (facts.areas || []).length ? facts.areas.map((a) => ({ '@type': 'Place', name: a })) : undefined,
    openingHoursSpecification: (facts.hours || []).length ? facts.hours.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.day, opens: h.opens, closes: h.closes })) : undefined,
    sameAs: (facts.same_as || []).filter((u) => /^https:\/\//.test(u)), identifier: facts.abn ? { '@type': 'PropertyValue', propertyID: 'ABN', value: facts.abn } : undefined };
  const out = [JSON.parse(JSON.stringify(biz))];
  const faq = (draft.blocks || []).find((b) => b.type === 'faq');
  if (faq?.items?.length && !faq.items.some((i) => /^\[/.test(i.a))) out.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) });
  if (['service', 'landing', 'location'].includes(kind) && draft.title) out.push({ '@context': 'https://schema.org', '@type': 'Service', name: draft.title, provider: { '@type': biz['@type'], name: facts.business_name }, areaServed: biz.areaServed });
  if (kind === 'blog' && draft.title) out.push({ '@context': 'https://schema.org', '@type': 'Article', headline: draft.title, author: { '@type': 'Organization', name: facts.business_name }, datePublished: '[set when published]' });
  return out;
}

export function draftText(draft) {
  return [draft.title, draft.meta_description, ...(draft.blocks || []).flatMap((b) => [b.heading, b.text, ...(b.items || []).flatMap((i) => (typeof i === 'string' ? [i] : [i.q, i.a]))])].filter(Boolean).join('\n');
}

// Generate a draft. With AI, only the wording fields come from the model; structure, facts and schema stay ours.
export async function generateDraft({ kind, topic, facts, keywords = [], page = null, internalLinks = [], ai = null }) {
  if (!CONTENT_KINDS[kind]) throw new Error('Unknown content type.');
  let draft = template(kind, { topic, facts, keywords, page });
  if (kind === 'links') draft = { method: 'rules', title: 'Internal-link suggestions', links: internalLinks.slice(0, 30), blocks: [] };
  if (ai && ['service', 'landing', 'location', 'industry', 'faq', 'blog', 'product', 'meta'].includes(kind)) {
    try {
      const out = await ai({
        system: 'You write website copy for an Australian small business. Use ONLY the facts given. Never invent prices, years, licences, awards, ratings, reviews, statistics, guarantees or locations. Never promise Google rankings. Plain Australian English. Reply with JSON only: {"meta_title": string<=60, "meta_description": string<=155, "intro": string, "sections":[{"heading":string,"text":string}], "faqs":[{"q":string,"a":string}]}.',
        user: JSON.stringify({ kind, topic, keywords: keywords.slice(0, 8), facts: { business_name: facts.business_name, services: facts.services, areas: facts.areas, phone: facts.phone, email: facts.email, prices: facts.prices, hours: facts.hours } })
      });
      const j = JSON.parse(String(out).replace(/^```(json)?|```$/g, '').trim());
      if (j && typeof j.meta_title === 'string') {
        draft.meta_title = clip(j.meta_title, 60); draft.meta_description = clip(j.meta_description, 155); draft.method = 'ai';
        if (draft.blocks.length) {
          const hero = draft.blocks.find((b) => b.type === 'hero'); if (hero && j.intro) hero.text = clip(j.intro, 600);
          const sections = (j.sections || []).slice(0, 6).map((s) => ({ type: 'text', heading: clip(s.heading, 90), text: clip(s.text, 1500) }));
          if (sections.length) draft.blocks = [hero, ...sections, ...draft.blocks.filter((b) => b.type !== 'hero' && b.type !== 'text' && b.type !== 'faq')].filter(Boolean);
          if ((j.faqs || []).length) draft.blocks.push({ type: 'faq', heading: 'Questions', items: j.faqs.slice(0, 8).map((f) => ({ q: clip(f.q, 160), a: clip(f.a, 700) })) });
        }
      }
    } catch { draft.note = 'The AI provider did not return a usable draft, so a plain template was used.'; }
  }
  if (['service', 'landing', 'location', 'industry', 'faq', 'blog', 'schema'].includes(kind)) draft.schema = schemaFor(kind === 'schema' ? 'service' : kind, facts, draft);
  const claims = checkClaims(draftText(draft), facts);
  if (claims.some((c) => c.level === 'blocked')) {
    for (const b of draft.blocks) { if (b.text) b.text = removeBlocked(b.text); if (b.items) b.items = b.items.map((it) => (typeof it === 'object' && it.a ? { ...it, a: removeBlocked(it.a) } : it)); }
    draft.meta_description = removeBlocked(draft.meta_description);
  }
  const placeholders = (draftText(draft).match(/\[[^\]]{3,}\]/g) || []).length;
  return { kind, kind_label: CONTENT_KINDS[kind], ...draft, claims, needs_review: claims.some((c) => c.level === 'review') || placeholders > 0, placeholders,
    facts_used: Object.entries(facts).filter(([, v]) => (Array.isArray(v) ? v.length : v)).map(([k]) => k) };
}
