// Phase 06 Module F: the website builder's page model, renderer and pre-publish checks. Pure functions.
// A page is a list of blocks (hero, text, services, areas, faq, cta, contact, image, gallery, reviews). Rendering escapes
// every value, produces one h1, accessible markup and responsive CSS from the business's brand colours. Reviews blocks
// show only reviews the business imported from a real source, with that source named.
import { checkClaims, draftText } from './content.js';

export const BLOCK_TYPES = ['hero', 'text', 'services', 'areas', 'faq', 'cta', 'contact', 'image', 'gallery', 'reviews'];
export const TEMPLATES = {
  service: { name: 'Service page', blocks: ['hero', 'text', 'services', 'areas', 'faq', 'contact'] },
  home: { name: 'Home page', blocks: ['hero', 'services', 'text', 'areas', 'reviews', 'cta', 'contact'] },
  location: { name: 'Service-area page', blocks: ['hero', 'text', 'services', 'faq', 'contact'] },
  about: { name: 'About page', blocks: ['hero', 'text', 'image', 'contact'] },
  contact: { name: 'Contact page', blocks: ['hero', 'contact'] },
  article: { name: 'Blog article', blocks: ['hero', 'text', 'text', 'cta'] }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u, { allowHash = true } = {}) => { const s = String(u || '').trim(); if (allowHash && /^#[\w-]*$/.test(s)) return s; if (/^\/(?!\/)[^\s]*$/.test(s)) return s; if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s; if (/^(tel|mailto):[^\s"'<>]+$/i.test(s)) return s; return ''; };

// --------------------------------------------------------------------------------- colour and contrast ---
function lum(hex) { const m = String(hex || '').replace('#', '').match(/^([0-9a-f]{6})$/i); if (!m) return null; const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a, b) { const x = lum(a), y = lum(b); if (x === null || y === null) return null; const [hi, lo] = x > y ? [x, y] : [y, x]; return +((hi + 0.05) / (lo + 0.05)).toFixed(2); }
export function themeFrom(brand = {}) {
  const primary = /^#[0-9a-f]{6}$/i.test(brand.primary_color || '') ? brand.primary_color : '#1f4e79';
  const onPrimary = (contrast(primary, '#ffffff') || 0) >= 4.5 ? '#ffffff' : '#111827';
  return { primary, on_primary: onPrimary, text: '#1b1f24', muted: '#4b5563', background: '#ffffff', surface: '#f4f6f8', font: brand.font || 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' };
}

// --------------------------------------------------------------------------------- render ---
// A plain HTML form (no scripts) that posts to the business's inbox. Marketing consent is a separate, unticked box.
function contactForm(site, page, status) {
  const back = `/sites/${site.slug}/${page.slug === 'home' ? '' : page.slug}`;
  return `${status === 'sent' ? '<p class="note" role="status">Thanks. Your message has been sent.</p>' : status === 'error' ? '<p class="note bad" role="alert">Please add your name, a message, and an email or phone number.</p>' : ''}<form class="form" method="post" action="/api/public/contact/${esc(site.slug)}"><input type="hidden" name="return_to" value="${esc(back)}"><label>Name<input name="name" required maxlength="120" autocomplete="name"></label><label>Email<input name="email" type="email" maxlength="254" autocomplete="email"></label><label>Phone<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label><label>How can we help?<textarea name="message" required rows="5" maxlength="5000"></textarea></label><label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label><label class="check"><input type="checkbox" name="marketing_consent" value="yes"> Send me news and offers. I can unsubscribe at any time.</label><button class="btn" type="submit">Send message</button><p class="small">We use your details only to reply to you${site.name ? ` (${esc(site.name)})` : ''}.</p></form>`;
}
export function renderPage(page, { site = {}, theme = themeFrom(site.brand), canonical = '', nav = [], preview = false, reviews = [], formStatus = null } = {}) {
  const blocks = page.blocks || [];
  let h1Done = false;
  const H = (text) => { if (!h1Done) { h1Done = true; return `<h1>${esc(text)}</h1>`; } return `<h2>${esc(text)}</h2>`; };
  const img = (b) => { const src = safeUrl(b.src, { allowHash: false }); if (!src) return ''; return `<img src="${esc(src)}" alt="${esc(b.alt ?? '')}"${b.width ? ` width="${Number(b.width) | 0}"` : ''}${b.height ? ` height="${Number(b.height) | 0}"` : ''} loading="lazy" decoding="async">`; };
  const body = blocks.map((b) => {
    switch (b.type) {
      case 'hero': return `<section class="hero">${H(b.heading || page.title)}${b.text ? `<p class="lead">${esc(b.text)}</p>` : ''}${safeUrl(b.cta_href) && b.cta_label ? `<p><a class="btn" href="${esc(safeUrl(b.cta_href))}">${esc(b.cta_label)}</a></p>` : ''}</section>`;
      case 'text': return `<section>${b.heading ? H(b.heading) : ''}${String(b.text || '').split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')}</section>`;
      case 'services': case 'areas': return `<section>${b.heading ? H(b.heading) : ''}<ul class="chips">${(b.items || []).map((i) => `<li>${b.links?.[i] && safeUrl(b.links[i]) ? `<a href="${esc(safeUrl(b.links[i]))}">${esc(i)}</a>` : esc(i)}</li>`).join('')}</ul></section>`;
      case 'faq': return `<section class="faq">${b.heading ? H(b.heading) : ''}${(b.items || []).map((i) => `<details><summary>${esc(i.q)}</summary><p>${esc(i.a)}</p></details>`).join('')}</section>`;
      case 'cta': return `<section class="cta">${b.heading ? H(b.heading) : ''}${b.text ? `<p>${esc(b.text)}</p>` : ''}${safeUrl(b.href) ? `<p><a class="btn" href="${esc(safeUrl(b.href))}">${esc(b.label || 'Contact us')}</a></p>` : ''}</section>`;
      case 'contact': return `<section id="contact" class="contact">${H(b.heading || 'Contact')}<ul>${b.phone ? `<li>Phone: <a href="tel:${esc(String(b.phone).replace(/[^\d+]/g, ''))}">${esc(b.phone)}</a></li>` : ''}${b.email ? `<li>Email: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>` : ''}${b.address ? `<li>${esc(b.address)}</li>` : ''}</ul>${b.form && site.slug ? contactForm(site, page, formStatus) : ''}</section>`;
      case 'image': return `<figure>${img(b)}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`;
      case 'gallery': return `<section>${b.heading ? H(b.heading) : ''}<div class="gallery">${(b.images || []).map(img).join('')}</div></section>`;
      case 'reviews': { const list = reviews.slice(0, b.limit || 6); if (!list.length) return ''; return `<section>${H(b.heading || 'What customers say')}${list.map((r) => `<blockquote><p>${esc(r.comment)}</p><footer>${esc(r.reviewer)}${r.rating ? ` · ${'★'.repeat(r.rating)}<span class="sr"> ${r.rating} out of 5</span>` : ''} · <cite>${esc(r.source)}</cite></footer></blockquote>`).join('')}</section>`; }
      default: return '';
    }
  }).join('\n');
  const ld = (page.schema || []).map((s) => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`).join('');
  const t = theme;
  const css = `*{box-sizing:border-box}body{margin:0;font:16px/1.6 ${t.font};color:${t.text};background:${t.background}}header,main,footer{max-width:960px;margin:0 auto;padding:16px}header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}main a:not(.btn){color:${t.primary}}header a{color:${t.text}}nav ul{display:flex;flex-wrap:wrap;gap:12px;list-style:none;margin:0;padding:0}h1{font-size:clamp(28px,5vw,44px);line-height:1.15;margin:.2em 0}h2{font-size:clamp(22px,3.5vw,30px);line-height:1.25;margin:1.2em 0 .4em}.lead{font-size:1.15em;color:${t.muted};max-width:65ch}p{max-width:70ch}.hero{padding:32px 0}.btn{display:inline-block;padding:12px 20px;border-radius:8px;background:${t.primary};color:${t.on_primary};text-decoration:none;font-weight:600}.btn:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid ${t.primary};outline-offset:3px}.chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}.chips li{padding:6px 12px;border-radius:999px;background:${t.surface}}details{border-bottom:1px solid #d9dee4;padding:12px 0}summary{cursor:pointer;font-weight:600}img{max-width:100%;height:auto}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}blockquote{margin:0 0 16px;padding:12px 16px;background:${t.surface};border-radius:8px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}footer{color:${t.muted};font-size:14px}.preview{background:#fff3cd;color:#5c4400;padding:8px 16px;text-align:center}.form{display:grid;gap:12px;max-width:520px;margin-top:16px}.form label{display:grid;gap:4px;font-weight:600}.form input,.form textarea{font:inherit;padding:10px;border:1px solid #9aa3ad;border-radius:8px}.form .check{display:flex;gap:8px;align-items:flex-start;font-weight:400}.form .hp{position:absolute;left:-9999px}.note{padding:10px 12px;border-radius:8px;background:#e7f4ea}.note.bad{background:#fdecea}.small{font-size:14px;color:${t.muted}}`;
  return `<!doctype html><html lang="${esc(site.lang || 'en-AU')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(page.meta_title || page.title)}</title>${page.meta_description ? `<meta name="description" content="${esc(page.meta_description)}">` : ''}${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}${preview ? '<meta name="robots" content="noindex, nofollow">' : ''}<style>${css}</style>${ld}</head><body>${preview ? '<div class="preview" role="note">Preview: not published. Search engines are asked not to index this.</div>' : ''}<header><a href="${esc(nav[0]?.href || './')}"><strong>${esc(site.name || '')}</strong></a>${nav.length > 1 ? `<nav aria-label="Main"><ul>${nav.map((n) => `<li><a href="${esc(n.href)}"${n.current ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`).join('')}</ul></nav>` : ''}</header><main>${body}</main><footer><p>© ${new Date().getFullYear()} ${esc(site.name || '')}${site.abn ? ` · ABN ${esc(site.abn)}` : ''}</p></footer></body></html>`;
}

// --------------------------------------------------------------------------------- checks before publishing ---
export function prePublishChecks(page, { site = {}, theme = themeFrom(site.brand), sitePages = [], facts = {}, reviews = [] } = {}) {
  const out = [], add = (group, level, text) => out.push({ group, level, text });
  const blocks = page.blocks || [];
  const title = page.meta_title || page.title || '';
  if (!title) add('seo', 'block', 'Add a page title.'); else if (title.length > 60) add('seo', 'warn', `The title is ${title.length} characters; over 60 is often cut off.`);
  if (!page.meta_description) add('seo', 'warn', 'Add a meta description.'); else if (page.meta_description.length > 160) add('seo', 'warn', 'The meta description is longer than 160 characters.');
  if (!blocks.some((b) => b.type === 'hero' || (b.type === 'text' && b.heading))) add('seo', 'block', 'The page needs a main heading (a hero or a section heading).');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.slug || '')) add('seo', 'block', 'The page address may only use lowercase letters, numbers and dashes.');
  if (sitePages.some((p) => p.id !== page.id && p.slug === page.slug)) add('seo', 'block', 'Another page already uses this address.');
  const sameTitle = sitePages.find((p) => p.id !== page.id && (p.meta_title || p.title) === title); if (sameTitle) add('seo', 'warn', `Another page has the same title ("${sameTitle.title}").`);
  const words = draftText(page).split(/\s+/).length; if (words < 120) add('seo', 'warn', `Only about ${words} words: thin pages rarely do well in search.`);
  const links = blocks.flatMap((b) => [b.cta_href, b.href, ...Object.values(b.links || {})]).filter(Boolean);
  for (const l of links) { const u = safeUrl(l); if (!u) add('links', 'block', `The link "${l}" is not a safe address (use /page, https://, tel: or mailto:).`); else if (u.startsWith('/') && site.base_path && u.startsWith(site.base_path) && !sitePages.some((p) => p.status !== 'archived' && u === `${site.base_path}/${p.slug}`)) add('links', 'block', `The link ${u} points to a page that does not exist on this site.`); }
  // Accessibility
  const imgs = blocks.flatMap((b) => (b.type === 'image' ? [b] : b.type === 'gallery' ? b.images || [] : []));
  for (const i of imgs) { if (i.alt === undefined || i.alt === null) add('a11y', 'block', `An image has no alt text (${String(i.src).slice(-40)}). Describe it, or leave it empty only if it is decorative.`); if (!i.width || !i.height) add('images', 'warn', `Add width and height for ${String(i.src).slice(-40)} so the page does not jump while loading.`); if (/\.(png|jpe?g|gif|bmp)(\?|$)/i.test(i.src || '')) add('images', 'warn', `${String(i.src).slice(-40)} could be smaller as WebP or AVIF.`); }
  const cr = contrast(theme.primary, theme.on_primary); if (cr !== null && cr < 4.5) add('a11y', 'block', `Button text contrast is ${cr}:1; it must be at least 4.5:1.`);
  const tc = contrast(theme.text, theme.background); if (tc !== null && tc < 4.5) add('a11y', 'block', `Text contrast is ${tc}:1; it must be at least 4.5:1.`);
  for (const b of blocks) if ((b.cta_label || b.label) && /^(click here|here|more|read more)$/i.test(b.cta_label || b.label)) add('a11y', 'warn', 'Use a button label that says what happens, not "click here".');
  for (const b of blocks) {
    if (b.type === 'text' && !String(b.text || '').trim()) add('content', 'block', `The section "${b.heading || 'Text'}" is empty. Write it or remove it.`);
    if (b.type === 'hero' && !String(b.text || '').trim()) add('content', 'warn', 'Add a sentence under the main heading saying what you do and where.');
    if (b.type === 'faq' && !(b.items || []).length) add('content', 'block', 'The questions section has no questions. Add some or remove it.');
    if (['services', 'areas'].includes(b.type) && !(b.items || []).length) add('content', 'block', `The "${b.heading || b.type}" list is empty. Add items or remove it.`);
  }
  for (const f of blocks.filter((b) => b.type === 'faq')) if ((f.items || []).some((i) => !i.q || !i.a)) add('content', 'block', 'Every FAQ needs a question and an answer.');
  if (/\[[^\]]{3,}\]/.test(draftText(page))) add('content', 'block', 'Replace the [placeholders] with your own words.');
  if (blocks.some((b) => b.type === 'reviews') && !reviews.length) add('content', 'warn', 'The reviews section is empty, so it will not show. Import real reviews from Google first.');
  // Claims
  const claims = checkClaims(draftText(page), facts);
  for (const c of claims) add('claims', c.level === 'blocked' ? 'block' : c.level === 'review' ? 'approval' : 'ok', `${c.reason} "${c.text}"`);
  return { checks: out, blocked: out.some((c) => c.level === 'block'), needs_approval_for_claims: claims.some((c) => c.level === 'review'), claims };
}

