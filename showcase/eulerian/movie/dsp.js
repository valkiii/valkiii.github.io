/* Eulerian video magnification, in plain JS, on a synthetic clip.
   Everything here is real signal processing: a 5-tap binomial Laplacian pyramid, an ideal temporal
   bandpass built from DFT bins of the looping clip, a causal IIR bandpass made of two first-order
   low-pass filters, per-level amplification and recombination. Also loadable from node for tests. */
(function (root) {
"use strict";

const FS = 30, N = 300, W = 128, H = 128;          // 10 s loop at 30 fps, so 1 Hz and 0.3 Hz loop exactly
const TAU = Math.PI * 2;

// ---------- deterministic randomness ----------
function rng32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussFactory(rand) {
  let spare = null;
  return function () {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0;
    while (u <= 1e-12) u = rand();
    v = rand();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(TAU * v);
    return m * Math.cos(TAU * v);
  };
}

const sig = x => 1 / (1 + Math.exp(-x));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------- the synthetic scene ----------
// Signals (ILLUSTRATIVE, from technical.md): pulse 1.0 Hz, +0.5 grey levels green and +0.25 red on skin;
// breathing 0.3 Hz, the chest outline moves 0.5 px; lights flicker 2.5 Hz, 0.4 grey levels;
// slow drift 0.1 Hz, 1 grey level; sensor noise sigma 2 per pixel per frame; stored as 8-bit like video.
const SIG = { pulseHz: 1.0, pulseG: 0.5, pulseR: 0.25, breathHz: 0.3, breathPx: 0.5,
  flickerHz: 2.5, flicker: 0.4, driftHz: 0.1, drift: 1.0, noise: 2.0 };

function sceneModel(w, h) {
  w = w || W; h = h || H;
  const P = w * h, base = new Float32Array(P * 3), skin = new Float32Array(P);
  const k = w / 128;
  const SK = [224, 172, 150], HAIR = [58, 40, 34], SHIRT = [62, 104, 150];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = (x + .5) / k, Y = (y + .5) / k, i = y * w + x;
    // wall: soft gradient with a faint lamp glow
    const glow = Math.exp(-((X - 96) ** 2 + (Y - 18) ** 2) / 1800);
    let r = 64 + 14 * glow - Y * .08, g = 72 + 12 * glow - Y * .08, b = 82 + 8 * glow - Y * .06;
    // head
    const hx = (X - 64) / 25, hy = (Y - 50) / 31, hd = Math.sqrt(hx * hx + hy * hy);
    const head = sig((1 - hd) * 26);
    const shade = 1 - .12 * Math.max(0, hd - .55) - .05 * Math.max(0, hx);
    let s = head;
    r = r * (1 - head) + SK[0] * shade * head; g = g * (1 - head) + SK[1] * shade * head; b = b * (1 - head) + SK[2] * shade * head;
    // neck
    const neck = sig((9.5 - Math.abs(X - 64)) * 1.5) * sig((Y - 72) * 1.2);
    r = r * (1 - neck) + 206 * neck; g = g * (1 - neck) + 155 * neck; b = b * (1 - neck) + 134 * neck;
    s = Math.max(s, neck);
    // hair: a cap over the top of the head
    const ax = (X - 64) / 27.5, ay = (Y - 45) / 30, ad = Math.sqrt(ax * ax + ay * ay);
    const fringe = 30 + 4 * Math.cos((X - 64) / 6);
    const hair = sig((1 - ad) * 22) * sig((fringe - Y) * 1.1);
    r = r * (1 - hair) + HAIR[0] * hair; g = g * (1 - hair) + HAIR[1] * hair; b = b * (1 - hair) + HAIR[2] * hair;
    s *= (1 - hair);
    // eyes, brows, mouth, nose, cheeks
    const feat = (cx, cy, rx, ry, sharp) => sig((1 - Math.hypot((X - cx) / rx, (Y - cy) / ry)) * sharp);
    const eyes = Math.max(feat(54, 52, 3.4, 2.1, 6), feat(74, 52, 3.4, 2.1, 6));
    r = r * (1 - eyes) + 40 * eyes; g = g * (1 - eyes) + 34 * eyes; b = b * (1 - eyes) + 36 * eyes; s *= (1 - eyes);
    const brow = Math.max(feat(54, 46.5, 5, 1.1, 5), feat(74, 46.5, 5, 1.1, 5));
    r = r * (1 - brow) + 92 * brow; g = g * (1 - brow) + 62 * brow; b = b * (1 - brow) + 52 * brow; s *= (1 - .7 * brow);
    const mouthY = 68 + .02 * (X - 64) ** 2;
    const mouth = sig((6.5 - Math.abs(X - 64)) * 2) * sig((1 - Math.abs(Y - mouthY)) * 2.4);
    r = r * (1 - mouth) + 170 * mouth; g = g * (1 - mouth) + 92 * mouth; b = b * (1 - mouth) + 92 * mouth; s *= (1 - mouth);
    const nose = feat(65.5, 60, 2.2, 4.6, 3) * .18;
    r *= 1 - nose; g *= 1 - nose; b *= 1 - nose;
    const cheek = (feat(50, 62, 6, 4, 2) + feat(78, 62, 6, 4, 2)) * .25 * head;
    r += 8 * cheek; g -= 4 * cheek; b -= 2 * cheek;
    base[i * 3] = r; base[i * 3 + 1] = g; base[i * 3 + 2] = b; skin[i] = clamp(s, 0, 1);
  }
  return { w, h, P, base, skin, SHIRT, k };
}

// torso outline: shoulders that drop away from the neck; d moves it up (breathing)
function torsoTop(X) { const u = (X - 64) / 56; return 88 + 24 * u * u; }
const TORSO_SOFT = 4.5;   // logistic scale in px: a soft edge, about 14 px from 10% to 90%

function renderFrame(model, t, gauss, out, opt) {
  opt = opt || {};
  const { w, h, P, base, skin, SHIRT, k } = model;
  const amp = opt.breathPx != null ? opt.breathPx : SIG.breathPx;
  const pulse = Math.sin(TAU * SIG.pulseHz * t);
  const d = amp * Math.sin(TAU * SIG.breathHz * t);
  const glob = SIG.flicker * Math.sin(TAU * SIG.flickerHz * t) + SIG.drift * Math.sin(TAU * SIG.driftHz * t);
  const noise = opt.noise != null ? opt.noise : SIG.noise;
  for (let y = 0; y < h; y++) {
    const Y = (y + .5) / k;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, X = (x + .5) / k;
      let r = base[i * 3], g = base[i * 3 + 1], b = base[i * 3 + 2];
      const sk = skin[i];
      r += SIG.pulseR * pulse * sk; g += SIG.pulseG * pulse * sk;
      // torso (drawn over neck), with a soft edge, displaced upward by d
      const top = torsoTop(X) - d;
      const m = sig((Y - top) / TORSO_SOFT);
      if (m > 1e-4) {
        const sh = 1 - .1 * Math.abs(X - 64) / 64;
        r = r * (1 - m) + SHIRT[0] * sh * m; g = g * (1 - m) + SHIRT[1] * sh * m; b = b * (1 - m) + SHIRT[2] * sh * m;
      }
      r += glob + noise * gauss(); g += glob + noise * gauss(); b += glob + noise * gauss();
      out[i * 3] = clamp(Math.round(r), 0, 255); out[i * 3 + 1] = clamp(Math.round(g), 0, 255); out[i * 3 + 2] = clamp(Math.round(b), 0, 255);
    }
  }
}

