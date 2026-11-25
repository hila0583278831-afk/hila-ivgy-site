/* Glass tiles over the hero headline (after the faceted glass sphere in Noomo Labs):
   – moving the cursor over the words brings up a sphere of small glass squares that refract the letters
     under it (magnified in the middle, squeezed at the rim, slightly sliced)
   – after the glass has travelled across the words for a while, the whole hero turns into glass tiles
     in a wave from the cursor, the sentence changes underneath, and the tiles clear to reveal the next one
   – with no hover (phones, or nobody touching it) the sentences change by themselves every few seconds
   The words themselves stay real SVG text (layout, blur mask, SEO); the canvas only draws the glass. */
(() => {
  const hero = document.getElementById('hero'); if (!hero) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const svg = hero.querySelector('svg'), group = svg.querySelector('.hero-type');
  const texts = [...group.querySelectorAll('text')];
  const hover = matchMedia('(hover: hover)').matches;
  const stopped = () => document.documentElement.classList.contains('a11y-stop');

  // the sentences rotate in this order; each one is three lines, the first line is the black one
  const SENTENCES = [
    ['אתר שנראה', 'כמו שהעסק שלך', 'באמת שווה'],
    ['מיתוג שגורם', 'ללקוחות לבחור', 'דווקא בך'],
    ['אתר שמוכר', 'בשבילך', 'גם בשתיים בלילה'],
  ];
  let idx = 0;

  const cv = document.createElement('canvas'); cv.className = 'hero-glass'; cv.setAttribute('aria-hidden', 'true'); hero.appendChild(cv);
  const ctx = cv.getContext('2d');
  const scene = document.createElement('canvas'), sc = scene.getContext('2d');   // a canvas copy of the words
  let W = 0, H = 0, dpr = 1, box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;

  function size() {
    const r = hero.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
    for (const c of [cv, scene]) { c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr)); }
    paintScene(); kick();
  }
  // draw the SVG lines on the scene canvas at exactly their on-screen place and size
  function paintScene() {
    sc.setTransform(dpr, 0, 0, dpr, 0, 0); sc.clearRect(0, 0, W, H);
    const hr = hero.getBoundingClientRect();
    box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    texts.forEach(t => {
      const m = t.getScreenCTM(); if (!m) return;
      const fs = +t.getAttribute('font-size') * m.a, ls = +(t.getAttribute('letter-spacing') || 0) * m.a;
      const x = +t.getAttribute('x') * m.a + m.e - hr.left, y = +t.getAttribute('y') * m.d + m.f - hr.top;
      sc.font = `600 ${fs}px "Lia Element", sans-serif`; sc.direction = 'rtl'; sc.textAlign = 'center'; sc.textBaseline = 'alphabetic';
      if ('letterSpacing' in sc) sc.letterSpacing = ls + 'px';
      sc.fillStyle = t.getAttribute('fill') || '#fff'; sc.fillText(t.textContent, x, y);
      const b = t.getBoundingClientRect();
      box.x0 = Math.min(box.x0, b.left - hr.left); box.x1 = Math.max(box.x1, b.right - hr.left);
      box.y0 = Math.min(box.y0, b.top - hr.top); box.y1 = Math.max(box.y1, b.bottom - hr.top);
    });
  }

  // one glass square: tinted body, the words seen through it (shifted by ox/oy, magnified by mag), sheen and edge
  function tile(x, y, s, ox, oy, mag, a) {
    const cx = x + s / 2, cy = y + s / 2, sw = s / mag;
    ctx.globalAlpha = a * .82; ctx.fillStyle = '#7A4FE0'; ctx.fillRect(x, y, s, s);
    ctx.globalAlpha = a;
    const qx = (x - cx - ox) / mag + cx, qy = (y - cy - oy) / mag + cy;
    ctx.drawImage(scene, qx * dpr, qy * dpr, sw * dpr, sw * dpr, x, y, s, s);
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, 'rgba(255,255,255,.38)'); g.addColorStop(.45, 'rgba(255,255,255,.04)'); g.addColorStop(1, 'rgba(255,255,255,.14)');
    ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
    ctx.globalAlpha = a * .55; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, s - 1, s - 1);
    ctx.globalAlpha = 1;
  }

  // ---- the glass sphere under the cursor ----
  let px = -1e4, py = -1e4, sx = 0, sy = 0, show = 0, target = 0, charge = 0;
  function drawSphere(now) {
    const TS = Math.max(22, Math.min(50, W * .03)), R = Math.max(110, Math.min(240, W * .125));
    const step = TS + 3, n = Math.ceil(R / step) + 1, t = now / 1000;
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const dx = i * step, dy = j * step, d = Math.hypot(dx, dy) / R; if (d > 1) continue;
      const z = Math.sqrt(1 - d * d), s = TS * (.35 + .65 * z) * show; if (s < 2) continue;
      const cx = sx + dx * (.85 + .15 * z), cy = sy + dy * (.85 + .15 * z);
      const k = .5 + 1.1 * (1 - z), mag = 1 + .35 * z;                 // centre magnifies, rim squeezes
      const wob = Math.sin(t * 2 + i * 1.7 + j * 2.3) * 3 * (1 - z);     // the facets shimmer a little
      tile(cx - s / 2, cy - s / 2, s, mag * (cx - sx) * (1 - k) + wob, mag * (cy - sy) * (1 - k), mag, show);
    }
  }

  // ---- full-hero glass wave that changes the sentence ----
  const TD = 1700; let tr = null, lastAuto = performance.now();
  function startTransition(x, y) {
    if (tr || stopped()) return;
    tr = { t0: performance.now(), cx: x, cy: y, swapped: false }; charge = 0; target = 0; show = 0;
    paintScene(); group.style.opacity = '0'; kick();
  }
  function swap() {
    idx = (idx + 1) % SENTENCES.length;
    texts.forEach((t, i) => { t.textContent = SENTENCES[idx][i] || ''; });
    window.heroRelayout && window.heroRelayout();
    paintScene();
  }
  function drawTransition(now) {
    const p = Math.min(1, (now - tr.t0) / TD);
    if (!tr.swapped && p >= .5) { swap(); tr.swapped = true; }
    if (p >= 1) { ctx.clearRect(0, 0, W, H); group.style.opacity = ''; tr = null; lastAuto = now; return false; }
    ctx.drawImage(scene, 0, 0, W, H);      // the words themselves (old, then new) – the SVG is hidden meanwhile
    const step = Math.max(48, Math.min(110, W / 18)), s = step - 5;
    const cols = Math.ceil(W / step) + 1, rows = Math.ceil(H / step) + 1;
    const maxD = Math.hypot(Math.max(tr.cx, W - tr.cx), Math.max(tr.cy, H - tr.cy)) || 1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * step + 2, y = j * step + 2, cx = x + s / 2, cy = y + s / 2;
      const d = Math.min(1, Math.hypot(cx - tr.cx, cy - tr.cy) / maxD);
      const tin = d * .32, tout = .6 + d * .3;
      const a = clamp((p - tin) / .1) * (1 - clamp((p - tout) / .1)); if (a <= 0) continue;
      const life = clamp((p - tin) / (tout + .1 - tin)), bump = Math.sin(Math.PI * life);
      const sz = s * (.55 + .45 * a);
      tile(cx - sz / 2, cy - sz / 2, sz, bump * step * .9 * (j % 2 ? 1 : -1), 0, 1 + .25 * bump, a);
    }
    return true;
  }

  // ---- loop: runs only while something is on screen ----
  let raf = 0;
  function frame(now) {
    raf = 0; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    let busy = false;
    if (tr) busy = drawTransition(now) || !!tr;
    else {
      show += (target - show) * .12; if (show < .002 && target === 0) show = 0;
      sx += (px - sx) * .18; sy += (py - sy) * .18;
      if (show > 0) { drawSphere(now); busy = true; }
    }
    if (busy) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  if (hover) {
    let wasOver = false;
    addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, pad = 30;
      const over = !tr && !stopped() && x > box.x0 - pad && x < box.x1 + pad && y > box.y0 - pad && y < box.y1 + pad;
      if (over && show === 0) { sx = x; sy = y; }
      if (over && wasOver) {
        charge += Math.hypot(x - px, y - py); lastAuto = performance.now();
        if (charge > (box.x1 - box.x0) * 1.6) { px = x; py = y; wasOver = false; startTransition(x, y); return; }
      }
      px = x; py = y; wasOver = over; target = over ? 1 : 0; if (over || show > 0) kick();
    }, { passive: true });
    document.addEventListener('pointerleave', () => { target = 0; wasOver = false; });
  }

  // nobody playing with it → next sentence every few seconds (only while the hero is on screen)
  let inView = true;
  new IntersectionObserver(e => { inView = e[0].isIntersecting; }).observe(hero);
  setInterval(() => {
    const now = performance.now();
    if (!tr && inView && target === 0 && !document.hidden && now - lastAuto > 7000) startTransition(W / 2, H / 2);
  }, 500);

  size();
  addEventListener('resize', () => setTimeout(size, 0));
  document.fonts && document.fonts.ready.then(size);
})();
