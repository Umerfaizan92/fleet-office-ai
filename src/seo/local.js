// Phase 06 Module E: local SEO. Compares the business's own facts, its website and its Google Business Profile, and
// says exactly where they disagree. Location pages are offered only for real service areas, and are written as
// "we travel to you" pages unless the business has a real address there. Review replies are drafts; posting one is a
// Level 3 action. Reviews are never written, requested in exchange for anything, or invented.
import { tokens } from './keywords.js';

const digits = (p) => String(p || '').replace(/\D/g, '').replace(/^61/, '0');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export function localAudit({ facts = {}, site = null, gbp = null, reviews = null, photos = null }) {
  const checks = [], add = (area, level, title, detail, how = '') => checks.push({ area, level, title, detail, how });
  const html = site?.html || '', text = String(site?.text || '').toLowerCase();
  // Consistent contact details (name, address, phone) across facts, website and Google profile.
  const sources = [['Business facts', facts], ['Website', site ? { business_name: site.ld_name || null, phone: site.phones?.[0] || null, address: site.ld_address || null } : null], ['Google Business Profile', gbp ? { business_name: gbp.title, phone: gbp.phone, address: gbp.address } : null]].filter(([, v]) => v);
  for (const [field, label, cmp] of [['business_name', 'Business name', norm], ['phone', 'Phone number', digits], ['address', 'Address', (a) => norm(String(a || '').split(',')[0])]]) {
    const vals = sources.map(([n, v]) => [n, v[field]]).filter(([, v]) => v);
    const distinct = [...new Set(vals.map(([, v]) => cmp(v)))];
    if (vals.length < 2) add('nap', 'setup', `${label}: not enough sources to compare`, vals.length ? `Only ${vals[0][0]} has it.` : 'Not recorded anywhere yet.', field === 'address' && !facts.address ? 'Service-area businesses without a shopfront can leave the street address hidden on Google.' : 'Add it to Business facts and your website.');
    else if (distinct.length > 1) add('nap', 'fix', `${label} is different in different places`, vals.map(([n, v]) => `${n}: ${v}`).join(' · '), 'Use exactly the same details everywhere.');
    else add('nap', 'good', `${label} matches`, vals.map(([n]) => n).join(', '));
  }
  if (site && facts.phone && !html.includes('tel:')) add('nap', 'improve', 'No tap-to-call link on the website', '', 'Link your phone number with tel: so phones can call it.');
  // Profile accuracy
  if (!gbp) add('profile', 'setup', 'Google Business Profile not connected', 'Connect it in the Google Integration Centre to check categories, hours, photos and reviews.');
  else {
    if (!gbp.primary_category) add('profile', 'fix', 'No primary category on Google', '', 'Choose the category that best describes what you do.'); else add('profile', 'good', `Primary category: ${gbp.primary_category}`, gbp.additional_categories.length ? `Also: ${gbp.additional_categories.join(', ')}` : 'No additional categories.');
    const services = facts.services || [];
    const missing = services.filter((s) => !tokens(s).some((t) => tokens([gbp.primary_category, ...gbp.additional_categories].join(' ')).includes(t)));
    if (missing.length && services.length) add('profile', 'improve', 'Services not reflected in your Google categories', missing.join(', '), 'Add a matching additional category if Google offers one. Only list what you really do.');
    if (!gbp.hours.length) add('hours', 'fix', 'No opening hours on Google', '', 'Add your regular hours.');
    else {
      const days = new Set(gbp.hours.map((h) => h.day));
      add('hours', 'good', `Hours set for ${days.size} day(s)`, DAYS.filter((d) => days.has(d)).map((d) => d.slice(0, 3)).join(', '));
      if ((facts.hours || []).length) { const diff = facts.hours.filter((h) => !gbp.hours.some((g) => g.day === h.day && g.opens === h.opens && g.closes === h.closes)); if (diff.length) add('hours', 'fix', 'Hours on Google differ from your business facts', diff.map((h) => `${h.day.slice(0, 3)} ${h.opens}–${h.closes}`).join(', ')); }
    }
    if (!gbp.description) add('profile', 'improve', 'No business description on Google', '', 'Write a plain description of what you do and where.');
    if (gbp.website && facts.website_url && norm(new URL(gbp.website).host) !== norm(new URL(facts.website_url).host)) add('profile', 'fix', 'Google lists a different website', `${gbp.website} vs ${facts.website_url}`);
  }
  // Service areas and location pages
  const areas = facts.areas || [];
  if (!areas.length) add('areas', 'setup', 'No service areas recorded', '', 'List the suburbs or regions you really serve in Business facts.');
  else {
    if (gbp && !gbp.has_storefront && !gbp.service_areas.length) add('areas', 'fix', 'Google profile has no address and no service area', '', 'Add your service areas on Google.');
    if (gbp?.service_areas?.length) { const missing = areas.filter((a) => !gbp.service_areas.some((g) => norm(g).includes(norm(a)))); if (missing.length) add('areas', 'improve', 'Areas you serve that are not on your Google profile', missing.join(', ')); }
    const onSite = areas.filter((a) => text.includes(a.toLowerCase()));
    add('areas', onSite.length === areas.length ? 'good' : 'improve', `${onSite.length} of ${areas.length} service area(s) mentioned on your website`, areas.filter((a) => !onSite.includes(a)).join(', '), 'Mention each area you serve, or create a service-area page for the main ones.');
  }
  // Local structured data
  if (site) {
    const lb = (site.ld || []).find((x) => [].concat(x?.['@type'] || []).some((t) => /LocalBusiness|Plumber|Electrician|Contractor|Service|Store|Business/.test(t)));
    if (!lb) add('schema', 'fix', 'No LocalBusiness structured data on the home page', '', 'Copy the generated LocalBusiness markup into your site, or publish with the Website Builder.');
    else { const miss = ['name', 'telephone', 'areaServed', 'openingHoursSpecification'].filter((k) => !lb[k]); add('schema', miss.length ? 'improve' : 'good', miss.length ? `LocalBusiness markup is missing ${miss.join(', ')}` : 'LocalBusiness markup is complete', ''); }
  }
  // Reviews and photos
  if (reviews) {
    const unanswered = reviews.reviews.filter((r) => !r.reply);
    add('reviews', unanswered.length ? 'improve' : 'good', `${reviews.total ?? reviews.reviews.length} Google review(s), average ${reviews.average ?? 'not shown'}`, unanswered.length ? `${unanswered.length} without a reply.` : 'Every review has a reply.', 'Reply to every review, good or bad. Super Pro drafts replies; you approve each one.');
  } else add('reviews', 'setup', 'Reviews not read yet', 'Connect Google Business Profile to read reviews.');
  if (photos !== null) add('photos', photos >= 10 ? 'good' : photos ? 'improve' : 'fix', `${photos} photo(s) on your Google profile`, '', 'Add real photos of your work, team and vehicles. Only use photos you own.');
  return checks;
}