// generator so the browser can build the clip in slices; node can just run it to the end
function* clipBuilder(seed) {
  const model = sceneModel(W, H), P = W * H;
  const frames = new Uint8Array(N * P * 3);
  const gauss = gaussFactory(rng32(seed || 20120701));
  for (let n = 0; n < N; n++) {
    renderFrame(model, n / FS, gauss, frames.subarray(n * P * 3, (n + 1) * P * 3));
    if (n % 10 === 9) yield (n + 1) / N;
  }
  return { w: W, h: H, n: N, fs: FS, P, frames, model };
}
function buildClipSync(seed) { const g = clipBuilder(seed); let r; do { r = g.next(); } while (!r.done); return r.value; }

// ---------- spatial pyramid (planar float images) ----------
const K5 = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
const refl = (i, n) => i < 0 ? -i : i >= n ? 2 * n - 2 - i : i;

function blurDown(src, w, h) {               // binomial blur then keep every other sample
  const w2 = w >> 1, h2 = h >> 1, tmp = new Float32Array(w2 * h), out = new Float32Array(w2 * h2);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x2 = 0; x2 < w2; x2++) {
      const x = x2 * 2;
      tmp[y * w2 + x2] = K5[0] * src[o + refl(x - 2, w)] + K5[1] * src[o + refl(x - 1, w)] + K5[2] * src[o + x] + K5[3] * src[o + refl(x + 1, w)] + K5[4] * src[o + refl(x + 2, w)];
    }
  }
  for (let y2 = 0; y2 < h2; y2++) {
    const y = y2 * 2;
    const r0 = refl(y - 2, h) * w2, r1 = refl(y - 1, h) * w2, r2 = y * w2, r3 = refl(y + 1, h) * w2, r4 = refl(y + 2, h) * w2;
    for (let x2 = 0; x2 < w2; x2++)
      out[y2 * w2 + x2] = K5[0] * tmp[r0 + x2] + K5[1] * tmp[r1 + x2] + K5[2] * tmp[r2 + x2] + K5[3] * tmp[r3 + x2] + K5[4] * tmp[r4 + x2];
  }
  return out;
}
function upsample(src, w, h) {               // (w,h) to (2w,2h): zero insertion then the same kernel times 2 per axis
  const W2 = w * 2, H2 = h * 2, tmp = new Float32Array(W2 * h), out = new Float32Array(W2 * H2);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let X = 0; X < W2; X++) {
      const j = X >> 1;
      tmp[y * W2 + X] = (X & 1) ? .5 * (src[o + j] + src[o + Math.min(j + 1, w - 1)])
        : .125 * src[o + (j > 0 ? j - 1 : 1)] + .75 * src[o + j] + .125 * src[o + (j < w - 1 ? j + 1 : w - 2)];
    }
  }
  for (let Y = 0; Y < H2; Y++) {
    const j = Y >> 1;
    if (Y & 1) {
      const a = j * W2, b = Math.min(j + 1, h - 1) * W2;
      for (let X = 0; X < W2; X++) out[Y * W2 + X] = .5 * (tmp[a + X] + tmp[b + X]);
    } else {
      const a = (j > 0 ? j - 1 : 1) * W2, b = j * W2, c = (j < h - 1 ? j + 1 : h - 2) * W2;
      for (let X = 0; X < W2; X++) out[Y * W2 + X] = .125 * tmp[a + X] + .75 * tmp[b + X] + .125 * tmp[c + X];
    }
  }
  return out;
}
// Laplacian pyramid: levels-1 band images plus the low-pass residual. Sum of expanded levels = input exactly.
function lapBuild(img, w, h, levels) {
  const bands = [], sizes = [];
  let g = img, cw = w, ch = h;
  for (let l = 0; l < levels - 1; l++) {
    const d = blurDown(g, cw, ch), u = upsample(d, cw >> 1, ch >> 1), b = new Float32Array(cw * ch);
    for (let i = 0; i < b.length; i++) b[i] = g[i] - u[i];
    bands.push(b); sizes.push([cw, ch]);
    g = d; cw >>= 1; ch >>= 1;
  }
  bands.push(g); sizes.push([cw, ch]);
  return { bands, sizes };
}
function lapCollapse(pyr, weights) {
  const L = pyr.bands.length;
  let [cw, ch] = pyr.sizes[L - 1];
  let acc = new Float32Array(pyr.bands[L - 1].length);
  const wTop = weights ? weights[L - 1] : 1;
  for (let i = 0; i < acc.length; i++) acc[i] = pyr.bands[L - 1][i] * wTop;
  for (let l = L - 2; l >= 0; l--) {
    const up = upsample(acc, cw, ch), b = pyr.bands[l], wl = weights ? weights[l] : 1;
    for (let i = 0; i < up.length; i++) up[i] += b[i] * wl;
    acc = up; [cw, ch] = pyr.sizes[l];
  }
  return acc;
}
const LEVELS = 5;
// representative spatial wavelength of each level in original pixels (ILLUSTRATIVE, technical.md): 4, 8, 16, 32, 64
const levelLambda = l => 4 * Math.pow(2, l);
// paper Sect. 4 step 4: alpha is attenuated below lambda_c, either forced to 0 or scaled down linearly
function levelAlphas(alpha, lambdaC, ramp, levels) {
  const out = [];
  for (let l = 0; l < (levels || LEVELS); l++) {
    const lam = levelLambda(l);
    out.push(lam >= lambdaC ? alpha : ramp ? alpha * lam / lambdaC : 0);
  }
  return out;
}

