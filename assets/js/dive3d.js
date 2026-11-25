/* HILA IVGY — "into the screen": hero → concave project gallery (three.js)

   SURFACE  The hero's own leaf grid, read from the hero SVG (cell size + origin on screen), is rebuilt as one WebGL
            mesh in the same place: the camera starts at the distance where 1 world unit = 1 CSS px, so at the first
            pixel of scroll the 3D grid sits exactly on top of the SVG grid (which then fades out under it).
            The mesh is bent in the vertex shader into a concave cylinder (axis vertical, sides curving towards the
            viewer) plus a little vertical concavity – a giant curved display, not walls of a room.
   PROJECTS Each project lives in a real grid cell of the row at the centre of the screen (one cell apart, the next
            one to the left – RTL). It starts as a small leaf in the middle of the cell and grows until it fills
            the cell, clipped to the leaf shape (rounded top-right / bottom-left), image cover-cropped, never stretched.
            The project in the centre lifts off the surface towards the camera, grows and lights up; the others stay
            in their cells, smaller and angled by the curve.
   CAMERA   scroll (in screen heights):  DIVE 0→1.7   camera pushes in, the grid bends, the purple turns to black,
                                                      the headline flies past (it is pinned to the original plane)
                                         FILL +1.0    projects grow into their cells
                                         BROWSE +0.75 per project – the surface slides one cell, next project to the centre
                                         HOLD +0.6
            Everything is a pure function of the scroll position (eased towards it), so scrolling back plays it
            backwards. Arrows / drag / keys move the page scroll, so they stay in sync with it.            */
import * as THREE from 'three';

const dive = document.getElementById('dive'), hero = document.getElementById('hero');
const stage = document.getElementById('diveStage'), canvas = document.getElementById('diveCanvas');
const typeLayer = document.getElementById('diveType'), light = stage.querySelector('.dive-light');
const cap = stage.querySelector('.dive-cap'), capNum = cap.querySelector('.n'), capName = cap.querySelector('.t'), capShort = cap.querySelector('.s');
const btnPrev = stage.querySelector('.dive-prev'), btnNext = stage.querySelector('.dive-next'), btnOpen = cap.querySelector('.o');
const PROJ = (window.PROJECTS || []).filter(p => p.hero);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reduce || !PROJ.length || !hero) dive.classList.add('dive-off');
else start();

