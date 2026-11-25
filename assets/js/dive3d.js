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
  const PH = { dive: 1.7, fill: 1.0, step: .75, away: 1.4, scatter: 2.0, hold: .6 };
  const TOTAL = PH.dive + PH.fill + PH.step * (N - 1) + PH.away + PH.scatter + PH.hold;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;          // no colour management: sRGB values pass straight through
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 40000);

  // ---------- shared surface uniforms + GLSL ----------
  const U = {
    uPan: { value: 0 }, uK: { value: 0 }, uR: { value: 1000 }, uCw: { value: 200 }, uCh: { value: 180 },
    uOy: { value: 0 }, uVh: { value: 900 }, uEx: { value: 0 }, uRowY: { value: 0 },
    uF0: { value: 1.05 }, uF1: { value: 1.6 }, uAway: { value: 0 }, uRowB: { value: 0 }, uSX: { value: 0 }, uSY: { value: 0 },
    uScat: { value: 0 }, uSpan: { value: new THREE.Vector2(1600, 900) }
  };
  const SURF = /* glsl */`
    uniform float uPan, uK, uR, uCw, uCh, uOy, uVh, uEx, uRowY, uF0, uF1, uAway, uRowB, uSX, uSY, uScat;
    uniform vec2 uSpan;
    attribute vec2 aCell;                                                  // the cell a vertex belongs to (cells are separate quads)
    float h1(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    float band(float y) { return 1.0; }
    // the overview's slides: every other row moves sideways (uSX cells, alternating directions), then every other
    // column moves up / down (uSY). The cells keep their place on the curved display; their contents travel.
    vec2 shifted(vec2 g) {
      float r = floor(g.y);
      g.x -= (mod(r - uRowB, 2.0) < 0.5 ? 1.0 : -1.0) * uSX;
      float c = floor(g.x);
      g.y -= (mod(c, 2.0) < 0.5 ? -1.0 : 1.0) * uSY;
      return g;
    }
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
    }
    // SCATTER (after the overview): most cells sink away into the black; about one in five drifts off to its own
    // spot in the dark space – spread over the whole screen at different depths, flat to the camera, a little
    // smaller – and floats there (the reference: sites hanging in a dark room at different distances).
    vec3 scatter(vec2 cell, vec3 p, out float alive) {
      alive = 1.0;
      if (uScat <= 0.0) return p;
      float th; vec3 c = surf(cell + 0.5, 0.0, th);
      float r1 = h1(cell), r2 = h1(cell + 7.31), r3 = h1(cell + 13.17), r4 = h1(cell + 21.9);
      bool front = abs(th) < 1.1;                                          // only cells facing the camera (no mirrored backs)
      bool keep = front && r1 < 0.14;                                      // ≈ 15–20 cards stay
      float t = clamp((uScat - r4 * 0.3) / 0.7, 0.0, 1.0); t = t * t * (3.0 - 2.0 * t);
      vec3 l = p - c;
      l.z = 0.0;                                                           // un-bend: the card faces the camera
      float a = (r2 - 0.5) * 0.35 * t;
      l.xy = mat2(cos(a), sin(a), -sin(a), cos(a)) * l.xy;
      vec3 to;
      if (keep) {
        // spread over the whole frame (some cut by the edges), at different depths, and bigger than a cell
        to = vec3((r2 * 2.0 - 1.0) * uSpan.x * 1.3, uRowY + (r3 * 2.0 - 1.0) * uSpan.y * 1.2, (0.4 - r4) * uCw * 9.0);
        l *= 1.0 + 0.3 * t;
      } else {
        to = vec3(c.x * 0.6, uRowY + (c.y - uRowY) * 0.6, -uCw * (30.0 + 40.0 * r3));
        alive = 1.0 - smoothstep(front ? 0.15 : 0.0, front ? 0.7 : 0.2, t);   // the far sides go at once
      }
      return mix(c, to, t) + mix(p - c, l, t);
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
      uniform float uPanI; varying vec2 vG; varying float vFade; varying float vX;
      void main() {
        float th, alive; vec2 gh = vec2(position.x + uPanI, position.y);
        vec3 p = scatter(aCell + vec2(uPanI, 0.0), surf(gh, 0.0, th), alive);
        vG = gh; vX = p.x;
        vFade = (1.0 - smoothstep(uF0, uF1, abs(th))) * alive * (1.0 - smoothstep(0.0, 0.35, uScat));   // the frames go first
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uAlpha, uGlow, uVw, uSX, uSY, uRowB; uniform vec3 uC1, uC2;
      varying vec2 vG; varying float vFade; varying float vX;
      vec2 shifted(vec2 g) {
        float r = floor(g.y);
        g.x -= (mod(r - uRowB, 2.0) < 0.5 ? 1.0 : -1.0) * uSX;
        float c = floor(g.x);
        g.y -= (mod(c, 2.0) < 0.5 ? -1.0 : 1.0) * uSY;
        return g;
      }
      void main() {
        float a = texture2D(uMap, vec2(vG.x, -vG.y)).a * uAlpha * vFade;
        vec3 col = mix(uC1, uC2, clamp(vX / uVw + 0.5, 0.0, 1.0)) * (1.0 + uGlow * 0.35) + vec3(0.05, 0.0, 0.1) * uGlow;
        gl_FragColor = vec4(col * a, a);
      }`
  });
  let gridMesh = null;

  // ---------- every other cell of the display filled with a site (one atlas of the project heroes) ----------
  // cell (x, y) shows project (3x + y) mod N: no two neighbours (incl. diagonals) repeat. The cells of the gallery
  // row that hold the real project meshes are skipped. Cells grow in from their centres, outward from the middle.
  const fillU = { uAtlas: { value: null }, uPanI: gridU.uPanI, uN: { value: PROJ.length }, uFill: { value: 0 }, uRow: { value: 0 },
    uCellA: { value: 1.1 }, uImgA: { value: 1.5 }, uRad: { value: 85 }, uPx: { value: new THREE.Vector2(200, 180) }, uFA: { value: 0 }, uAll: { value: 0 } };
  const fillMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(fillU, U), side: THREE.DoubleSide, transparent: true, depthWrite: false, premultipliedAlpha: true,
    vertexShader: SURF + /* glsl */`
      uniform float uPanI; varying vec2 vG; varying vec2 vCell; varying float vFade;
      void main() {
        float th, alive; vec2 gh = vec2(position.x + uPanI, position.y), cell = aCell + vec2(uPanI, 0.0);
        vec3 p = scatter(cell, surf(gh, 0.0, th), alive);
        vG = gh; vCell = cell;
        vFade = mix(1.0 - smoothstep(uF0, uF1, abs(th)), 1.0, smoothstep(0.0, 0.5, uScat)) * alive;   // floating cards ignore the edge fade
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uAtlas; uniform float uN, uFill, uRow, uCellA, uImgA, uRad, uFA, uPan, uAway, uAll, uSX, uSY, uRowB; uniform vec2 uPx;
      vec2 shifted(vec2 g) {
        float r = floor(g.y);
        g.x -= (mod(r - uRowB, 2.0) < 0.5 ? 1.0 : -1.0) * uSX;
        float c = floor(g.x);
        g.y -= (mod(c, 2.0) < 0.5 ? -1.0 : 1.0) * uSY;
        return g;
      }
      uniform float uScat;
      varying vec2 vG; varying vec2 vCell; varying float vFade;
      float leaf(vec2 uv) {                     // the leaf softens into a plain card while they scatter
        vec2 p = (uv - 0.5) * uPx, h = uPx * 0.5;
        float r = (p.x * p.y > 0.0) ? mix(uRad, 6.0, smoothstep(0.0, 0.6, uScat)) : mix(0.0, 6.0, smoothstep(0.0, 0.6, uScat));
        vec2 q = abs(p) - h + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }
      void main() {
        vec2 cell = vCell, f = clamp(vG - vCell, 0.0, 1.0);
        bool gal = abs(cell.y - uRow) < 0.5 && cell.x < 0.5 && cell.x > -uN + 0.5;            // the gallery row's project cells
        if (gal && uAll < 0.5) discard;                                                       // real project meshes live there
        float dist = length(vec2(cell.x + 0.5 - uPan, cell.y - uRow));
        float e = clamp((uFill - 0.12 - dist * 0.09) / 0.6, 0.0, 1.0); e = 1.0 - pow(1.0 - e, 3.0);
        if (e <= 0.0) discard;
        float s = mix(0.14, 1.0, e);
        vec2 q = (f - 0.5) / s + 0.5;
        if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
        vec2 uv = vec2(q.x, 1.0 - q.y);
        float d = leaf(uv), aa = fwidth(d) * 1.2, m = 1.0 - smoothstep(-aa, aa, d);
        vec2 c = uv;
        if (uImgA > uCellA) c.x = 0.5 + (uv.x - 0.5) * uCellA / uImgA; else c.y = 1.0 - (1.0 - uv.y) * uImgA / uCellA;
        c = clamp(c, 0.006, 0.994);
        float idx = gal ? -cell.x : mod(floor(mod(cell.x * 3.0 + cell.y, uN) + 0.5), uN);   // 3x + y: no neighbour (incl. diagonals) repeats for N = 7 or 8; rounded: float mod can land on N − ε
        float row = floor(idx / 4.0 + 0.001), col = idx - row * 4.0;
        vec3 rgb = texture2D(uAtlas, vec2((col + c.x) / 4.0, 1.0 - (row + 1.0) * 0.5 + c.y * 0.5)).rgb;
        rgb *= mix(mix(0.78, 0.42, smoothstep(0.5, 3.5, dist)), 0.86, uAway);            // the middle reads first; all even in the overview
        float a = m * smoothstep(0.0, 0.35, e) * uFA * vFade;
        gl_FragColor = vec4(rgb * a, a);
      }`
  });
  let fillMesh = null;
  function buildAtlas() {
    const imgs = projU.map(u => u.uMap.value && u.uMap.value.image);
    if (imgs.some(i => !i || !i.width)) return;
    const cw = 1024, ch = Math.round(cw / (imgs[0].width / imgs[0].height));
    const c = document.createElement('canvas'); c.width = cw * 4; c.height = ch * 2; const x = c.getContext('2d');
    imgs.forEach((im, i) => x.drawImage(im, (i % 4) * cw, Math.floor(i / 4) * ch, cw, ch));
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.minFilter = THREE.LinearMipmapLinearFilter;
    fillU.uAtlas.value = t; fillU.uImgA.value = imgs[0].width / imgs[0].height; dirty = true; tick();
  }

  // ---------- projects ----------
  const loader = new THREE.TextureLoader();
  const projU = PROJ.map(() => ({
    uMap: { value: null }, uCell: { value: new THREE.Vector2() }, uScale: { value: 0 }, uLift: { value: 0 }, uAlpha: { value: 0 },
    uImgA: { value: 1.5 }, uCellA: { value: 1.1 }, uPx: { value: new THREE.Vector2(200, 180) }, uRad: { value: 85 },
    uDim: { value: 1 }, uEdge: { value: 0 }
  }));
  const projMeshes = PROJ.map((p, i) => {
    const u = projU[i];
    const tex = loader.load(p.hero, t => { u.uImgA.value = t.image.width / t.image.height; dirty = true; buildAtlas(); });
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.minFilter = THREE.LinearMipmapLinearFilter;
    u.uMap.value = tex;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 6), new THREE.ShaderMaterial({
      uniforms: Object.assign(u, U), side: THREE.DoubleSide, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: SURF + /* glsl */`
        uniform vec2 uCell; uniform float uScale, uLift; varying vec2 vUv; varying float vFade;
        void main() {
          float th; vec2 gh = uCell + vec2(position.x, -position.y) * uScale;
          vec3 p = surf(gh, uLift, th);
          vUv = uv; vFade = 1.0 - smoothstep(uF0 + 0.05, uF1 - 0.05, abs(th));
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

  // one separate quad per cell (6 × 3 segments so it bends with the display), each tagged with its cell –
  // so every cell can leave the display on its own when they scatter
  function cellsGeometry(C, r0, r1, sx = 6, sy = 3) {
    const n = 2 * C * (r1 - r0), vp = (sx + 1) * (sy + 1);
    const pos = new Float32Array(n * vp * 3), cel = new Float32Array(n * vp * 2), idx = new Uint32Array(n * sx * sy * 6);
    let v = 0, k = 0;
    for (let cy = r0; cy < r1; cy++) for (let cx = -C; cx < C; cx++) {
      const base = v;
      for (let j = 0; j <= sy; j++) for (let i = 0; i <= sx; i++) {
        pos[v * 3] = cx + i / sx; pos[v * 3 + 1] = cy + j / sy; cel[v * 2] = cx; cel[v * 2 + 1] = cy; v++;
      }
      for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
        const a = base + j * (sx + 1) + i, d = a + sx + 1; idx.set([a, d, a + 1, a + 1, d, d + 1], k); k += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCell', new THREE.BufferAttribute(cel, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

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
    U.uRowY.value = G.rowY; U.uRowB.value = rg; gridU.uVw.value = vw;
    // h measured from the lattice origin row 0; the mesh spans enough columns/rows to cover every camera position
    const C = phone ? 9 : 15, r0 = -3, r1 = Math.ceil((vh - oy) / ch) + 3;
    if (gridMesh) { gridMesh.geometry.dispose(); scene.remove(gridMesh); }
    const geo = cellsGeometry(C, r0, r1);
    gridMesh = new THREE.Mesh(geo, gridMat); gridMesh.frustumCulled = false; gridMesh.renderOrder = 1; scene.add(gridMesh);
    if (fillMesh) scene.remove(fillMesh);
    fillMesh = new THREE.Mesh(geo, fillMat); fillMesh.frustumCulled = false; fillMesh.renderOrder = 0; scene.add(fillMesh);   // under the grid lines
    fillU.uRow.value = rg; fillU.uCellA.value = cw / ch; fillU.uRad.value = G.rad; fillU.uPx.value.set(cw, ch);
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
  const vhOf = () => G.vh;
  function progress() { return clamp(-dive.getBoundingClientRect().top / G.vh, 0, TOTAL); }

  function render() {
    const S = progress();
    E = E === null ? S : E + (S - E) * .12; if (Math.abs(S - E) < 4e-4) E = S;
    const q = E, vw = G.vw, vh = G.vh;

    // DIVE
    const dv = io3(q / PH.dive);
    const aw = io3((q - PH.dive - PH.fill - PH.step * (N - 1)) / PH.away);   // AWAY: pull back to the whole display
    U.uK.value = io2((q - .12) / (PH.dive - .12)) * (1 + .15 * aw);
    U.uF0.value = lerp(1.05, 1.35, aw); U.uF1.value = lerp(1.6, 1.8, aw); U.uAway.value = aw;
    // SCATTER: the sites leave the display and hang in the dark at different depths; then the next section arrives
    const sc = clamp((q - PH.dive - PH.fill - PH.step * (N - 1) - PH.away) / PH.scatter);
    U.uScat.value = sc;
    fillU.uAll.value = aw > .5 ? 1 : 0;
    const camZ = lerp(G.D, G.Dend, dv), camY = lerp(0, G.rowY, dv);
    const zFar = G.Dend * (G.phone ? 2.4 : 3);                         // stop here: the whole display, cells about a tenth of the width
    camera.position.set(0, lerp(camY, G.rowY + vhOf() * .06, aw), lerp(camZ, zFar, aw) - G.Dend * .35 * io2(sc));   // a slow drift into the space
    // the floating cards spread over what the camera sees at the display's depth
    const zs = zFar - G.Dend * .35; U.uSpan.value.set(vw / 2 * zs / G.D * .92, vhOf() / 2 * zs / G.D * .8);
    camera.lookAt(0, camY, 0);
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
    fillU.uFill.value = fq; fillU.uFA.value = fillU.uAtlas.value ? 1 : 0;

    // projects
    let best = 0, bestF = -1;
    projU.forEach((u, i) => {
      const enter = out3((fq - .08 - Math.min(i, 3) * .1) / .62);
      const off = (.5 - i) - pan;                                     // cells from the centre
      const f = 1 - smooth(Math.abs(off));                            // focus
      const g = f * enter;
      const back = 1 - smooth(aw / .45);                             // settled back into its cell before the hand-over
      u.uScale.value = lerp(.14, 1, enter) * (1 + (G.phone ? .1 : .2) * g * back);
      u.uLift.value = g * G.cw * (G.phone ? .35 : .55) * back;
      u.uAlpha.value = smooth(enter / .35) * (aw > .5 ? 0 : 1);       // past half-way the fill layer shows these cells (same image)
      u.uDim.value = lerp(lerp(.55, 1, g), .86, 1 - back);
      u.uEdge.value = g * back;
      projMeshes[i].renderOrder = 2 + Math.round(f * 10);
      if (f > bestF) { bestF = f; best = i; }
    });

    // caption + controls
    const ui = smooth((fq - PH.fill * .55) / .4) * (1 - smooth(aw / .25));
    cap.style.opacity = ui.toFixed(3); stage.querySelector('.dive-ui').style.opacity = ui.toFixed(3);
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