// --------------------------------------------------------------------------------- change risk ---
// Decides whether a change may be published under the owner's "low-risk updates" rule or needs approval.
const SENSITIVE = /\b(medical|diagnos|treat(ment)?|cure|legal advice|lawyer|financial advice|invest|refund policy|privacy|terms|complain|asbestos|gas fitting|electrical safety|child|children)\b/i;
export function classifyChange(before, after, { claims = [], firstRelease = false } = {}) {
  const reasons = [];
  if (firstRelease) reasons.push('First time this page goes live.');
  const typesA = (before?.blocks || []).map((b) => b.type).join(','), typesB = (after.blocks || []).map((b) => b.type).join(',');
  if (before && typesA !== typesB) reasons.push('Sections were added, removed or reordered (design change).');
  if (before && JSON.stringify(before.theme || {}) !== JSON.stringify(after.theme || {})) reasons.push('Colours or fonts changed (design change).');
  if (before && before.slug !== after.slug) reasons.push('The page address changed.');
  const ta = before ? draftText(before) : '', tb = draftText(after);
  const changed = before ? diffRatio(ta, tb) : 1;
  if (before && changed > 0.2) reasons.push(`${Math.round(changed * 100)}% of the words changed.`);
  const newClaims = claims.filter((c) => c.level === 'review' && !ta.includes(c.text.replace(/…$/, '')));
  if (newClaims.length) reasons.push(`${newClaims.length} new claim(s) that need checking.`);
  if (SENSITIVE.test(tb) && (!before || !SENSITIVE.test(ta) || changed > 0.05)) reasons.push('Sensitive subject (health, legal, money, safety or policy wording).');
  const imgsA = JSON.stringify((before?.blocks || []).filter((b) => ['image', 'gallery'].includes(b.type))), imgsB = JSON.stringify((after.blocks || []).filter((b) => ['image', 'gallery'].includes(b.type)));
  if (before && imgsA !== imgsB) reasons.push('Images changed.');
  return { low_risk: reasons.length === 0, reasons, changed_ratio: +changed.toFixed(2) };
}
function diffRatio(a, b) { const A = a.split(/\s+/), B = new Set(b.split(/\s+/)); const SA = new Set(A); let same = 0; for (const w of SA) if (B.has(w)) same++; return 1 - same / Math.max(SA.size, B.size, 1); }

