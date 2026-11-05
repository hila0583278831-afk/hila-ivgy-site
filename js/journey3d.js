/* HILA IVGY — journey: live 3D objects inside the 5 stage cards (three.js) */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = { violet: 0x8b3dff, magenta: 0xff3fd8, blue: 0x5b6bff, pink: 0xff9cf0, pearl: 0xf3eaff };

/* ---------- materials ---------- */
const iri = (color, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
  color, metalness: 0.15, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08,
  iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [150, 800], envMapIntensity: 1.25
}, o));
const glass = (color) => new THREE.MeshPhysicalMaterial({
  color, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.6, ior: 1.45,
  clearcoat: 1, iridescence: 0.7, envMapIntensity: 1.5, side: THREE.DoubleSide, transparent: true
});
const glow = (color, i = 2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: i });
const additive = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/* ---------- shape helpers ---------- */
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function ext(shape, depth = 0.4, bevel = 0.08, center = true) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 40 });
  if (center) g.center(); else g.translate(0, 0, -depth / 2);
  return g;
}

/* ---------- 01 · היכרות: two chat bubbles, typing dots ---------- */
function buildChat() {
  const g = new THREE.Group();
  const bubble = (w, h, mat, flip) => {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(ext(roundRect(w, h, h / 2), 0.42, 0.1), mat));
    const t = new THREE.Shape(); t.moveTo(0, 0); t.lineTo(0.5, 0); t.lineTo(-0.18, -0.48); t.lineTo(0, 0);
    const tail = new THREE.Mesh(ext(t, 0.42, 0.08, false), mat);
    tail.position.set(-w / 2 + 0.5, -h / 2 + 0.12, -0.21 + 0.21);
    if (flip) { tail.scale.x = -1; tail.position.x *= -1; }
    b.add(tail);
    return b;
  };
  const a = bubble(2.5, 1.35, iri(C.violet), false);
  const b = bubble(1.8, 1.0, iri(C.magenta), true);
  a.position.set(-0.35, -0.45, 0.4);
  b.position.set(0.95, 0.75, -0.7);
  const dots = [-0.5, 0, 0.5].map((x) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 16), iri(C.pearl, { iridescence: 0.35 }));
    d.position.set(x, 0, 0.36); a.add(d); return d;
  });
  g.add(a, b);
  return {
    group: g,
    update(t) {
      a.position.y = -0.45 + Math.sin(t * 1.2) * 0.08;
      b.position.y = 0.75 + Math.sin(t * 1.2 + 1.6) * 0.09;
      dots.forEach((d, i) => { d.position.y = Math.max(0, Math.sin(t * 5 - i * 0.8)) * 0.16; });
      g.rotation.y = Math.sin(t * 0.5) * 0.35;
      g.rotation.x = Math.sin(t * 0.4) * 0.08;
    }
  };
}

/* ---------- 02 · מיתוג: glass light bulb with a glowing filament ---------- */
function buildBulb() {
  const g = new THREE.Group();
  const pts = [new THREE.Vector2(0.4, -0.32), new THREE.Vector2(0.42, -0.12), new THREE.Vector2(0.5, 0.02)];
  for (let a = -52; a <= 90; a += 4) {
    const r = (a * Math.PI) / 180;
    pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(r) * 1.0), 0.85 + Math.sin(r) * 1.0));
  }
  const bulb = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), glass(0xe2ccff));
  g.add(bulb);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 16), additive(C.magenta, 0.22));
  core.position.y = 0.85; g.add(core);

  class Helix extends THREE.Curve {
    getPoint(t, v = new THREE.Vector3()) {
      const a = t * Math.PI * 2 * 5;
      return v.set(Math.cos(a) * 0.17, 0.5 + t * 0.62, Math.sin(a) * 0.17);
    }
  }
  const filMat = glow(C.magenta, 2.6);
  const fil = new THREE.Mesh(new THREE.TubeGeometry(new Helix(), 240, 0.028, 8), filMat);
  g.add(fil);
  [-0.15, 0.15].forEach((x) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8), glow(C.pink, 0.8));
    w.position.set(x, 0.1, 0); g.add(w);
  });
  const metal = iri(0xcbb8ea, { metalness: 0.9, roughness: 0.22, iridescence: 0.5 });
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.37, 0.62, 48), metal);
  sleeve.position.y = -0.62; g.add(sleeve);
  [-0.42, -0.58, -0.74].forEach((y) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.055, 16, 64), metal);
    ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
  });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), iri(0x2a1446, { metalness: 0.6 }));
  tip.position.y = -0.98; tip.scale.y = 0.6; g.add(tip);
  const light = new THREE.PointLight(C.magenta, 6, 4, 2);
  light.position.y = 0.85; g.add(light);
  g.position.y = -0.35;
  return {
    group: g,
    update(t) {
      const p = 2.2 + Math.sin(t * 3) * 0.9;
      filMat.emissiveIntensity = p;
      light.intensity = 4 + p * 1.5;
      core.material.opacity = 0.14 + (p / 3.1) * 0.14;
      g.rotation.z = Math.sin(t * 0.8) * 0.12;
      g.rotation.y = t * 0.45;
      g.position.y = -0.35 + Math.sin(t * 1.1) * 0.06;
    }
  };
}