// ---------- temporal filters ----------
const binsIn = (lo, hi, n, fs) => { const out = []; for (let k = 1; k < n / 2; k++) { const f = k * fs / n; if (f >= lo - 1e-9 && f <= hi + 1e-9) out.push(k); } return out; };

// DFT bank: lazily computes bins k of every pixel series (Re, Im). The clip loops, so these bins are exact.
function DFTBank(frames, n, P) {
  const cache = new Map();
  const cosT = new Float64Array(n), sinT = new Float64Array(n);
  function bin(k) {
    let b = cache.get(k);
    if (b) return b;
    const re = new Float32Array(P), im = new Float32Array(P);
    for (let t = 0; t < n; t++) {
      const th = TAU * k * t / n, c = Math.cos(th), s = Math.sin(th), o = t * P;
      for (let p = 0; p < P; p++) { const v = frames[o + p]; re[p] += v * c; im[p] -= v * s; }
    }
    b = { re, im }; cache.set(k, b);
    return b;
  }
  // band-passed signal at frame t from a list of bins (ideal filter: gain 1 inside, 0 outside)
  function synth(t, ks, out) {
    out.fill(0);
    for (const k of ks) {
      const { re, im } = bin(k), th = TAU * k * t / n, c = 2 * Math.cos(th) / n, s = 2 * Math.sin(th) / n;
      for (let p = 0; p < P; p++) out[p] += re[p] * c - im[p] * s;
    }
    return out;
  }
  return { bin, synth, has: k => cache.has(k), cosT, sinT };
}

