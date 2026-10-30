// Phase 04 feature inventory and verification harness.
// Every module the owner listed is mapped to its screen(s), the server endpoints it reads, the automated tests that
// exercise its actions, and any outside provider it needs. The harness opens each screen as a business owner (or the
// founder), calls each endpoint, and records failures, browser errors and phone-width overflow.
//   npm run verify:modules   → qa/reports/modules.json and a summary on screen
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner, ownerContext } from './visual/session.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// [module, workspace route(s), read endpoints, tests covering actions, provider needed for live use]
export const SUBSCRIBER = [
  ['Dashboard', ['b01/home'], ['/api/saas/dashboard', '/api/saas/command-centre', '/api/saas/pipeline/overview'], ['test:ui', 'test:visual'], null],
  ['Business setup', ['b08/settings'], ['/api/saas/onboarding'], ['test:ui', 'npm test (pipeline)'], null],
  ['CRM and customers', ['b02/customers'], ['/api/saas/customers'], ['test:ui', 'pipeline.test', 'test:pipeline-ui'], null],
  ['Enquiries', ['b02/enquiries'], ['/api/saas/pipeline/enquiry'], ['pipeline.test', 'test:pipeline-ui'], null],
  ['Quotations', ['b02/quotes'], ['/api/saas/pipeline/quote'], ['pipeline.test', 'test:pipeline-ui'], null],
  ['Bookings', ['b02/bookings'], ['/api/saas/pipeline/booking'], ['pipeline.test', 'test:pipeline-ui'], null],
  ['Jobs', ['b02/jobs'], ['/api/saas/work-orders'], ['test:ui', 'workorder-runtime-auth.test', 'pipeline.test'], null],
  ['Work orders', ['b02/jobs'], ['/api/saas/work-orders', '/api/saas/work-orders/skill-suggestions'], ['workorder-rbac-contract.test', 'workorder-runtime-auth.test'], null],
  ['Worker allocation', ['b02/jobs', 'b02/bookings'], ['/api/saas/work-orders'], ['workorder-runtime-auth.test', 'pipeline.test'], null],
  ['Workforce compliance', ['b03/workers'], ['/api/saas/workers'], ['saas-platform.test', 'test:ui'], 'VEVO checks are recorded from the official portal; there is no automated government API'],
  ['Offshore staff', ['b03/offshore'], ['/api/saas/workers/offshore'], ['business-ops.test', 'test:pipeline-ui'], null],
  ['AI receptionist', ['b04/receptionist'], ['/api/saas/receptionist-profile', '/api/saas/service-requests/receptionist'], ['test:ui'], 'Telnyx number, routing and spend caps'],
  ['Unified inbox', ['b04/inbox'], ['/api/saas/comms/channels', '/api/saas/comms/threads'], ['test:ui', 'npm test (comms)'], 'Telnyx / Meta / email webhooks for live channels'],
  ['Email and messaging', ['b04/email', 'b04/calls'], ['/api/saas/mail'], ['test:ui (email centre)'], 'Resend for sending; Telnyx for SMS'],
  ['Invoices', ['b07/invoices'], ['/api/saas/pipeline/invoice'], ['pipeline.test', 'test:pipeline-ui'], null],
  ['Payments', ['b07/ledger'], ['/api/saas/payments', '/api/saas/payments/overview', '/api/saas/payments/settings'], ['payments contract tests', 'pipeline.test'], 'Stripe or PayPal keys per business for card links; bank and manual payments work without'],
  ['Accounting and GST', ['b07/ledger'], ['/api/saas/finance', '/api/saas/finance/overview', '/api/saas/finance/jobs'], ['npm test (finance)', 'pipeline.test'], null],
  ['Marketing', ['b05/growth'], ['/api/saas/growth/overview', '/api/saas/growth/calendar'], ['test:ui'], 'Social accounts for publishing'],
  ['Campaigns', ['b05/campaigns'], ['/api/saas/business-hub/campaign'], ['test:ui'], 'Bulk sending requires a verified email provider and opt-outs'],
  ['Social media', ['b05/growth', 'b08/connections'], ['/api/saas/integrations/self-service'], ['test:ui (connected TikTok)'], 'Each network’s own app approval'],
  ['Content studio', ['b05/studio'], ['/api/saas/media', '/api/saas/video-renders'], ['test:ui'], 'AI provider for scripts and voice'],
  ['Website management', ['b06/website'], ['/api/saas/service-requests/website'], ['test:ui'], 'Domain registrar and hosting (requests only today)'],
  ['SEO', ['b06/search', 'b06/search-console', 'b06/backlinks'], ['/api/saas/seo/overview'], ['test:ui'], 'Google Search Console / Bing for live data'],
  ['AI approvals', ['b01/approvals'], ['/api/saas/approvals'], ['npm test (approvals)', 'test:ui'], null],
  ['Files and documents', ['b05/studio', 'b08/print', 'b02/archive'], ['/api/saas/media', '/api/saas/business-archive'], ['npm test (file safety)'], null],
  ['Reports', ['b08/print', 'b07/ledger'], ['/api/saas/finance/overview'], ['test:ui (exports)'], null],
  ['Analytics', ['b01/home', 'b07/ledger', 'b06/search'], ['/api/saas/dashboard', '/api/saas/finance/overview'], ['test:ui'], null],
  ['Branding', ['b08/settings'], ['/api/saas/branding'], ['test:ui'], null],
  ['Notifications', ['b01/home'], ['/api/saas/notifications', '/api/saas/notification-preferences'], ['test:ui', 'npm test (notifications)'], 'Push and email delivery need providers'],
  ['Help and support', ['b08/help', 'b08/support-access'], ['/api/saas/support-access'], ['test:ui', 'npm test (support cases)'], null],
  ['Integrations', ['b08/connections'], ['/api/saas/integrations/self-service'], ['integration:test', 'test:ui'], 'Each provider’s credentials'],
  ['SEO Command Centre and reports', ['b06/seo', 'b06/reports', 'b06/analytics'], ['/api/saas/seo/command', '/api/saas/seo/dashboard', '/api/saas/seo/reports'], ['seo-platform.test', 'test:seo-ui'], 'Search Console and Analytics data need a Google connection'],
  ['Technical SEO audit and keyword clusters', ['b06/audit', 'b06/keywords'], ['/api/saas/seo/audit', '/api/saas/seo/keywords'], ['seo-audit.test', 'seo-units.test', 'seo-platform.test'], null],
  ['Google Integration Centre and local SEO', ['b06/google', 'b06/local'], ['/api/saas/seo/google', '/api/saas/seo/local'], ['seo-units.test', 'seo-platform.test', 'test:seo-ui'], 'Google OAuth client, Business Profile API access, PageSpeed key; not yet verified against live Google'],
  ['Content Studio and Website Builder', ['b06/studio', 'b06/builder'], ['/api/saas/seo/studio', '/api/saas/seo/sites'], ['seo-platform.test', 'test:seo-ui'], 'AI drafts need an AI provider (templates otherwise)'],
  ['AI automations and approvals', ['b01/automations', 'b01/approvals'], ['/api/saas/automation/engine', '/api/saas/automation/workflows', '/api/saas/automation/runs', '/api/saas/automation/audit', '/api/saas/approvals'], ['automation-governance.test', 'automation-engine.test', 'test:automations-ui'], 'AI analysis needs an AI provider (built-in rules otherwise); sending needs an email provider'],
  ['Automation settings', ['b08/automation'], ['/api/saas/automation', '/api/saas/approvals', '/api/saas/payments/settings'], ['business-ops.test', 'test:pipeline-ui'], 'Inbox AI drafts need an AI provider; customer reminders need email or SMS'],
  // Consolidation release: modules added in Phases 07 to 09.
  ['Unified Inbox (all folders and AI triage)', ['b04/unified'], ['/api/saas/comms/unified', '/api/saas/comms/unified/suggestions'], ['comms.test', 'test:comms-ui'], 'Telnyx, Resend and Meta for live channels'],
  ['Call handling (voice)', ['b04/voice'], ['/api/saas/comms/voice'], ['comms.test', 'test:comms-ui'], 'Telnyx number, AI assistant and transcription; not verified against live Telnyx'],
  ['Campaign Studio and consent', ['b05/campaign-studio', 'b05/consent'], ['/api/saas/growth/campaigns', '/api/saas/comms/consents'], ['comms.test', 'test:comms-ui'], 'Resend or Telnyx for sending; every send needs approval'],
  ['Quotes, estimates, deposits and tax invoices', ['b07/sales'], ['/api/saas/finance/hub', '/api/saas/finance/documents', '/api/saas/finance/settings'], ['finance.test', 'test:finance-ui'], 'Card payment links need the business\'s own Stripe or PayPal'],
  ['Payments, receipts and refunds', ['b07/payments-refunds'], ['/api/saas/finance/receipts', '/api/saas/finance/refunds'], ['finance.test', 'test:finance-ui'], 'Card refunds need the business\'s own Stripe; not verified against live Stripe'],
  ['Bank reconciliation', ['b07/reconcile'], ['/api/saas/finance/reconciliation'], ['finance.test', 'test:finance-ui'], null],
  ['Financial reports and GST', ['b07/reports'], ['/api/saas/finance/reports/pl', '/api/saas/finance/reports/gst', '/api/saas/finance/reports/aged', '/api/saas/finance/insights'], ['finance.test', 'test:finance-ui'], null],
  ['Finance settings, compliance and audit', ['b07/compliance'], ['/api/saas/finance/compliance', '/api/saas/finance/audit', '/api/saas/finance/rules'], ['finance.test', 'test:finance-ui'], null],
  ['Change plan', ['b09/change-plan'], ['/api/saas/finance/plan-changes'], ['finance.test', 'test:finance-ui'], null]
];
export const FOUNDER = [
  ['Subscriber administration', ['f02/subscribers'], ['/api/operator/subscribers'], ['test:ui (founder)'], null],
  ['Organisation management', ['f02/subscribers'], ['/api/operator/subscribers'], ['test:ui (founder)'], null],
  ['Subscription plans', ['f03/legacy:subscribers', 'f09/platform/configuration'], ['/api/admin/subscription-plans', '/api/operator/platform/configuration'], ['platform-health.test'], null],
  ['Platform billing', ['f03/invoices', 'f03/legacy:subpay'], ['/api/operator/invoices'], ['npm test (platform invoices)'], 'Stripe for platform card payments'],
  ['Revenue analytics', ['f01/platform/revenue'], ['/api/operator/platform/revenue'], ['platform-health.test', 'test:console-ui'], 'Figures are Super Pro records; reconcile with Stripe'],
  ['Infrastructure status', ['f01/system'], ['/api/operator/system', '/api/operator/jobs'], ['platform-health.test', 'test:console-ui'], null],
  ['Platform SEO and website', ['f06/platform/seo'], ['/api/operator/seo/command', '/api/operator/seo/audit'], ['seo-platform.test', 'test:seo-ui'], 'Google service account for Search Console and GA4'],
  ['Platform automations', ['f07/platform/automation'], ['/api/operator/automation', '/api/operator/automation/audit'], ['automation-governance.test', 'test:automations-ui', 'test:console-ui'], 'Deployments and key rotation are always done by a person'],
  ['Storage and backups', ['f01/platform/backups'], ['/api/operator/platform/backups'], ['platform-health.test', 'storage:verify', 'backup:restore-drill'], 'AWS S3 buckets and keys'],
  ['AI usage and costs', ['f01/platform/ai-usage'], ['/api/operator/platform/ai-usage'], ['platform-health.test'], 'Provider cost is not recorded by Super Pro'],
  ['Platform marketing', ['f06/records:prospect', 'f06/records:campaign', 'f06/records:content'], ['/api/operator/records/prospect', '/api/operator/records/campaign'], ['test:ui (founder)'], 'Records only; publishing needs providers'],
  ['System email', ['f04/mail'], ['/api/operator/mail'], ['platform-health.test (separation)', 'test:ui (founder)'], 'Resend for sending'],
  ['Support tickets', ['f04/records:ticket', 'f04/support-access'], ['/api/operator/records/ticket', '/api/operator/support-access'], ['test:ui (founder)'], null],
  ['Security and audit logs', ['f08/audit'], ['/api/operator/audit'], ['test:ui (founder)', 'npm test (audit chain)'], null],
  ['Feature flags', ['f09/platform/configuration', 'f09/complimentary'], ['/api/operator/platform/configuration', '/api/operator/complimentary'], ['platform-health.test'], 'Plan and grant based; no runtime on/off switches'],
  ['Compliance', ['f08/platform/compliance'], ['/api/operator/platform/compliance'], ['platform-health.test', 'test:console-ui'], null],
  ['Platform configuration', ['f09/platform/configuration', 'f09/staff'], ['/api/operator/platform/configuration'], ['platform-health.test'], null],
  ['Newsletter campaigns (platform)', ['f06/platform/campaigns'], ['/api/operator/campaigns', '/api/operator/comms/overview'], ['comms.test', 'test:comms-ui'], 'Resend and PLATFORM_MAIL_FROM for sending'],
  ['Plan prices, renewals, dunning and revenue', ['f03/platform/finance'], ['/api/operator/finance/plans', '/api/operator/finance/renewals', '/api/operator/finance/dunning', '/api/operator/finance/revenue'], ['finance.test', 'test:finance-ui'], null],
  ['Reliability and backups', ['f07/platform/reliability'], ['/api/operator/reliability'], ['reliability.test', 'test:reliability-ui'], 'AWS S3 backup bucket and keys; not verified against live AWS']
];