/* ---------- 03 · המילים: 3D quotation marks + text lines ---------- */
function buildQuotes() {
  const g = new THREE.Group();
  const comma = () => {
    const s = new THREE.Shape();
    s.moveTo(0.5, 0);
    s.absarc(0, 0, 0.5, 0, Math.PI * 1.5, false);
    s.quadraticCurveTo(-0.12, -0.9, -0.42, -1.15);
    s.quadraticCurveTo(0.5, -0.9, 0.5, 0);
    return ext(s, 0.36, 0.1);
  };
  const q1 = new THREE.Mesh(comma(), iri(C.magenta));
  const q2 = new THREE.Mesh(comma(), iri(C.violet));
  q1.position.set(0.62, 0.45, 0); q2.position.set(-0.62, 0.45, 0);
  g.add(q1, q2);
  const bars = [[2.6, -1.05], [1.9, -1.42], [2.3, -1.79]].map(([w, y], i) => {
    const m = new THREE.Mesh(ext(roundRect(w, 0.16, 0.08), 0.08, 0.03), iri(i === 1 ? C.pink : C.pearl, { iridescence: 0.4 }));
    m.position.set(0, y, -0.2); g.add(m); return m;
  });
  g.position.y = 0.05;
  return {
    group: g,
    update(t) {
      q1.position.y = 0.45 + Math.sin(t * 1.4) * 0.12;
      q2.position.y = 0.45 + Math.sin(t * 1.4 + 0.9) * 0.12;
      q1.rotation.y = Math.sin(t * 0.7) * 0.5;
      q2.rotation.y = Math.sin(t * 0.7 + 0.6) * 0.5;
      bars.forEach((b, i) => { b.scale.x = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.3 - i * 0.9)); });
      g.rotation.x = -0.12 + Math.sin(t * 0.5) * 0.06;
    }
  };
}

/* ---------- 04 · העיצוב: floating glass screens + cursor ---------- */
function buildDesign() {
  const g = new THREE.Group();
  const panels = [[C.blue, -0.42, 0.32, -0.7], [C.violet, 0, 0, -0.25], [C.magenta, 0.42, -0.32, 0.2]].map(([c, x, y, z]) => {
    const m = new THREE.Mesh(ext(roundRect(2.4, 1.55, 0.2), 0.06, 0.03), iri(c, { transparent: true, opacity: 0.88 }));
    m.position.set(x, y, z); g.add(m); return m;
  });
  const front = panels[2];
  const ui = iri(C.pearl, { iridescence: 0.3 });
  const pill = new THREE.Mesh(ext(roundRect(1.2, 0.2, 0.1), 0.05, 0.02), ui); pill.position.set(-0.3, 0.3, 0.07); front.add(pill);
  const pill2 = new THREE.Mesh(ext(roundRect(0.8, 0.14, 0.07), 0.05, 0.02), ui); pill2.position.set(-0.5, 0.0, 0.07); front.add(pill2);
  const btn = new THREE.Mesh(ext(roundRect(0.7, 0.3, 0.15), 0.06, 0.02), iri(C.violet)); btn.position.set(0.55, -0.42, 0.08); front.add(btn);
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0, -1.1); s.lineTo(0.3, -0.82); s.lineTo(0.52, -1.3); s.lineTo(0.7, -1.22); s.lineTo(0.48, -0.75); s.lineTo(0.85, -0.75); s.lineTo(0, 0);
  const cursor = new THREE.Mesh(ext(s, 0.16, 0.05, false), iri(C.pearl, { iridescence: 0.6 }));
  cursor.scale.setScalar(0.85);
  g.add(cursor);
  g.rotation.x = -0.12;
  return {
    group: g,
    update(t) {
      panels.forEach((p, i) => { p.position.y = [0.32, 0, -0.32][i] + Math.sin(t * 1.1 + i * 0.9) * 0.07; });
      g.rotation.y = Math.sin(t * 0.45) * 0.45;
      const k = (t * 0.55) % 1;
      cursor.position.set(0.75 + Math.cos(t * 1.1) * 0.55, 0.15 + Math.sin(t * 1.6) * 0.4, 0.75);
      const click = Math.pow(Math.max(0, Math.sin(t * 2.2)), 24);
      cursor.scale.setScalar(0.85 - click * 0.12);
      btn.scale.setScalar(1 + click * 0.12 + k * 0);
    }
  };
}