// IIR bandpass: difference of two first-order low-pass filters (cutoffs wh and wl), as in the paper.
const lpCoef = (fc, fs) => 1 - Math.exp(-TAU * fc / fs);
function iirResponse(f, lo, hi, fs) {   // complex response of LP(hi) - LP(lo) at frequency f
  const w = TAU * f / fs, c = Math.cos(w), s = Math.sin(w);
  const H = r => { const a = 1 - r, dr = 1 - a * c, di = a * s, m = dr * dr + di * di; return [r * dr / m, -r * di / m]; };
  const [hr, hi_] = H(lpCoef(hi, fs)), [lr, li] = H(lpCoef(lo, fs));
  return Math.hypot(hr - lr, hi_ - li);
}
function iir1D(x, lo, hi, fs, loops) {   // steady-state output on a looping signal
  const rh = lpCoef(hi, fs), rl = lpCoef(lo, fs), n = x.length, out = new Float64Array(n);
  let yh = x[0], yl = x[0];
  for (let L = 0; L < (loops || 3); L++) for (let t = 0; t < n; t++) {
    yh += rh * (x[t] - yh); yl += rl * (x[t] - yl); out[t] = yh - yl;
  }
  return out;
}
function dft1D(x) {      // returns {re, im} for k = 0..n/2
  const n = x.length, m = Math.floor(n / 2) + 1, re = new Float64Array(m), im = new Float64Array(m);
  for (let k = 0; k < m; k++) { let a = 0, b = 0; for (let t = 0; t < n; t++) { const th = TAU * k * t / n; a += x[t] * Math.cos(th); b -= x[t] * Math.sin(th); } re[k] = a; im[k] = b; }
  return { re, im };
}
function ampSpectrum(x) { const { re, im } = dft1D(x), n = x.length; return Array.from(re, (r, k) => (k === 0 ? 1 : 2) * Math.hypot(r, im[k]) / n); }
function ideal1D(x, lo, hi, fs) {
  const n = x.length, { re, im } = dft1D(x), ks = binsIn(lo, hi, n, fs), out = new Float64Array(n);
  for (const k of ks) for (let t = 0; t < n; t++) { const th = TAU * k * t / n; out[t] += 2 * (re[k] * Math.cos(th) - im[k] * Math.sin(th)) / n; }
  return out;
}

