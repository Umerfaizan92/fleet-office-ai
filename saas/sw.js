const CACHE='superpro-public-v20';
const PUBLIC=[
  '/saas/',
  '/saas/index.html',
  '/saas/intro.css?v=8',
  '/saas/v14.css?v=14',
  '/saas/v15.css?v=15',
  '/saas/intro.js?v=17',
  '/saas/product-guide.js?v=15',
  '/saas/v14.js?v=14',
  '/saas/v15.js?v=15',
  '/saas/superpro-v12.js?v=17.1',
  '/saas/guide-v17-hotfix.js?v=17.3',
  '/saas/guide-v16.js?v=16.3',
  '/saas/ai-operations-v16.js?v=16.2',
  '/saas/answers.html',
  '/saas/superpro-icon-192.png',
  '/saas/superpro-icon-512.png'
];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PUBLIC)).catch(()=>{}))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('superpro-public-')&&k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  const privatePath=u.pathname.startsWith('/api/')||u.pathname.includes('workspace')||u.pathname.includes('sign-in')||u.pathname.includes('create-account')||u.pathname.includes('verify-account')||u.pathname.startsWith('/office/');
  if(e.request.method!=='GET'||u.origin!==location.origin||privatePath)return;
  e.respondWith(fetch(e.request).then(r=>{if(!r||r.status!==200||r.type==='opaque')return r;const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));
});