/* ---------- 05 · הבנייה ועלייה לאוויר: rocket with flame ---------- */
function buildRocket() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const prof = [[0, 1.6], [0.12, 1.5], [0.26, 1.32], [0.38, 1.08], [0.46, 0.8], [0.5, 0.45], [0.52, 0.05], [0.5, -0.4], [0.44, -0.72], [0.34, -0.88], [0, -0.9]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  body.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 72), iri(C.pearl, { metalness: 0.35, roughness: 0.18, iridescence: 0.8 })));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 16, 72), iri(C.magenta));
  band.rotation.x = Math.PI / 2; band.position.y = 0.55; body.add(band);
  const win = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.05, 16, 48), iri(C.violet, { metalness: 0.6 }));
  win.position.set(0, 0.2, 0.47); body.add(win);
  const glassWin = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), glow(C.blue, 1.4));
  glassWin.position.set(0, 0.2, 0.465); body.add(glassWin);
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(0.55, -0.35); fs.lineTo(0.58, -0.9); fs.lineTo(0, -0.6); fs.lineTo(0, 0);
  const finGeo = ext(fs, 0.08, 0.03, false);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = (i / 3) * Math.PI * 2;
    const fin = new THREE.Mesh(finGeo, iri(C.magenta)); fin.position.set(0.4, -0.2, 0); pivot.add(fin); body.add(pivot);
  }
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.2, 32), iri(0x3a2260, { metalness: 0.8 }));
  nozzle.position.y = -0.98; body.add(nozzle);
  g.add(body);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.0, 32, 1, true), additive(C.magenta, 0.85));
  flame.rotation.x = Math.PI; flame.position.y = -1.58; g.add(flame);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 24, 1, true), additive(0xffffff, 0.9));
  inner.rotation.x = Math.PI; inner.position.y = -1.38; g.add(inner);
  const sparks = Array.from({ length: 18 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), additive(i % 2 ? C.pink : C.violet, 0.9));
    m.userData = { o: Math.random(), x: (Math.random() - 0.5) * 0.5, z: (Math.random() - 0.5) * 0.5 };
    g.add(m); return m;
  });
  g.rotation.z = -0.38;
  g.scale.setScalar(0.88);
  return {
    group: g,
    update(t) {
      body.rotation.y = t * 0.7;
      g.position.set(Math.sin(t * 0.9) * 0.08, 0.1 + Math.sin(t * 1.3) * 0.14, 0);
      const f = 1 + Math.sin(t * 28) * 0.08 + Math.sin(t * 11) * 0.06;
      flame.scale.set(1, f, 1); inner.scale.set(1, f * 1.05, 1);
      sparks.forEach((s) => {
        const p = (t * 0.9 + s.userData.o) % 1;
        s.position.set(s.userData.x * (1 + p * 2), -1.4 - p * 1.8, s.userData.z);
        s.scale.setScalar(1 - p);
      });
    }
  };
}

const BUILDERS = { chat: buildChat, bulb: buildBulb, quotes: buildQuotes, design: buildDesign, rocket: buildRocket };

/* ---------- mount ---------- */
const mounts = [];
function mount(canvas) {
  const build = BUILDERS[canvas.dataset.obj];
  if (!build) return;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (e) { canvas.closest('.j5__card')?.classList.add('no3d'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 4, 5); scene.add(key);
  const pl1 = new THREE.PointLight(C.magenta, 30, 0, 2); pl1.position.set(-3, 1.5, 2.5); scene.add(pl1);
  const pl2 = new THREE.PointLight(C.blue, 26, 0, 2); pl2.position.set(3, -1.5, 2.5); scene.add(pl2);
  const camera = new THREE.PerspectiveCamera(32, 1.6, 0.1, 50);
  camera.position.set(0, 0, 7.2);
  const obj = build();
  const rig = new THREE.Group(); rig.add(obj.group); scene.add(rig);
  const m = { renderer, scene, camera, obj, rig, visible: false, tx: 0, ty: 0 };
  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1.25 ? 8.6 : 7.2;
    camera.updateProjectionMatrix();
    if (reduce) { obj.update(1.2); renderer.render(scene, camera); }
  };
  new ResizeObserver(size).observe(canvas); size();
  new IntersectionObserver((es) => { m.visible = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(canvas);
  const card = canvas.closest('.j5__card');
  if (card && !reduce) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      m.tx = ((e.clientX - r.left) / r.width - 0.5) * 0.6;
      m.ty = ((e.clientY - r.top) / r.height - 0.5) * 0.4;
    });
    card.addEventListener('pointerleave', () => { m.tx = 0; m.ty = 0; });
  }
  mounts.push(m);
}

document.querySelectorAll('canvas[data-obj]').forEach(mount);

if (!reduce && mounts.length) {
  const tick = () => {
    requestAnimationFrame(tick);
    const t = performance.now() / 1000;
    for (const m of mounts) {
      if (!m.visible) continue;
      m.rig.rotation.y += (m.tx - m.rig.rotation.y) * 0.06;
      m.rig.rotation.x += (m.ty - m.rig.rotation.x) * 0.06;
      m.obj.update(t);
      m.renderer.render(m.scene, m.camera);
    }
  };
  requestAnimationFrame(tick);
}