// ---------- the magnifier for an RGB clip ----------
// params: mode 'ideal' | 'iir', lo, hi (Hz), lambdaC (px), ramp (bool), chrom (0..1 chroma kept).
// Every stage (temporal filter, pyramid, per-level weights, YIQ chroma scaling) is linear, so the change
// is computed once with alpha = 1 and then scaled: frame(t, alpha) = original + alpha * unit(t).
function Magnifier(clip, bank) {
  const { w, h, n, P, frames } = clip, PP = P * 3;
  const B = new Float32Array(PP), planes = [new Float32Array(P), new Float32Array(P), new Float32Array(P)];
  const rgba = new Uint8ClampedArray(P * 4), amp = new Float32Array(PP);
  let prm = null, key = "", ks = [], unitKey = "", unitT = -1, outKey = "";
  let yh = null, yl = null, iirT = -1, snap = null, rh = 0, rl = 0;
  function set(p) {
    const k = [p.mode, p.lo, p.hi, p.lambdaC, p.ramp, p.chrom].join("|");
    if (k === key) return;
    const old = prm; prm = Object.assign({}, p); key = k;
    if (prm.mode === "ideal") ks = binsIn(prm.lo, prm.hi, n, clip.fs);
    else {
      rh = lpCoef(prm.hi, clip.fs); rl = lpCoef(prm.lo, clip.fs);
      if (!old || old.lo !== prm.lo || old.hi !== prm.hi || old.mode !== prm.mode) snap = null; // keep running state, drop snapshot
    }
  }
  function stepIIR(t) {
    const o = t * PP;
    for (let i = 0; i < PP; i++) { const x = frames[o + i]; yh[i] += rh * (x - yh[i]); yl[i] += rl * (x - yl[i]); }
    iirT = t;
  }
  function warm() {
    yh = new Float32Array(PP); yl = new Float32Array(PP);
    for (let i = 0; i < PP; i++) yh[i] = yl[i] = frames[i];
    for (let L = 0; L < 2; L++) for (let t = 0; t < n; t++) stepIIR(t);
    snap = [yh.slice(), yl.slice()];                 // steady state just after frame n-1
  }
  function iirTo(t) {
    if (!yh) warm();
    if (iirT === t) return;
    if (iirT === (t + n - 1) % n) { stepIIR(t); return; }
    if (!snap) warm();
    yh.set(snap[0]); yl.set(snap[1]); iirT = n - 1;
    for (let s = 0; s <= t; s++) stepIIR(s);
  }
  function bandpassed(t) {        // B(x, t), RGB interleaved
    if (prm.mode === "ideal") bank.synth(t, ks, B);
    else { iirTo(t); for (let i = 0; i < PP; i++) B[i] = yh[i] - yl[i]; }
    return B;
  }
  // change for alpha = 1: each pyramid level of B weighted by alpha_l / alpha, recombined
  function unit(t) {
    t = ((t % n) + n) % n;
    if (unitKey === key && unitT === t) return amp;
    bandpassed(t);
    const al = levelAlphas(1, prm.lambdaC, prm.ramp);
    for (let c = 0; c < 3; c++) {
      const pl = planes[c];
      for (let i = 0; i < P; i++) pl[i] = B[i * 3 + c];
      const r = lapCollapse(lapBuild(pl, w, h, LEVELS), al);
      for (let i = 0; i < P; i++) amp[i * 3 + c] = r[i];
    }
    const ck = prm.chrom == null ? 1 : prm.chrom;
    if (ck !== 1) {                                   // YIQ: attenuate I and Q of the added signal
      for (let i = 0; i < P; i++) {
        const r = amp[i * 3], g = amp[i * 3 + 1], b = amp[i * 3 + 2];
        const Y = .299 * r + .587 * g + .114 * b, I = (.596 * r - .274 * g - .322 * b) * ck, Q = (.211 * r - .523 * g + .312 * b) * ck;
        amp[i * 3] = Y + .956 * I + .621 * Q; amp[i * 3 + 1] = Y - .272 * I - .647 * Q; amp[i * 3 + 2] = Y - 1.106 * I + 1.703 * Q;
      }
    }
    unitKey = key; unitT = t;
    return amp;
  }
  function frame(t, alpha, out) {   // RGBA bytes of the magnified frame t (clamped to 0..255 like a display)
    t = ((t % n) + n) % n;
    const ok = key + "|" + t + "|" + alpha;
    if (!out && ok === outKey) return rgba;
    const o = t * PP, dst = out || rgba;
    if (alpha === 0) { for (let i = 0; i < P; i++) { dst[i * 4] = frames[o + i * 3]; dst[i * 4 + 1] = frames[o + i * 3 + 1]; dst[i * 4 + 2] = frames[o + i * 3 + 2]; dst[i * 4 + 3] = 255; } }
    else {
      const a = unit(t);
      for (let i = 0; i < P; i++) {
        dst[i * 4] = frames[o + i * 3] + alpha * a[i * 3]; dst[i * 4 + 1] = frames[o + i * 3 + 1] + alpha * a[i * 3 + 1];
        dst[i * 4 + 2] = frames[o + i * 3 + 2] + alpha * a[i * 3 + 2]; dst[i * 4 + 3] = 255;
      }
    }
    if (!out) outKey = ok;
    return dst;
  }
  function raw(t, out) { return frame(t, 0, out); }
  return { set, frame, unit, bandpassed, raw, get params() { return prm; }, get bins() { return ks; } };
}

