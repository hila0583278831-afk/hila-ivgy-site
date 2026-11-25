/* Warp Carousel – based on "Warp Carousel" by Louis Studios (https://studios.lou15.com/),
   ported from React/TypeScript to plain JS for this static site. The ring geometry, spin curve,
   lens flare and glow are the original's; the cards are painted from the site's projects
   (hero image + Hebrew title) instead of the stat cards.
   Usage: WarpCarousel(element, { cards: [{ id, name, short, hero, accent }], onOpen(card) }) */
(() => {
  const CW = 256, CH = 320, CR = 10, FOCAL = 734.103;
  const G = { qA: 0.46401, XLA: 165.774, zA: 35.354, psiA: 1.44638, a1: 1.31454, a2: 1.10948, qB: 0.74999, XB: 204.525, ZB: 355.405,
    bB: 0.69311, bE: 0.04614, vC: 203.134, aC: 229.260, kB: 0.01087, bP: 0.99129, qPR: 1.01828, bPL: 1.00920, qPL: 1.07139 };

  /* pose of a card at ring offset q (0 front, +1 right, -1 left): centre x, depth behind the front plane, yaw */
  function poseAt(q0) {
    let q = q0;
    if (Math.abs(q) < 1) q -= G.kB * Math.sin(Math.PI * q) ** 2;
    const s = q < 0 ? -1 : 1, a = Math.abs(q), half = CW / 2;
    if (a <= G.qA) {
      const t = a / G.qA;
      const xl = -half + (G.XLA + half) * Math.pow(t, G.a1), zl = G.zA * t ** 4, psi = G.psiA * Math.pow(t, G.a2);
      return [s * (xl + half * Math.cos(psi)), zl + half * Math.sin(psi), s * psi];
    }
    const dXL = ((G.XLA + half) * G.a1) / G.qA, dZL = (G.zA * 4) / G.qA, dps = (G.psiA * G.a2) / G.qA;
    let Hx, Hz;
    if (a <= G.qB) {
      const L = G.qB - G.qA, t = (a - G.qA) / L;
      const hx = G.XLA + CW * Math.cos(G.psiA), hz = G.zA + CW * Math.sin(G.psiA);
      const dhx = dXL - CW * Math.sin(G.psiA) * dps, dhz = dZL + CW * Math.cos(G.psiA) * dps;
      const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
      Hx = h00 * hx + h10 * L * dhx * G.bB + h01 * G.XB + h11 * L * G.vC * G.bE;
      Hz = h00 * hz + h10 * L * dhz * G.bB + h01 * G.ZB;
    } else {
      const d = a - G.qB;
      Hx = G.XB + G.vC * d + G.aC * d * d; Hz = G.ZB;
    }
    const qP = s < 0 ? G.qPL : G.qPR, bP = s < 0 ? G.bPL : G.bP, LP = qP - G.qA, tp = Math.min(1, (a - G.qA) / LP);
    const psi = (2 * tp ** 3 - 3 * tp ** 2 + 1) * G.psiA + (tp ** 3 - 2 * tp ** 2 + tp) * LP * dps * bP + (-2 * tp ** 3 + 3 * tp ** 2) * Math.PI;
    return [s * (Hx - half * Math.cos(psi)), Hz - half * Math.sin(psi), s * psi];
  }

  /* spin curve over one autoplay step, in reference frames (30 fps) */
  const TK = [0, 3, 6, 8, 10, 11, 12, 13, 14, 16, 18, 21, 25, 30, 36, 45, 55, 70, 88, 110];
  const TB = [0, 0.02175, 0.12069, 0.22549, 0.35493, 0.43254, 0.51436, 0.5952, 0.6751, 0.83199, 0.9709, 1.12669, 1.27958, 1.40975, 1.53561, 1.68385, 1.79183, 1.89191, 1.95233, 2];
  const DRIFT = 0.06511, REST_PHASE = 81.828, STEP_FRAMES = 110;
  const SLOPES = (() => {
    const n = TK.length, h = TK.slice(1).map((x, i) => x - TK[i]), dl = h.map((hi, i) => (TB[i + 1] - TB[i]) / hi), d = new Array(n).fill(0);
    for (let k = 1; k < n - 1; k++) {
      if (dl[k - 1] * dl[k] <= 0) d[k] = 0;
      else { const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1]; d[k] = (w1 + w2) / (w1 / dl[k - 1] + w2 / dl[k]); }
    }
    const v = (dl[0] + dl[n - 2]) / 2; d[0] = v; d[n - 1] = v;
    return d;
  })();
  function spin(f) {
    if (f <= 0) return 0;
    if (f >= STEP_FRAMES) return 1;
    let i = 0;
    while (i < TK.length - 2 && f > TK[i + 1]) i++;
    const h = TK[i + 1] - TK[i], t = (f - TK[i]) / h;
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
    return (h00 * TB[i] + h10 * h * SLOPES[i] + h01 * TB[i + 1] + h11 * h * SLOPES[i + 1]) / 2;
  }
  function spinN(f, n) {
    if (n <= STEP_FRAMES + 0.5) return spin((f * STEP_FRAMES) / Math.max(1, n));
    const knee = 80;
    if (f <= knee) return spin(f);
    return spin(knee + ((f - knee) * (STEP_FRAMES - knee)) / (n - knee));
  }
  const LEAD = (STEP_FRAMES - REST_PHASE) / 30;

  /* ---------- colour ---------- */
  function parseColor(c) {
    const m = /^#([0-9a-f]{3,8})$/i.exec((c || '').trim());
    if (!m) return [255, 255, 255];
    let h = m[1];
    if (h.length <= 4) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

  /* ---------- card painter: project hero on top, Hebrew title below ---------- */
  function fitFont(ctx, text, weight, px, family, maxW) {
    ctx.font = `${weight} ${px}px ${family}`;
    const w = ctx.measureText(text).width;
    if (w > maxW) { px *= maxW / w; ctx.font = `${weight} ${px}px ${family}`; }
  }
  function paintCard(cv, card, img, i, total, family) {
    const ctx = cv.getContext('2d'), k = cv.width / CW, acc = parseColor(card.accent);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, '#2B1858'); bg.addColorStop(1, '#110A22');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
    const rg = ctx.createRadialGradient(CW * .9, CH, 0, CW * .9, CH, CW);
    rg.addColorStop(0, rgba(acc, .5)); rg.addColorStop(1, rgba(acc, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, CW, CH);

    // the project hero, cover-fitted into a rounded window
    const ix = 12, iy = 12, iw = CW - 24, ih = 172;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 7); ctx.clip();
    ctx.fillStyle = '#1B1030'; ctx.fillRect(ix, iy, iw, ih);
    if (img && img.naturalWidth) {
      const s = Math.max(iw / img.naturalWidth, ih / img.naturalHeight), dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 7); ctx.stroke();

    // number, title, line, call to action
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr'; ctx.textAlign = 'left';
    ctx.font = `600 8px ${family}`; ctx.letterSpacing = '2px';
    ctx.fillStyle = 'rgba(205,185,255,.85)';
    ctx.fillText(`${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, 16, 207);
    ctx.letterSpacing = '0px';
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    fitFont(ctx, card.name, 600, 21, family, CW - 32);
    ctx.fillText(card.name, CW - 16, 236);
    ctx.fillStyle = 'rgba(214,204,240,.9)';
    fitFont(ctx, card.short || '', 600, 11, family, CW - 32);
    ctx.fillText(card.short || '', CW - 16, 256);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(16, 276, CW - 32, .6);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = `600 10.5px ${family}`;
    ctx.fillText('לצפייה בפרויקט', CW - 16, 298);
    ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.fillStyle = rgba(acc, 1);
    ctx.font = `600 13px Arial, sans-serif`;
    ctx.fillText('←', 16, 299);
  }

  /* glow a card casts above and below the ring: [centre u, half width, strength] */
  function glowShape(pose) {
    const [px, pz, ps] = pose, c = Math.cos(ps), sn = Math.sin(ps);
    if (c <= 0.02) return [0, 1, 0];
    const A = px, B = FOCAL + pz, tNear = B - 0.5 * CW * Math.abs(sn);
    let m = 0, mx = 0, mxx = 0;
    for (let u = -360; u <= 360; u += 3) {
      const h = Math.exp(-((Math.abs(u - 9) / 138) ** 4));
      if (h < 0.003) continue;
      const k = u / 1.8 / FOCAL, den = sn * k - c;
      if (Math.abs(den) < 1e-4) continue;
      const s = (A - B * k) / den, t = B + s * sn;
      if (t < 4) continue;
      if ((u / 1.8 / FOCAL) * t * sn - t * c >= 0) continue;
      const dsdk = (B * c - A * sn) / (den * den);
      const soft = Math.min(Math.abs(dsdk / FOCAL) * 2.2, 40) + 0.5;
      const cov = Math.max(0, Math.min(1, (CW * 0.5 - Math.abs(s)) / soft + 0.5));
      if (cov <= 0) continue;
      const near = Math.min(1, FOCAL / t), rel = Math.exp(-((Math.max(t - tNear, 0) / 36) ** 1.5));
      const w = cov * near * near * rel * c * h;
      m += w; mx += w * u; mxx += w * u * u;
    }
    if (m < 0.5) return [0, 1, 0];
    const mu = mx / m, sd = Math.sqrt(Math.max(1, mxx / m - mu * mu)), r = Math.max(6, sd / 0.581);
    return [mu, r, (m * 3) / (1.813 * r)];
  }

  /* ---------- WebGL ---------- */
  const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform vec2 uRes;
uniform float uUnit;
uniform vec4 uPose[8];
uniform vec3 uGlowCol[8];
uniform vec3 uGlowShape[8];
uniform vec3 uBg;
uniform float uWarp;
uniform float uMix;
out vec4 outColor;
const float F = ${FOCAL.toFixed(2)};
const float CW = ${CW.toFixed(1)};
const float CH = ${CH.toFixed(1)};
const float CR = ${CR.toFixed(1)};
float lensH(float a){
  if (a <= 232.0) return a;
  float k[9] = float[9](232.0, 238.0, 245.0, 253.0, 262.0, 275.0, 295.0, 325.0, 360.0);
  float d[9] = float[9](1.1759, 1.0671, 1.0156, 1.0965, 0.6487, 0.2700, -0.1991, -0.4782, -0.0318);
  float s = 232.0;
  for (int i = 0; i < 8; i++){
    if (a <= k[i]) break;
    float x = min(a, k[i+1]);
    float t = (x - k[i]) / (k[i+1] - k[i]);
    s += (x - k[i]) * mix(1.0, mix(d[i], d[i+1], t * 0.5), uWarp);
  }
  if (a > 360.0) s += (a - 360.0) * mix(1.0, d[8], uWarp);
  return s;
}
float lensS(float a){
  float t = clamp((a - 262.0) / 93.0, 0.0, 2.0);
  return 1.0 + uWarp * (0.42 * pow(t, 1.5) + 0.045 * smoothstep(320.0, 360.0, a));
}
float sdRound(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
vec4 shadeCard(vec4 pose, vec2 ps, float fx, float fy, out float depth){
  depth = 1e9;
  if (pose.w < 0.0) return vec4(0.0);
  float k = ps.x / F;
  float c = cos(pose.z), sn = sin(pose.z);
  float den = sn * k - c;
  if (abs(den) < 1e-5) return vec4(0.0);
  float A = pose.x, B = F + pose.y;
  float s = (A - B * k) / den;
  float t = B + s * sn;
  if (t < 4.0) return vec4(0.0);
  float y = t * ps.y / F;
  float dsdk = (B * c - A * sn) / (den * den);
  float fs = min(abs(dsdk / F) * fx, 48.0);
  float fyc = min(t / F * fy, 48.0);
  vec2 p = vec2(s, y);
  float d = sdRound(p, vec2(CW, CH) * 0.5, CR);
  vec2 q = abs(p) - vec2(CW, CH) * 0.5 + CR;
  vec2 n = q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  if (q.x > 0.0 && q.y > 0.0) n = normalize(q);
  float fp = length(vec2(fs * n.x, fyc * n.y)) + 1e-4;
  if (d > fp) return vec4(0.0);
  float cov = clamp(0.5 - d / fp, 0.0, 1.0);
  if (cov <= 0.0) return vec4(0.0);
  vec2 uv = vec2(s / CW + 0.5, 0.5 - y / CH);
  vec4 tex = textureGrad(uTex, vec3(uv, pose.w), vec2(fs / CW, 0.0), vec2(0.0, fyc / CH));
  depth = t;
  return vec4(tex.rgb, 1.0) * cov;
}
vec4 scene(vec2 ps, float fx, float fy, int base){
  vec4 col[4];
  float dep[4];
  for (int i = 0; i < 4; i++) col[i] = shadeCard(uPose[base + i], ps, fx, fy, dep[i]);
  for (int i = 0; i < 3; i++)
    for (int j = 0; j < 3; j++)
      if (j < 3 - i && dep[j] > dep[j+1]) {
        float td = dep[j]; dep[j] = dep[j+1]; dep[j+1] = td;
        vec4 tc = col[j]; col[j] = col[j+1]; col[j+1] = tc;
      }
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 4; i++) acc += (1.0 - acc.a) * col[i];
  return acc;
}
vec4 glowAt(vec2 pu, float halfH, int base){
  vec4 sum = vec4(0.0);
  float gH = min(halfH, 288.0);
  float dy = min(abs((gH - 11.0) - pu.y), abs(pu.y + (gH - 12.0)));
  if (dy > 40.0) return sum;
  for (int i = 0; i < 4; i++){
    vec3 sh = uGlowShape[base + i];
    if (sh.z <= 0.0) continue;
    float E = exp(-pow(abs(pu.x - sh.x) / sh.y, 4.0));
    if (E < 0.002) continue;
    float v = exp(-pow(dy / (18.5 * (0.45 + 0.55 * sqrt(E))), 3.0));
    float w = sh.z * E * v;
    sum += vec4(uGlowCol[base + i] * w, w);
  }
  return sum;
}
vec3 stage(vec2 pu, float halfH, int base){
  vec4 g = glowAt(pu, halfH, base);
  if (g.a <= 0.0) return uBg;
  float I = clamp(g.a, 0.0, 1.0);
  vec3 drop = uBg - g.rgb / g.a;
  return uBg - drop * pow(vec3(I), vec3(0.8, 1.6, 1.0));
}
vec3 render(vec2 pu, float halfH, int base){
  float au = min(abs(pu.x), 360.0);
  float px = 1.0 / uUnit;
  vec3 bg = stage(pu, halfH, base);
  if (au < 236.0 || uWarp <= 0.0) {
    vec4 c = scene(pu, px, px, base);
    return c.rgb + (1.0 - c.a) * bg;
  }
  float e = 0.064 * uWarp * smoothstep(275.0, 360.0, au);
  float S0 = lensS(au);
  float sg = pu.x < 0.0 ? -1.0 : 1.0;
  float blur = 1.0 + 30.0 * pow(smoothstep(240.0, 340.0, au), 1.5) * uWarp;
  float fyb = 1.0 + 15.0 * smoothstep(280.0, 352.0, au) * uWarp;
  float gain = 1.0 + 0.17 * smoothstep(285.0, 350.0, au) * uWarp;
  vec3 acc;
  for (int ch = 0; ch < 3; ch++){
    float off = uWarp * (ch == 0 ? -20.92 : (ch == 1 ? 0.0 : 11.91));
    float h = lensH(au) + off * smoothstep(289.8, 344.9, au);
    float h0 = lensH(au - 0.5) + off * smoothstep(289.8, 344.9, au - 0.5);
    float h1 = lensH(au + 0.5) + off * smoothstep(289.8, 344.9, au + 0.5);
    float fx = px * max(abs(h1 - h0), 0.02) * blur;
    float S = S0 * (ch == 0 ? 1.0 + e : (ch == 1 ? 1.0 : 1.0 - e));
    vec4 c = scene(vec2(sg * h, pu.y / S), fx, px / S * fyb, base);
    c.rgb = min(c.rgb * gain, vec3(c.a));
    acc[ch] = (c.rgb + (1.0 - c.a) * bg)[ch];
  }
  return acc;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 pu = (fc - 0.5 * uRes) / uUnit;
  float halfH = 0.5 * uRes.y / uUnit;
  vec3 col = render(pu, halfH, 0);
  if (uMix > 0.0) col = mix(col, render(pu, halfH, 4), uMix);
  outColor = vec4(col, 1.0);
}`;

  function createGL(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.bindAttribLocation(prog, 0, 'aPos'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return null; }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const loc = {};
    for (const n of ['uTex', 'uRes', 'uUnit', 'uPose', 'uGlowCol', 'uGlowShape', 'uBg', 'uWarp', 'uMix']) loc[n] = gl.getUniformLocation(prog, n);
    return { gl, prog, tex: gl.createTexture(), loc, aniso: gl.getExtension('EXT_texture_filter_anisotropic') };
  }
  function uploadCards(st, canvases) {
    const { gl, tex } = st, w = canvases[0].width, h = canvases[0].height;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, w, h, canvases.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    canvases.forEach((cv, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, cv));
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (st.aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, st.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  }

  /* ---------- Canvas 2D fallback (no WebGL2): per-strip affine, no lens flare ---------- */
  function drawFallback(ctx, w, h, unit, poses, canvases, bg, glows) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const gH = Math.min(h / 2 / unit, 288);
    for (const p of poses) {
      if (p.layer < 0) continue;
      const [mu, r, amp] = glowShape(p.pose), a = Math.min(1, amp) * 0.9;
      if (a < 0.01) continue;
      const rx = r * 1.35 * unit, col = glows[p.layer], rgb = `${col[0]}, ${col[1]}, ${col[2]}`;
      for (const yy of [h / 2 - (gH - 11) * unit, h / 2 + (gH - 12) * unit]) {
        ctx.save(); ctx.translate(w / 2 + mu * unit, yy); ctx.scale(1, (20 * unit) / rx);
        const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        rg.addColorStop(0, `rgba(${rgb}, ${a})`); rg.addColorStop(0.55, `rgba(${rgb}, ${a * 0.55})`); rg.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = rg; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
      }
    }
    const proj = (X, Zb, Y) => { const D = FOCAL + Zb; return [w / 2 + ((X * FOCAL) / D) * unit, h / 2 - ((Y * FOCAL) / D) * unit]; };
    const items = poses.filter(p => p.layer >= 0).sort((a, b) => b.pose[1] - a.pose[1]);
    const strips = 32, eps = 1.5 / Math.max(unit, 0.25), half = CW / 2;
    const edgeY = sv => { const dx = Math.abs(sv) - (half - CR); if (dx <= 0) return CH / 2; return CH / 2 - CR + Math.sqrt(Math.max(0, CR * CR - Math.min(dx, CR) ** 2)); };
    for (const it of items) {
      const [cx, zb, psi] = it.pose, cv = canvases[it.layer];
      if (!cv) continue;
      const tpu = cv.width / CW, cs = Math.cos(psi), sn = Math.sin(psi);
      const at = (sv, y) => proj(cx + sv * cs, zb + sv * sn, y);
      for (let i = 0; i < strips; i++) {
        const s0 = -half + (CW * i) / strips - (i > 0 ? eps : 0), s1 = -half + (CW * (i + 1)) / strips + (i < strips - 1 ? eps : 0);
        if (FOCAL + zb + s0 * sn < 10 || FOCAL + zb + s1 * sn < 10) continue;
        const n = Math.abs(s0) > half - CR - 1 || Math.abs(s1) > half - CR - 1 ? 6 : 1;
        ctx.save(); ctx.beginPath();
        for (let k = 0; k <= n; k++) { const sv = Math.max(-half, Math.min(half, s0 + ((s1 - s0) * k) / n)), pt = at(sv, edgeY(sv)); k ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); }
        for (let k = n; k >= 0; k--) { const sv = Math.max(-half, Math.min(half, s0 + ((s1 - s0) * k) / n)), pt = at(sv, -edgeY(sv)); ctx.lineTo(pt[0], pt[1]); }
        ctx.closePath(); ctx.clip();
        const sm = (s0 + s1) / 2, tl = at(s0, CH / 2), tr = at(s1, CH / 2), mt = at(sm, CH / 2), mb = at(sm, -CH / 2);
        const sx0 = (s0 + half) * tpu, sw = (s1 - s0) * tpu, ov = 1.025;
        const a = (tr[0] - tl[0]) / sw, b = (tr[1] - tl[1]) / sw, c = ((mb[0] - mt[0]) / cv.height) * ov, d = ((mb[1] - mt[1]) / cv.height) * ov;
        const smx = (sm + half) * tpu;
        ctx.setTransform(a, b, c, d, (mt[0] + mb[0]) / 2 - a * smx - c * (cv.height / 2), (mt[1] + mb[1]) / 2 - b * smx - d * (cv.height / 2));
        const x0 = Math.max(0, sx0 - 1), x1 = Math.min(cv.width, sx0 + sw + 1);
        ctx.drawImage(cv, x0, 0, x1 - x0, cv.height, x0, 0, x1 - x0, cv.height);
        ctx.restore();
      }
    }
  }

  const mod = (a, n) => ((a % n) + n) % n;
  const loadImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

  window.WarpCarousel = async function (wrap, opts) {
    const o = Object.assign({ interval: 3.6667, step: 1, autoplay: true, background: '#111113', warp: 1,
      font: '"Lia Element", "Segoe UI", Arial, sans-serif', onOpen: null, onChange: null }, opts);
    const src = o.cards;
    const list = []; while (list.length < 4) list.push(...src);
    const N = list.length, real = src.length, gap = Math.max(0.5, o.interval), stepN = Math.max(1, Math.round(o.step));
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    wrap.appendChild(canvas);

    const imgs = await Promise.all(list.map(c => loadImg(c.hero)));
    try { await document.fonts.load(`600 20px ${o.font}`); } catch (_) {}

    let gls = createGL(canvas), ctx2d = gls ? null : canvas.getContext('2d');
    let cardCanvases = [], texW = 0, raf = 0;
    const bg = parseColor(o.background), glowCols = list.map(c => parseColor(c.accent));
    const paintAll = w => {
      cardCanvases = list.map((card, i) => {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = Math.round((w * CH) / CW);
        paintCard(cv, card, imgs[i], mod(i, real), real, o.font);
        return cv;
      });
      texW = w;
      if (gls) uploadCards(gls, cardCanvases);
    };

    // the 720-unit stage fills the width; on phones a narrower stage (bigger cards, the outer flare runs off the edge)
    const stageUnits = cssW => cssW < 700 ? 470 : 720;
    let W = 0, H = 0, unit = 1;
    const resize = () => {
      const r = wrap.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(2, Math.round(r.width * dpr)); H = Math.max(2, Math.round(r.height * dpr));
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      unit = Math.min(W / stageUnits(r.width), H / 440);
      const want = Math.min(1024, Math.max(256, Math.round(CW * unit * 1.25)));
      if (want !== texW) paintAll(want);
    };
    const unitCss = () => { const r = wrap.getBoundingClientRect(); return Math.min(r.width / stageUnits(r.width), r.height / 440); };

    const poseSet = P => Array.from({ length: N }, (_, c) => ({ c, q: mod(c - P + N / 2, N) - N / 2 }))
      .sort((a, b) => Math.abs(a.q) - Math.abs(b.q)).slice(0, 4)
      .map(({ c, q }) => (Math.abs(q) > 2.05 ? { pose: [0, 0, 0], layer: -1 } : { pose: poseAt(q), layer: c }));

    let cur = 0;
    const L = { P: 0, from: 0, to: 0, t0: 0, n: STEP_FRAMES, v: 0, mode: 'rest', nextAuto: Infinity, fadeFrom: 0, fadeT0: 0,
      dragX: 0, dragP: 0, downX: 0, moved: false, lastT: 0, visible: true, hiddenAt: 0 };

    const progressAt = now => {
      if (L.mode === 'spin') {
        const f = (now - L.t0) * 30;
        L.P = L.from + (L.to - L.from) * spinN(f, L.n);
        if (f >= L.n) L.mode = 'rest';
      } else if (L.mode === 'spring') {
        const dt = Math.min(0.034, Math.max(0, now - L.lastT)); L.lastT = now;
        for (let i = 0; i < 4; i++) { const acc = -60 * (L.P - L.to) - 13 * L.v; L.v += (acc * dt) / 4; L.P += (L.v * dt) / 4; }
        if (Math.abs(L.P - L.to) < 4e-4 && Math.abs(L.v) < 3e-3) { L.P = L.to; L.v = 0; L.mode = 'rest'; }
      } else if (L.mode === 'fade') {
        const m = Math.min(1, (now - L.fadeT0) / 0.45);
        if (m >= 1) L.mode = 'rest';
        return { P: L.P, Pb: L.fadeFrom, mix: 1 - m * m * (3 - 2 * m) };
      }
      return { P: L.P, Pb: 0, mix: 0 };
    };

    const poseArr = new Float32Array(32), glowArr = new Float32Array(24), shapeArr = new Float32Array(24);
    const fill = (set, off) => set.forEach((s, i) => {
      const j = off + i;
      poseArr.set([s.pose[0], s.pose[1], s.pose[2], s.layer], j * 4);
      const gc = s.layer >= 0 ? glowCols[s.layer] : [255, 255, 255];
      glowArr.set([gc[0] / 255, gc[1] / 255, gc[2] / 255], j * 3);
      shapeArr.set(s.layer >= 0 ? glowShape(s.pose) : [0, 1, 0], j * 3);
    });

    const draw = now => {
      const { P, Pb, mix } = progressAt(now), setA = poseSet(P);
      if (gls) {
        const { gl, prog, loc } = gls;
        gl.viewport(0, 0, W, H); gl.useProgram(prog);
        fill(setA, 0); if (mix > 0) fill(poseSet(Pb), 4);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, gls.tex);
        gl.uniform1i(loc.uTex, 0); gl.uniform2f(loc.uRes, W, H); gl.uniform1f(loc.uUnit, unit);
        gl.uniform4fv(loc.uPose, poseArr); gl.uniform3fv(loc.uGlowCol, glowArr); gl.uniform3fv(loc.uGlowShape, shapeArr);
        gl.uniform3f(loc.uBg, bg[0] / 255, bg[1] / 255, bg[2] / 255);
        gl.uniform1f(loc.uWarp, Math.max(0, Math.min(1, o.warp))); gl.uniform1f(loc.uMix, mix);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else if (ctx2d) {
        const css = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`;
        drawFallback(ctx2d, W, H, unit, setA, cardCanvases, css, glowCols);
        if (mix > 0) { ctx2d.globalAlpha = mix; drawFallback(ctx2d, W, H, unit, poseSet(Pb), cardCanvases, css, glowCols); ctx2d.globalAlpha = 1; }
      }
    };

    const announce = () => o.onChange && o.onChange(src[mod(cur, real)], mod(cur, real));
    // move the front card: a spin (or a cross-fade when motion is reduced)
    const setIndex = (next, fromAuto) => {
      const delta = next - cur;
      if (!delta) return;
      cur = next;
      const now = performance.now() / 1000;
      if (reduced) { L.fadeFrom = L.P; L.P = Math.round(L.P) + delta; L.mode = 'fade'; L.fadeT0 = now; }
      else if (L.mode !== 'spring') {
        L.from = L.P; L.to = Math.round(L.P - DRIFT) + delta + DRIFT; L.t0 = now;
        L.n = fromAuto ? gap * 30 : STEP_FRAMES; L.mode = 'spin';
      }
      if (!fromAuto) L.nextAuto = now + gap;
      announce(); kick();
    };

    const loop = () => {
      raf = 0;
      if (!L.visible) return;
      const now = performance.now() / 1000;
      if (o.autoplay && !reduced && L.mode !== 'drag' && L.mode !== 'spring' && now >= L.nextAuto) {
        L.nextAuto = Math.max(L.nextAuto + gap, now + gap * 0.5);
        setIndex(cur + stepN, true);
      }
      draw(now);
      if (L.mode !== 'rest' || (o.autoplay && !reduced)) raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf && L.visible) raf = requestAnimationFrame(loop); };

    // opens mid-rest, a moment before its first spin (as the original)
    const t0 = performance.now() / 1000;
    if (o.autoplay && !reduced) {
      L.from = cur - stepN + DRIFT; L.to = cur + DRIFT; L.t0 = t0 - REST_PHASE / 30; L.n = STEP_FRAMES; L.mode = 'spin';
      L.P = L.from + (L.to - L.from) * spin(REST_PHASE); L.nextAuto = t0 + LEAD;
    } else L.nextAuto = t0 + gap;

    resize();
    new ResizeObserver(() => { resize(); draw(performance.now() / 1000); }).observe(wrap);
    const setVisible = vis => {
      const now = performance.now() / 1000;
      if (vis === L.visible) return;
      if (!vis) L.hiddenAt = now;
      else { const dt = now - L.hiddenAt; L.t0 += dt; L.fadeT0 += dt; L.nextAuto += dt; L.lastT = now; }
      L.visible = vis;
      if (vis) kick();
    };
    let inView = true;
    new IntersectionObserver(ents => { inView = ents.some(e => e.isIntersecting); setVisible(inView && document.visibilityState === 'visible'); }).observe(wrap);
    document.addEventListener('visibilitychange', () => setVisible(inView && document.visibilityState === 'visible'));
    canvas.addEventListener('webglcontextlost', e => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => { gls = createGL(canvas); texW = 0; resize(); kick(); });

    /* ---------- interaction: drag, tap a side card to bring it forward, tap the front card to open it ---------- */
    wrap.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId);
      L.mode = 'drag'; L.dragX = e.clientX; L.downX = e.clientX; L.dragP = L.P; L.v = 0; L.moved = false; L.lastT = performance.now() / 1000;
      kick();
    });
    wrap.addEventListener('pointermove', e => {
      if (L.mode !== 'drag') return;
      const now = performance.now() / 1000, P = L.dragP - (e.clientX - L.dragX) / (unitCss() * 300), dt = Math.max(1 / 240, now - L.lastT);
      L.v = 0.6 * L.v + 0.4 * ((P - L.P) / dt); L.P = P; L.lastT = now;
      if (Math.abs(e.clientX - L.downX) > 5) L.moved = true;
      draw(now);
    });
    const up = e => {
      if (L.mode !== 'drag') return;
      const now = performance.now() / 1000;
      L.nextAuto = now + gap;
      if (!L.moved) {
        L.mode = 'rest';
        const r = wrap.getBoundingClientRect(), u = (e.clientX - r.left - r.width / 2) / unitCss();
        if (u > 168) setIndex(cur + 1);
        else if (u < -168) setIndex(cur - 1);
        else if (Math.abs(u) < CW / 2 && e.type === 'pointerup' && o.onOpen) o.onOpen(src[mod(cur, real)]);
        kick();
        return;
      }
      if (now - L.lastT > 0.08) L.v = 0;
      const target = Math.round(L.P + L.v * 0.16), from = Math.round(L.dragP - DRIFT);
      L.to = target; L.mode = 'spring'; L.lastT = now;
      const next = cur + (target - from);
      if (next !== cur) { cur = next; announce(); }
      kick();
    };
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', up);
    wrap.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setIndex(cur + (e.key === 'ArrowRight' ? 1 : -1)); }
      else if (e.key === 'Enter' && o.onOpen) o.onOpen(src[mod(cur, real)]);
    });

    draw(t0); announce(); kick();
    return { next: () => setIndex(cur + 1), prev: () => setIndex(cur - 1) };
  };
})();
