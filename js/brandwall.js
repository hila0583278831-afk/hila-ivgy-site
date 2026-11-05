/* HILA IVGY — branding wall: a plane of wide tiles leaned back (rotateX/rotateZ), scroll slides the rows sideways, then the columns up/down */
(() => {
  const root = document.querySelector('[data-bw]');
  if (!root) return;
  const plane = root.querySelector('[data-bwplane]');
  const tiles = [...plane.children];
  const COLS = 7, ROWS = 9;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const ease = (x) => { x = clamp(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  let g = {}, vis = true, ticking = false;
  const hash = (n) => { const t = 43758.5453 * Math.sin(12.9898 * n + 78.233); return t - Math.floor(t); };

  const size = () => {
    const vw = root.clientWidth, vh = innerHeight;
    const portrait = vw / vh < .85;
    const w = portrait ? .62 * vw : Math.min(560, vw * .29), h = w * .625, gap = w * .09;
    g = { w, h, sx: w + gap, sy: h + gap, portrait, vw };
    root.style.setProperty('--u', (w / 560).toFixed(4));
    tiles.forEach((t) => { t.style.width = w.toFixed(1) + 'px'; t.style.height = h.toFixed(1) + 'px'; });
  };
  const draw = () => {
    ticking = false;
    const r = root.getBoundingClientRect();
    const span = r.height - innerHeight;
    const p = reduce ? .22 : clamp(-r.top / Math.max(1, span));
    const enter = .45 + .55 * ease(p / .2);                         // the wall leans back and grows in
    const bump = (x) => Math.sin(Math.PI * ease(x));      // out and back, so the grid is whole again at rest
    const side = bump((p - .16) / .34);                  // rows slide sideways
    const ud = bump((p - .56) / .34);                    // columns slide up / down
    const rx = 18 + 36 * enter, rz = -34 * enter, sc = (.82 + .38 * enter) * (g.portrait ? 1.1 : 1);
    plane.style.transform = `scale(${sc.toFixed(3)}) rotateX(${rx.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
    tiles.forEach((t, i) => {
      const c = (i % COLS) - (COLS - 1) / 2, rr = Math.floor(i / COLS) - (ROWS - 1) / 2;
      const dirR = (Math.round(rr + 4) % 2 ? 1 : -1), dirC = (Math.round(c + 3) % 2 ? 1 : -1);
      const x = c * g.sx + dirR * side * g.sx * 1.5;
      const y = rr * g.sy + dirC * ud * g.sy * 1.5;
      const d = Math.hypot(c, rr) / 6.5;
      const a = clamp((enter * 1.25) - d * .55 - hash(i) * .12);
      t.style.opacity = a.toFixed(3);
      t.style.transform = `translate3d(${(x - g.w / 2).toFixed(1)}px,${(y - g.h / 2).toFixed(1)}px,0)`;
    });
  };
  const req = () => { if (!ticking && vis) { ticking = true; requestAnimationFrame(draw); } };
  size(); draw();
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', () => { size(); req(); });
  new IntersectionObserver((e) => { vis = e[0].isIntersecting; if (vis) req(); }, { rootMargin: '200px' }).observe(root);
})();
