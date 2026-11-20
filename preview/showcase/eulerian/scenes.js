/* Scenes: one draw(env, p) per chapter. Pure functions of p, UI state and the clip clock.
   env: ctx, W, H, F (focus rect), phone, pal, ui, D (data), E (dsp), t, fi, keys (step centres in p), hit(). */
(function () {
"use strict";
const TAU = Math.PI * 2;
const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
const sm = x => { x = cl(x); return x * x * (3 - 2 * x); };
const seg = (p, a, b) => sm((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpR = (A, B, t) => ({ x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t), w: lerp(A.w, B.w, t), h: lerp(A.h, B.h, t) });
const FONT = { mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace', body: '"Public Sans", "Helvetica Neue", Arial, sans-serif', display: '"Bodoni Moda", Didot, Georgia, serif' };
// keys: step centres. around(e, i) gives a window for transitions between step i-1 and step i
const K = (e, i) => e.keys[Math.max(0, Math.min(e.keys.length - 1, i))];
const mid = (e, i) => (K(e, i - 1) + K(e, i)) / 2;
const into = (e, p, i, span) => seg(p, mid(e, i) - (span || .06), mid(e, i) + (span || .06));   // 0 -> 1 while step i arrives

function text(e, s, x, y, o) {
  o = o || {}; const g = e.ctx;
  let size = o.size || 13;
  g.font = `${o.weight || 400} ${size}px ${FONT[o.font || "mono"]}`;
  // keep every label inside the picture: shrink a little, then slide it in from the edge
  const al = o.align || "left", wd = g.measureText(s).width, lim = e.W - 12;
  if (wd > lim - 0) { size = Math.max(8.5, size * lim / wd); g.font = `${o.weight || 400} ${size}px ${FONT[o.font || "mono"]}`; }
  const w2 = g.measureText(s).width, x0 = al === "left" ? x : al === "right" ? x - w2 : x - w2 / 2;
  if (x0 + w2 > e.W - 6) x -= x0 + w2 - (e.W - 6); else if (x0 < 6) x += 6 - x0;
  g.textAlign = al; g.textBaseline = o.base || "alphabetic";
  g.fillStyle = o.color || e.pal.c("ink2");
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (o.halo) { g.lineWidth = 4; g.strokeStyle = e.pal.c("bg", .85); g.lineJoin = "round"; g.strokeText(s, x, y); }
  g.fillText(s, x, y);
  if (o.alpha != null) g.globalAlpha /= o.alpha || 1;
  return g.measureText(s).width;
}
function withAlpha(e, a, fn) { if (a <= 0.001) return; const g = e.ctx; g.save(); g.globalAlpha *= a; fn(); g.restore(); }
function line(e, pts, color, wd, dash) {
  const g = e.ctx; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
  g.strokeStyle = color; g.lineWidth = wd || 1.5; g.lineJoin = "round"; g.lineCap = "round"; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]);
}
function arrow(e, x1, y1, x2, y2, color, wd) {
  const g = e.ctx, a = Math.atan2(y2 - y1, x2 - x1), hs = 7 + (wd || 1.5) * 1.5;
  line(e, [[x1, y1], [x2, y2]], color, wd || 1.5);
  g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - hs * Math.cos(a - .45), y2 - hs * Math.sin(a - .45)); g.lineTo(x2 - hs * Math.cos(a + .45), y2 - hs * Math.sin(a + .45)); g.closePath(); g.fillStyle = color; g.fill();
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
// a plot frame: maps data to pixels, draws a baseline and ticks
function frame(e, r, o) {
  const X = v => r.x + (v - o.x0) / (o.x1 - o.x0) * r.w, Y = v => r.y + r.h - (v - o.y0) / (o.y1 - o.y0) * r.h;
  const g = e.ctx;
  if (o.axis !== false) {
    g.strokeStyle = e.pal.c("rule"); g.lineWidth = 1; g.beginPath(); g.moveTo(r.x, r.y + r.h + .5); g.lineTo(r.x + r.w, r.y + r.h + .5); g.stroke();
    (o.xt || []).forEach(v => { text(e, o.xf ? o.xf(v) : String(v), X(v), r.y + r.h + 17, { size: 12, align: "center", color: e.pal.c("ink3") }); });
    if (o.xl) text(e, o.xl, r.x + r.w, r.y + r.h + 34, { size: 12, align: "right", color: e.pal.c("ink3") });
    if (o.yl) text(e, o.yl, r.x, r.y - 8, { size: 12, color: e.pal.c("ink3") });
  }
  return { X, Y };
}
function series(e, m, xs, ys, color, wd, n) {
  const pts = []; const N = n == null ? ys.length : n;
  for (let i = 0; i < N; i++) pts.push([m.X(xs(i)), m.Y(ys[i])]);
  line(e, pts, color, wd);
}

// ---------- drawing the clip ----------
const CW = window.EVM.W;                 // clip size in pixels
const fc = document.createElement("canvas"); fc.width = fc.height = CW;
const fctx = fc.getContext("2d"); const img = fctx.createImageData(CW, CW);
function putRGBA(rgba, w, h, matte) {
  if (fc.width !== w || fc.height !== h) { fc.width = w; fc.height = h; }
  const id = (w === CW && h === CW) ? img : fctx.createImageData(w, h);
  id.data.set(rgba);
  if (matte) { const d = id.data; for (let i = 0; i < matte.length; i++) d[i * 4 + 3] = matte[i] * 255; }
  fctx.putImageData(id, 0, 0); return fc;
}
function vignette(e, r, f, color) {      // feather the picture into the page: the video has no frame
  if (!f) return;
  const g = e.ctx; g.save(); g.translate(r.x + r.w / 2, r.y + r.h / 2); g.scale(r.w / 2, r.h / 2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  const bg = color || e.pal.bg;
  gr.addColorStop(0, `rgba(${bg},0)`); gr.addColorStop(Math.max(0, 1 - f), `rgba(${bg},0)`);
  gr.addColorStop(Math.max(0, 1 - f * .45), `rgba(${bg},.55)`); gr.addColorStop(1, `rgba(${bg},1)`);
  g.fillStyle = gr; g.fillRect(-1.03, -1.03, 2.06, 2.06); g.restore();
}
function drawRGBA(e, rgba, r, o) {
  o = o || {}; const g = e.ctx, w = o.w || CW, h = o.h || CW;
  const c = putRGBA(rgba, w, h, o.matte ? e.D.clip.model.fg : null);
  g.save(); if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.imageSmoothingEnabled = !o.pixel; g.imageSmoothingQuality = "high";
  if (o.clip) { g.beginPath(); g.rect(o.clip.x, o.clip.y, o.clip.w, o.clip.h); g.clip(); }
  const s = o.src || { x: 0, y: 0, w, h };
  g.drawImage(c, s.x, s.y, s.w, s.h, r.x, r.y, r.w, r.h);
  g.restore();
  if (o.feather) vignette(e, r, o.feather);
}
function clipFrame(e, alpha, mag) {        // RGBA of frame e.fi, magnified by alpha with the given magnifier
  const m = mag || e.D.mag.pulse; return m.frame(e.fi, alpha || 0);
}
function waiting(e, r) {
  text(e, "preparing the synthetic clip " + Math.round(e.D.progress * 100) + "%", r.x + r.w / 2, r.y + r.h / 2, { size: 13, align: "center", color: e.pal.c("ink3") });
}
function square(e, cx, cy, s) { return { x: cx - s / 2, y: cy - s / 2, w: s, h: s }; }
// the big face position, shared by several chapters so cuts line up
function heroRect(e, scale) {        // large, anchored to the bottom of the picture so the bust rises out of the page
  const F = e.F, k = scale || 1;
  const s = (e.phone ? Math.min(e.W * 1.02, e.H * 1.08) : Math.min(e.W * .6, e.H * 1.12)) * k;
  const cx = e.phone ? e.W / 2 : F.x + F.w * .5;
  return { x: cx - s / 2, y: e.H - s * .97, w: s, h: s };
}
const clipToRect = (r, x, y) => ({ x: r.x + (x + .5) / CW * r.w, y: r.y + (y + .5) / CW * r.h });
const rectToClip = (r, X, Y) => ({ x: Math.max(0, Math.min(CW - 1, Math.floor((X - r.x) / r.w * CW))), y: Math.max(0, Math.min(CW - 1, Math.floor((Y - r.y) / r.h * CW))) });

// ---------- deterministic noise for the illustrative 1D signals ----------
function noiseSeq(seed, n, sd) { const g = window.EVM.gaussFactory(window.EVM.rng32(seed)); return Array.from({ length: n }, () => sd * g()); }
// chapter 4/5/6 pixel: drift (0.1 Hz, 1), breathing (0.3 Hz, 1.0), heart (1 Hz, 0.5), flicker (2.5 Hz, 0.4), noise sigma 2 (ILLUSTRATIVE, technical.md)
const PIX = (() => {
  const n = 300, fs = 30, nz = noiseSeq(7, n, 2);
  const comp = { drift: [0.1, 1.0], breath: [0.3, 1.0], heart: [1.0, 0.5], flicker: [2.5, 0.4] };
  const x = Array.from({ length: n }, (_, t) => { let v = 190 + nz[t]; for (const k in comp) v += comp[k][1] * Math.sin(TAU * comp[k][0] * t / fs); return v; });
  return { n, fs, x, comp };
})();

const SCENES = [];

// ===== 0. cold open =====
SCENES[0] = {
  desc: "A synthetic face and chest on a dark page, apparently still. At the end of the chapter the hidden pulse is amplified and the face flushes with each heartbeat.",
  anim: true,
  draw(e, p) {
    const r = heroRect(e, lerp(.86, .94, p));
    if (!e.D.ready) { waiting(e, r); return; }
    const auto = into(e, p, 2, .08);
    const m = e.ui.coldView === "filter" ? 1 : e.ui.coldView === "camera" ? 0 : auto;
    drawRGBA(e, clipFrame(e, 50 * m), r, { matte: true });
    const y = Math.min(e.H - 18, r.y + r.h * .97);
    withAlpha(e, 1 - m, () => text(e, "Can you see a pulse?", r.x + r.w / 2, y, { size: 15, align: "center", color: e.pal.c("ink2"), halo: true }));
    withAlpha(e, m, () => text(e, "same video · pulse band × 50", r.x + r.w / 2, y, { size: 15, align: "center", color: e.pal.c("skin"), halo: true }));
    text(e, `30 fps · frame ${String(e.fi + 1).padStart(3, "0")} of 300 · synthetic`, r.x + r.w / 2, Math.max(e.F.y + 4, r.y + r.h * .1), { size: 12, align: "center", color: e.pal.c("ink3"), halo: true });
  },
};

// ===== 1. a face that seems still =====
SCENES[1] = {
  desc: "The face, then a swatch cut from its forehead beside a grey ruler: its green value flickers between 172 and 173, a difference of 1 in 255. Then a ghost of the same video with the change multiplied.",
  anim: true,
  draw(e, p) {
    const hero = heroRect(e, .94);
    if (!e.D.ready) { waiting(e, hero); return; }
    const F = e.F, zin = into(e, p, 2, .07), zout = into(e, p, 3, .07), z = zin * (1 - zout);
    // camera move: the face slides aside to make room for the swatch and ruler
    const side = e.phone ? square(e, F.x + F.w * .26, F.y + F.h * .38, Math.min(F.w * .5, F.h * .72)) : square(e, F.x + F.w * .27, F.y + F.h * .5, Math.min(F.w * .52, F.h * .7));
    const r = lerpR(hero, side, z);
    const ghost = zout;
    drawRGBA(e, clipFrame(e, 0), r, { matte: true });
    if (ghost > 0) withAlpha(e, ghost * .6, () => drawRGBA(e, clipFrame(e, e.ui.ghostAlpha), r, { matte: true }));
    // forehead swatch and the grey ruler
    const fp = clipToRect(r, e.D.ready ? e.D.clip.model.L.forehead.x : 96, e.D.ready ? e.D.clip.model.L.forehead.y : 57);
    withAlpha(e, 1 - zin, () => text(e, "Can you see a pulse?", r.x + r.w / 2, Math.min(e.H - 18, r.y + r.h * .97), { size: 15, align: "center", color: e.pal.c("ink2"), halo: true }));
    if (z > 0.01) withAlpha(e, z, () => {
      const g = e.ctx, base = e.D.clip.model.base, LF = e.D.clip.model.L.forehead, i = (LF.y * CW + LF.x) * 3;
      const pulse = Math.sin(TAU * e.t);
      const G = Math.round(base[i + 1] + 0.5 * pulse), R = Math.round(base[i] + .25 * pulse), B = Math.round(base[i + 2]);
      const sx = e.phone ? F.x + F.w * .56 : F.x + F.w * .58, sw = e.phone ? F.w * .4 : F.w * .36, sy = e.phone ? F.y + F.h * .06 : F.y + F.h * .14, sh = e.phone ? F.h * .36 : F.h * .3;
      g.strokeStyle = e.pal.c("ink3"); g.lineWidth = 1; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(fp.x, fp.y); g.lineTo(sx, sy + sh / 2); g.stroke(); g.setLineDash([]);
      g.strokeRect(fp.x - 6, fp.y - 6, 12, 12);
      g.fillStyle = `rgb(${R},${G},${B})`; g.fillRect(sx, sy, sw, sh);
      text(e, `forehead pixel · R ${R}  G ${G}  B ${B}`, sx, sy - 10, { size: 12, color: e.pal.c("ink2") });
      // ruler 0..255 with a zoomed inset
      const ry = sy + sh + (e.phone ? 30 : 46), rw = sw;
      const gr = g.createLinearGradient(sx, 0, sx + rw, 0); gr.addColorStop(0, "#000"); gr.addColorStop(1, "#fff");
      g.fillStyle = gr; g.fillRect(sx, ry, rw, 10);
      text(e, "0", sx, ry + 26, { size: 12, color: e.pal.c("ink3") }); text(e, "255", sx + rw, ry + 26, { size: 12, align: "right", color: e.pal.c("ink3") });
      const mx = sx + rw * (base[i + 1] + .5) / 255;
      g.fillStyle = e.pal.c("skin"); g.fillRect(mx - 1, ry - 6, 2, 22);
      const g0 = Math.round(base[i + 1]) - 2, iy = ry + (e.phone ? 40 : 52), steps = [0, 1, 2, 3, 4, 5].map(k => g0 + k), cw = rw / steps.length;
      steps.forEach((v, k) => {
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(sx + k * cw, iy, cw - 2, 26);
        const on = v === G;
        if (on) { g.strokeStyle = e.pal.c("skin"); g.lineWidth = 3; g.strokeRect(sx + k * cw - 1, iy - 1, cw, 28); }
        text(e, String(v), sx + k * cw + cw / 2 - 1, iy + 44, { size: 12, align: "center", color: on ? e.pal.c("skin") : e.pal.c("ink3"), weight: on ? 500 : 400 });
      });
      line(e, [[mx, ry + 16], [sx + cw * 2, iy - 2]], e.pal.c("ink3"), 1, [2, 3]); line(e, [[mx, ry + 16], [sx + cw * 4, iy - 2]], e.pal.c("ink3"), 1, [2, 3]);
      text(e, "difference of 1 in 255, about 0.4 percent", sx, iy + (e.phone ? 66 : 74), { size: 13, color: e.pal.c("ink") });
    });
    withAlpha(e, ghost, () => text(e, `Same video. Different numbers. × ${e.ui.ghostAlpha}`, r.x + r.w / 2, Math.min(e.H - 18, r.y + r.h * .97), { size: 15, align: "center", color: e.pal.c("skin"), halo: true }));
  },
};

// ===== 2. interlude: before 2012 =====
SCENES[2] = {
  desc: "A flat patch of skin-coloured pixels beside a pulse-rate counter, and an empty panel asking where the blood is. Then a shape tracked point by point between frames, until one track goes wrong and a smear tears away.",
  anim: true,
  draw(e, p) {
    const F = e.F, g = e.ctx, a = 1 - into(e, p, 3, .07), b = into(e, p, 3, .07);
    withAlpha(e, a, () => {
      // patch of skin pixels, each a little noisy, with the read-out rate
      const cols = 9, rows = 7, s = Math.min(F.w * (e.phone ? .055 : .05), F.h * .07), px = F.x + F.w * (e.phone ? .04 : .06), py = F.y + F.h * .2;
      const rnd = window.EVM.rng32(1000 + e.fi);
      const pulse = Math.sin(TAU * e.t);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const n = (rnd() - .5) * 6, G = 172 + .5 * pulse + n, R = 224 + n, B = 150 + n;
        g.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`; g.fillRect(px + x * s, py + y * s, s - 1, s - 1);
      }
      text(e, "skin pixels, averaged", px, py - 12, { size: 12, color: e.pal.c("ink3") });
      const cx = px + cols * s + 30, beat = Math.max(0, Math.sin(TAU * e.t)) ** 8;
      text(e, "rate", cx, py + 18, { size: 12, color: e.pal.c("ink3") });
      text(e, "60", cx, py + 68, { size: 50, font: "display", weight: 700, color: e.pal.c("ink") });
      text(e, "bpm", cx + 66, py + 68, { size: 14, color: e.pal.c("ink2") });
      g.beginPath(); g.arc(cx + 8, py + 92, 5 + 3 * beat, 0, TAU); g.fillStyle = e.pal.c("heart"); g.fill();
      text(e, "one number (illustrative)", cx, py + 124, { size: 12, color: e.pal.c("ink3") });
      // the empty panel
      const gx = e.phone ? F.x + F.w * .04 : F.x + F.w * .06, gy = py + rows * s + 40, gw = e.phone ? F.w * .9 : F.w * .8, gh = Math.min(F.h * .32, F.y + F.h - gy - 10);
      g.setLineDash([5, 6]); g.strokeStyle = e.pal.c("ink3"); g.lineWidth = 1.2; rrect(g, gx, gy, gw, gh, 14); g.stroke(); g.setLineDash([]);
      text(e, "where is the blood?", gx + gw / 2, gy + gh / 2 + 6, { size: 16, align: "center", color: e.pal.c("ink2"), font: "display", weight: 500 });
      const two = into(e, p, 2, .07);
      withAlpha(e, two, () => {
        text(e, "pulse from video: a rate", gx, gy + gh + 22, { size: 12, color: e.pal.c("heart") });
        text(e, "motion magnification: by tracking (2005)", gx + gw, gy + gh + 22, { size: 12, align: "right", color: e.pal.c("sway") });
      });
    });
    if (b > 0.01) withAlpha(e, b, () => lagrangian(e, p));
  },
};
function lagrangian(e, p) {
  // a blob tracked across three frames; arrows are the estimated motion; one goes wrong near an occluding edge
  const F = e.F, g = e.ctx, err = e.ui.trackErr, n = 16;
  const cx0 = F.x + F.w * (e.phone ? .2 : .2), cy = F.y + F.h * .45, R = Math.min(F.w, F.h) * (e.phone ? .14 : .13);
  const step = F.w * (e.phone ? .3 : .3), tear = into(e, p, 4, .08);
  const rnd = window.EVM.rng32(99);
  const jit = Array.from({ length: 3 * n }, () => [rnd() - .5, rnd() - .5]);
  const pts = k => Array.from({ length: n }, (_, i) => {
    const a = i / n * TAU, rr = R * (1 + .18 * Math.sin(3 * a + k * .4));
    return [cx0 + k * step + rr * Math.cos(a), cy + rr * .8 * Math.sin(a) + k * 6];
  });
  // occluder: a bar crossing the third frame
  const ox = cx0 + 2 * step - R * .2;
  for (let k = 0; k < 3; k++) {
    const P = pts(k).map((q, i) => {
      if (k === 0) return q;
      const j = jit[k * n + i], bad = (k === 2 && i >= 2 && i <= 5) ? tear * err : 0;
      return [q[0] + j[0] * 8 * err + bad * (R * 1.6) * (1 + (i - 2) * .25), q[1] + j[1] * 8 * err + bad * R * .5 * (i - 3)];
    });
    g.globalAlpha = .35 + .3 * k;
    line(e, P.concat([P[0]]), e.pal.c("sway"), 1.4);
    P.forEach(q => { g.beginPath(); g.arc(q[0], q[1], 3.2, 0, TAU); g.fillStyle = e.pal.c("sway"); g.fill(); });
    g.globalAlpha = 1;
    text(e, `frame ${k + 1}`, cx0 + k * step, cy + R * 1.55, { size: 12, align: "center", color: e.pal.c("ink3") });
    if (k > 0) {
      const prev = pts(k - 1);
      [0, 4, 8, 12, 3].forEach(i => {
        const q = P[i], bad = k === 2 && i === 3 && tear * err > .15, pr = prev[i];
        const mx = (pr[0] + q[0]) / 2, my = (pr[1] + q[1]) / 2 - 18;
        g.beginPath(); g.moveTo(pr[0], pr[1]); g.quadraticCurveTo(mx, my, q[0], q[1]);
        g.strokeStyle = bad ? e.pal.c("heart") : e.pal.c("ink3", .7); g.lineWidth = bad ? 2 : 1; g.setLineDash(bad ? [] : [3, 3]); g.stroke(); g.setLineDash([]);
        const a = Math.atan2(q[1] - my, q[0] - mx); g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] - 8 * Math.cos(a - .4), q[1] - 8 * Math.sin(a - .4)); g.lineTo(q[0] - 8 * Math.cos(a + .4), q[1] - 8 * Math.sin(a + .4)); g.fillStyle = bad ? e.pal.c("heart") : e.pal.c("ink3"); g.fill();
      });
    }
  }
  g.fillStyle = e.pal.c("ink", .14); g.fillRect(ox, cy - R * 1.4, R * .35, R * 2.8);
  text(e, "occluding edge", ox + R * .17, cy - R * 1.5, { size: 12, align: "center", color: e.pal.c("ink3") });
  withAlpha(e, tear * (err > .15 ? 1 : 0), () => text(e, "a tracking mistake tears the shape", F.x + F.w / 2, cy + R * 1.95, { size: e.phone ? 12 : 13, align: "center", color: e.pal.c("heart") }));
  text(e, e.phone ? "Lagrangian: track each point, then push it" : "Lagrangian: estimate where each point moved, then push it further", F.x + F.w / 2, F.y + F.h * .08, { size: e.phone ? 12 : 13, align: "center", color: e.pal.c("ink2") });
}

// ===== 3. follow it, or watch here =====
SCENES[3] = {
  desc: "Left, a camera follows a bird; right, a fixed square watches it pass. Then the square becomes a probe on the synthetic face, and the plot below is that pixel's green value over five seconds. Finally a grid of probes, each with its own trace.",
  anim: true,
  draw(e, p) {
    const F = e.F, a = 1 - into(e, p, 3, .08), b = into(e, p, 3, .08);
    if (a > .01) withAlpha(e, a, () => birds(e, p));
    if (b > .01) withAlpha(e, b, () => probeScene(e, p, into(e, p, 4, .07)));
  },
};
function birdPos(u) { return { x: u, y: .5 + .18 * Math.sin(u * TAU * .9) }; }
function drawBird(e, x, y, s, color) {
  const g = e.ctx; g.beginPath(); g.moveTo(x - s, y - s * .35); g.quadraticCurveTo(x - s * .4, y - s * .5, x, y + s * .1); g.quadraticCurveTo(x + s * .4, y - s * .5, x + s, y - s * .35);
  g.strokeStyle = color; g.lineWidth = 2.6; g.lineCap = "round"; g.stroke();
}
function birds(e, p) {
  const F = e.F, g = e.ctx, gap = 24;
  const pw = e.phone ? F.w : (F.w - gap) / 2, ph = e.phone ? (F.h - gap) / 2 : F.h * .62;
  const A = { x: F.x, y: F.y + (e.phone ? 0 : F.h * .14), w: pw, h: ph }, B = e.phone ? { x: F.x, y: A.y + ph + gap, w: pw, h: ph } : { x: F.x + pw + gap, y: A.y, w: pw, h: ph };
  const u = (e.t / 4) % 1;              // the bird's journey loops every 4 s
  const pos = birdPos(u);
  // Follow it: the frame moves with the bird, so clouds stream past
  [A, B].forEach(R => { g.fillStyle = e.pal.c("ink", .04); rrect(g, R.x, R.y, R.w, R.h, 16); g.fill(); });
  g.save(); rrect(g, A.x, A.y, A.w, A.h, 16); g.clip();
  for (let i = 0; i < 6; i++) { const cx = A.x + ((i * .23 - u * 1.4) % 1 + 1) % 1 * A.w * 1.2 - A.w * .1, cy = A.y + A.h * (.2 + .13 * (i % 4)); g.fillStyle = e.pal.c("ink3", .25); g.beginPath(); g.ellipse(cx, cy, 26, 7, 0, 0, TAU); g.fill(); }
  const trail = []; for (let k = 0; k < 30; k++) { const q = birdPos(u - k * .01); trail.push([A.x + A.w / 2 - (pos.x - q.x) * A.w, A.y + A.h * (q.y - pos.y + .5)]); }
  line(e, trail, e.pal.c("sway", .5), 2, [3, 4]);
  drawBird(e, A.x + A.w / 2, A.y + A.h / 2, 18, e.pal.c("sway"));
  g.restore();
  // Watch here: a fixed square; the bird passes through it
  g.save(); rrect(g, B.x, B.y, B.w, B.h, 16); g.clip();
  const bx = B.x + B.w * pos.x, by = B.y + B.h * pos.y;
  drawBird(e, bx, by, 18, e.pal.c("ink2"));
  const sq = { x: B.x + B.w * .55, y: B.y + B.h * .42, w: 44, h: 44 };
  const inside = bx > sq.x - 12 && bx < sq.x + sq.w + 12 && by > sq.y - 10 && by < sq.y + sq.h + 10;
  g.strokeStyle = e.pal.c("skin"); g.lineWidth = inside ? 3.5 : 2; g.strokeRect(sq.x, sq.y, sq.w, sq.h);
  g.restore();
  text(e, "Follow it · Lagrangian", A.x + 14, A.y + 26, { size: 13, color: e.pal.c("ink") });
  text(e, "Watch here · Eulerian", B.x + 14, B.y + 26, { size: 13, color: e.pal.c("ink") });
  text(e, inside ? "something passes" : "nothing here", sq.x + sq.w / 2, sq.y + sq.h + 20, { size: 12, align: "center", color: e.pal.c(inside ? "skin" : "ink3") });
}
function probeScene(e, p, grid) {
  const F = e.F, g = e.ctx;
  const s = e.phone ? Math.min(F.w * .52, F.h * .56) : Math.min(F.w * .46, F.h * .56);
  const face = { x: F.x + (e.phone ? 0 : F.w * .02), y: F.y, w: s, h: s };
  const pr = e.phone ? { x: F.x + 34, y: face.y + s + 34, w: F.w - 40, h: F.h - s - 66 } : { x: F.x + 44, y: face.y + s + 44, w: F.w - 60, h: F.h - s - 84 };
  if (!e.D.ready) { waiting(e, face); return; }
  drawRGBA(e, clipFrame(e, 0), face, { matte: true });
  e.hit(face, "probe", { cursor: "crosshair", move: (x, y, r) => { const q = rectToClip(r, x, y); e.ui.probe = q; } });
  const pb = e.ui.probe, q = clipToRect(face, pb.x, pb.y), ps = Math.max(8, face.w / CW * 6);
  const ser = e.D.series(pb.x, pb.y, 1), n = 150;
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < 300; i++) { lo = Math.min(lo, ser[i]); hi = Math.max(hi, ser[i]); }
  const mid = (lo + hi) / 2, half = Math.max(6, (hi - lo) / 2 + 1);
  const m = frame(e, pr, { x0: 0, x1: 5, y0: mid - half, y1: mid + half, xt: [0, 1, 2, 3, 4, 5], xf: v => v + " s", yl: `green value of pixel (${pb.x}, ${pb.y}) · 30 samples a second` });
  text(e, String(Math.round(mid + half)), pr.x - 8, pr.y + 10, { size: 11, align: "right", color: e.pal.c("ink3") });
  text(e, String(Math.round(mid - half)), pr.x - 8, pr.y + pr.h, { size: 11, align: "right", color: e.pal.c("ink3") });
  const now = e.fi % n;
  const pts = []; for (let i = 0; i < n; i++) pts.push([m.X(i / 30), m.Y(ser[i])]);
  line(e, pts, e.pal.c("ink2", .5), 1);
  for (let i = 0; i < n; i++) { g.beginPath(); g.arc(pts[i][0], pts[i][1], i === now ? 4.5 : 1.8, 0, TAU); g.fillStyle = i === now ? e.pal.c("skin") : e.pal.c("ink"); g.fill(); }
  // probe line from the pixel down to the plot
  g.strokeStyle = e.pal.c("skin"); g.lineWidth = 2; g.strokeRect(q.x - ps / 2, q.y - ps / 2, ps, ps);
  line(e, [[q.x, q.y + ps / 2], [q.x, pr.y - 22], [pts[now][0], pr.y - 22], [pts[now][0], pts[now][1]]], e.pal.c("skin", .55), 1, [3, 3]);
  // grid of probes with sparklines
  if (grid > .01) withAlpha(e, grid, () => {
    const G = e.phone ? 3 : 5;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const FB = e.D.clip.model.L.face, cx = Math.round(FB[0] + 8 + i * (FB[2] - FB[0] - 16) / (G - 1)), cy = Math.round(FB[1] + 4 + j * (FB[3] - FB[1] - 14) / (G - 1)), c = clipToRect(face, cx, cy), sr = e.D.series(cx, cy, 1);
      g.strokeStyle = e.pal.c("skin", .9); g.lineWidth = 1; g.strokeRect(c.x - 3, c.y - 3, 6, 6);
      let a = 0; for (let k = 0; k < 60; k++) a += sr[k]; a /= 60;
      const sp = []; for (let k = 0; k < 60; k++) sp.push([c.x + 5 + k * .42 * face.w / 300, c.y - (sr[k] - a) * .9]);
      line(e, sp, e.pal.c("bg", .9), 2.2); line(e, sp, e.pal.c("skin"), 1);
    }
    if (e.phone) { text(e, "One pixel =", face.x + face.w + 14, face.y + face.h * .45, { size: 14, color: e.pal.c("ink"), font: "body", weight: 500 }); text(e, "one signal over time.", face.x + face.w + 14, face.y + face.h * .45 + 20, { size: 14, color: e.pal.c("ink"), font: "body", weight: 500 }); }
    else text(e, "One pixel = one signal over time.", face.x + face.w + 18, face.y + face.h * .5, { size: 15, color: e.pal.c("ink"), font: "body", weight: 500 });
  });
}

// ===== 4. every signal is waves =====
const WAVES = [{ f: 0.3, A: 1.5 }, { f: 1.0, A: 1.0 }, { f: 2.0, A: .5 }, { f: 3.7, A: .25 }];
const ORDER = [1, 0, 2, 3];      // technical.md: 1 Hz first, then 0.3, 2.0, 3.7
function waveAmounts(e, p) {
  const k1 = K(e, 1), k2a = mid(e, 2), k2 = K(e, 2), k2b = (K(e, 2) + K(e, 3)) / 2;
  const starts = [k1 - .07, k2a + .01, (k2a + k2) / 2 + .02, (k2 + k2b) / 2];
  const am = [0, 0, 0, 0];
  ORDER.forEach((wi, j) => { am[wi] = seg(p, starts[j], starts[j] + .05) * (e.ui.sines[wi] ? 1 : 0); });
  return am;
}
SCENES[4] = {
  desc: "Sine waves are added one at a time, drawn by rotating circles, and their sum gets more complicated. Below, each wave appears as a bar in the spectrum at its frequency, with height equal to its amplitude.",
  anim: true,
  draw(e, p) {
    const F = e.F, g = e.ctx, am = waveAmounts(e, p), newest = ORDER.reduce((a, wi) => am[wi] > .01 && am[wi] < .99 ? wi : a, -1);
    const circW = e.phone ? F.w * .26 : F.w * .22;
    const tr = { x: F.x + circW + 20, y: F.y + F.h * (e.phone ? .06 : .08), w: F.w - circW - 30, h: F.h * (e.phone ? .34 : .38) };
    const sr = { x: F.x + 36, y: F.y + F.h * (e.phone ? .62 : .6), w: F.w - 50, h: F.h * (e.phone ? .26 : .28) };
    const m = frame(e, tr, { x0: 0, x1: 5, y0: -3.4, y1: 3.4, xt: [0, 1, 2, 3, 4, 5], xf: v => v + " s", yl: "time view" });
    const sum = t => WAVES.reduce((s, w, i) => s + am[i] * w.A * Math.sin(TAU * w.f * t), 0);
    const N = 400;
    // thin components, thick sum
    WAVES.forEach((w, i) => { if (am[i] < .01) return; const pts = []; for (let k = 0; k <= N; k++) { const t = k / N * 5; pts.push([m.X(t), m.Y(am[i] * w.A * Math.sin(TAU * w.f * t))]); } line(e, pts, e.pal.c(i === newest ? "skin" : "ink3", i === newest ? .9 : .55), i === newest ? 1.6 : 1); });
    const pts = []; for (let k = 0; k <= N; k++) { const t = k / N * 5; pts.push([m.X(t), m.Y(sum(t))]); }
    line(e, pts, e.pal.c("ink"), 2.6);
    // rotating circles (phasors) whose tip height is the sum at the moving cursor
    const tau = e.t % 5, cx0 = F.x + circW * .5, cy0 = m.Y(0);
    let x = cx0, y = cy0; const sc = (tr.h / 2) / 3.4;
    const tipTrace = [];
    ORDER.forEach(wi => {
      const w = WAVES[wi], rr = am[wi] * w.A * sc; if (rr < .5) return;
      g.beginPath(); g.arc(x, y, rr, 0, TAU); g.strokeStyle = e.pal.c("ink3", .5); g.lineWidth = 1; g.stroke();
      const ang = TAU * w.f * tau, nx = x + rr * Math.cos(ang), ny = y - rr * Math.sin(ang);
      line(e, [[x, y], [nx, ny]], e.pal.c(wi === newest ? "skin" : "ink2"), 1.6); x = nx; y = ny; tipTrace.push([x, y]);
    });
    const cxp = m.X(tau);
    line(e, [[x, y], [cxp, m.Y(sum(tau))]], e.pal.c("skin", .6), 1, [3, 3]);
    g.beginPath(); g.arc(cxp, m.Y(sum(tau)), 4.5, 0, TAU); g.fillStyle = e.pal.c("skin"); g.fill();
    // spectrum bars
    const sm_ = frame(e, sr, { x0: 0, x1: 5, y0: 0, y1: 1.7, xt: [0, 1, 2, 3, 4, 5], xf: v => v + " Hz", yl: "frequency view · amplitude" });
    const bw = Math.max(6, sr.w / 60);
    WAVES.forEach((w, i) => {
      const hgt = am[i] * w.A, hov = e.ui.specHover && Math.abs(e.ui.specHover.f - w.f) < .2;
      g.fillStyle = e.pal.c(i === newest || hov ? "skin" : "ink"); g.fillRect(sm_.X(w.f) - bw / 2, sm_.Y(hgt), bw, sr.y + sr.h - sm_.Y(hgt));
      if (am[i] > .5) text(e, `${w.f} Hz · ${w.A}`, sm_.X(w.f), sm_.Y(hgt) - 8, { size: 12, align: "center", color: e.pal.c("ink2") });
    });
    e.hit(sr, "spec", { cursor: "pointer", move: (x) => { e.ui.specHover = { f: (x - sr.x) / sr.w * 5 }; } });
    const lab = into(e, p, 4, .06);
    withAlpha(e, lab, () => {
      const ax = e.phone ? F.x + F.w - 8 : F.x + 8, ay1 = tr.y + tr.h + 30, ay2 = sr.y - 26;
      if (!e.phone) { arrow(e, F.x + 14, (ay1 + ay2) / 2 - 4, F.x + 14, ay1, e.pal.c("skin"), 1.5); arrow(e, F.x + 14, (ay1 + ay2) / 2 + 4, F.x + 14, ay2, e.pal.c("skin"), 1.5); }
      text(e, e.phone ? "↕ same information" : "same information", e.phone ? F.x + F.w - 4 : F.x + 26, e.phone ? sr.y - 30 : (ay1 + ay2) / 2 + 5, { size: 13, color: e.pal.c("skin"), align: e.phone ? "right" : "left" });
      void ax;
    });
    if (!e.phone) text(e, "s(t) = Σ A_k sin(2π f_k t + phase_k)", tr.x + tr.w, tr.y + tr.h + 36, { size: 12, align: "right", color: e.pal.c("ink3") });
  },
};

// ===== 5. sorting signals by frequency =====
const SPEC = (() => window.EVM.ampSpectrum(PIX.x))();
const REG = [
  { key: "drift", f0: 0, f1: .1, col: "ink3", label: "drift" },
  { key: "breath", f0: .3, f1: .3, col: "sway", label: "breathing" },
  { key: "heart", f0: 1, f1: 1, col: "heart", label: "heartbeat" },
  { key: "flicker", f0: 2.5, f1: 2.5, col: "amber", label: "flicker or other motion" },
];
function specPlot(e, r, o) {      // bars of the illustrative pixel's spectrum, 0..5 Hz; o.gain(f) scales bars
  const g = e.ctx, m = frame(e, r, { x0: 0, x1: 5.05, y0: 0, y1: 1.25, xt: [0, 1, 2, 3, 4, 5], xf: v => v + " Hz", yl: o.yl || "spectrum · amplitude in grey levels" });
  const bw = Math.max(3, r.w / 51 * .62);
  for (let k = 1; k <= 50; k++) {
    const f = k / 10, a = SPEC[k] * (o.gain ? o.gain(f) : 1);
    let col = "ink3";
    if (o.colour) for (const R of REG) if (f >= R.f0 - .05 && f <= R.f1 + .05 && o.colour[R.key]) col = R.col;
    g.fillStyle = e.pal.c(col, col === "ink3" ? .75 : 1); g.fillRect(m.X(f) - bw / 2, m.Y(a), bw, Math.max(0, r.y + r.h - m.Y(a)));
  }
  return m;
}
function timePlot(e, r, ys, o) {
  const m = frame(e, r, { x0: 0, x1: 10, y0: o.y0, y1: o.y1, xt: [0, 2, 4, 6, 8, 10], xf: v => v + " s", yl: o.yl });
  series(e, m, i => i / 30, ys, o.color || e.pal.c("ink"), o.wd || 1.4);
  return m;
}
function specHoverTip(e, r, m) {
  const h = e.ui.specHover; if (!h || h.r !== r.y) return;
  const k = Math.max(1, Math.min(50, Math.round(h.f * 10))), f = k / 10, x = m.X(f);
  line(e, [[x, r.y], [x, r.y + r.h]], e.pal.c("skin", .6), 1, [2, 3]);
  const s = `${f.toFixed(1)} Hz · ${Math.round(f * 60)} per minute · ${SPEC[k].toFixed(2)}`;
  text(e, s, Math.min(Math.max(x, r.x + 120), r.x + r.w - 120), r.y - 26, { size: 12, align: "center", color: e.pal.c("ink"), halo: true });
}
SCENES[5] = {
  desc: "An illustrative pixel signal over ten seconds and its spectrum. Labelled bands appear: drift near zero, breathing at 0.3 Hz, heartbeat at 1 Hz, flicker at 2.5 Hz and a floor of noise. A beats-per-minute axis is added, then the paper's pulse range 0.4 to 4 Hz is shaded.",
  draw(e, p) {
    const F = e.F, g = e.ctx;
    const tr = { x: F.x + 40, y: F.y + F.h * .08, w: F.w - 54, h: F.h * (e.phone ? .24 : .3) };
    const sr = { x: F.x + 40, y: F.y + F.h * (e.phone ? .48 : .56), w: F.w - 54, h: F.h * (e.phone ? .32 : .28) };
    const mean = 190;
    timePlot(e, tr, PIX.x, { y0: mean - 9, y1: mean + 9, yl: "one pixel, illustrative · grey level" });
    const c1 = into(e, p, 1, .06), c2 = into(e, p, 2, .06), c3 = into(e, p, 3, .06), c4 = into(e, p, 4, .06);
    const m = specPlot(e, sr, { colour: { heart: c1 > .5, breath: c1 > .5, drift: c2 > .5, flicker: c2 > .5 } });
    // labels
    withAlpha(e, c1, () => {
      text(e, "breathing · 0.3 Hz", m.X(.3) + 8, m.Y(SPEC[3]) - 10, { size: 12, color: e.pal.c("sway"), halo: true });
      text(e, "heartbeat · 1 Hz", m.X(1) + 8, m.Y(SPEC[10]) - 10, { size: 12, color: e.pal.c("heart"), halo: true });
    });
    withAlpha(e, c2, () => {
      text(e, "drift", m.X(.1) - 8, m.Y(SPEC[1]) + 12, { size: 12, color: e.pal.c("ink2"), halo: true, align: "right" });
      text(e, "flicker or other motion · 2.5 Hz", m.X(2.5) + 8, m.Y(SPEC[25]) - 10, { size: 12, color: e.pal.c("amber"), halo: true });
      text(e, "noise: a floor everywhere", m.X(4.4), m.Y(.3) - 6, { size: 12, color: e.pal.c("ink2"), halo: true, align: "center" });
    });
    withAlpha(e, c3, () => {
      [0.3, 1, 2, 3, 4, 5].forEach(f => text(e, `${Math.round(f * 60)}`, m.X(f), sr.y + sr.h + 34, { size: 12, align: "center", color: e.pal.c("ink2") }));
      text(e, "per minute", sr.x + sr.w, sr.y + sr.h + 52, { size: 12, align: "right", color: e.pal.c("ink3") });
    });
    withAlpha(e, c4, () => {
      g.fillStyle = e.pal.c("heart", .1); g.fillRect(m.X(.4), sr.y - 6, m.X(4) - m.X(.4), sr.h + 6);
      line(e, [[m.X(.4), sr.y - 6], [m.X(.4), sr.y + sr.h]], e.pal.c("heart", .6), 1); line(e, [[m.X(4), sr.y - 6], [m.X(4), sr.y + sr.h]], e.pal.c("heart", .6), 1);
      text(e, "paper's pulse range, 24 to 240 bpm", m.X(4) - 8, sr.y + 14, { size: e.phone ? 12 : 13, align: "right", color: e.pal.c("heart"), halo: true });
    });
    e.hit(sr, "spec", { cursor: "pointer", move: (x) => { e.ui.specHover = { f: (x - sr.x) / sr.w * 5.05, r: sr.y }; } });
    specHoverTip(e, sr, m);
    if (!e.phone) text(e, "frequency in Hz = beats per minute / 60", tr.x + tr.w, F.y + F.h * .47, { size: 12, align: "right", color: e.pal.c("ink3") });
  },
};

window.EVMScenes = SCENES;
window.EVMLib = { cl, sm, seg, lerp, lerpR, K, mid, into, text, withAlpha, line, arrow, rrect, frame, series, drawRGBA, vignette, clipFrame, waiting, square, heroRect, clipToRect, rectToClip, PIX, SPEC, REG, specPlot, timePlot, specHoverTip, noiseSeq, TAU };
})();
