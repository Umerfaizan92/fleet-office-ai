// Public website routes (Phase 03). Clean addresses map to static pages built into saas/site/ by `npm run build:site`.
// The existing /saas/ pages, sign-in and workspace addresses are unchanged.
import fs from 'node:fs';
import path from 'node:path';

export const PUBLIC_ROUTES = [
  ['/', 'home.html', 1.0], ['/features', 'features.html', 0.9],
  ...['customers', 'money', 'communications', 'growth', 'people', 'ai'].map((s) => [`/features/${s}`, `features-${s}.html`, 0.8]),
  ['/for', 'industries.html', 0.8],
  ...['trades', 'clinics', 'retail', 'agencies', 'cleaning'].map((s) => [`/for/${s}`, `for-${s}.html`, 0.8]),
  ['/pricing', 'pricing.html', 0.9], ['/receptionist', 'receptionist.html', 0.8], ['/stories', 'stories.html', 0.6],
  ['/help', 'help.html', 0.7], ['/contact', 'contact.html', 0.6]
];

export function installPublicSite(app, { env, siteRoot }) {
  const dir = path.join(siteRoot, 'saas', 'site');
  const baseUrl = (req) => (env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const cache = new Map();
  const read = (file) => {
    if (env.NODE_ENV === 'production' && cache.has(file)) return cache.get(file);
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    if (env.NODE_ENV === 'production') cache.set(file, html);
    return html;
  };
  for (const [route, file] of PUBLIC_ROUTES) {
    app.get(route === '/' ? '/' : [route, route + '/'], (req, res, next) => {
      let html; try { html = read(file); } catch { return next(); }
      res.set('cache-control', 'public, max-age=300').type('html').send(html.replaceAll('__PUBLIC_BASE_URL__', baseUrl(req)));
    });
  }
  // The trial starts on the existing, tested sign-up page.
  app.get('/start', (req, res) => {
    const q = new URLSearchParams();
    if (/^(starter|operations|scale)$/.test(String(req.query.plan || ''))) q.set('plan', req.query.plan);
    res.redirect(302, '/saas/create-account.html' + (q.toString() ? '?' + q : ''));
  });
  // Pre-compressed design-system assets (built by npm run build:ds); everything else falls through to express.static.
  app.get('/saas/ds/:file', (req, res, next) => {
    const name = String(req.params.file);
    if (!/^[a-z0-9-]+\.(js|css)$/.test(name)) return next();
    const accept = String(req.get('accept-encoding') || '');
    for (const [enc, ext] of [['br', '.br'], ['gzip', '.gz']]) {
      const file = path.join(siteRoot, 'saas', 'ds', name + ext);
      if (accept.includes(enc) && fs.existsSync(file)) {
        res.set({ 'content-encoding': enc, vary: 'Accept-Encoding', 'cache-control': 'public, max-age=86400' });
        res.type(name.endsWith('.js') ? 'application/javascript' : 'text/css');
        return res.sendFile(file);
      }
    }
    next();
  });
}

export function publicSitemapEntries() {
  return PUBLIC_ROUTES.map(([route, , priority]) => ({ route, priority }));
}