function start() {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const io3 = t => (t = clamp(t)) < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const io2 = t => (t = clamp(t)) < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const out3 = t => 1 - Math.pow(1 - clamp(t), 3);
  const smooth = t => (t = clamp(t)) * t * (3 - 2 * t);
  const N = PROJ.length, FOV = 35;
  const PH = { dive: 1.7, fill: 1.0, step: .75, hold: .6 };
  const TOTAL = PH.dive + PH.fill + PH.step * (N - 1) + PH.hold;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;          // no colour management: sRGB values pass straight through
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 40000);

  // ---------- shared surface uniforms + GLSL ----------
  const U = {
    uPan: { value: 0 }, uK: { value: 0 }, uR: { value: 1000 }, uCw: { value: 200 }, uCh: { value: 180 },
    uOy: { value: 0 }, uVh: { value: 900 }, uEx: { value: 0 }, uRowY: { value: 0 }
  };
  const SURF = /* glsl */`
    uniform float uPan, uK, uR, uCw, uCh, uOy, uVh, uEx, uRowY;
    // grid coords (g = columns from the centre seam, h = rows from the hero grid's top) -> point on the bent display
    vec3 surf(vec2 gh, float lift, out float th) {
      float xs = (gh.x - uPan) * uCw + uEx;
      float ys = uVh * 0.5 - (uOy + gh.y * uCh);
      float Rk = uR / max(uK, 1e-5);
      th = xs / Rk;
      float s2 = sin(th * 0.5);
      vec3 p = vec3(Rk * sin(th), ys, 2.0 * Rk * s2 * s2);
      float dy = ys - uRowY;
      p.z += dy * dy / (uR * 4.4) * uK;                                    // a touch of vertical concavity
      p += vec3(-sin(th), 0.0, cos(th)) * lift;                            // lift along the surface normal
      return p;
    }`;

  // ---------- the leaf cell as a texture (white = line), coloured in the shader like the hero's gradients ----------
  function cellTexture(cw, ch, rad) {
    const W = 512, H = Math.round(512 * ch / cw), s = W / cw, r = rad * s;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const leaf = () => { x.beginPath(); x.moveTo(1, 1); x.lineTo(W - r, 1); x.arc(W - r, r, r - 1, -Math.PI / 2, 0); x.lineTo(W - 1, H - 1);
      x.lineTo(r, H - 1); x.arc(r, H - r, r - 1, Math.PI / 2, Math.PI); x.closePath(); };
    x.strokeStyle = '#fff';
    x.shadowColor = 'rgba(255,255,255,.5)'; x.shadowBlur = 7;                   // soft glow
    x.globalAlpha = .5; x.lineWidth = 2.2 * W / 322 * .6; x.strokeRect(0, 0, W, H);   // hero stroke widths, a bit finer: they get magnified
    x.globalAlpha = 1; x.lineWidth = 2.6 * W / 322 * .6; leaf(); x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  // ---------- grid mesh ----------
  const gridU = { uMap: { value: null }, uPanI: { value: 0 }, uAlpha: { value: 0 }, uGlow: { value: 0 }, uVw: { value: 1600 },
    uC1: { value: new THREE.Color('#4A44EA') }, uC2: { value: new THREE.Color('#9254F2') } };
  const gridMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(gridU, U), side: THREE.DoubleSide, transparent: true, depthWrite: false, premultipliedAlpha: true,
    vertexShader: SURF + /* glsl */`
      uniform float uPanI; varying vec2 vUv; varying float vFade; varying float vX;
      void main() {
        float th; vec2 gh = vec2(position.x + uPanI, position.y);
        vec3 p = surf(gh, 0.0, th);
        vUv = vec2(gh.x, -gh.y); vX = p.x;
        vFade = 1.0 - smoothstep(1.05, 1.6, abs(th));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uAlpha, uGlow, uVw; uniform vec3 uC1, uC2;
      varying vec2 vUv; varying float vFade; varying float vX;
      void main() {
        float a = texture2D(uMap, vUv).a * uAlpha * vFade;
        vec3 col = mix(uC1, uC2, clamp(vX / uVw + 0.5, 0.0, 1.0)) * (1.0 + uGlow * 0.35) + vec3(0.05, 0.0, 0.1) * uGlow;
        gl_FragColor = vec4(col * a, a);
      }`
  });
  let gridMesh = null;

  // ---------- projects ----------
  const loader = new THREE.TextureLoader();
  const projU = PROJ.map(() => ({
    uMap: { value: null }, uCell: { value: new THREE.Vector2() }, uScale: { value: 0 }, uLift: { value: 0 }, uAlpha: { value: 0 },
    uImgA: { value: 1.5 }, uCellA: { value: 1.1 }, uPx: { value: new THREE.Vector2(200, 180) }, uRad: { value: 85 },
    uDim: { value: 1 }, uEdge: { value: 0 }
  }));
  const projMeshes = PROJ.map((p, i) => {
    const u = projU[i];
    const tex = loader.load(p.hero, t => { u.uImgA.value = t.image.width / t.image.height; dirty = true; });
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.minFilter = THREE.LinearMipmapLinearFilter;
    u.uMap.value = tex;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 6), new THREE.ShaderMaterial({
      uniforms: Object.assign(u, U), side: THREE.DoubleSide, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: SURF + /* glsl */`
        uniform vec2 uCell; uniform float uScale, uLift; varying vec2 vUv; varying float vFade;
        void main() {
          float th; vec2 gh = uCell + vec2(position.x, -position.y) * uScale;
          vec3 p = surf(gh, uLift, th);
          vUv = uv; vFade = 1.0 - smoothstep(1.1, 1.55, abs(th));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform float uAlpha, uImgA, uCellA, uRad, uDim, uEdge; uniform vec2 uPx;
        varying vec2 vUv; varying float vFade;
        float leaf(vec2 uv) {                       // signed distance to the leaf: rounded top-right + bottom-left
          vec2 p = (uv - 0.5) * uPx, h = uPx * 0.5;
          float r = (p.x * p.y > 0.0) ? uRad : 0.0;
          vec2 q = abs(p) - h + r;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }
        void main() {
          vec2 c = vUv;
          if (uImgA > uCellA) c.x = 0.5 + (vUv.x - 0.5) * uCellA / uImgA;           // wide image: crop the sides
          else c.y = 1.0 - (1.0 - vUv.y) * uImgA / uCellA;                         // tall image: keep the top
          vec3 col = texture2D(uMap, c).rgb * uDim;
          float d = leaf(vUv), aa = fwidth(d) * 1.2;
          float m = 1.0 - smoothstep(-aa, aa, d);
          float rim = smoothstep(-5.0, -0.5, d) * m;                               // thin violet light along the edge
          col = mix(col, vec3(0.78, 0.6, 1.0), rim * uEdge * 0.75);
          float a = m * uAlpha * vFade;
          gl_FragColor = vec4(col * a, a);
        }`
    }));
    m.renderOrder = 2; m.frustumCulled = false; scene.add(m);
    return m;
  });

  // ---------- layout: read the hero grid off the SVG ----------
  let G = null;
  function measure() {
    const vw = document.documentElement.clientWidth, vh = innerHeight, phone = vw < 700;
    renderer.setPixelRatio(Math.min(phone ? 2 : 1.75, devicePixelRatio || 1));
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh; camera.updateProjectionMatrix();
    const svg = hero.querySelector('svg'), rect = svg.querySelector('.hero-grid rect');
    const m = svg.getScreenCTM(), hr = hero.getBoundingClientRect();
    const cwU = +rect.getAttribute('width'), chU = +rect.getAttribute('height');
    const cw = cwU * m.a, ch = chU * m.d;
    const ox = m.e - hr.left, oy = m.f - hr.top;                       // lattice origin on screen (hero is pinned at 0,0)
    const c0 = Math.round((vw / 2 - ox) / cw);                         // the column seam closest to the centre
    const ex = ox + c0 * cw - vw / 2;
    const rg = Math.floor((vh * .5 - oy) / ch);                        // the row in the middle of the screen
    const D = (vh / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const cellFrac = phone ? .68 : .29;                               // centre cell = this share of the screen width
    const Dend = D * cw / (cellFrac * vw);
    G = { vw, vh, phone, cw, ch, ox, oy, c0, ex, rg, D, Dend, R: Dend * (phone ? 1.35 : 1.5),
      rowY: vh / 2 - (oy + (rg + .5) * ch), rad: 137 * cw / 322 };
    U.uCw.value = cw; U.uCh.value = ch; U.uOy.value = oy - 0; U.uVh.value = vh; U.uR.value = G.R;
    U.uRowY.value = G.rowY; gridU.uVw.value = vw;
    // h measured from the lattice origin row 0; the mesh spans enough columns/rows to cover every camera position
    const C = phone ? 7 : 11, r0 = -3, r1 = Math.ceil((vh - oy) / ch) + 3;
    if (gridMesh) { gridMesh.geometry.dispose(); scene.remove(gridMesh); }
    const geo = new THREE.PlaneGeometry(2 * C, r1 - r0, 2 * C * 8, (r1 - r0) * 4);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setXY(i, pos.getX(i), -(pos.getY(i)) + (r0 + r1) / 2);   // x: −C..C, y: rows top→bottom
    gridMesh = new THREE.Mesh(geo, gridMat); gridMesh.frustumCulled = false; gridMesh.renderOrder = 1; scene.add(gridMesh);
    if (gridU.uMap.value) gridU.uMap.value.dispose();
    gridU.uMap.value = cellTexture(cw, ch, G.rad);
    projU.forEach((u, i) => {
      u.uCell.value.set(.5 - i, rg + .5);                              // project i: i cells to the left of the centre cell
      u.uPx.value.set(cw, ch); u.uRad.value = G.rad; u.uCellA.value = cw / ch;
    });
    cloneType(); dirty = true;
  }

  // the headline is cloned above the canvas, so the grid never draws over the letters while the camera flies in
  function cloneType() {
    const svg = hero.querySelector('svg').cloneNode(true);
    svg.querySelectorAll('.hero-grid').forEach(g => g.remove());
    svg.removeAttribute('style');
    const r = hero.getBoundingClientRect();
    svg.setAttribute('width', r.width); svg.setAttribute('height', r.height);
    typeLayer.textContent = ''; typeLayer.appendChild(svg);
    typeLayer.style.width = r.width + 'px'; typeLayer.style.height = r.height + 'px';
  }

  // ---------- scroll → state ----------
  const heroType = () => hero.querySelector('svg .hero-type'), heroGrid = () => hero.querySelector('svg .hero-grid');
  let E = null, dirty = true, focusIdx = -1;
  const scrollFor = idx => dive.offsetTop + (PH.dive + PH.fill + PH.step * idx) * G.vh;
  function progress() { return clamp(-dive.getBoundingClientRect().top / G.vh, 0, TOTAL); }

  function render() {
    const S = progress();
    E = E === null ? S : E + (S - E) * .12; if (Math.abs(S - E) < 4e-4) E = S;
    const q = E, vw = G.vw, vh = G.vh;

    // DIVE
    const dv = io3(q / PH.dive);
    U.uK.value = io2((q - .12) / (PH.dive - .12));
    const camZ = lerp(G.D, G.Dend, dv), camY = lerp(0, G.rowY, dv);
    camera.position.set(0, camY, camZ); camera.lookAt(0, camY, 0);
    // FILL + BROWSE
    const fq = q - PH.dive, bq = clamp((fq - PH.fill) / PH.step, 0, N - 1);
    const seg = Math.min(Math.floor(bq), N - 2), fr = bq - Math.max(seg, 0);
    const browse = N > 1 ? Math.max(seg, 0) + io3((fr - .12) / .76) : 0;
    const pan = .5 * dv - browse;                                     // .5: centre a cell (the hero centre is a seam)
    U.uPan.value = pan; gridU.uPanI.value = Math.floor(pan);
    U.uEx.value = G.ex * (1 - dv);

    // the hero: same move as the camera, as if it were printed on the plane z = 0
    const Sc = G.D / camZ, tx = vw / 2 * (1 - Sc), ty = vh / 2 * (1 - Sc) + camY * Sc;
    const live = q > .0005;
    if (live) {
      const tf = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${Sc.toFixed(5)})`;
      hero.style.transformOrigin = '0 0'; hero.style.transform = tf;
      const St = Sc * (1 + 2.2 * dv * dv), ttx = vw / 2 * (1 - St), tty = vh / 2 * (1 - St) + camY * St;   // the words fly past a little faster
      typeLayer.style.transform = `translate(${ttx.toFixed(2)}px,${tty.toFixed(2)}px) scale(${St.toFixed(5)})`;
      typeLayer.style.opacity = (1 - smooth((dv - .2) / .45)).toFixed(3);
      typeLayer.style.filter = dv > .2 ? `blur(${(smooth((dv - .2) / .5) * 10).toFixed(1)}px)` : '';
      typeLayer.style.visibility = 'visible';
      const ht = heroType(); if (ht) ht.style.visibility = 'hidden';
      const hg = heroGrid(); if (hg) hg.style.opacity = (1 - clamp(q / .1)).toFixed(3);
    } else {
      hero.style.transform = ''; typeLayer.style.visibility = 'hidden';
      const ht = heroType(); if (ht) ht.style.visibility = '';
      const hg = heroGrid(); if (hg) hg.style.opacity = '';
    }
    stage.style.visibility = live ? 'visible' : 'hidden';
    const bg = smooth((q - .25) / 1.1);
    renderer.setClearColor(0x111113, bg);
    hero.style.visibility = bg > .999 ? 'hidden' : '';                  // fully covered: keep its lower part (16:9 hero on wide screens) from peeking out
    light.style.opacity = bg.toFixed(3);
    gridU.uAlpha.value = live ? clamp(q / .1) : 0;
    gridU.uGlow.value = bg;

    // projects
    let best = 0, bestF = -1;
    projU.forEach((u, i) => {
      const enter = out3((fq - .08 - Math.min(i, 3) * .1) / .62);
      const off = (.5 - i) - pan;                                     // cells from the centre
      const f = 1 - smooth(Math.abs(off));                            // focus
      const g = f * enter;
      u.uScale.value = lerp(.14, 1, enter) * (1 + (G.phone ? .1 : .2) * g);
      u.uLift.value = g * G.cw * (G.phone ? .35 : .55);
      u.uAlpha.value = smooth(enter / .35);
      u.uDim.value = lerp(.55, 1, g) ;
      u.uEdge.value = g;
      projMeshes[i].renderOrder = 2 + Math.round(f * 10);
      if (f > bestF) { bestF = f; best = i; }
    });

    // caption + controls
    const ui = smooth((fq - PH.fill * .55) / .4) * (1 - smooth((q - TOTAL + .15) / .15));
    cap.style.opacity = ui.toFixed(3);
    const on = ui > .5; stage.classList.toggle('on', on);
    if (best !== focusIdx) {
      focusIdx = best; const p = PROJ[best];
      capNum.textContent = String(best + 1).padStart(2, '0') + ' / ' + String(N).padStart(2, '0');
      capName.textContent = p.name; capShort.textContent = p.short || '';
      btnOpen.href = 'project.html?id=' + p.id;
    }
    btnPrev.disabled = focusIdx <= 0; btnNext.disabled = focusIdx >= N - 1;
    btnPrev.style.opacity = (ui * (btnPrev.disabled ? .25 : 1)).toFixed(3); btnNext.style.opacity = (ui * (btnNext.disabled ? .25 : 1)).toFixed(3);

    renderer.render(scene, camera);
    return E !== S;
  }

  let queued = false;
  const tick = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; if (render() || dirty) { dirty = false; tick(); } }); };

  // ---------- paging: arrows, keys, drag/swipe, click ----------
  const go = idx => { idx = clamp(idx, 0, N - 1); scrollTo({ top: scrollFor(idx), behavior: 'smooth' }); };
  btnNext.addEventListener('click', () => go(focusIdx + 1));          // RTL: the next project comes from the left
  btnPrev.addEventListener('click', () => go(focusIdx - 1));
  addEventListener('keydown', e => {
    if (!stage.classList.contains('on') || e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(focusIdx + 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(focusIdx - 1); }
  });
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (!stage.classList.contains('on')) return; drag = { x: e.clientX, y: e.clientY, s: scrollY, moved: false }; });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 8) return;
    drag.moved = true;
    const perCell = G.cw * G.D / G.Dend;                              // one centre cell on screen
    scrollTo(0, drag.s + dx / perCell * PH.step * G.vh);              // drag right → previous, left → next (RTL)
  }, { passive: true });
  addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved) { go(Math.round(clamp((progress() - PH.dive - PH.fill) / PH.step, 0, N - 1))); return; }
    // a tap: on the centre project → open it; on a side one → bring it to the centre
    const vw = G.vw, x = d.x - vw / 2, cellPx = G.cw * G.D / G.Dend;
    if (Math.abs(x) < cellPx * .62) location.href = btnOpen.href;
    else go(focusIdx + (x < 0 ? 1 : -1));
  });

  // ---------- size the scroll track ----------
  function track() {
    const vh = innerHeight, hh = hero.getBoundingClientRect().height;
    dive.style.setProperty('--hero-h', hh + 'px');
    dive.style.setProperty('--track', (TOTAL * vh) + 'px');
  }
  track(); measure(); render();
  addEventListener('scroll', tick, { passive: true });
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { hero.style.transform = ''; track(); measure(); E = null; tick(); }, 150); });
  document.fonts && document.fonts.ready.then(() => { cloneType(); tick(); });
}