// --------------------------------------------------------------------------------- design suggestions ---
export function designSuggestions(page, { theme, facts = {} } = {}) {
  const s = [], blocks = page.blocks || [], types = blocks.map((b) => b.type);
  if (types[0] !== 'hero') s.push('Start with a hero: a clear heading saying what you do and where, and one button.');
  const hero = blocks.find((b) => b.type === 'hero'); if (hero && !hero.cta_label) s.push('Give the hero one clear action, for example "Get a quote".');
  if (!types.includes('contact') && !types.includes('cta')) s.push('End with a way to get in touch.');
  if (!types.includes('faq') && ['service', 'location'].includes(page.template)) s.push('Add three to five common questions; they help people decide and can appear in search.');
  if (facts.areas?.length && !types.includes('areas') && page.template !== 'contact') s.push('List the areas you serve.');
  if (types.filter((t) => t === 'text').length > 5) s.push('Long pages read better with fewer, shorter sections.');
  if (theme && (contrast(theme.primary, theme.on_primary) || 0) < 4.5) s.push('Your brand colour is too light for button text; use a darker shade for buttons.');
  if (!blocks.some((b) => ['image', 'gallery'].includes(b.type)) && page.template !== 'contact') s.push('Add a real photo of your work. Avoid stock photos that could mislead.');
  return s;
}