// ---------- small grey clips (for the interlude panels and the big-motion ghost) ----------
function greyClip(w, h, n, fs, fn, seed, noise) {
  const P = w * h, frames = new Float32Array(n * P), gauss = gaussFactory(rng32(seed));
  for (let t = 0; t < n; t++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    frames[t * P + y * w + x] = Math.round(fn(x, y, t / fs) + (noise || 0) * gauss());
  return { w, h, n, fs, P, frames };
}
function greyMagnifier(clip, lo, hi) {
  const bank = DFTBank(clip.frames, clip.n, clip.P), ks = binsIn(lo, hi, clip.n, clip.fs);
  const B = new Float32Array(clip.P), out = new Float32Array(clip.P);
  return function (t, alpha, blurLevels) {
    t = ((t % clip.n) + clip.n) % clip.n;
    bank.synth(t, ks, B);
    let add = B;
    if (blurLevels) {             // spatially low-pass the change (coarse levels only)
      const pyr = lapBuild(B, clip.w, clip.h, blurLevels + 1), wts = pyr.bands.map((_, l) => l < blurLevels ? 0 : 1);
      add = lapCollapse(pyr, wts);
    }
    const o = t * clip.P;
    for (let p = 0; p < clip.P; p++) out[p] = clip.frames[o + p] + alpha * add[p];
    return out;
  };
}

const api = { FS, N, W, H, SIG, TAU, rng32, gaussFactory, sceneModel, renderFrame, torsoTop, TORSO_SOFT, clipBuilder, buildClipSync,
  blurDown, upsample, lapBuild, lapCollapse, LEVELS, levelLambda, levelAlphas, binsIn, DFTBank, lpCoef, iirResponse, iir1D,
  dft1D, ampSpectrum, ideal1D, Magnifier, greyClip, greyMagnifier, clamp };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.EVM = api;
})(typeof self !== "undefined" ? self : this);
