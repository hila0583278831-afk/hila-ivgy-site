/* HILA IVGY — Work: endless curved 3D ring of site heroes (three.js) */
import * as THREE from 'three';

const host = document.querySelector('[data-orbit]');
if (host) init(host);

function init(host) {
  const canvas = host.querySelector('canvas');
  const items = [...host.querySelectorAll('.h-orbit__list li')].map((li) => ({
    img: li.dataset.img, name: li.dataset.name, cat: li.dataset.cat, url: li.dataset.url, ltr: li.dataset.ltr === '1'
  }));
  const capName = host.querySelector('.h-orbit__name');
  const capCat = host.querySelector('.h-orbit__cat');
  const pauseBtn = host.querySelector('.h-orbit__pause');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { host.classList.add('h-orbit--no3d'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
  const ring = new THREE.Group();
  scene.add(ring);

  const PANELS = 8;                  // the 5 sites repeat around the circle
  const R = 6;
  const STEP = (Math.PI * 2) / PANELS;
  const LEN = STEP * 0.84;           // panel width (angle), the rest is the gap
  const H = R * LEN * 0.66;          // panel height (≈16:10)
  const loader = new THREE.TextureLoader();
  const mats = [];
  const textures = items.map((it) => {
    const t = loader.load(it.img, () => { mats.forEach((m) => { if (m.map === t) { m.color.set(0xffffff); m.needsUpdate = true; } }); });
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.x = -1; t.offset.x = 1;   // seen from inside the ring → un-mirror
    t.anisotropy = 4;
    return t;
  });

  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xe0b3ff, side: THREE.BackSide, transparent: true, opacity: 0.95 });
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xb25cff, side: THREE.BackSide, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloMat2 = new THREE.MeshBasicMaterial({ color: 0xff4fd8, side: THREE.BackSide, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false });

  const panels = [];
  for (let i = 0; i < PANELS; i++) {
    const c = i * STEP;
    const it = i % items.length;
    const seg = (r, h, len) => new THREE.CylinderGeometry(r, r, h, 48, 1, true, c - len / 2, len);
    const fm = new THREE.MeshBasicMaterial({ map: textures[it], side: THREE.BackSide, color: textures[it].image ? 0xffffff : 0x1b1624 });
    mats.push(fm);
    const face = new THREE.Mesh(seg(R, H, LEN), fm);
    face.userData = { item: it };
    const edge = new THREE.Mesh(seg(R + 0.015, H + 0.07, LEN + 0.012), edgeMat);
    const halo = new THREE.Mesh(seg(R + 0.03, H + 0.16, LEN + 0.026), haloMat);
    ring.add(halo, edge, face);
    panels.push(face);
  }

  /* camera sits inside the ring, toward the front, looking at the far wall */
  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const mobile = w < 700;
    camera.fov = mobile ? 60 : 44;
    camera.position.set(0, 0, mobile ? 0.6 : 2.4);
    camera.lookAt(0, 0, -R);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(canvas); fit();

  /* motion: endless spin + drag with inertia */
  let paused = reduce, speed = 0.11, vel = 0, dragging = false, lastX = 0, visible = true, moved = 0;
  const setPaused = (p) => {
    paused = p;
    if (pauseBtn) {
      pauseBtn.setAttribute('aria-pressed', p ? 'true' : 'false');
      pauseBtn.querySelector('span').textContent = p ? 'הפעלת תנועה' : 'עצירת תנועה';
      pauseBtn.classList.toggle('is-paused', p);
    }
  };
  setPaused(paused);
  pauseBtn && pauseBtn.addEventListener('click', () => setPaused(!paused));

  canvas.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
      vel = dx * 0.0035; ring.rotation.y += vel;
    } else hover(e);
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', (e) => { end(); if (moved < 6) click(e); });
  canvas.addEventListener('pointercancel', end);

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(panels, false)[0];
    return hit ? items[hit.object.userData.item] : null;
  };
  const hover = (e) => { canvas.style.cursor = pick(e) ? 'pointer' : 'grab'; };
  const click = (e) => { const it = pick(e); if (it && it.url) window.open(it.url, '_blank', 'noopener'); };

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { rootMargin: '100px' }).observe(host);

  /* caption = the panel now facing the far wall */
  let shown = -1;
  const caption = () => {
    let best = 0, bd = 9;
    for (let i = 0; i < PANELS; i++) {
      let a = (i * STEP + ring.rotation.y - Math.PI) % (Math.PI * 2);
      if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) < bd) { bd = Math.abs(a); best = i % items.length; }
    }
    if (best !== shown && capName) {
      shown = best;
      const it = items[best];
      host.classList.remove('is-swap'); void host.offsetWidth; host.classList.add('is-swap');
      capName.textContent = it.name; capName.dir = it.ltr ? 'ltr' : 'rtl';
      capCat.textContent = it.cat;
    }
  };

  let last = performance.now();
  const tick = (now) => {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    if (!dragging) {
      vel *= 0.94;
      ring.rotation.y += vel + (paused ? 0 : speed * dt);
    }
    caption();
    renderer.render(scene, camera);
  };
  requestAnimationFrame(tick);
}
