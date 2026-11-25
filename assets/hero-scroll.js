/* Scrolling away from the hero, like a camera move: the whole hero travels off to the right, turning a little in
   depth and shrinking slightly, the headline drifts a bit faster than the background (parallax), and the leaf
   cells of the grid scatter outward – each one flies, spins and fades on its own path. Scroll-linked, so it plays
   backwards when scrolling up. */
(() => {
  const hero = document.getElementById('hero'); if (!hero) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const svg = hero.querySelector('svg'), grid = svg.querySelector('.hero-grid'), type = svg.querySelector('.hero-type');
  const NS = 'http://www.w3.org/2000/svg';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;     // in-out cubic
  let cells = [], last = -1, raf = 0;

  // the grid is plain rect+path pairs (and is rebuilt by the layout script on resize) – wrap each pair in a <g>
  function prep() {
    const first = grid.firstElementChild;
    if (first && first.tagName.toLowerCase() === 'g' && cells.length) return;
    const kids = [...grid.children], vb = svg.viewBox.baseVal, cx = vb.width / 2, cy = vb.height / 2;
    cells = [];
    for (let i = 0; i < kids.length; i += 2) {
      const r = kids[i], g = document.createElementNS(NS, 'g');
      grid.insertBefore(g, r); g.appendChild(r); if (kids[i + 1]) g.appendChild(kids[i + 1]);
      const x = +r.getAttribute('x') + +r.getAttribute('width') / 2, y = +r.getAttribute('y') + +r.getAttribute('height') / 2;
      const a = Math.atan2(y - cy, x - cx) + rnd(-.6, .6), d = rnd(350, 1200);
      cells.push({ g, x, y, dx: Math.cos(a) * d + rnd(250, 800), dy: Math.sin(a) * d + rnd(-150, 150), rot: rnd(-80, 80), s: rnd(.4, 1.1), delay: rnd(0, .3) });
    }
    last = -1;
  }

  function update() {
    raf = 0; prep();
    const h = hero.offsetHeight || 1, p = clamp(-hero.getBoundingClientRect().top / (h * .85));
    if (Math.abs(p - last) < .0005) return; last = p;
    if (p === 0) {
      hero.style.transform = ''; type.style.transform = '';
      cells.forEach(c => { c.g.removeAttribute('transform'); c.g.removeAttribute('opacity'); });
      return;
    }
    const e = ease(p), vb = svg.viewBox.baseVal;
    hero.style.transform = `perspective(1500px) translateX(${(e * 55).toFixed(2)}%) rotateY(${(-e * 16).toFixed(2)}deg) scale(${(1 - e * .1).toFixed(4)})`;
    type.style.transform = `translate(${(e * vb.width * .18).toFixed(1)}px, 0)`;
    cells.forEach(c => {
      const q = ease(clamp((p - c.delay) / (1 - c.delay) * 1.15));
      if (q <= 0) { c.g.removeAttribute('transform'); c.g.removeAttribute('opacity'); return; }
      const sc = 1 + (c.s - 1) * q;
      c.g.setAttribute('transform', `translate(${(c.dx * q).toFixed(1)} ${(c.dy * q).toFixed(1)}) rotate(${(c.rot * q).toFixed(1)} ${c.x} ${c.y}) translate(${c.x} ${c.y}) scale(${sc.toFixed(3)}) translate(${-c.x} ${-c.y})`);
      c.g.setAttribute('opacity', (1 - q).toFixed(3));
    });
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { cells = []; last = -1; setTimeout(kick, 50); });
  document.fonts && document.fonts.ready.then(() => { cells = []; kick(); });
  kick();
})();
