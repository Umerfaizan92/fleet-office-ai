// HTML templates for the public website. Pure functions that return strings; no runtime framework.
import { SITE, NAV, PLANS, DOMAINS, INDUSTRIES, SCENARIOS, FAQ, HELP, RECEPTIONIST_CALL } from './content.mjs';

const BASE = '__PUBLIC_BASE_URL__';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = 'sp-icon') => `<svg class="${cls}" aria-hidden="true"><use href="/saas/ds/icons.svg#${id}"/></svg>`;
const V = '20261030';
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const ORG = { '@type': 'Organization', '@id': `${BASE}/#organization`, name: SITE.name, url: `${BASE}/`, logo: `${BASE}/saas/superpro-icon-512.png` };
const faqLd = (items) => ({ '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const crumbs = (trail) => ({ '@type': 'BreadcrumbList', itemListElement: trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${BASE}${path}` })) });
const offers = () => PLANS.map((p) => ({ '@type': 'Offer', name: p.name, price: String(p.price), priceCurrency: 'AUD', description: 'Monthly plan price, plus GST.' }));

export function page({ path, title, description, body, graph = [], scripts = [], current = path, bodyClass = '' }) {
  const fullTitle = path === '/' ? `${SITE.name}: ${SITE.tagline}` : `${title} | ${SITE.name}`;
  return `<!doctype html>
<html lang="en-AU" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${BASE}${path}">
<meta name="theme-color" content="#070B14">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${BASE}${path}">
<meta property="og:image" content="${BASE}/saas/superpro-icon-512.png">
<meta property="og:locale" content="en_AU">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/saas/superpro-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/saas/superpro-icon-192.png">
<link rel="manifest" href="/saas/manifest.webmanifest">
<link rel="preload" href="/saas/fonts/bodoni-moda-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/saas/fonts/manrope-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/saas/ds/tokens.css?v=${V}">
<link rel="stylesheet" href="/saas/ds/components.css?v=${V}">
<link rel="stylesheet" href="/saas/ds/site.css?v=${V}">
<script src="/saas/ds/motion.js?v=${V}" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
<script src="/saas/ds/site.js?v=${V}" defer></script>
${ld({ '@context': 'https://schema.org', '@graph': [ORG, ...graph] })}
</head>
<body class="sp-site ${bodyClass}">
<a class="sp-skip" href="#main">Skip to content</a>
${nav(current)}
<main id="main" tabindex="-1">
${body}
</main>
${footer()}
</body>
</html>
`;
}

function nav(current) {
  const link = (n) => `<li><a href="${n.href}"${current === n.href || (n.href !== '/' && current.startsWith(n.href + '/')) ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`;
  return `<header class="sp-nav" data-nav>
  <div class="sp-nav__inner">
    <a class="sp-brand" href="/"><img src="/saas/superpro-icon-192.png" alt="" width="34" height="34">Super Pro</a>
    <nav aria-label="Main"><ul class="sp-nav__links" id="sp-nav-links">${NAV.map(link).join('')}</ul></nav>
    <div class="sp-nav__actions">
      <a class="sp-btn sp-btn--ghost" href="/saas/sign-in.html">Sign in</a>
      <a class="sp-btn sp-btn--primary" href="/start">Start free trial</a>
      <button class="sp-btn sp-btn--quiet sp-nav__toggle" type="button" aria-expanded="false" aria-controls="sp-nav-links" data-nav-toggle><span class="sp-visually-hidden">Menu</span>${icon('menu')}</button>
    </div>
  </div>
</header>`;
}

function footer() {
  const col = (title, links) => `<div><h2>${esc(title)}</h2><ul>${links.map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></div>`;
  return `<footer class="sp-footer">
  <div class="sp-page">
    <div class="sp-footer__grid">
      <div><a class="sp-brand" href="/"><img src="/saas/superpro-icon-192.png" alt="" width="34" height="34" loading="lazy">Super Pro</a><p style="margin-top:var(--sp-3);max-width:32ch">The AI office manager for Australian service businesses. Prices in AUD, plus GST.</p></div>
      ${col('Product', [['Features', '/features'], ['AI receptionist', '/receptionist'], ['Pricing', '/pricing'], ['Example scenarios', '/stories']])}
      ${col('Industries', INDUSTRIES.map((i) => [i.name, `/for/${i.slug}`]))}
      ${col('Help', [['Help centre', '/help'], ['Product answers', '/saas/answers.html'], ['Contact us', '/contact'], ['Sign in', '/saas/sign-in.html']])}
      ${col('Trust', [['Trust centre', '/saas/trust-center.html'], ['Privacy', '/saas/privacy.html'], ['Terms', '/saas/terms.html'], ['Complaints', '/saas/complaints.html'], ['Subprocessors', '/saas/subprocessors.html']])}
    </div>
    <hr class="sp-rule" style="margin-block:var(--sp-6) var(--sp-4)">
    <p>© <span data-year>2026</span> Super Pro AI Office Manager.</p>
  </div>
</footer>`;
}

const cta = (headline = 'Start with your own business', text = `Try every feature free for ${SITE.trialDays} days. Choose a plan when you are ready.`) => `<section class="sp-section sp-cta" aria-labelledby="cta-title">
  <div class="sp-page sp-stage sp-cta__stage" data-reveal>
    <h2 class="sp-h2" id="cta-title">${esc(headline)}</h2>
    <p class="sp-lede">${esc(text)}</p>
    <div class="sp-actions"><a class="sp-btn sp-btn--primary sp-btn--lg" href="/start">Start free trial</a><a class="sp-btn sp-btn--ghost sp-btn--lg" href="/contact">Talk to us</a></div>
  </div>
</section>`;

const faqList = (items, id = 'faq') => `<div class="sp-faqs" id="${id}">${items.map(([q, a]) => `<details class="sp-faq"><summary>${esc(q)}</summary><div class="sp-faq__body"><p>${esc(a)}</p></div></details>`).join('')}</div>`;

const posterSvg = () => `<svg class="sp-hero3d__poster" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs><radialGradient id="pg" cx="68%" cy="48%" r="38%"><stop offset="0" stop-color="var(--sp-gold)" stop-opacity=".22"/><stop offset="1" stop-color="var(--sp-gold)" stop-opacity="0"/></radialGradient></defs>
  <rect width="1200" height="700" fill="url(#pg)"/>
  <g fill="none" stroke="var(--sp-cyan)" stroke-opacity=".45" stroke-width="1.5">
    <path d="M150 170 C 380 160, 520 260, 640 350"/><path d="M110 340 C 330 330, 500 330, 640 350"/><path d="M160 520 C 380 500, 520 420, 640 350"/><path d="M300 110 C 470 140, 560 250, 640 350"/>
  </g>
  <g fill="none" stroke="var(--sp-gold)" stroke-opacity=".5" stroke-width="1.5"><path d="M700 350 C 860 300, 960 210, 1110 170"/><path d="M700 350 C 880 350, 980 360, 1130 360"/><path d="M700 350 C 860 420, 980 500, 1100 540"/></g>
  <g fill="none" stroke="var(--sp-cyan)" stroke-width="2"><rect x="128" y="150" width="36" height="36" rx="4"/><rect x="88" y="322" width="36" height="36" rx="4"/><rect x="140" y="502" width="36" height="36" rx="4"/><rect x="282" y="92" width="36" height="36" rx="4"/></g>
  <ellipse cx="660" cy="350" rx="26" ry="70" fill="none" stroke="var(--sp-gold)" stroke-width="3"/>
  <g transform="translate(780 260) rotate(8)" fill="none" stroke="var(--sp-gold)" stroke-width="2"><rect width="180" height="180" rx="6"/><path d="M0 0l40-30h180l-40 30M180 180l40-30V-30"/></g>
  <circle cx="872" cy="352" r="22" fill="var(--sp-gold)" fill-opacity=".85"/>
  <circle cx="420" cy="230" r="7" fill="var(--sp-cyan)"/><circle cx="520" cy="335" r="7" fill="var(--sp-cyan)"/><circle cx="980" cy="230" r="7" fill="var(--sp-gold)"/>
</svg>`;

/* ----------------------------------------------------------------- pages */
export function home() {
  const storySteps = [
    ['call', '7:02', 'A call you could not take', 'You are on the tools. The receptionist add-on answers, takes the details and creates an enquiry.'],
    ['draft', '7:05', 'A reply is drafted', 'Super Pro writes a reply from the enquiry and your services, then waits.'],
    ['approve', '7:40', 'You approve it on the train', 'Read it, change a word if you like, and approve. Only then does it send.'],
    ['book', '10:15', 'The quote is accepted', 'A booking is proposed and the worker you pick is checked for work rights and licences.'],
    ['done', '3:30', 'The job is finished', 'Before and after photos are saved to the job; the invoice is drafted from the quote.'],
    ['paid', '3:45', 'Paid before you leave', 'The customer pays by QR on their phone. The profit for the job updates.']
  ];
  const body = `
<section class="sp-hero" aria-labelledby="hero-title">
  <div class="sp-hero3d" data-hero3d>${posterSvg()}</div>
  <div class="sp-hero__veil" aria-hidden="true"></div>
  <div class="sp-page sp-hero__inner">
    <div class="sp-hero__copy">
      <h1 class="sp-display" id="hero-title">Your office runs.<br>You approve.</h1>
      <p class="sp-lede">Super Pro answers enquiries, drafts quotes and invoices, and keeps your team's paperwork in order. Nothing leaves your business until you say yes.</p>
      <div class="sp-actions">
        <a class="sp-btn sp-btn--primary sp-btn--lg" href="/start">Start your ${SITE.trialDays}-day free trial</a>
        <a class="sp-btn sp-btn--ghost sp-btn--lg" href="#demo">Ask it a question</a>
      </div>
      <p class="sp-hero__note">Plans from A$49 a month, plus GST.</p>
      <ul class="sp-hero__key" aria-label="How to read the animation">
        <li><span class="sp-key sp-key--cyan" aria-hidden="true"></span>Work arriving: calls, messages, email, web</li>
        <li><span class="sp-key sp-key--gold" aria-hidden="true"></span>Leaves only after your approval</li>
      </ul>
    </div>
  </div>
</section>

<section class="sp-section sp-demo" id="demo" aria-labelledby="demo-title">
  <div class="sp-page sp-split">
    <div class="sp-section-head" data-reveal>
      <h2 class="sp-h2" id="demo-title">Ask it what your mornings are like</h2>
      <p class="sp-lede">This is the same product guide that sits inside Super Pro. Ask anything about how it would work for your business.</p>
      <ul class="sp-checks">
        <li>${icon('check')}Answers in plain language, by text or voice</li>
        <li>${icon('check')}Explains what needs your approval and why</li>
        <li>${icon('check')}Never asks for passwords or card numbers</li>
      </ul>
    </div>
    <div class="sp-glass sp-chat" data-ai-demo data-reveal>
      <div class="sp-chat__head"><span class="sp-chat__avatar" aria-hidden="true"><span></span></span><div><strong>Super Pro guide</strong><span class="sp-chat__status"><span class="sp-live" data-ai-live></span><span data-ai-state>Ready</span></span></div></div>
      <div class="sp-chat__log" data-ai-log role="log" aria-live="polite" aria-relevant="additions">
        <div class="sp-msg sp-msg--ai"><p>Hello. Ask me how Super Pro would handle a missed call, a quote, a new worker or getting paid.</p></div>
      </div>
      <div class="sp-chat__prompts" data-ai-prompts>
        <button type="button" class="sp-chip">What happens when I miss a call?</button>
        <button type="button" class="sp-chip">How do approvals work?</button>
        <button type="button" class="sp-chip">Can my workers see prices?</button>
      </div>
      <form class="sp-chat__form" data-ai-form>
        <label class="sp-visually-hidden" for="ai-q">Your question</label>
        <input id="ai-q" name="q" autocomplete="off" maxlength="400" placeholder="Ask about your business day" required>
        <button class="sp-btn sp-btn--primary" type="submit" aria-label="Send question">${icon('send')}</button>
      </form>
    </div>
  </div>
</section>

<section class="sp-section sp-story-wrap" aria-labelledby="story-title">
  <div class="sp-page">
    <div class="sp-section-head" data-reveal>
      <h2 class="sp-h2" id="story-title">One Tuesday, handled</h2>
      <p class="sp-lede">Scroll through a day. The screen on the right is built from the same parts as the real workspace.</p>
    </div>
    <div class="sp-story" data-story data-active="call">
      <ol class="sp-story__steps">
        ${storySteps.map(([id, time, title, text]) => `<li class="sp-story__step" data-step="${id}"><time>${time}</time><h3 class="sp-h3">${esc(title)}</h3><p class="sp-muted">${esc(text)}</p></li>`).join('')}
      </ol>
      <div class="sp-story__device" aria-hidden="true">
        <div class="sp-device" data-parallax="0.04">
          <div class="sp-device__screen">
            <div class="sp-device__bar"><span></span><span></span><span></span><b>Today</b></div>
            <div class="sp-feed">
              <div class="sp-feed__item" data-feed="call" data-state="hidden"><span class="sp-feed__icon">${icon('phone')}</span><div><div class="sp-feed__title">Missed call, 0412 *** 118</div><div class="sp-feed__meta">Hot water system not working, Fremantle</div></div><span class="sp-chip sp-chip--ai">Enquiry</span></div>
              <div class="sp-feed__item" data-feed="draft" data-state="hidden"><span class="sp-feed__icon">${icon('spark')}</span><div><div class="sp-feed__title">Reply drafted</div><div class="sp-feed__meta">"Thanks Priya, we can come tomorrow at 8am…"</div></div><span class="sp-chip sp-chip--gate">Needs you</span></div>
              <div class="sp-feed__item" data-feed="approve" data-state="hidden"><span class="sp-feed__icon">${icon('check')}</span><div><div class="sp-feed__title">Approved and sent</div><div class="sp-feed__meta">by you, 7:40am</div></div><span class="sp-chip sp-chip--good">Sent</span></div>
              <div class="sp-feed__item" data-feed="book" data-state="hidden"><span class="sp-feed__icon">${icon('calendar')}</span><div><div class="sp-feed__title">Booking proposed, Thu 8:00</div><div class="sp-feed__meta">Sam: work rights and licence current</div></div><span class="sp-chip sp-chip--gate">Confirm</span></div>
              <div class="sp-feed__item" data-feed="done" data-state="hidden"><span class="sp-feed__icon">${icon('briefcase')}</span><div><div class="sp-feed__title">Job complete, 4 photos</div><div class="sp-feed__meta">Invoice INV-1042 drafted, A$680</div></div><span class="sp-chip sp-chip--gate">Send</span></div>
              <div class="sp-feed__item" data-feed="paid" data-state="hidden"><span class="sp-feed__icon">${icon('wallet')}</span><div><div class="sp-feed__title">Paid by QR, A$680</div><div class="sp-feed__meta">Job profit A$412</div></div><span class="sp-chip sp-chip--good">Paid</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

${workflowDemo()}

<section class="sp-section" aria-labelledby="domains-title">
  <div class="sp-page">
    <div class="sp-section-head" data-reveal>
      <h2 class="sp-h2" id="domains-title">Everything an office does, in one place</h2>
      <p class="sp-lede">Six parts that share one set of records, so nothing is typed twice.</p>
    </div>
    <ul class="sp-domain-list" data-reveal-group>
      ${DOMAINS.map((d) => `<li data-reveal><a class="sp-domain" href="/features/${d.slug}"><span class="sp-domain__icon">${icon(d.icon, 'sp-icon sp-icon--lg')}</span><span><strong>${esc(d.name)}</strong><span class="sp-muted">${esc(d.title)}</span></span>${icon('arrow')}</a></li>`).join('')}
    </ul>
  </div>
</section>

<section class="sp-section sp-compliance" aria-labelledby="compliance-title">
  <div class="sp-page sp-split">
    <div data-reveal>
      <h2 class="sp-h2" id="compliance-title">Know who can legally work before you book them</h2>
      <p class="sp-lede" style="margin-top:var(--sp-4)">Record work rights, VEVO results and licence expiry dates for every worker. Super Pro shows who is eligible before you offer a job, and reminds you before anything lapses.</p>
      <div class="sp-actions" style="margin-top:var(--sp-5)"><a class="sp-btn sp-btn--ghost" href="/features/people">How compliance works</a></div>
    </div>
    <div class="sp-roster sp-glass" data-reveal aria-label="Example worker eligibility">
      ${[['Sam Taylor', 'Licence current to Mar 2027', 'good', 'Eligible'], ['Ana Ruiz', 'Visa conditions recorded, 20 h/week', 'gate', 'Check hours'], ['Lee Chen', 'White card expires in 12 days', 'gate', 'Renew soon']].map(([n, m, t, s]) => `<div class="sp-roster__row"><span class="sp-roster__avatar" aria-hidden="true">${n.split(' ').map((x) => x[0]).join('')}</span><div><strong>${n}</strong><span class="sp-muted sp-small">${m}</span></div><span class="sp-chip sp-chip--${t}">${s}</span></div>`).join('')}
      <p class="sp-small sp-muted">Example names.</p>
    </div>
  </div>
</section>

<section class="sp-section" aria-labelledby="industries-title">
  <div class="sp-page">
    <div class="sp-section-head" data-reveal><h2 class="sp-h2" id="industries-title">Made for businesses that work on site</h2></div>
    <div class="sp-industry-row" data-reveal-group>
      ${INDUSTRIES.map((i) => `<a class="sp-card sp-card--lit sp-industry" href="/for/${i.slug}" data-reveal>${icon(i.icon, 'sp-icon sp-icon--lg')}<strong>${esc(i.name)}</strong><span class="sp-muted sp-small">${esc(i.pains[0])}</span></a>`).join('')}
    </div>
  </div>
</section>

${pricingSection(true)}

${storiesSection(true)}

<section class="sp-section" aria-labelledby="faq-title">
  <div class="sp-page sp-split sp-split--top">
    <div class="sp-section-head"><h2 class="sp-h2" id="faq-title">Questions owners ask first</h2><p class="sp-lede">More in the <a href="/help">help centre</a>.</p></div>
    ${faqList(FAQ)}
  </div>
</section>

${newsletter()}
${cta()}`;
  return page({ path: '/', title: SITE.tagline, description: 'Super Pro is the AI office manager for Australian service businesses: enquiries, quotes, jobs, invoices and staff compliance in one place, with every outgoing action approved by you.', body, scripts: ['/saas/product-guide.js?v=20261028.2'], graph: [{ '@type': 'WebSite', name: SITE.name, url: `${BASE}/` }, { '@type': 'SoftwareApplication', name: SITE.name, applicationCategory: 'BusinessApplication', operatingSystem: 'Web', offers: offers() }, faqLd(FAQ)] });
}

function workflowDemo() {
  const flows = {
    missed: ['Missed call', [['phone', 'Call answered by the receptionist add-on', 'ai'], ['spark', 'Enquiry created and reply drafted', 'ai'], ['gate', 'You approve the reply', 'gate'], ['send', 'Reply sent by SMS', 'done']]],
    quote: ['Quote accepted', [['check', 'Customer accepts the quote', 'ai'], ['calendar', 'Booking proposed from availability', 'ai'], ['users', 'Worker eligibility checked', 'ai'], ['gate', 'You confirm the booking', 'gate'], ['message', 'Customer and worker notified', 'done']]],
    finished: ['Job finished', [['briefcase', 'Worker marks the job complete with photos', 'ai'], ['spark', 'Invoice drafted from the quote and materials', 'ai'], ['gate', 'You send the invoice', 'gate'], ['wallet', 'Customer pays by link or QR', 'done']]]
  };
  return `<section class="sp-section sp-flow" aria-labelledby="flow-title">
  <div class="sp-page">
    <div class="sp-section-head" data-reveal>
      <h2 class="sp-h2" id="flow-title">Try the approval gate</h2>
      <p class="sp-lede">Pick something that happens in your week. Super Pro does the work up to the gold gate, then waits for you.</p>
    </div>
    <div class="sp-stage sp-flow__stage" data-flow>
      <div class="sp-tabs" role="tablist" aria-label="Choose a situation">
        ${Object.entries(flows).map(([k, [label]], i) => `<button type="button" role="tab" id="flow-tab-${k}" aria-controls="flow-panel-${k}" aria-selected="${i === 0}" data-flow-tab="${k}">${label}</button>`).join('')}
      </div>
      ${Object.entries(flows).map(([k, [, steps]], i) => `<div class="sp-flow__panel" role="tabpanel" id="flow-panel-${k}" aria-labelledby="flow-tab-${k}"${i ? ' hidden' : ''} data-flow-panel="${k}">
        <ol class="sp-flow__steps">${steps.map(([ic, text, kind]) => `<li class="sp-flow__step" data-kind="${kind}">${icon(ic)}<span>${esc(text)}</span></li>`).join('')}</ol>
        <div class="sp-flow__controls"><button type="button" class="sp-btn sp-btn--primary" data-flow-approve disabled>Approve</button><button type="button" class="sp-btn sp-btn--quiet" data-flow-reset>Start again</button><span class="sp-flow__status" data-flow-status aria-live="polite"></span></div>
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

function pricingSection(preview = false) {
  return `<section class="sp-section" id="pricing" aria-labelledby="pricing-title">
  <div class="sp-page">
    <div class="sp-section-head" data-reveal>
      <h2 class="sp-h2" id="pricing-title">${preview ? 'One price per business, not per seat' : 'Simple plans. Change any time.'}</h2>
      <p class="sp-lede">Every plan starts with a ${SITE.trialDays}-day free trial. Prices are in AUD and exclude GST.</p>
    </div>
    <div class="sp-plans" data-reveal-group>
      ${PLANS.map((p) => `<article class="sp-card sp-plan${p.featured ? ' sp-plan--featured' : ''}" data-reveal data-plan="${p.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--sp-3)"><h3 class="sp-h3">${p.name}</h3>${p.featured ? '<span class="sp-chip sp-chip--gate">Most chosen</span>' : ''}</div>
        <p class="sp-muted sp-small">${esc(p.summary)}</p>
        <p class="sp-plan__price"><span data-plan-price>A$${p.price}</span> <small>a month, plus GST</small></p>
        <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <a class="sp-btn ${p.featured ? 'sp-btn--primary' : 'sp-btn--ghost'}" href="/saas/create-account.html?plan=${p.id}">Start with ${p.name}</a>
      </article>`).join('')}
    </div>
    ${preview ? '<p class="sp-center" style="margin-top:var(--sp-5)"><a href="/pricing">Compare plans and add-ons</a></p>' : ''}
  </div>
</section>`;
}

function storiesSection(preview = false) {
  return `<section class="sp-section" aria-labelledby="stories-title">
  <div class="sp-page">
    <div class="sp-section-head" data-reveal>
      <h2 class="sp-h2" id="stories-title">${preview ? 'What a week with Super Pro looks like' : 'Stories and example scenarios'}</h2>
      <p class="sp-lede">We are onboarding our first businesses now. Real customer stories appear here once they have agreed to share them; until then, these are labelled examples.</p>
    </div>
    <div class="sp-testimonials" data-testimonials hidden></div>
    <div class="sp-cols" data-reveal-group>
      ${SCENARIOS.map((s) => `<article class="sp-card sp-scenario" data-reveal><span class="sp-chip">Example scenario</span><h3 class="sp-h3">${esc(s.title)}</h3><p class="sp-muted">${esc(s.body)}</p><a href="/for/${s.industry}">For ${esc(INDUSTRIES.find((i) => i.slug === s.industry).name.toLowerCase())}</a></article>`).join('')}
    </div>
  </div>
</section>`;
}

function newsletter() {
  return `<section class="sp-section sp-section--tight" aria-labelledby="news-title">
  <div class="sp-page sp-news sp-glass">
    <div><h2 class="sp-h3" id="news-title">Product updates, a few times a year</h2><p class="sp-muted sp-small">New features and plan changes. Unsubscribe any time.</p></div>
    <form class="sp-news__form" data-newsletter novalidate>
      <div class="sp-field"><label for="news-email">Work email</label><input id="news-email" name="email" type="email" autocomplete="email" required></div>
      <button class="sp-btn sp-btn--primary" type="submit">Subscribe</button>
      <p class="sp-form-status" data-status role="status"></p>
    </form>
  </div>
</section>`;
}

export function features() {
  const body = `
<section class="sp-section sp-pagehead"><div class="sp-page">
  <h1 class="sp-h1">What Super Pro does</h1>
  <p class="sp-lede" style="margin-top:var(--sp-4)">Six parts of running a service business, sharing one set of records. Each one does the work and leaves the decisions to you.</p>
</div></section>
<section class="sp-section sp-section--tight"><div class="sp-page sp-chapters">
  ${DOMAINS.map((d, i) => `<article class="sp-chapter" id="${d.slug}" data-reveal>
    <div class="sp-chapter__index" aria-hidden="true">${icon(d.icon, 'sp-icon sp-icon--lg')}</div>
    <div><h2 class="sp-h2">${esc(d.name)}</h2><p class="sp-lede" style="margin-top:var(--sp-3)">${esc(d.lede)}</p>
    <ul class="sp-chapter__list">${d.blocks.map(([t]) => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="sp-gate-line">${icon('gate')}${esc(d.approval)}</p>
    <a class="sp-btn sp-btn--ghost" href="/features/${d.slug}">More about ${esc(d.name.toLowerCase())}</a></div>
  </article>`).join('')}
</div></section>
${cta()}`;
  return page({ path: '/features', title: 'Features', description: 'Customers and work, money, communications, growth, people and compliance, and AI with human approval: everything Super Pro does for an Australian service business.', body, graph: [crumbs([['Home', '/'], ['Features', '/features']])] });
}

export function domainPage(d) {
  const body = `
<section class="sp-section sp-pagehead"><div class="sp-page sp-split">
  <div><p class="sp-crumbs"><a href="/features">Features</a> / ${esc(d.name)}</p><h1 class="sp-h1">${esc(d.title)}</h1><p class="sp-lede" style="margin-top:var(--sp-4)">${esc(d.lede)}</p>
  <div class="sp-actions" style="margin-top:var(--sp-5)"><a class="sp-btn sp-btn--primary sp-btn--lg" href="/start">Start free trial</a></div></div>
  <div class="sp-stage sp-domain-hero" aria-hidden="true" data-parallax="0.05">${icon(d.icon, 'sp-icon sp-domain-hero__icon')}</div>
</div></section>
<section class="sp-section sp-section--tight"><div class="sp-page">
  <div class="sp-cols" data-reveal-group>${d.blocks.map(([t, x]) => `<article class="sp-card" data-reveal><h2 class="sp-h3">${esc(t)}</h2><p class="sp-muted" style="margin-top:var(--sp-3)">${esc(x)}</p></article>`).join('')}</div>
  <p class="sp-gate-line sp-gate-line--wide" data-reveal>${icon('gate')}${esc(d.approval)}</p>
</div></section>
<section class="sp-section sp-section--tight"><div class="sp-page sp-split sp-split--top"><div class="sp-section-head"><h2 class="sp-h2">Questions</h2></div>${faqList(d.faq)}</div></section>
${cta()}`;
  return page({ path: `/features/${d.slug}`, current: '/features', title: d.name, description: d.lede, body, graph: [crumbs([['Home', '/'], ['Features', '/features'], [d.name, `/features/${d.slug}`]]), faqLd(d.faq)] });
}

export function industriesIndex() {
  const body = `
<section class="sp-section sp-pagehead"><div class="sp-page"><h1 class="sp-h1">Built for businesses that work on site</h1><p class="sp-lede" style="margin-top:var(--sp-4)">The same workspace, set up for how your industry runs its day.</p></div></section>
<section class="sp-section sp-section--tight"><div class="sp-page sp-cols" data-reveal-group>
  ${INDUSTRIES.map((i) => `<a class="sp-card sp-card--lit sp-industry sp-industry--tall" href="/for/${i.slug}" data-reveal>${icon(i.icon, 'sp-icon sp-icon--lg')}<strong>${esc(i.name)}</strong><span class="sp-muted">${esc(i.title)}</span></a>`).join('')}
</div></section>
${cta()}`;
  return page({ path: '/for', title: 'Industries', description: 'Super Pro for trades, allied health and clinics, retail, agencies and cleaning businesses in Australia.', body, graph: [crumbs([['Home', '/'], ['Industries', '/for']])] });
}

export function industryPage(i) {
  const body = `
<section class="sp-section sp-pagehead"><div class="sp-page sp-split">
  <div><p class="sp-crumbs"><a href="/for">Industries</a> / ${esc(i.name)}</p><h1 class="sp-h1">${esc(i.title)}</h1><p class="sp-lede" style="margin-top:var(--sp-4)">${esc(i.lede)}</p>
  <div class="sp-actions" style="margin-top:var(--sp-5)"><a class="sp-btn sp-btn--primary sp-btn--lg" href="/start">Start free trial</a><a class="sp-btn sp-btn--ghost sp-btn--lg" href="/contact">Talk to us</a></div></div>
  <div class="sp-glass sp-pains" data-reveal><h2 class="sp-h3">Sound familiar?</h2><ul>${i.pains.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
</div></section>
<section class="sp-section sp-section--tight"><div class="sp-page">
  <div class="sp-section-head"><h2 class="sp-h2">A day with Super Pro</h2></div>
  <ol class="sp-timeline" data-reveal-group>${i.day.map(([t, x]) => `<li data-reveal><time>${esc(t)}</time><p>${esc(x)}</p></li>`).join('')}</ol>
</div></section>
<section class="sp-section sp-section--tight"><div class="sp-page"><div class="sp-section-head"><h2 class="sp-h2">The parts you will use most</h2></div>
  <ul class="sp-domain-list">${DOMAINS.slice(0, 5).map((d) => `<li><a class="sp-domain" href="/features/${d.slug}"><span class="sp-domain__icon">${icon(d.icon, 'sp-icon sp-icon--lg')}</span><span><strong>${esc(d.name)}</strong><span class="sp-muted">${esc(d.title)}</span></span>${icon('arrow')}</a></li>`).join('')}</ul>
</div></section>
${cta(`Try it on your own ${i.name.toLowerCase()} business`)}`;
  return page({ path: `/for/${i.slug}`, current: '/for', title: `Super Pro for ${i.name.toLowerCase()}`, description: i.lede, body, graph: [crumbs([['Home', '/'], ['Industries', '/for'], [i.name, `/for/${i.slug}`]])] });
}

export function pricing() {
  const rows = [['Business users', '3', '10', '25'], ['Customers, enquiries, quotes and jobs', 'Yes', 'Yes', 'Yes'], ['Inbox, email centre and team chat', 'Yes', 'Yes', 'Yes'], ['Invoices, payment links, tap-to-pay QR', 'Yes', 'Yes', 'Yes'], ['AI drafts with approval', 'Core', 'Operations', 'Higher limits'], ['Workforce compliance', 'Basic', 'Full', 'Full'], ['Job eligibility checks', 'No', 'Yes', 'Yes'], ['Individual staff permissions', 'No', 'No', 'Yes'], ['Storage', 'Standard', 'Expanded', 'High'], ['Discount on usage add-on packs', 'None', '25%', '50%']];
  const pf = [['Is GST included?', 'No. Prices are in AUD and GST is added on your invoice.'], ['What happens after the trial?', 'Choose a plan to keep going. Your records are kept either way.'], ['What are usage add-on packs?', 'Extra storage, AI requests and similar usage you can add when you need it. Operations saves 25% and Scale saves 50% on packs.'], ['Is the AI receptionist included?', 'It is an add-on, priced by usage and switched on once your number is set up.']];
  const body = `
<section class="sp-section sp-pagehead"><div class="sp-page"><h1 class="sp-h1">Pricing</h1><p class="sp-lede" style="margin-top:var(--sp-4)">One monthly price per business. Start free for ${SITE.trialDays} days.</p></div></section>
${pricingSection(false)}
<section class="sp-section sp-section--tight"><div class="sp-page">
  <h2 class="sp-h2" style="margin-bottom:var(--sp-5)">Compare plans</h2>
  <div class="sp-table-wrap" tabindex="0" role="region" aria-label="Plan comparison"><table class="sp-table"><thead><tr><th scope="col">Feature</th>${PLANS.map((p) => `<th scope="col">${p.name}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
</div></section>
<section class="sp-section sp-section--tight"><div class="sp-page sp-split sp-split--top"><div class="sp-section-head"><h2 class="sp-h2">Pricing questions</h2></div>${faqList(pf)}</div></section>
${cta()}`;
  return page({ path: '/pricing', title: 'Pricing', description: 'Super Pro plans: Starter A$49, Operations A$99 and Scale A$149 a month, plus GST, with a 14-day free trial.', body, graph: [crumbs([['Home', '/'], ['Pricing', '/pricing']]), { '@type': 'Product', name: SITE.name, offers: offers() }, faqLd(pf)] });
}

export function receptionist() {
  const rf = [['Is the receptionist included in every plan?', 'It is an add-on, priced by usage, and switched on for your business once your number is set up.'], ['Does it make decisions for me?', 'No. It takes details and requests bookings. Bookings and replies wait for your approval.'], ['Can callers reach me directly?', 'Yes. Genuine urgent calls can be transferred to you without your private number ever being shown.']];
  const body = `
<section class="sp-section sp-pagehead sp-rx-head"><div class="sp-page sp-split">
  <div><h1 class="sp-h1">A receptionist that never puts anyone on hold</h1><p class="sp-lede" style="margin-top:var(--sp-4)">The AI receptionist add-on answers your business number, takes the details, offers times from your availability and texts you a summary. Bookings wait for your approval.</p>
  <div class="sp-actions" style="margin-top:var(--sp-5)"><a class="sp-btn sp-btn--primary sp-btn--lg" href="/contact?topic=receptionist">Ask about the add-on</a></div></div>
  ${callPlayer()}
</div></section>
<section class="sp-section sp-section--tight"><div class="sp-page sp-cols" data-reveal-group>
  ${[['clock', 'Answers every call', 'Including after hours and when you are on the tools.'], ['message', 'Takes the right details', 'Name, suburb, what is wrong and how urgent it is, in a natural conversation.'], ['calendar', 'Offers real times', 'From your availability, as a booking request you approve.'], ['shield', 'Keeps your number private', 'Urgent calls can be transferred to you without revealing your private number.']].map(([ic, t, x]) => `<article class="sp-card" data-reveal>${icon(ic, 'sp-icon sp-icon--lg')}<h2 class="sp-h3" style="margin-top:var(--sp-3)">${t}</h2><p class="sp-muted" style="margin-top:var(--sp-2)">${x}</p></article>`).join('')}
</div></section>
<section class="sp-section sp-section--tight"><div class="sp-page sp-split sp-split--top"><div class="sp-section-head"><h2 class="sp-h2">Receptionist questions</h2></div>${faqList(rf)}</div></section>
${cta('Hear it answer your own number', 'Tell us about your calls and we will set up the receptionist add-on with you.')}`;
  return page({ path: '/receptionist', title: 'AI receptionist', description: 'The Super Pro AI receptionist add-on answers your business calls, takes details, offers times and texts you a summary. Bookings wait for your approval.', body, graph: [crumbs([['Home', '/'], ['AI receptionist', '/receptionist']]), faqLd(rf)] });
}

function callPlayer() {
  return `<div class="sp-stage sp-call" data-call>
    <div class="sp-call__head"><span class="sp-chat__avatar" aria-hidden="true"><span></span></span><div><strong>Sample call</strong><span class="sp-muted sp-small">Harbour Plumbing is an example business</span></div>
      <button type="button" class="sp-btn sp-btn--primary" data-call-play aria-pressed="false">${icon('play')}<span>Play sample call</span></button></div>
    <div class="sp-wave" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    <ol class="sp-call__lines" data-call-lines aria-live="polite" tabindex="0" aria-label="Call transcript">
      ${RECEPTIONIST_CALL.map(([who, text], i) => `<li class="sp-line sp-line--${who}" data-line="${i}"${i ? ' hidden' : ''}><b>${who === 'ai' ? 'Receptionist' : who === 'caller' ? 'Caller' : 'In your workspace'}</b><span>${esc(text)}</span></li>`).join('')}
    </ol>
    <button type="button" class="sp-btn sp-btn--quiet sp-small" data-call-all>Show the whole transcript</button>
  </div>`;
}

export function stories() {
  const body = `
<section class="sp-section sp-pagehead"><div class="sp-page"><h1 class="sp-h1">Stories</h1><p class="sp-lede" style="margin-top:var(--sp-4)">How businesses use Super Pro. Customer stories are published only with the customer's written agreement.</p></div></section>
${storiesSection(false)}
<section class="sp-section sp-section--tight"><div class="sp-page sp-glass sp-launch">
  <div><h2 class="sp-h3">Be one of our launch customers</h2><p class="sp-muted">Launch customers get help setting up and a direct line to the people building Super Pro.</p></div>
  <a class="sp-btn sp-btn--primary" href="/contact?topic=launch">Talk to us</a>
</div></section>
${cta()}`;
  return page({ path: '/stories', title: 'Stories and example scenarios', description: 'How Australian service businesses can run their office with Super Pro: real customer stories once published, and clearly labelled example scenarios.', body, graph: [crumbs([['Home', '/'], ['Stories', '/stories']])] });
}

export function help() {
  const all = HELP.flatMap((c) => c.items);
  const body = `
<section class="sp-section sp-pagehead"><div class="sp-page"><h1 class="sp-h1">Help centre</h1><p class="sp-lede" style="margin-top:var(--sp-4)">Answers about getting started, approvals, billing, staff and security.</p>
  <div class="sp-field sp-help-search"><label for="help-q">Search the help centre</label><input id="help-q" type="search" placeholder="For example: GST, workers, approvals" data-help-search autocomplete="off"></div>
  <p class="sp-small sp-muted" data-help-count aria-live="polite"></p>
</div></section>
<section class="sp-section sp-section--tight"><div class="sp-page sp-help">
  <nav class="sp-help__nav" aria-label="Help topics"><ul>${HELP.map((c) => `<li><a href="#${c.id}">${esc(c.name)}</a></li>`).join('')}<li><a href="/saas/answers.html">Product answers</a></li><li><a href="/saas/trust-center.html">Trust centre</a></li></ul></nav>
  <div>${HELP.map((c) => `<section class="sp-help__group" id="${c.id}" aria-labelledby="h-${c.id}"><h2 class="sp-h3" id="h-${c.id}">${esc(c.name)}</h2>${faqList(c.items, 'faq-' + c.id)}</section>`).join('')}
  <p class="sp-help__empty" data-help-empty hidden>No answers match that search. <a href="/contact">Ask us directly</a>.</p></div>
</div></section>
${cta('Still stuck?', 'Send us a message and a person will reply.')}`;
  return page({ path: '/help', title: 'Help centre', description: 'Help with Super Pro: getting started, AI approvals, plans and billing, staff and compliance, security and privacy.', body, graph: [crumbs([['Home', '/'], ['Help', '/help']]), faqLd(all)] });
}

export function contact() {
  const body = `
<section class="sp-section sp-pagehead"><div class="sp-page sp-split sp-split--top">
  <div>
    <h1 class="sp-h1">Talk to us</h1>
    <p class="sp-lede" style="margin-top:var(--sp-4)">Questions before you start, a walkthrough, or help setting up. A person reads every message.</p>
    <ol class="sp-onboard">
      <li><strong>Start your trial</strong><span class="sp-muted">Business name, ABN and your details. About two minutes.</span></li>
      <li><strong>Verify your email and mobile</strong><span class="sp-muted">A code to each, so your account stays yours.</span></li>
      <li><strong>Take the guided tour</strong><span class="sp-muted">It sets up your services, team and connections with you.</span></li>
    </ol>
    <a class="sp-btn sp-btn--primary sp-btn--lg" href="/start">Start free trial</a>
  </div>
  <form class="sp-glass sp-contact" data-contact novalidate>
    <div class="sp-field"><label for="c-topic">What is it about?</label><select id="c-topic" name="topic"><option value="question">A question before I start</option><option value="walkthrough">A walkthrough</option><option value="receptionist">The AI receptionist add-on</option><option value="launch">Becoming a launch customer</option><option value="support">Help with my account</option></select></div>
    <div class="sp-field"><label for="c-name">Your name</label><input id="c-name" name="name" autocomplete="name" required minlength="2" maxlength="150"></div>
    <div class="sp-field"><label for="c-email">Email</label><input id="c-email" name="email" type="email" autocomplete="email" required></div>
    <div class="sp-field"><label for="c-phone">Mobile <span class="sp-muted">(optional)</span></label><input id="c-phone" name="phone" type="tel" autocomplete="tel" maxlength="50"></div>
    <div class="sp-field"><label for="c-msg">Message</label><textarea id="c-msg" name="message" required minlength="10" maxlength="4000"></textarea><span class="sp-field__hint">Please do not include passwords or card numbers.</span></div>
    <button class="sp-btn sp-btn--primary sp-btn--lg" type="submit">Send message</button>
    <p class="sp-form-status" data-status role="status"></p>
  </form>
</div></section>`;
  return page({ path: '/contact', title: 'Contact', description: 'Contact Super Pro for a walkthrough, questions before you start, the AI receptionist add-on, or help with your account.', body, graph: [crumbs([['Home', '/'], ['Contact', '/contact']])] });
}

export const PAGES = () => [
  ['home.html', home()], ['features.html', features()], ...DOMAINS.map((d) => [`features-${d.slug}.html`, domainPage(d)]),
  ['industries.html', industriesIndex()], ...INDUSTRIES.map((i) => [`for-${i.slug}.html`, industryPage(i)]),
  ['pricing.html', pricing()], ['receptionist.html', receptionist()], ['stories.html', stories()], ['help.html', help()], ['contact.html', contact()]
];
