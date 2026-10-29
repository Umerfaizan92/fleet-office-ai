// Cinematic hero: "Every action waits at your gate".
// Four channels (calls, messages, email, website) send cyan signals along curved paths into the office core.
// Each signal stops at the approval gate, the gate flashes gold, and the signal leaves as a gold outcome.
// One orchestrated opening, a short idle, then rendering stops; pointer and scroll move the camera gently.
// Built with `npm run build:ds` (esbuild tree-shakes Three.js into saas/ds/hero-3d.js).
import {
  Scene, PerspectiveCamera, WebGLRenderer, Color, Fog, Group, Vector3, CatmullRomCurve3,
  BoxGeometry, EdgesGeometry, LineSegments, LineBasicMaterial, MeshBasicMaterial, Mesh,
  SphereGeometry, TorusGeometry, TubeGeometry, PlaneGeometry, BufferGeometry, Float32BufferAttribute,
  Points, PointsMaterial, AdditiveBlending, CircleGeometry
} from 'three';

const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

export function mountHero(container, { quality = 'high', onReady = () => {} } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'sp-hero3d__canvas';
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: quality === 'high', alpha: true, powerPreference: 'low-power' });
  } catch { return null; }
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.75 : 1);
  renderer.setPixelRatio(dpr);
  container.append(canvas);

  const gold = new Color(css('--sp-gold', '#E6B455')), cyan = new Color(css('--sp-cyan', '#43D3F0'));
  const midnight = new Color(css('--sp-midnight', '#070B14')), line = new Color(css('--sp-fg-muted', '#95A1B6'));
  const scene = new Scene();
  const world = new Group();
  scene.add(world);
  scene.fog = new Fog(midnight, 9, 26);
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  const home = new Vector3(2.2, 2.4, 11.5);
  camera.position.copy(home);

  // Floor: a field of faint points, like an office floor plan seen at night.
  const floorPts = [];
  for (let x = -14; x <= 14; x += 0.7) for (let z = -12; z <= 6; z += 0.7) floorPts.push(x, -2.2, z);
  const floorGeo = new BufferGeometry(); floorGeo.setAttribute('position', new Float32BufferAttribute(floorPts, 3));
  const floor = new Points(floorGeo, new PointsMaterial({ color: line, size: 0.035, transparent: true, opacity: 0.35, depthWrite: false }));
  world.add(floor);

  // The office core: a glass block with gold edges and a soft inner light.
  const core = new Group();
  const block = new BoxGeometry(2.2, 2.2, 2.2);
  core.add(new LineSegments(new EdgesGeometry(block), new LineBasicMaterial({ color: gold, transparent: true, opacity: 0.9 })));
  core.add(new Mesh(block, new MeshBasicMaterial({ color: midnight, transparent: true, opacity: 0.55, depthWrite: false })));
  const inner = new Mesh(new SphereGeometry(0.42, 32, 16), new MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.85 }));
  core.add(inner);
  const innerGlow = new Mesh(new SphereGeometry(0.9, 32, 16), new MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.08, blending: AdditiveBlending, depthWrite: false }));
  core.add(innerGlow);
  core.position.set(1.4, 0, 0);
  core.rotation.set(0.32, -0.6, 0);
  world.add(core);

  // The approval gate: a ring in front of the core that every signal must pass.
  const gate = new Mesh(new TorusGeometry(0.95, 0.035, 12, 96), new MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.55 }));
  gate.position.set(-0.55, 0, 0.6); gate.rotation.y = Math.PI / 2.4;
  world.add(gate);
  const gateFlash = new Mesh(new CircleGeometry(0.92, 48), new MeshBasicMaterial({ color: gold, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  gateFlash.position.copy(gate.position); gateFlash.rotation.copy(gate.rotation);
  world.add(gateFlash);

  // Channels: four stations on an arc behind and left of the gate.
  const stations = [new Vector3(-6.2, 2.1, -3.5), new Vector3(-7.1, 0.4, -1.2), new Vector3(-6.4, -1.3, 1.2), new Vector3(-4.8, 2.9, 1.6)];
  const stationMat = new LineBasicMaterial({ color: cyan, transparent: true, opacity: 0 });
  const stationGeo = new EdgesGeometry(new BoxGeometry(0.55, 0.55, 0.08));
  const stationMeshes = stations.map((p) => { const s = new LineSegments(stationGeo, stationMat); s.position.copy(p); s.lookAt(gate.position); world.add(s); return s; });

  // Paths: station → gate (cyan) and gate → outcome (gold), drawn as faint tubes.
  const outcomes = [new Vector3(5.6, 2.4, -2.5), new Vector3(6.2, 0.3, -0.8), new Vector3(5.4, -1.6, 0.8)];
  const inPaths = stations.map((p) => new CatmullRomCurve3([p, p.clone().lerp(gate.position, 0.5).add(new Vector3(0, 0.6, 1.2)), gate.position.clone()]));
  const outPaths = outcomes.map((p) => new CatmullRomCurve3([gate.position.clone(), core.position.clone().add(new Vector3(0, 0.2, 1.4)), p]));
  const tubeIn = new MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0, depthWrite: false });
  const tubeOut = new MeshBasicMaterial({ color: gold, transparent: true, opacity: 0, depthWrite: false });
  inPaths.forEach((c) => world.add(new Mesh(new TubeGeometry(c, 48, 0.012, 6, false), tubeIn)));
  outPaths.forEach((c) => world.add(new Mesh(new TubeGeometry(c, 48, 0.012, 6, false), tubeOut)));

  // Signals.
  const signalGeo = new SphereGeometry(0.12, 16, 8), haloGeo = new SphereGeometry(0.34, 16, 8);
  const signals = [];
  function launch(i) {
    const mat = new MeshBasicMaterial({ color: cyan.clone(), transparent: true, opacity: 1 });
    const halo = new MeshBasicMaterial({ color: cyan.clone(), transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false });
    const m = new Mesh(signalGeo, mat), h = new Mesh(haloGeo, halo);
    m.add(h); world.add(m);
    signals.push({ mesh: m, mat, halo, inPath: inPaths[i % inPaths.length], outPath: outPaths[i % outPaths.length], t: 0, phase: 'in', hold: 0 });
  }

  // Timeline (seconds): stations and paths appear, then six signals launch, then occasional signals while idle.
  let elapsed = 0, lastSpawn = 0, spawned = 0, flash = 0, running = true, visible = true, idleSince = 0, rafId = 0, last = performance.now();
  const IDLE_LIMIT = 45; // stop rendering 45 s after the last interaction
  const pointer = { x: 0, y: 0 }, target = { x: 0, y: 0 };
  let scrollFactor = 0;

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const wide = w / h > 1.2;
    world.position.set(wide ? 4.2 : 0.4, wide ? 0 : 2.4, 0);
    world.scale.setScalar(wide ? 1 : 0.82);
    home.z = wide ? 13 : 16;
    camera.position.z = home.z;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  function step(dt) {
    elapsed += dt;
    const appear = Math.min(1, elapsed / 1.6);
    stationMat.opacity = 0.9 * appear; tubeIn.opacity = 0.32 * appear; tubeOut.opacity = 0.26 * Math.min(1, Math.max(0, (elapsed - 0.8) / 1.6));
    stationMeshes.forEach((s, i) => { s.position.y = stations[i].y + Math.sin(elapsed * 0.6 + i) * 0.05; });
    const opening = spawned < 6 && elapsed > 1.2 && elapsed - lastSpawn > 0.55;
    const idleSpawn = spawned >= 6 && elapsed - lastSpawn > 3.8;
    if (opening || idleSpawn) { launch(spawned); spawned += 1; lastSpawn = elapsed; }
    for (let i = signals.length - 1; i >= 0; i -= 1) {
      const s = signals[i];
      if (s.phase === 'in') {
        s.t = Math.min(1, s.t + dt / 1.9);
        s.mesh.position.copy(s.inPath.getPointAt(easeInOut(s.t)));
        if (s.t >= 1) { s.phase = 'hold'; s.hold = 0; }
      } else if (s.phase === 'hold') {
        s.hold += dt;
        if (s.hold > 0.45) { s.phase = 'out'; s.t = 0; s.mat.color.copy(gold); s.halo.color.copy(gold); flash = 1; }
      } else {
        s.t = Math.min(1, s.t + dt / 1.6);
        s.mesh.position.copy(s.outPath.getPointAt(easeInOut(s.t)));
        s.mat.opacity = 1 - Math.max(0, (s.t - 0.75) / 0.25);
        s.halo.opacity = 0.3 * s.mat.opacity;
        if (s.t >= 1) { world.remove(s.mesh); s.mat.dispose(); s.halo.dispose(); signals.splice(i, 1); }
      }
    }
    flash = Math.max(0, flash - dt * 2.2);
    gateFlash.material.opacity = 0.32 * flash;
    gate.material.opacity = 0.55 + 0.45 * flash;
    inner.scale.setScalar(1 + 0.18 * flash);
    core.rotation.y += dt * 0.06;
    // Camera: pointer parallax and scroll dolly, eased.
    target.x += (pointer.x - target.x) * Math.min(1, dt * 3); target.y += (pointer.y - target.y) * Math.min(1, dt * 3);
    camera.position.x = home.x + target.x * 0.9;
    camera.position.y = home.y + target.y * 0.5 + scrollFactor * 1.6;
    camera.lookAt(0.6 + world.position.x * 0.15, world.position.y * 0.5 - scrollFactor * 0.6, 0);
  }
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frame(now) {
    rafId = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt);
    renderer.render(scene, camera);
    idleSince += dt;
    if (running && visible && idleSince < IDLE_LIMIT) rafId = requestAnimationFrame(frame);
  }
  function wake() { idleSince = 0; if (!rafId && running && visible) { last = performance.now(); rafId = requestAnimationFrame(frame); } }

  const onPointer = (e) => { const r = container.getBoundingClientRect(); pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2; pointer.y = -((e.clientY - r.top) / r.height - 0.5) * 2; wake(); };
  const onScroll = () => { const r = container.getBoundingClientRect(); scrollFactor = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height))); wake(); };
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }, { threshold: 0.01 });
  io.observe(container);
  const onVis = () => { visible = !document.hidden; if (visible) wake(); };
  document.addEventListener('visibilitychange', onVis);

  renderer.render(scene, camera);
  requestAnimationFrame(() => { container.classList.add('is-ready'); onReady(); });
  wake();

  return {
    destroy() {
      running = false; cancelAnimationFrame(rafId); ro.disconnect(); io.disconnect();
      removeEventListener('pointermove', onPointer); removeEventListener('scroll', onScroll); document.removeEventListener('visibilitychange', onVis);
      renderer.dispose(); canvas.remove();
    }
  };
}
