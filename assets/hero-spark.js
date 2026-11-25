/* THE CREATIVE SPARK – a photographed glass-and-chrome sculpture (Magnific render, assets/spark.jpg, shot on black)
   living under the hero grid:
   – drawn on a canvas BELOW the SVG, so the grid lines and the headline stay on top; "screen" blending makes the
     black studio backdrop disappear and lets the glass read as translucent light on the violet background
   – idle: floats and turns slowly; follows the mouse with parallax (moves against it, turns in depth)
   – as the cursor comes close it rises, brightens and its violet glow grows; its contact shadow softens
   – the grid cells around it bend towards it, like a magnetic pull, and thin out where it rises through
   – click / tap on it: it breaks into glowing vector-edged fragments and reassembles
   One canvas, one image, ~1 draw per frame; paused when the hero is off screen or the tab is hidden. */
(() => {
  const hero = document.getElementById('hero'); if (!hero) return;
  const svg = hero.querySelector('svg'), grid = svg.querySelector('.hero-grid');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stopped = () => document.documentElement.classList.contains('a11y-stop');
  const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const easeOut = t => 1 - Math.pow(1 - t, 3), easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const rnd = (a, b) => a + Math.random() * (b - a);

  const shadow = document.createElement('div'); shadow.className = 'spark-shadow'; shadow.setAttribute('aria-hidden', 'true');
  const cv = document.createElement('canvas'); cv.className = 'spark'; cv.setAttribute('aria-hidden', 'true');
  svg.before(shadow, cv);
  const ctx = cv.getContext('2d');
  const img = new Image(); img.decoding = 'async'; img.src = 'assets/spark.jpg';

  let W = 0, H = 0, dpr = 1, ready = false;
  const N = 16; let tiles = [];                     // fragments for the click break-up
  function size() {
    const r = hero.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(1.5, devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
  }
  const geo = () => W < 700
    ? { cx: W * .5, cy: H * .5, S: Math.min(H * .5, W * .8) }
    : { cx: W * .5, cy: H * .5, S: Math.min(H * .66, W * .4) };

  // ---- pointer ----
  let mx = 0, my = 0, inside = false, prox = 0, px = 0, py = 0, cur = { x: 0, y: 0, s: 0 };
  addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
    inside = mx >= 0 && my >= 0 && mx <= r.width && my <= r.height;
    hero.style.cursor = inside && Math.hypot(mx - cur.x, my - cur.y) < cur.s * .4 ? 'pointer' : '';
  }, { passive: true });
  document.addEventListener('pointerleave', () => { inside = false; });

  // ---- magnetic pull on the grid cells ----
  let cells = [];
  function prep() {
    const first = grid.firstElementChild;
    if (first && first.tagName.toLowerCase() === 'g' && cells.length) return;
    const kids = [...grid.children], NS = 'http://www.w3.org/2000/svg'; cells = [];
    for (let i = 0; i < kids.length; i += 2) {
      const r = kids[i], g = document.createElementNS(NS, 'g');
      grid.insertBefore(g, r); g.appendChild(r); if (kids[i + 1]) g.appendChild(kids[i + 1]);
      cells.push({ g, x: +r.getAttribute('x') + +r.getAttribute('width') / 2, y: +r.getAttribute('y') + +r.getAttribute('height') / 2, on: false });
    }
  }
  function magnet(x, y, s, p) {
    prep();
    const m = svg.getScreenCTM(); if (!m) return;
    const hr = hero.getBoundingClientRect(), inv = m.inverse();
    const c = new DOMPoint(x + hr.left, y + hr.top).matrixTransform(inv);
    const R = s / m.a * (.32 + .12 * p), pull = .03 + .09 * p;      // local: only the cells right around it
    cells.forEach(k => {
      const dx = c.x - k.x, dy = c.y - k.y, f = Math.exp(-(dx * dx + dy * dy) / (R * R));
      if (f < .01) { if (k.on) { k.g.removeAttribute('transform'); k.g.removeAttribute('opacity'); k.on = false; } return; }
      const sc = 1 - .05 * f * (.3 + .7 * p);
      k.g.setAttribute('transform', `translate(${(dx * pull * f).toFixed(1)} ${(dy * pull * f).toFixed(1)}) translate(${k.x} ${k.y}) scale(${sc.toFixed(3)}) translate(${-k.x} ${-k.y})`);
      k.g.setAttribute('opacity', (1 - .45 * f * p).toFixed(3));
      k.on = true;
    });
  }

  // ---- click: break apart and reassemble ----
  let shatter = null;
  function buildTiles() {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data; tiles = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 4; if (d[k] * .3 + d[k + 1] * .59 + d[k + 2] * .11 < 16) continue;   // empty black studio backdrop
      tiles.push({ i, j });
    }
  }
  hero.addEventListener('click', e => {
    if (!ready || shatter || reduce || stopped()) return;
    const r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - cur.x, y - cur.y) > cur.s * .42) return;
    tiles.forEach(t => {
      const a = Math.atan2(t.j - N / 2 + .5, t.i - N / 2 + .5) + rnd(-.6, .6), sp = rnd(.35, 1);
      t.dx = Math.cos(a) * sp; t.dy = Math.sin(a) * sp - rnd(0, .25); t.r = rnd(-2.6, 2.6); t.z = rnd(.6, 1.25);
    });
    shatter = { t0: performance.now() }; kick();
  });

  // ---- draw ----
  function frame(now) {
    raf = 0; if (!ready) return;
    const g = geo(), t = now / 1000;
    const target = inside && !stopped() ? clamp(1 - (Math.hypot(mx - g.cx, my - g.cy) - g.S * .3) / (g.S * 1.3)) : 0;
    prox += (target - prox) * .05;
    const nx = inside ? mx / W - .5 : 0, ny = inside ? my / H - .5 : 0;
    px += (nx - px) * .05; py += (ny - py) * .05;
    const e = easeIO(clamp(prox)), still = reduce || stopped();
    const bob = still ? 0 : Math.sin(t * 1.05) * H * .006;
    const x = g.cx - px * W * .022, y = g.cy - py * H * .025 + bob - e * H * .045 + (1 - e) * H * .012;
    const s = g.S * (.96 + .1 * e), rot = still ? 0 : Math.sin(t * .4) * .045 + px * .14, turn = 1 - Math.min(.16, Math.abs(px) * .3);
    cur = { x, y, s };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    // soft violet light the sculpture throws around itself
    const gl = ctx.createRadialGradient(x, y, 0, x, y, s * .8);
    gl.addColorStop(0, `rgba(160,80,255,${(.16 + .24 * e).toFixed(3)})`); gl.addColorStop(.6, `rgba(120,60,240,${(.05 + .08 * e).toFixed(3)})`); gl.addColorStop(1, 'rgba(120,60,240,0)');
    ctx.fillStyle = gl; ctx.fillRect(x - s, y - s, s * 2, s * 2);

    let a = 0;
    if (shatter) {
      const k = (now - shatter.t0) / 1700;
      a = k < .38 ? easeOut(k / .38) : 1 - easeIO(clamp((k - .38) / .62));
      if (k >= 1) shatter = null;
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(turn, 1);
    ctx.globalAlpha = .8 + .2 * e;
    if (!a) ctx.drawImage(img, -s / 2, -s / 2, s, s);
    else {
      const ts = s / N, src = img.naturalWidth / N;
      tiles.forEach(tl => {
        const ox = -s / 2 + tl.i * ts + ts / 2 + tl.dx * s * .55 * a, oy = -s / 2 + tl.j * ts + ts / 2 + tl.dy * s * .55 * a;
        const z = 1 + (tl.z - 1) * a;
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(tl.r * a); ctx.scale(z, z);
        ctx.globalAlpha = .85;
        ctx.drawImage(img, tl.i * src, tl.j * src, src, src, -ts / 2, -ts / 2, ts, ts);
        ctx.globalAlpha = .9 * a; ctx.strokeStyle = '#C79BFF'; ctx.lineWidth = 1; ctx.strokeRect(-ts / 2 + .5, -ts / 2 + .5, ts - 1, ts - 1);
        ctx.restore();
      });
    }
    ctx.restore();

    // contact shadow on the "surface" below it: tighter and darker at rest, softer as it rises
    const sw = s * (.62 - .12 * e);
    shadow.style.width = sw + 'px'; shadow.style.height = sw * .2 + 'px';
    shadow.style.transform = `translate(${(x - sw / 2).toFixed(1)}px, ${(g.cy + s * .47).toFixed(1)}px)`;
    shadow.style.opacity = (.6 - .3 * e - .4 * a).toFixed(3);

    if (!still) magnet(x, y, s, e);
    if (running()) raf = requestAnimationFrame(frame);
  }
  let raf = 0, inView = true;
  const running = () => !reduce && inView && !document.hidden;
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  new IntersectionObserver(en => { inView = en[0].isIntersecting; if (inView) kick(); }).observe(hero);
  document.addEventListener('visibilitychange', kick);
  addEventListener('pointermove', kick, { passive: true });
  addEventListener('resize', () => { size(); cells = []; kick(); });

  img.onload = () => { size(); buildTiles(); ready = true; kick(); };
})();
