#!/usr/bin/env node
// Phase 10 SEO release check on a throwaway local server: every sitemap URL answers 200 with a title, meta
// description, canonical, one h1 and valid JSON-LD; robots.txt points to the sitemap; private pages are noindex;
// and Super Pro's own technical audit (Founder SEO) runs end to end.
//   node scripts/release-seo-check.mjs [--json qa/reports/release-seo.json]
import fs from 'node:fs';
import { startServer } from './test-server.mjs';

const out = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : 'qa/reports/release-seo.json';
const s = await startServer({});
const problems = [], pages = [];
try {
  const robots = await (await fetch(s.base + '/robots.txt')).text();
  if (!/Sitemap:\s*\S+sitemap\.xml/i.test(robots)) problems.push('robots.txt does not name the sitemap');
  const sm = await (await fetch(s.base + '/sitemap.xml')).text();
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urls.length < 10) problems.push(`sitemap lists only ${urls.length} URL(s)`);
  for (const u of urls) {
    const path = new URL(u).pathname, r = await fetch(s.base + path), html = await r.text();
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || '';
    const desc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1] || html.match(/<meta[^>]+content="([^"]*)"[^>]+name="description"/i)?.[1] || '';
    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] || '';
    const h1 = (html.match(/<h1\b/gi) || []).length, noindex = /<meta[^>]+name="robots"[^>]+noindex/i.test(html);
    let ldOk = true, ld = 0; for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { ld++; try { JSON.parse(m[1]); } catch { ldOk = false; } }
    const p = { path, status: r.status, title_len: title.length, desc_len: desc.length, canonical: Boolean(canonical), h1, json_ld: ld, json_ld_valid: ldOk, noindex };
    pages.push(p);
    const issue = [r.status !== 200 && `status ${r.status}`, !title && 'no title', title.length > 65 && `title ${title.length} chars`, !desc && 'no meta description', !canonical && 'no canonical', h1 !== 1 && `${h1} h1`, !ldOk && 'invalid JSON-LD', noindex && 'listed in sitemap but noindex'].filter(Boolean);
    if (issue.length) problems.push(`${path}: ${issue.join(', ')}`);
  }
  for (const priv of ['/saas/workspace.html', '/office/']) { const html = await (await fetch(s.base + priv)).text(); const ok = /noindex/i.test(html) || /Disallow:\s*\/(saas\/workspace|office)/.test(robots); if (!ok) problems.push(`${priv} is not marked noindex or disallowed`); }
  const audit = await s.call('POST', '/api/operator/seo/audit', { headers: { 'x-admin-key': s.adminKey }, body: {} });
  const a = audit.json?.audit || audit.json;
  const summary = { audit_status: audit.status, score: a?.score ?? null, categories: a?.categories?.length ?? null, fix: a?.counts?.fix ?? null };
  if (audit.status >= 300) problems.push('Founder SEO audit did not run: ' + audit.status);
  const report = { generated_at: new Date().toISOString(), pages, problems, founder_audit: summary };
  fs.mkdirSync('qa/reports', { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`${pages.length} sitemap page(s) checked; Founder SEO audit score ${summary.score} (${summary.categories} areas, ${summary.fix} to fix).`);
  console.log(problems.length ? 'Problems:\n  ' + problems.join('\n  ') : 'SEO RELEASE CHECK PASSED.');
  process.exitCode = problems.length ? 1 : 0;
} finally { await s.stop(); }