const s = await startServer();
const browser = await chromium.launch();
const report = { generated_at: new Date().toISOString(), subscriber: [], founder: [] };
try {
  const owner = await seedOwner(s, { business: 'Verification Plumbing Pty Ltd' });
  const get = async (url, opts) => { const r = await s.call('GET', url, opts); return { url, status: r.status, ok: r.status === 200 && r.json?.ok !== false }; };

  // Subscriber screens: one browser session, every route at laptop width, then at phone width.
  const screens = new Map();
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const ctx = await ownerContext(browser, s, owner, { viewport: { width, height }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    let fails = [], errs = [];
    p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) fails.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
    await p.goto(s.base + '/saas/workspace.html'); await p.locator('#workspace').waitFor({ state: 'visible' }); await p.waitForTimeout(800);
    for (const route of [...new Set(SUBSCRIBER.flatMap((m) => m[1]))]) {
      fails = []; errs = [];
      await p.evaluate((h) => { location.hash = h; }, route); await p.waitForTimeout(900);
      const r = await p.evaluate(() => { const v = [...document.querySelectorAll('#workspace .view')].find((x) => x.offsetParent); return { view: v?.id || null, heading: v?.querySelector('h1,h2')?.textContent.trim().slice(0, 80) || '', controls: v ? v.querySelectorAll('button:not([disabled]),input,select,textarea,a[href]').length : 0, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
      const prev = screens.get(route) || {};
      screens.set(route, { ...prev, [width]: { ...r, failing_calls: [...new Set(fails)], browser_errors: [...new Set(errs)] } });
    }
    await ctx.close();
  }
  for (const [name, routes, apis, tests, provider] of SUBSCRIBER) {
    const calls = [];
    for (const a of apis) calls.push(await get(a, { cookie: owner.cookie }));
    const sc = routes.map((r) => ({ route: r, ...screens.get(r) }));
    const problems = [
      ...calls.filter((c) => !c.ok).map((c) => `${c.url} returned ${c.status}`),
      ...sc.flatMap((x) => [1440, 390].flatMap((w) => [...(x[w]?.failing_calls || []).map((f) => `${x.route} @${w}: ${f}`), ...(x[w]?.browser_errors || []).map((e) => `${x.route} @${w}: JS ${e}`), ...(x[w] && !x[w].view ? [`${x.route} @${w}: no visible view`] : []), ...(x[w]?.overflow > 1 ? [`${x.route} @${w}: scrolls sideways ${x[w].overflow}px`] : [])]))
    ];
    report.subscriber.push({ module: name, routes: sc, endpoints: calls, tests, provider, problems, result: !routes.length ? 'NOT BUILT' : problems.length ? 'PROBLEMS' : provider ? 'WORKS, PROVIDER NEEDED FOR LIVE USE' : 'VERIFIED' });
  }

  // Founder console: sign in once per width, open every tab.
  const tabs = new Map();
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    let fails = [], errs = [];
    p.on('response', (r) => { if (/\/api\/(operator|admin)\//.test(r.url()) && r.status() >= 400) fails.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
    await p.goto(s.base + '/saas/operator-sign-in.html'); await p.locator('#operator-form input[name=key]').fill(s.adminKey);
    await Promise.all([p.waitForURL(s.base + '/office/'), p.locator('#operator-form button[type=submit]').click()]);
    for (const tab of [...new Set(FOUNDER.flatMap((m) => m[1]))]) {
      fails = []; errs = [];
      await p.evaluate((h) => { location.hash = h; }, tab); await p.waitForTimeout(1000);
      const r = await p.evaluate(() => ({ text: (document.querySelector('#console-content')?.innerText || '').replace(/\s+/g, ' ').slice(0, 120), unavailable: /Action unavailable/.test(document.querySelector('#console-content')?.innerText || ''), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      tabs.set(tab, { ...(tabs.get(tab) || {}), [width]: { ...r, failing_calls: [...new Set(fails)], browser_errors: [...new Set(errs)] } });
    }
    await ctx.close();
  }
  for (const [name, routes, apis, tests, provider] of FOUNDER) {
    const calls = [];
    for (const a of apis) calls.push(await get(a, { headers: { 'x-admin-key': s.adminKey } }));
    const sc = routes.map((r) => ({ route: r, ...tabs.get(r) }));
    const problems = [
      ...calls.filter((c) => !c.ok).map((c) => `${c.url} returned ${c.status}`),
      ...sc.flatMap((x) => [1440, 390].flatMap((w) => [...(x[w]?.failing_calls || []).map((f) => `${x.route} @${w}: ${f}`), ...(x[w]?.browser_errors || []).map((e) => `${x.route} @${w}: JS ${e}`), ...(x[w]?.unavailable ? [`${x.route} @${w}: shows Action unavailable`] : []), ...(x[w]?.overflow > 1 ? [`${x.route} @${w}: scrolls sideways ${x[w].overflow}px`] : [])]))
    ];
    report.founder.push({ module: name, routes: sc, endpoints: calls, tests, provider, problems, result: problems.length ? 'PROBLEMS' : provider ? 'WORKS, PROVIDER NEEDED FOR LIVE USE' : 'VERIFIED' });
  }
} finally {
  await browser.close();
  await s.stop();
}

fs.mkdirSync(path.join(ROOT, 'qa', 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'qa', 'reports', 'modules.json'), JSON.stringify(report, null, 2) + '\n');
for (const [label, list] of [['SUBSCRIBER WORKSPACE', report.subscriber], ['FOUNDER CONSOLE', report.founder]]) {
  console.log(`\n${label}`);
  for (const m of list) console.log(`${m.result.padEnd(36)} ${m.module}${m.problems.length ? '\n      ' + m.problems.join('\n      ') : ''}`);
}
const problems = [...report.subscriber, ...report.founder].filter((m) => m.result === 'PROBLEMS').length;
console.log(`\n${report.subscriber.length + report.founder.length} modules checked, ${problems} with problems. Details: qa/reports/modules.json`);
process.exit(problems ? 1 : 0);
