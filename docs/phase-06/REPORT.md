# Phase 06: SEO, Google and website intelligence platform: report

Branch `phase-06-seo-platform`, stacked on `phase-05-ai-automation` (PR #35). Nothing was deployed. No environment
variables, infrastructure or credentials were changed, and the Super Pro public website content was not edited. The
prompt is in `PROMPT.md`.

## Most important limitation first

The prompt says: "Every external integration must be tested using real authorised API responses." **That has not been
possible in this workspace.** Its network refuses connections to `googleapis.com` (and to every website except package
registries), and it holds no Google credentials. Here is what was done instead (decision D-016):

- Every Google client was tested against Google's documented request and response formats. The tests use 14 fixtures
  in `scripts/seo-units.test.mjs`.
- No status shows "verified" until a live call to Google succeeds. Each service has a **Check connection** button that
  makes a real authorised call and records the result. That record is the evidence the prompt asks for once the app
  runs on Render with credentials.
- Until then every Google service correctly shows "Not connected". A failed check shows "Failing", never success.

To produce the real-response evidence after deploying, the owner needs to:
- Enable these APIs on the existing Google OAuth client: Search Console, Analytics Admin, Analytics Data, Tag Manager,
  and the Business Profile APIs (the Business Profile APIs need Google's approval).
- Optionally add `PAGESPEED_API_KEY`, `GOOGLE_ADS_DEVELOPER_TOKEN`, and `GOOGLE_SERVICE_ACCOUNT_JSON` (for Super Pro's
  own site).
- Connect a Google account, choose a property, press **Check connection** for each service, then **Sync Google data
  now**.

## What was built

| Deliverable | Where | Notes |
|---|---|---|
| 1. SEO Command Centre | Website & Visibility › SEO Command Centre; Founder Console › Super Pro marketing › SEO & website | Audit score, clusters, Google status, measured headline, alerts, scheduled jobs, sites |
| 2. Keyword Cluster Engine | `src/seo/keywords.js`; › Keyword Clusters | All 10 Module B functions; evidence-only (see below) |
| 3. Technical Audit Engine | `src/seo/audit.js`; › Technical Audit | Polite crawler plus all 19 Module A areas |
| 4. Google Integration Centre | `src/seo/google.js`; › Google | Search Console, GA4, Business Profile, Ads (reporting), Tag Manager, PageSpeed |
| 5. AI Content Studio | `src/seo/content.js`; › Content Studio | 12 content types; claim checking; schema |
| 6. Website Builder | `src/seo/builder.js`; › Website Builder | 10 section types, 6 templates; pages served at `/sites/<site>/<page>` |
| 7. Scheduled SEO Jobs | Phase 05 catalogue: `seo_daily_monitor`, `seo_weekly_analysis`, `seo_monthly_report` (business and platform) | Run through the automation engine: audited, pausable, retried |
| 8. Publishing Approvals | Phase 05 action `publish_site_page` and rule `low_risk_site_updates` | Shown in Approvals, with schedule, rollback and history |
| 9. Analytics Dashboard | › SEO Analytics | "Measured" and "Estimates" are separate sections, and every figure names its source |
| 10. Automated Reporting | › SEO Reports | Daily, weekly and monthly reports; printable |

### Module A: technical audit

The crawler honours robots.txt and reads the sitemaps first. It follows redirects hop by hop, works within a page
budget and timeouts, and for subscribers reads public hosts only. A Website Builder site is crawled inside its own
`/sites/<name>/` path.

The audit reports all 19 areas: crawlability, indexability, robots.txt, XML sitemaps, canonical URLs, redirects,
broken links, HTTP status codes, duplicate content (exact and near), structured data, meta titles, meta descriptions,
heading hierarchy, internal linking, image optimisation, Core Web Vitals, mobile usability, HTTPS and
internationalisation (hreflang).

Two things are never guessed:
- Core Web Vitals show "Not measured" unless PageSpeed Insights data exists. Field data and lab data are labelled
  separately.
- External links that cannot be reached are reported as "could not be checked", not as broken.

### Module B: keyword clusters, with no invented data

Keywords come only from:
- Search Console (measured);
- an uploaded list, whose volume is stored exactly as given, with the source's name;
- page titles and headings that relate to the business's services;
- business facts, manual entries, and service × area suggestions (labelled as having no evidence yet).

The engine does the rest of Module B:
- classifies search intent;
- picks primary and secondary keywords;
- builds pillars, supporting clusters and content gaps;
- finds cannibalisation, "measured" when Search Console shows two pages sharing impressions and "possible" otherwise;
- suggests internal links and maps clusters to existing pages.

Priorities are labelled as Super Pro estimates and list their reasons.

### Module C: content studio

Drafts are built from the business's verified facts. Without an AI provider the drafts are plain templates with
[placeholders], and they say so. With AI, the model only fills wording fields.

Every checkable claim is listed for a person to confirm before publishing: superlatives, guarantees, licences, prices,
years, counts and response times. Promises of Google rankings are removed automatically. Schema markup is generated
from facts only.

### Module E: local SEO

- Checks that name, phone and address match across business facts, the website and the Google profile.
- Checks categories, hours, service areas and LocalBusiness markup.
- Shows reviews and drafts replies. Posting a reply is Level 3 and goes to the Google API only after approval.
- Suggests location pages only for areas the business says it serves. Pages for areas without an address are written
  as "we travel to you" pages.
- No reviews are created.

### Module F: website management

Built:
- section editor, templates and design suggestions;
- accessibility checks (alt text, WCAG contrast of brand colours, link text, one h1);
- SEO checks before publishing, and claim checks;
- preview links (signed, 7 days, noindex);
- versions, rollback and scheduled publishing;
- a sitemap and robots.txt per site;
- freshness flags in reports.

Published pages are escaped, run no scripts (strict CSP) and pass axe.

Publishing rules:
- **Every first release, design change, image change, address change, new claim, sensitive wording, and anything
  changing more than 20% of the words waits for approval.**
- Small wording fixes publish on their own only while the owner has switched on the "Low-risk website updates" rule.

### Account separation

- Every row belongs to `platform` (Founder Console only) or one organisation id taken from the session.
- Tests prove that another business gets 404 for sites, pages, reviews and audits, and that field staff get 403.
- The platform's routes refuse business sessions.

## Verification (this branch, 30 Oct 2026)

| Check | Result |
|---|---|
| `npm test` | 73/73 |
| `npm run test:unit` | 169/169. New: `seo-audit.test` 5, `seo-units.test` 5, `seo-platform.test` 4 |
| `npm run test:seo-ui` (real browser) | 11/11: every view, builder to published page, audit, clusters to studio, Google failure shown as failure, review approval, analytics separation, reports, founder tab, axe WCAG 2.2 AA clean (including the published page), phone and iPad fit |
| `test:ui` / `test:pipeline-ui` / `test:console-ui` / `test:automations-ui` | 34/34 / 15/15 / 16/16 / 11/11 |
| `verify:modules` | 54 modules, 0 problems |
| `test:visual` | 51 screens unchanged |
| `report:a11y-perf` | 0 serious accessibility issues; 0 pages over budget on the second run. The first run had the home page TBT at 229 ms, which is lab noise: the home page is unchanged |
| `security:secrets`, `verify:manifest` | pass |

## What the first real audit found on the Super Pro public site

The site was audited on this server over http, so the "not https" finding does not apply to Render. The other findings:

- **Must fix:** `/saas/trust-center.html`, `/saas/terms.html` and `/saas/privacy.html` are listed in the sitemap but
  tell search engines not to index them. One of the two should change.
- Seven industry and feature page titles are over 60 characters.
- Three legal pages have no meta description, and three descriptions are over 160 characters.
- 42 images are JPEG or PNG without responsive sizes.
- Structured data on 23 pages is missing recommended fields.
- `/start` uses a temporary redirect.

I did not change the public website. These are recorded as task T-050 for your decision.

## Not done, or limited

1. No live Google responses have been tested yet (explained at the top).
2. **Image optimisation is checks only.** Super Pro reports size, format, dimensions and lazy loading, but does not
   re-encode images, because that needs an image library (for example `sharp`) as a new dependency on Render.
   Recorded as T-051.
3. **Custom domains** for builder sites are not set up. Sites are served at `/sites/<name>/` on the Super Pro domain.
   Using a business's own domain needs DNS and certificate work on Render (infrastructure, so it needs your approval).
   Recorded as T-052.
4. **Google Ads is reporting only**, and it needs a Google-approved developer token. Super Pro never changes campaigns
   or spend.
5. **Indexing cannot be requested** for ordinary pages: Google limits its Indexing API to job and livestream pages.
   Sitemap submission is offered and needs approval.
6. **Business Profile photos** are not counted yet; that needs the Media API, which requires Google's approval.
7. The Google sync and SEO jobs run in the web process (see T-048).
