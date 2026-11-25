/* Hero headline – after Noomo Labs: a clear glass sphere built from curved panels (latitude rows × longitude
   slices, slowly spinning) follows the cursor over the words; each panel refracts the letters behind it, the gaps
   between panels show them straight. Off once the page is scrolled (hero-scroll.js moves the hero then).
   The words stay real SVG text (layout, blur mask, SEO); while the sphere is up the canvas draws them instead. */
(() => {
  const hero = document.getElementById('hero'); if (!hero) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const svg = hero.querySelector('svg'), group = svg.querySelector('.hero-type');
  const texts = [...group.querySelectorAll('text')];
  const hover = matchMedia('(hover: hover)').matches;
  const stopped = () => document.documentElement.classList.contains('a11y-stop');

  const cv = document.createElement('canvas'); cv.className = 'hero-glass'; cv.setAttribute('aria-hidden', 'true'); hero.appendChild(cv);
  const ctx = cv.getContext('2d');
  const scene = document.createElement('canvas'), sc = scene.getContext('2d');   // canvas copy of the words
  let W = 0, H = 0, dpr = 1, box = { x0: 0, y0: 0, x1: 0, y1: 0 };

  function size() {
    const r = hero.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
    for (const c of [cv, scene]) { c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr)); }
    paintScene();
  }
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

  // ---------- the glass sphere ----------
  let px = -1e4, py = -1e4, sx = 0, sy = 0, show = 0, target = 0, spin = 0, lastT = 0, raf = 0;
  const ROWS = 8, COLS = 14, GAP = .07;
  function drawSphere(now) {
    const dt = lastT ? Math.min(.05, (now - lastT) / 1000) : 0; lastT = now; spin += dt * .35;
    const R = Math.max(110, Math.min(260, W * .13)) * (.55 + .45 * show);
    ctx.drawImage(scene, 0, 0, W, H);                       // the words (the SVG copy is hidden meanwhile)
    const dP = Math.PI / ROWS, dT = 2 * Math.PI / COLS, HP = Math.PI / 2;
    const P = (t, p) => [sx + R * Math.cos(p) * Math.sin(t), sy + R * Math.sin(p)];
    for (let r = 0; r < ROWS; r++) {
      const p0 = -HP + r * dP + dP * GAP, p1 = -HP + (r + 1) * dP - dP * GAP, pm = (p0 + p1) / 2;
      for (let c = 0; c < COLS; c++) {
        const mid = Math.atan2(Math.sin(c * dT + spin + (r % 2) * dT / 2), Math.cos(c * dT + spin + (r % 2) * dT / 2));
        const t0 = Math.max(-HP, mid - dT / 2 + dT * GAP), t1 = Math.min(HP, mid + dT / 2 - dT * GAP);
        if (t1 - t0 < .02) continue;                          // back of the sphere / sliver at the rim
        const tm = (t0 + t1) / 2, z = Math.cos(pm) * Math.cos(tm);   // how much the panel faces us
        // panel outline: corners + mid-points so the edges follow the curve
        const pts = [P(t0, p0), P(tm, p0), P(t1, p0), P(t1, p1), P(tm, p1), P(t0, p1)];
        let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        pts.forEach(([x, y]) => { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); });
        const bw = bx1 - bx0, bh = by1 - by0; if (bw < 1 || bh < 1) continue;
        const [pcx, pcy] = P(tm, pm);
        // refraction: the middle of the ball magnifies what is near its centre, the rim squeezes what is further out
        const k = 1 - show * (1 - (.42 + .95 * (1 - z))), m = 1 + show * .22 * z;
        const qcx = sx + (pcx - sx) * k, qcy = sy + (pcy - sy) * k;
        ctx.save();
        ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
        ctx.clip();
        ctx.clearRect(bx0 - 1, by0 - 1, bw + 2, bh + 2);
        const srx = qcx + (bx0 - pcx) / m, sry = qcy + (by0 - pcy) / m;
        ctx.drawImage(scene, srx * dpr, sry * dpr, bw / m * dpr, bh / m * dpr, bx0, by0, bw, bh);
        // light from the top-left: a soft sheen on the panels that face it
        const lit = Math.max(0, -Math.sin(tm) * .6 - Math.sin(pm) * .8);
        if (lit > .05) { ctx.globalAlpha = show * lit * .16; ctx.fillStyle = '#fff'; ctx.fillRect(bx0, by0, bw, bh); }
        ctx.restore();
        // glossy edge
        ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
        ctx.globalAlpha = show * (.25 + .55 * z); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // faint outline of the whole ball
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2);
    ctx.globalAlpha = show * .28; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function frame(now) {
    raf = 0; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    show += (target - show) * .12; if (show < .004 && target === 0) show = 0;
    sx += (px - sx) * .15; sy += (py - sy) * .15;
    if (show > 0) { group.style.visibility = 'hidden'; drawSphere(now); raf = requestAnimationFrame(frame); }
    else { group.style.visibility = ''; lastT = 0; }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  if (hover) {
    const scrolled = () => scrollY > 8;
    addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, pad = 40;
      const over = !scrolled() && !stopped() && x > box.x0 - pad && x < box.x1 + pad && y > box.y0 - pad && y < box.y1 + pad;
      if (over && show === 0) { sx = x; sy = y; }
      px = x; py = y; target = over ? 1 : 0; if (over || show > 0) kick();
    }, { passive: true });
    document.addEventListener('pointerleave', () => { target = 0; });
    addEventListener('scroll', () => { if (scrolled() && target) { target = 0; kick(); } }, { passive: true });
  }

  size();
  addEventListener('resize', () => setTimeout(size, 0));
  document.fonts && document.fonts.ready.then(size);
})();
