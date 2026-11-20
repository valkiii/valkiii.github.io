/* A procedural, softly lit portrait for the synthetic clip. No photos, no network: everything below is
   generated from a fixed seed. The head is a heightfield (skull, sockets, brow, nose, cheekbones, lips,
   chin, ears, neck) lit by a warm key and a cool fill, with wrap lighting for skin, a heightfield soft
   shadow, cavity occlusion, strand-splatted hair, brows and lashes, eyes with iris fibres and a cornea
   highlight, and a plain top with a ribbed neckband. Rendered at 2x and downsampled, then lens-softened.
   Output (at the clip size): an "under" layer (background + person without the top), a premultiplied
   "top" layer that breathes, a skin weight map for the pulse, and a display matte. */
(function (root) {
"use strict";
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const S = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const G = (dx, dy, sx, sy) => Math.exp(-(dx * dx / (2 * sx * sx) + dy * dy / (2 * sy * sy)));
const lin = c => Math.pow(c / 255, 2.2);
const enc = v => { const x = clamp(v, 0, 4), t = x * (1 + x / 2.2) / (1 + x); return 255 * Math.pow(clamp(t, 0, 1), 1 / 2.2); };   // gentle filmic shoulder

function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function noiseField(rand) {          // smooth value noise on a 256 lattice, with fbm
  const T = new Float32Array(256 * 256); for (let i = 0; i < T.length; i++) T[i] = rand() * 2 - 1;
  const at = (i, j) => T[((j & 255) << 8) | (i & 255)];
  const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const fbm = (x, y, o) => { let s = 0, a = .5, f = 1; for (let k = 0; k < (o || 3); k++) { s += a * vn(x * f + 17 * k, y * f - 31 * k); a *= .5; f *= 2.03; } return s; };
  return { vn, fbm };
}

function* portraitGen(size, seed) {
  const R = size * 2, N = R * R, sc = R / 384;           // all shapes are designed on a 384 grid and scaled
  const rand = rngOf(seed || 1234567), nz = noiseField(rand);
  const cx = 192 * sc;
  // ---------- geometry on the 384 design grid ----------
  const TA = 2.2 * Math.PI / 180, TS = -2.5;   // tilt (radians) and turn (design px) of the features
  const turn = (x, y) => { const dx = x - 192 - TS * (1 - ((y - 170) / 110) ** 2), dy = y - 165; return [192 + dx * Math.cos(TA) + dy * Math.sin(TA), 165 - dx * Math.sin(TA) + dy * Math.cos(TA)]; };
  const turnInv = (xt, yt) => { const a = xt - 192, b = yt - 165, dx = a * Math.cos(TA) - b * Math.sin(TA), dy = a * Math.sin(TA) + b * Math.cos(TA), y = 165 + dy; return [192 + dx + TS * (1 - ((y - 170) / 110) ** 2), y]; };
  const rxAt = y => 80 * (1 - .23 * Math.pow(S((y - 180) / 78), 1.1));
  function headQ(x, y) { const dx = x - 192, dy = y - 150; return (dx / rxAt(y)) ** 2 + (dy / 104) ** 2; }
  function faceZ(x0, y0) {         // relief added to the head ellipsoid (a slight tilt and turn)
    const r = turn(x0, y0), x = r[0], y = r[1], dx = x - 192, ax = Math.abs(dx);
    let z = 0;
    z -= 14 * G(ax - 34, y - 158, 15, 11);                       // eye sockets
    z += 6.5 * G(ax - 30, y - 141, 20, 5.5);                     // brow ridge
    z += 4 * G(dx, y - 108, 46, 30);                             // forehead
    z -= 4 * G(ax - 70, y - 132, 9, 22);                         // temples
    const np = 12 * S((y - 146) / 54) * (y < 208 ? 1 : Math.exp(-(((y - 208) / 4) ** 2)));
    const nw = 7 + .13 * Math.max(0, y - 150);
    z += np * Math.exp(-dx * dx / (2 * nw * nw));                // nose bridge and body
    z += 5 * G(dx, y - 201, 8, 7);                               // nose tip
    z += 6 * G(ax - 13, y - 206, 6, 4.5);                        // alae
    z -= 3 * G(ax - 7, y - 211, 3.2, 2);                         // nostrils
    z += 9 * G(ax - 46, y - 182, 20, 14);                        // cheekbones
    z -= 3 * G(ax - 40, y - 218, 14, 13);                        // under the cheekbones
    z -= 1.5 * G(ax - 27 - .35 * (y - 205), y - 214, 3, 11);     // nasolabial folds
    z += 1.2 * G(dx, y - 221, 20, 3.8);                          // upper lip
    z += 3.6 * G(dx, y - 232.5, 18, 4.6);                        // lower lip
    z -= 1.4 * G(dx, y - 227, 23, 1.2) * S((24 - ax) / 6);       // the line between the lips
    z -= .8 * G(ax - 24, y - 227, 4, 4);                         // mouth corners
    z -= .8 * G(dx, y - 215, 2.6, 4.5); z += .5 * G(ax - 4, y - 215, 1.6, 4.5);   // philtrum
    z -= 1.1 * G(dx, y - 240.5, 12, 3);                          // below the lower lip
    z += 7 * G(dx, y - 247, 14, 9);                              // chin
    return z;
  }
  const lipMask = (x0, y0) => { const r = turn(x0, y0), x = r[0], y = r[1], dx = x - 192, ax = Math.abs(dx);
    const up = S((25 - ax) / 5) * S((y - (219.5 + .012 * dx * dx - 1.3 * Math.exp(-dx * dx / 18))) / 2.2) * S((227.5 - y) / 1.5);
    const lo = S((22 - ax) / 5) * S((y - 226.5) / 1.5) * S(((238.5 - .017 * dx * dx) - y) / 2.6);
    return Math.max(up, lo); };
  // eyes
  const EY = 160, EH = 16;
  function eyeOpen(x0, y0) {       // returns {inside, ex, ey, yu, yl, side}
    const r = turn(x0, y0), x = r[0], y = r[1];
    const side = x < 192 ? -1 : 1, ecx = 192 + side * 34, ex = x - ecx, u = ex / EH;
    if (Math.abs(u) >= 1) return null;
    const t = 1 - u * u, tilt = -side * u * 1.2;               // outer corners a touch higher
    const yu = EY - 6.4 * Math.pow(t, .6) + tilt - .9, yl = EY + 3.9 * Math.pow(t, .85) + tilt * .5;
    return { ex, ey: y - EY, yu, yl, side, ecx, u };
  }
  // shoulders and neckline of the top
  const topY = x => { const ax = Math.abs(x - 192); return ax < 46 ? 279 + 12 * Math.sqrt(1 - (ax / 46) ** 2) : 279 + 40 * Math.pow((ax - 46) / 150, 1.35); };
  const neckHalf = y => 36 + .16 * Math.max(0, y - 246) + .012 * Math.max(0, y - 262) ** 2;
  // hair: cap outline and hairline
  const hairline = x => { const dx = x - 192; return 84 + .003 * dx * dx + 9 * G(Math.abs(dx) - 46, 0, 12, 1) + 4 * nz.fbm(x * .06, 3.3, 3); };
  function hairRegion(x, y) {
    const dx = x - 192, q = (dx / 90) ** 2 + ((y - 142) / 107) ** 2 - .07 * nz.fbm(Math.atan2(dx, y - 142) * 3 + 5, 1.7, 3);
    if (q > 1) return 0;
    if (y > 132 && Math.abs(dx) > 84 - (y - 132) * .55) return 0;
    const side = Math.abs(dx) > 62 ? S((166 - y - 1.4 * (Math.abs(dx) - 62)) / 7) * S((Math.abs(dx) - 62) / 6) : 0;
    return Math.max(S((hairline(x) - y) / 2.5), side) * S((1 - q) * 30);
  }
  // ---------- passes on the 2x grid ----------
  const zH = new Float32Array(N), cov = new Uint8Array(N), skinW = new Float32Array(N), hairM = new Float32Array(N);
  const D = 1 / sc;                       // grid pixel -> design units
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const x = (i + .5) * D, y = (j + .5) * D, k = j * R + i;
    const q = headQ(x, y);
    if (q < 1) { zH[k] = 30 + 72 * Math.sqrt(1 - q) + faceZ(x, y); cov[k] = 1; }
    else {
      const ax = Math.abs(x - 192);
      const eq = ((ax - 79) / 11) ** 2 + ((y - 170) / 23) ** 2;
      if (eq < 1) { zH[k] = 26 + 12 * Math.sqrt(1 - eq) + 3 * G(Math.sqrt(eq) - .82, 0, .1, 1) - 7 * G(ax - 81, y - 174, 4, 8); cov[k] = 2; }
      else if (ax < neckHalf(y) && y > 200) { zH[k] = 6 + 30 * Math.sqrt(Math.max(0, 1 - (ax / neckHalf(y)) ** 2)); cov[k] = 3; }
    }
    hairM[k] = hairRegion(x, y);
  }
  yield .2;
  // cavity (ambient occlusion): how far each point sits below its blurred surroundings
  const blurZ = boxBlur(zH, R, Math.round(9 * sc));
  // ---------- strands: hair, brows, lashes ----------
  const hD = new Float32Array(N), hB = new Float32Array(N), hT = new Float32Array(N * 2);
  const bD = new Float32Array(N), lD = new Float32Array(N);
  function splat(arr, x, y, a, bri, tx, ty) {      // x, y on the 2x grid; bilinear
    const i = Math.floor(x - .5), j = Math.floor(y - .5), fx = x - .5 - i, fy = y - .5 - j;
    const ws = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], ks = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
    for (let q = 0; q < 4; q++) { const [u, v] = ks[q]; if (u < 0 || v < 0 || u >= R || v >= R) continue; const k = v * R + u, w = ws[q] * a; arr[k] += w; if (bri != null) { hB[k] += w * bri; hT[k * 2] += w * tx; hT[k * 2 + 1] += w * ty; } }
  }
  const nHair = Math.round(16000 * sc * sc);
  for (let s = 0, tries = 0; s < nHair && tries < nHair * 8; tries++) {
    let x = 192 + (rand() * 2 - 1) * 92, y = 34 + rand() * 150;
    if (hairRegion(x, y) < .5) continue;
    s++;
    const len = 16 + rand() * 26, bri = .35 + rand() * 1.3, curl = (rand() - .5) * .05;
    let ang = Math.atan2(y - 18, (x - 192) * 1.15) + (rand() - .5) * .35;
    for (let t = 0; t < len; t += .7) {
      const tx = Math.cos(ang), ty = Math.sin(ang);
      const h = hairRegion(x, y); if (h < .01 && t > 6) break;
      splat(hD, x * sc, y * sc, .45 * sc * Math.min(1, h + .25), bri, tx, ty);
      x += tx * .7; y += ty * .7; ang += curl;
    }
  }
  for (const side of [-1, 1]) {        // eyebrows: short strands along an arc, angled outward
    for (let s = 0; s < 950; s++) {
      const u = rand(), bx = 192 + side * (13 + u * 40), by = 145 - 9 * Math.sin(Math.min(1, u * 1.25) * Math.PI * .62) + u * 3 + (rand() - .5) * (9.5 - 6 * u);
      const ang = side > 0 ? -.55 + u * .55 : Math.PI + .55 - u * .55, len = 4 + rand() * 5, bri = .6 + rand() * .7;
      let x = bx, y = by; for (let t = 0; t < len; t += .5) { const w = turnInv(x, y); splat(bD, w[0] * sc, w[1] * sc, .16 * sc * (1 - .55 * Math.abs(u - .4)), null); x += Math.cos(ang) * .5; y += Math.sin(ang) * .5 + .02 * t; }
    }
    for (let s = 0; s < 120; s++) {    // upper lashes
      const u = rand() * 2 - 1, ux = 192 + side * (34 + u * EH * .98), tt = 1 - u * u, yuT = EY - 6.4 * Math.pow(tt, .6) - side * side * 0 + (-side * (side * u) * 1.2) - .9;
      let x = ux, y = yuT + .3; const ang = -Math.PI / 2 + side * (.25 + .45 * Math.max(0, side * u)) + (rand() - .5) * .3, len = 3 + rand() * 3.5;
      for (let t = 0; t < len; t += .4) { const w = turnInv(x, y); splat(lD, w[0] * sc, w[1] * sc, .5 * sc, null); x += Math.cos(ang) * .4; y += Math.sin(ang) * .4 + .03 * t; }
    }
  }
  yield .35;
  // ---------- lighting ----------
  const norm = (a, b, c) => { const l = Math.hypot(a, b, c); return [a / l, b / l, c / l]; };
  const Lk = norm(-.64, -.5, .58), Lf = norm(.75, -.05, .66), Hk = norm(Lk[0], Lk[1], Lk[2] + 1), Hf = norm(Lf[0], Lf[1], Lf[2] + 1);
  const KEY = [1.2, 1.1, .97], FILL = [.075, .09, .12], AMB = [.055, .062, .078];
  const zAt = (i, j) => zH[clamp(j, 0, R - 1) * R + clamp(i, 0, R - 1)];
  function shadowKey(i, j, z0) {       // soft shadow by marching the heightfield toward the key light
    const st = 1.4 * sc, dz = Lk[2] / Math.hypot(Lk[0], Lk[1]) * 1.4; let sh = 1;
    for (let s = 1; s <= 26; s++) {
      const x = i + Lk[0] / Math.hypot(Lk[0], Lk[1]) * st * s, y = j + Lk[1] / Math.hypot(Lk[0], Lk[1]) * st * s;
      const h = zAt(Math.round(x), Math.round(y)) - (z0 + dz * s);
      if (h > 0) sh = Math.min(sh, 1 - clamp(h / (2 + .9 * s), 0, 1));
    }
    return 1 - .62 * (1 - sh);
  }
  const under = new Float32Array(N * 3), top = new Float32Array(N * 4), skin = new Float32Array(N), person = new Float32Array(N);
  const skinAlb = [lin(212), lin(163), lin(142)];
  for (let j = 0; j < R; j++) { if (j % 24 === 0) yield .35 + .6 * j / R; for (let i = 0; i < R; i++) {
    const k = j * R + i, x = (i + .5) * D, y = (j + .5) * D, dx = x - 192, ax = Math.abs(dx);
    // background: a softly lit wall far behind, out of focus
    const wl = .62 - .0009 * y + .25 * Math.exp(-(((x - 330) ** 2) / 9000 + ((y - 70) ** 2) / 14000)) - .18 * S((40 - Math.abs(x - 372)) / 24) * .6 + .04 * nz.fbm(x * .006, y * .006, 2);
    let c = [lin(118) * wl / .5, lin(114) * wl / .5, lin(110) * wl / .5];
    let pc = 0;
    const kind = cov[k];
    if (kind) {
      const z0 = zH[k];
      const gx = (zAt(i + 1, j) - zAt(i - 1, j)) / 2 * sc, gy = (zAt(i, j + 1) - zAt(i, j - 1)) / 2 * sc;   // dz per design unit
      let n = norm(-gx, -gy, 1);
      const cav = clamp(1 - Math.max(0, blurZ[k] - z0) * .05, .5, 1);
      let alb = skinAlb.slice(), oil = .25, wrap = [.6, .38, .3];
      // albedo variation: mottling, pores, warmer cheeks, nose, ears, lips; cooler under the eyes
      const mot = nz.fbm(x * .045, y * .045, 3) + .7 * nz.fbm(x * .19 + 50, y * .19, 2), por = nz.vn(x * .55, y * .55) * .6 + nz.vn(x * 1.1 + 9, y * 1.1) * .4;
      const red = .7 * G(ax - 45, y - 196, 17, 14) + .55 * G(dx, y - 201, 9, 8) + (kind === 2 ? .7 : 0) + .25 * G(dx, y - 120, 40, 18);
      const yel = G(dx, y - 112, 42, 22), dk2 = G(ax - 72, y - 150, 10, 40) + .6 * G(ax - 52, y - 238, 18, 12);
      alb = [alb[0] * (1 + .12 * red + .02 * yel + .08 * mot + .06 * por - .08 * dk2), alb[1] * (1 - .15 * red + .02 * yel + .07 * mot + .06 * por - .09 * dk2), alb[2] * (1 - .13 * red - .05 * yel + .05 * mot + .05 * por - .06 * dk2)];
      const ue = G(ax - 33, y - 170, 12, 4); alb = [alb[0] * (1 - .10 * ue), alb[1] * (1 - .13 * ue), alb[2] * (1 - .04 * ue)];
      if (kind === 1) {
        const lm = lipMask(x, y);
        if (lm > 0) { const la = [lin(176), lin(108), lin(104)]; alb = alb.map((v, q) => v + (la[q] - v) * lm * .75); oil += .6 * lm; }
        oil += .5 * G(dx, y - 115, 34, 20) + .7 * G(dx, y - 198, 7, 10);
      }
      if (kind === 3) { const jaw = Math.exp(-Math.max(0, y - 238 - .004 * dx * dx) / 14); alb = alb.map(v => v * (1 - .45 * jaw)); }
      let sw = 1;              // skin weight for the pulse
      // eyes replace skin inside the opening
      let eyePix = false, eyeCol = null;
      if (kind === 1 && Math.abs(y - EY) < 12) {
        const o = eyeOpen(x, y);
        if (o) {
          const inside = S((y - o.yu) / 1.1 + .3) * S((o.yl - y) / 1.1 + .2);
          if (inside > 0) {
            const r = 15, ez = Math.sqrt(Math.max(.1, r * r - o.ex * o.ex - o.ey * o.ey)), en = norm(o.ex / r, o.ey / r, ez / r);
            const ix = o.ex - o.side * .6, iy = o.ey + .8, ir = Math.hypot(ix, iy), RI = 7.0, RP = 2.6;
            const ang = Math.atan2(iy, ix);
            let ea;
            if (ir < RI) {
              const fib = .65 + .35 * nz.vn(ang * 13 + 40, ir * .9) + .15 * nz.vn(ang * 40, 2);
              const ring = 1 - .55 * S((ir - RI * .82) / (RI * .18)), coll = 1 + .35 * G(ir - RI * .45, 0, .9, 1);
              ea = [.085 * fib * ring * coll, .052 * fib * ring * coll, .028 * fib * ring * coll];
              if (ir < RP) ea = [.008, .007, .007];
            } else {
              const corner = 1 - .38 * Math.pow(Math.abs(o.u), 2.2), pink = G(o.ex + o.side * 14.5, o.ey, 2.4, 2.4);
              ea = [.44 * corner + .12 * pink, .41 * corner - .05 * pink, .39 * corner - .06 * pink];
            }
            const lidSh = .18 + .82 * S((y - o.yu) / 6.5);
            const dk = Math.max(0, en[0] * Lk[0] + en[1] * Lk[1] + en[2] * Lk[2]), df = Math.max(0, en[0] * Lf[0] + en[1] * Lf[1] + en[2] * Lf[2]);
            const spec = Math.pow(Math.max(0, en[0] * Hk[0] + en[1] * Hk[1] + en[2] * Hk[2]), 500) * 5 + Math.pow(Math.max(0, en[0] * Hf[0] + en[1] * Hf[1] + en[2] * Hf[2]), 300) * 1.2;
            eyeCol = [0, 1, 2].map(q => ea[q] * (KEY[q] * (.35 + .65 * dk) * lidSh + FILL[q] * df + AMB[q] * 1.5) + spec * KEY[q] * lidSh);
            eyePix = inside; sw *= 1 - inside;
          }
          // lid crease and lash line
          const crease = G(y - (o.yu - 6.5 - 1.5 * (1 - o.u * o.u)), 0, 1.2, 1) * (1 - o.u * o.u);
          alb = alb.map(v => v * (1 - .25 * crease));
          const lowerLine = G(y - o.yl - .8, 0, .7, 1) * (1 - o.u * o.u), lidLine = G(y - o.yu + .4, 0, 1.1, 1) * (1 - Math.pow(Math.abs(o.u), 3));
          alb = alb.map(v => v * (1 - .3 * lowerLine) * (1 - .75 * lidLine));
        }
      }
      // shading: wrap diffuse per channel (warm light bleeding past the terminator), key shadow, fill, sky, specular
      const sh = shadowKey(i, j, zH[k]);
      const dk = n[0] * Lk[0] + n[1] * Lk[1] + n[2] * Lk[2], df = n[0] * Lf[0] + n[1] * Lf[1] + n[2] * Lf[2];
      const sky = .55 + .45 * clamp(-n[1] * .6 + n[2] * .6, 0, 1);
      const spec = (Math.pow(Math.max(0, n[0] * Hk[0] + n[1] * Hk[1] + n[2] * Hk[2]), 30) * .22 * sh + Math.pow(Math.max(0, n[0] * Hf[0] + n[1] * Hf[1] + n[2] * Hf[2]), 30) * .03) * oil;
      c = [0, 1, 2].map(q => {
        const wq = wrap[q], shq = sh + (1 - sh) * (q === 0 ? .22 : q === 1 ? .08 : .05);
        const d = Math.max(0, (dk + wq) / (1 + wq)) * shq, f = Math.max(0, (df + wq) / (1 + wq));
        return alb[q] * (KEY[q] * d * 1.05 + FILL[q] * f + AMB[q] * sky * 1.6) * cav + spec * KEY[q];
      });
      if (eyePix) c = c.map((v, q) => v + (eyeCol[q] - v) * eyePix);
      // brows and lashes on top of skin
      const bd = .85 * (1 - Math.exp(-bD[k] * 1.3)), ld = 1 - Math.exp(-lD[k] * 3);
      const browC = [.035, .022, .015].map((v, q) => v * (KEY[q] * Math.max(.2, dk) + .5));
      c = c.map((v, q) => v + (browC[q] - v) * bd); c = c.map(v => v * (1 - .92 * ld));
      sw *= (1 - bd) * (1 - ld);
      if (kind === 1) { const lm = lipMask(x, y); sw *= 1 - .4 * lm; sw *= .82 + .18 * Math.max(G(dx, y - 112, 34, 22), G(ax - 44, y - 192, 18, 15), G(dx, y - 196, 9, 14)) / .9; }
      if (kind === 2) sw *= .8;
      if (kind === 3) sw *= .7;
      skin[k] = sw;
      pc = 1;
    }
    // hair over everything above the face
    const hm = hairM[k], hd = hD[k];
    if (hm > 0 || hd > 0) {
      const core = S((hm - .8) / .2) * .9, strand = 1 - Math.exp(-hd * 1.7), a = clamp(Math.max(core * .97, strand * (hm > .02 ? 1 : .6)), 0, 1);
      if (a > 0) {
        const bri = hd > 1e-4 ? hB[k] / hd : 1;
        let tx = hT[k * 2], ty = hT[k * 2 + 1], tl = Math.hypot(tx, ty);
        if (tl < 1e-4) { tx = (x - 192) * 1.15; ty = y - 18; tl = Math.hypot(tx, ty); }
        tx /= tl; ty /= tl;
        const q = ((x - 192) / 92) ** 2 + ((y - 140) / 108) ** 2, hz = Math.sqrt(Math.max(.02, 1 - q)), hn = norm((x - 192) / 92, (y - 140) / 108 * 1.1, hz);
        const T3 = norm(tx, ty, -(hn[0] * tx + hn[1] * ty) / hn[2]);
        const dk = Math.max(0, (hn[0] * Lk[0] + hn[1] * Lk[1] + hn[2] * Lk[2] + .3) / 1.3), df = Math.max(0, hn[0] * Lf[0] + hn[1] * Lf[1] + hn[2] * Lf[2]);
        const th = T3[0] * Hk[0] + T3[1] * Hk[1] + T3[2] * Hk[2], kk = Math.pow(Math.sqrt(Math.max(0, 1 - th * th)), 24) * .16 * dk;
        const phi = Math.atan2(x - 192, y - 18), rho = Math.hypot(x - 192, y - 18), streak = .5 + nz.fbm(phi * 58, rho * .045, 3);
        const ha = [.032, .020, .013].map(v => v * (.25 + .45 * bri + .55 * streak) * (1 + .12 * nz.vn(x * .4, y * .4)));
        const hc = ha.map((v, q2) => v * (KEY[q2] * dk * 1.1 + FILL[q2] * df + AMB[q2] * 1.4) + kk * KEY[q2] * clamp(streak, 0, 1.4) * (.4 + .6 * bri));
        c = c.map((v, q2) => v + (hc[q2] - v) * a);
        skin[k] *= 1 - a; pc = Math.max(pc, a);
      }
    }
    // gentle lens vignette
    const vg = 1 - .22 * (((x - 192) / 260) ** 2 + ((y - 192) / 260) ** 2);
    { const Y = .3 * c[0] + .59 * c[1] + .11 * c[2]; c = c.map(v => Y + (v - Y) * .9); }
    for (let q = 0; q < 3; q++) under[k * 3 + q] = enc(c[q] * vg);
    person[k] = pc;
    // the top (plain, heathered fabric) as its own layer
    const ty0 = topY(x);
    const ta = S((y - ty0) / 6 + .5);
    if (ta > 0) {
      const ex = dx / 205, base = 58 * Math.sqrt(Math.max(0, 1 - ex * ex)) + 8 * G(ax - 58, y - 384, 45, 46);
      const fold = 1.4 * Math.sin(dx * .085 + 2.2 * nz.fbm(x * .02, y * .02, 2)) * S((ax - 70) / 40) * S((y - ty0 - 6) / 20);
      const band = G(y - ty0 - 4.2, 0, 2.6, 1);
      const tz = (xx, yy) => { const ax2 = Math.abs(xx - 192), e2 = (xx - 192) / 205; return 58 * Math.sqrt(Math.max(0, 1 - e2 * e2)) + 8 * G(ax2 - 58, yy - 384, 45, 46) + 1.4 * Math.sin((xx - 192) * .085 + 2.2 * nz.fbm(xx * .02, yy * .02, 2)) * S((ax2 - 70) / 40) * S((yy - topY(xx) - 6) / 20) + 2.2 * G(yy - topY(xx) - 4.2, 0, 2.6, 1); };
      const gx = (tz(x + 1, y) - tz(x - 1, y)) / 2, gy = (tz(x, y + 1) - tz(x, y - 1)) / 2;
      void base; void fold;
      const n = norm(-gx, -gy, 1);
      const heather = 1 + .07 * nz.vn(x * 1.3, y * 1.3) + .04 * nz.vn(x * .35, y * .35), rib = 1 + .06 * Math.sin(Math.atan2(y - 250, dx) * 140) * band;
      const alb = [lin(64), lin(76), lin(100)].map(v => v * heather * rib * (1 + .12 * band));
      const dk = Math.max(0, n[0] * Lk[0] + n[1] * Lk[1] + n[2] * Lk[2]), df = Math.max(0, n[0] * Lf[0] + n[1] * Lf[1] + n[2] * Lf[2]);
      const neckSh = 1 - .45 * G(dx + 8, y - ty0 - 6, 34, 9) - .25 * G(dx + 12, y - ty0 - 30, 50, 22);  // shadow of the head and neck on the chest
      const sky = .6 + .4 * clamp(-n[1] + .3, 0, 1);
      const tc = alb.map((v, q) => v * (KEY[q] * dk * neckSh * 1.05 + FILL[q] * df + AMB[q] * sky * 1.7));
      for (let q = 0; q < 3; q++) top[k * 4 + q] = enc(tc[q] * vg) * ta;
      top[k * 4 + 3] = ta;
    }
  } }
  // ---------- downsample 2x, then a slight lens blur ----------
  const P = size * size;
  const down = (src, ch) => { const o = new Float32Array(P * ch); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let q = 0; q < ch; q++) { const a = ((2 * y) * R + 2 * x) * ch + q; o[(y * size + x) * ch + q] = (src[a] + src[a + ch] + src[a + R * ch] + src[a + R * ch + ch]) / 4; } return o; };
  const U = lens(down(under, 3), size, 3), T = lens(down(top, 4), size, 4), SK = down(skin, 1), PE = down(person, 1);
  // pulse weight: skin only, normalised so the middle of the forehead is 1
  let fs = 0, fn = 0; const L = landmarks(size);
  for (let y = L.foreheadBox[1]; y < L.foreheadBox[3]; y++) for (let x = L.foreheadBox[0]; x < L.foreheadBox[2]; x++) { fs += SK[y * size + x]; fn++; }
  const kn = fn ? fn / fs : 1; for (let i = 0; i < P; i++) SK[i] = Math.min(1.2, SK[i] * kn);
  // display matte: the person, the top raised a little for breathing, fading out at the bottom and sides
  const fg = new Float32Array(P);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, X = (x + .5) * 384 / size, Y = (y + .5) * 384 / size;
    const t = S((Y - (topY(X) - 6)) / 2.5);
    fg[i] = clamp(Math.max(PE[i], t), 0, 1) * Math.pow(clamp((384 - Y) / 60, 0, 1), 1.2) * clamp(Math.min(X, 384 - X) / 30, 0, 1);
  }
  let FG = fg; for (let r = 0; r < 3; r++) FG = lens(FG, size, 1);
  for (let i = 0; i < P; i++) FG[i] = S((FG[i] - .35) / .6);
  return { size, under: U, top: T, skin: SK, fg: FG, L };
}
function boxBlur(src, R, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let j = 0; j < R; j++) { let s = 0; for (let i = -r; i <= r; i++) s += src[j * R + clamp(i, 0, R - 1)]; for (let i = 0; i < R; i++) { tmp[j * R + i] = s / (2 * r + 1); s += src[j * R + clamp(i + r + 1, 0, R - 1)] - src[j * R + clamp(i - r, 0, R - 1)]; } }
  for (let i = 0; i < R; i++) { let s = 0; for (let j = -r; j <= r; j++) s += tmp[clamp(j, 0, R - 1) * R + i]; for (let j = 0; j < R; j++) { out[j * R + i] = s / (2 * r + 1); s += tmp[clamp(j + r + 1, 0, R - 1) * R + i] - tmp[clamp(j - r, 0, R - 1) * R + i]; } }
  return out;
}
function lens(src, n, ch) {       // [1 2 1]/4 both ways: a slightly soft webcam lens
  const t = new Float32Array(src.length), o = new Float32Array(src.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let q = 0; q < ch; q++) { const a = (y * n + Math.max(0, x - 1)) * ch + q, b = (y * n + x) * ch + q, c = (y * n + Math.min(n - 1, x + 1)) * ch + q; t[b] = .25 * src[a] + .5 * src[b] + .25 * src[c]; }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let q = 0; q < ch; q++) { const a = (Math.max(0, y - 1) * n + x) * ch + q, b = (y * n + x) * ch + q, c = (Math.min(n - 1, y + 1) * n + x) * ch + q; o[b] = .25 * t[a] + .5 * t[b] + .25 * t[c]; }
  return o;
}
// landmarks in clip pixels (for probes, the swatch, the rPPG patch and tests)
function landmarks(size) {
  const k = size / 384, r = v => Math.round(v * k);
  const topY = x => { const ax = Math.abs(x - 192); return ax < 46 ? 279 + 12 * Math.sqrt(1 - (ax / 46) ** 2) : 279 + 40 * Math.pow((ax - 46) / 150, 1.35); };
  return {
    forehead: { x: r(192), y: r(114) }, foreheadBox: [r(168), r(100), r(216), r(128)],
    face: [r(130), r(100), r(254), r(244)], cheek: { x: r(236), y: r(196) },
    chestX: r(62), chestRows: [r(250), r(350)], shoulderY: xClip => topY((xClip + .5) / k) * k - .5,
  };
}
function buildPortrait(size, seed) { const g = portraitGen(size, seed); let r; do { r = g.next(); } while (!r.done); return r.value; }
const api = { buildPortrait, portraitGen, landmarks };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.EVMPortrait = api;
})(typeof self !== "undefined" ? self : this);
