const CACHE='superpro-public-20260919-5';
const PUBLIC=[
  '/saas/',
  '/saas/index.html',
  '/saas/intro.css?v=8',
  '/saas/support.css?v=11',
  '/saas/public-sections.css?v=20260919.5',
  '/saas/public-voice-install.css?v=20260919.5',
  '/saas/adaptive.css?v=11',
  '/saas/brand.css?v=20260919.5',
  '/saas/experience.css?v=20260919.5',
  '/saas/product-guide.js?v=20260919.5',
  '/saas/intro.js?v=20260919.5',
  '/saas/support.js?v=13',
  '/saas/common.js?v=20260919.5',
  '/saas/install.js?v=20260919.5',
  '/saas/answers.html',
  '/saas/superpro-icon-192.png',
  '/saas/superpro-icon-512.png'
];
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PUBLIC)).catch(()=>{}));
});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('superpro-public-')&&k!==CACHE).map(k=>caches.delete(k))))
])));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  const privatePath=u.pathname.startsWith('/api/')||u.pathname.includes('workspace')||u.pathname.includes('sign-in')||u.pathname.includes('create-account')||u.pathname.includes('verify-account')||u.pathname.includes('recover-account')||u.pathname.startsWith('/office/');
  if(e.request.method!=='GET'||u.origin!==location.origin||privatePath)return;
  e.respondWith(fetch(e.request).then(r=>{
    if(!r||r.status!==200||r.type==='opaque')return r;
    const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r;
  }).catch(()=>caches.match(e.request)));
});