// Draft a reply. Plain, specific, no incentives, no personal details, no admission of liability.
export function reviewReplyDraft(review, facts = {}) {
  const first = String(review.reviewer || '').split(' ')[0];
  const name = first && !/anonymous|google user/i.test(first) ? ` ${first}` : '';
  const biz = facts.business_name || 'the team';
  if ((review.rating || 0) >= 4) return `Thanks${name} for taking the time to leave a review. We're glad it went well and appreciate you choosing ${biz}.`;
  if ((review.rating || 0) === 3) return `Thanks${name} for the feedback. We'd like to hear what we could have done better. Please contact us${facts.phone ? ' on ' + facts.phone : ''} so we can talk it through.`;
  return `Hi${name}, we're sorry your experience fell short. We'd like to understand what happened and put it right. Please contact us${facts.phone ? ' on ' + facts.phone : ''}${facts.email ? ' or at ' + facts.email : ''}.`;
}

// Service-area page suggestions: only areas the business says it serves. No fake addresses, ever.
export function locationPageIdeas(facts = {}, existingPages = []) {
  const have = existingPages.map((p) => (p.title + ' ' + p.url).toLowerCase());
  return (facts.areas || []).slice(0, 30).map((a) => ({ area: a, exists: have.some((h) => h.includes(a.toLowerCase())), type: facts.address && String(facts.address).toLowerCase().includes(a.toLowerCase()) ? 'location' : 'service_area', note: facts.address && String(facts.address).toLowerCase().includes(a.toLowerCase()) ? 'You have an address here.' : 'You travel here. The page must not suggest an office or shopfront in this area.' }));
}
