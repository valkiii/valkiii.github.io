// Precog story: a scroll-down page, visuals made from the real recordings, and hand control through the webcam.
(() => {
"use strict";
const G = window.PRECOG_GESTURES, P = window.Precog;
const byName = n => G.find(g => g.name === n);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const out = (k, v) => $$(`[data-out="${k}"]`).forEach(e => { if (e.textContent !== v) e.textContent = v; });
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- colours from the theme tokens ----------
const COL = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["ink", "ink-2", "ink-3", "line", "amber", "fired", "violet", "green", "surface", "sunk", "bg"]) COL[k] = cs.getPropertyValue("--" + k).trim();
}
readColors();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
const alpha = (hex, a) => {
  if (hex.startsWith("#")) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
  return hex;
};

// ---------- hand geometry helpers ----------
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const NAMES = ["wrist", "thumb base", "thumb knuckle", "thumb joint", "thumb tip", "index knuckle", "index middle joint", "index top joint", "index tip",
  "middle knuckle", "middle middle joint", "middle top joint", "middle tip", "ring knuckle", "ring middle joint", "ring top joint", "ring tip",
  "pinky knuckle", "pinky middle joint", "pinky top joint", "pinky tip"];
const TIPS = [4, 8, 12, 16, 20];
const isPair = lm => Array.isArray(lm[0][0]);
const handsOf = lm => isPair(lm) ? lm : [lm];

function fit(c) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return { ctx: c.getContext("2d"), w, h, dpr, k: dpr * (r.width / Math.max(1, c.offsetWidth || r.width)) };
}
// a map from landmark space to the canvas that keeps proportions, fitted to the given points
function mapper(points, w, h, pad, top = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const s = Math.min((w - 2 * pad) / Math.max(1e-6, x1 - x0), (h - 2 * pad - top) / Math.max(1e-6, y1 - y0));
  const ox = (w - (x1 - x0) * s) / 2 - x0 * s, oy = top + (h - top - (y1 - y0) * s) / 2 - y0 * s;
  const f = p => [ox + p[0] * s, oy + p[1] * s];
  f.s = s;
  return f;
}
const allPoints = sample => sample.lm.flatMap(lm => handsOf(lm).flat());
function lerpLm(a, b, f) { return Array.isArray(a[0]) ? a.map((x, i) => lerpLm(x, b[i], f)) : a.map((v, i) => v + (b[i] - v) * f); }
function frameAt(sample, t) {
  const T = sample.t;
  if (t <= T[0]) return sample.lm[0];
  if (t >= T[T.length - 1]) return sample.lm[T.length - 1];
  let k = 0; while (T[k + 1] < t) k++;
  return lerpLm(sample.lm[k], sample.lm[k + 1], (t - T[k]) / Math.max(1e-6, T[k + 1] - T[k]));
}
const dur = s => s.t[s.t.length - 1] - s.t[0];
function drawHand(ctx, lm, map, o = {}) {
  const color = o.color || COL.ink, lw = o.lw || 3, r = o.r ?? 4;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  for (const [a, b] of BONES) { const p = map(lm[a]), q = map(lm[b]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
  ctx.stroke();
  if (r > 0) {
    for (let i = 0; i < 21; i++) {
      const p = map(lm[i]);
      ctx.fillStyle = o.tips && TIPS.includes(i) ? o.tips : color;
      ctx.beginPath(); ctx.arc(p[0], p[1], TIPS.includes(i) ? r * 1.25 : r, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}
// pose vectors (wrist-relative, hand-size units) back to drawable points
const vecToLm = flat => Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1], 0]);

// ---------- visual registry ----------
const VIZ = {};
const active = new Set();

// 1 · cover: chronophotograph of a real swipe
VIZ.cover = c => {
  const g = byName("swipe left");
  const pts = g.samples.flatMap(allPoints);
  let k = 0, t0 = null;
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    const s = g.samples[k], d = dur(s), HOLD = 1.6;
    t0 ??= now;
    let t = now - t0;
    if (t > d + HOLD) { k = (k + 1) % g.samples.length; t0 = now; t = 0; out("cover-sample", `take ${k + 1} of ${g.samples.length}`); }
    const map = mapper(pts, w, h, 30 * dpr, 20 * dpr);
    ctx.clearRect(0, 0, w, h);
    const tt = Math.min(t, d) + s.t[0];
    // ghost frames, oldest faintest
    const n = s.t.length;
    for (let i = 0; i < n; i++) {
      if (s.t[i] > tt) break;
      drawHand(ctx, s.lm[i], map, { color: COL["ink-3"], lw: 1.4 * dpr, r: 0, alpha: 0.12 + 0.3 * (i / n) });
    }
    // fingertip trails
    for (const tip of TIPS) {
      ctx.beginPath();
      for (let q = 0; q <= 40; q++) {
        const p = map(frameAt(s, s.t[0] + (tt - s.t[0]) * q / 40)[tip]);
        q ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
      }
      ctx.strokeStyle = alpha(COL.amber, tip === 8 ? 0.95 : 0.55); ctx.lineWidth = (tip === 8 ? 3 : 2) * dpr; ctx.stroke();
    }
    drawHand(ctx, frameAt(s, tt), map, { lw: 4 * dpr, r: 4.5 * dpr, tips: COL.amber });
  };
};

// 3 · the 21 landmarks
VIZ.landmarks = c => {
  const s = byName("pointer").samples[0], lm = s.lm[Math.floor(s.lm.length / 2)];
  let hover = 8;
  c.addEventListener("pointermove", ev => {
    const r = c.getBoundingClientRect(), dpr = c.width / r.width;
    const mx = (ev.clientX - r.left) * dpr, my = (ev.clientY - r.top) * dpr;
    let best = -1, bd = (40 * dpr) ** 2;
    lm.forEach((p, i) => { const q = c._map(p), d = (q[0] - mx) ** 2 + (q[1] - my) ** 2; if (d < bd) { bd = d; best = i; } });
    if (best >= 0) hover = best;
  });
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    const map = c._map = mapper(lm, w, h, 80 * dpr, 20 * dpr);
    ctx.clearRect(0, 0, w, h);
    // ruler: wrist -> middle knuckle
    const a = map(lm[0]), b = map(lm[9]);
    ctx.save(); ctx.strokeStyle = COL.amber; ctx.lineWidth = 6 * dpr; ctx.setLineDash([10 * dpr, 8 * dpr]); ctx.globalAlpha = .8;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore();
    drawHand(ctx, lm, map, { lw: 3.5 * dpr, r: 0 });
    const pc = map(P.palmCenter(lm));
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.arc(pc[0], pc[1], 12 * dpr, 0, 7); ctx.stroke();
    ctx.font = `500 ${13 * dpr}px "Geist Mono", monospace`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const pulse = reduce ? 0 : (Math.sin(now * 4) + 1) / 2;
    lm.forEach((p, i) => {
      const q = map(p), on = i === hover;
      ctx.fillStyle = on ? COL.fired : COL.surface; ctx.strokeStyle = on ? COL.fired : COL.ink; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(q[0], q[1], (on ? 10 + pulse * 3 : 8) * dpr, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = on ? COL.fired : COL["ink-2"];
      ctx.fillText(String(i), q[0] + 14 * dpr, q[1] - 10 * dpr);
    });
    out("lm-name", `point ${hover} · ${NAMES[hover]}`);
  };
};

// 4 · normalising: two different takes, one far away
VIZ.normalize = c => {
  const A = byName("app switch").samples[0], B = byName("app switch").samples[4];
  const la = A.lm[4], lb0 = B.lm[5];
  const sc = 0.5, off = [0.42, 0.18];
  const lb = lb0.map(p => [lb0[0][0] + (p[0] - lb0[0][0]) * sc + off[0], lb0[0][1] + (p[1] - lb0[0][1]) * sc + off[1], p[2] * sc]);
  const va = P.poseVec(la), vb = P.poseVec(lb), dist = P.poseDist(va, vb);
  const thr = P.compile(byName("app switch")).threshold;
  const steps = ["1 · as the camera sees them", "2 · moved to the wrist", "3 · divided by hand size", "4 · one shape to compare"];
  const sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    ctx.clearRect(0, 0, w, h);
    const T = reduce ? 6.5 : (now % 8);
    const p1 = sm((T - 1.6) / 1.4), p2 = sm((T - 3.6) / 1.4);
    out("norm-step", steps[T < 1.6 ? 0 : T < 3.6 ? 1 : T < 5.2 ? 2 : 3]);
    out("norm-dist", T >= 5.2 ? `pose distance ${dist.toFixed(2)} · threshold ${thr.toFixed(2)}` : "");
    // camera frame (16:9) on the left part; normalised space centred
    const fw = w - 120 * dpr, fh = fw * 9 / 16 > h - 120 * dpr ? (h - 120 * dpr) : fw * 9 / 16, fx = (w - fh * 16 / 9) / 2, fy = (h - fh) / 2 + 14 * dpr;
    const cam = p => [fx + p[0] / 1.778 * fh * 16 / 9, fy + p[1] * fh];
    ctx.strokeStyle = alpha(COL["ink-3"], 1 - p1); ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([6 * dpr, 6 * dpr]);
    ctx.strokeRect(fx, fy, fh * 16 / 9, fh); ctx.setLineDash([]);
    const centre = [w / 2, h / 2 + 50 * dpr], unit = Math.min(w, h) * 0.2;
    const place = (lm, v, i, scaleRaw) => {
      const raw = cam(lm[i]);
      const wr = cam(lm[0]);
      const moved = [centre[0] + (raw[0] - wr[0]), centre[1] + (raw[1] - wr[1])];
      const norm = [centre[0] + v[i][0] * unit, centre[1] + v[i][1] * unit];
      const a = [raw[0] + (moved[0] - raw[0]) * p1, raw[1] + (moved[1] - raw[1]) * p1];
      return [a[0] + (norm[0] - a[0]) * p2, a[1] + (norm[1] - a[1]) * p2];
    };
    const ma = la.map((_, i) => place(la, va, i)), mb = lb.map((_, i) => place(lb, vb, i));
    const ident = p => p;
    drawHand(ctx, mb, ident, { color: COL.amber, lw: 3 * dpr, r: 3.5 * dpr });
    drawHand(ctx, ma, ident, { color: COL.ink, lw: 3 * dpr, r: 3.5 * dpr, alpha: .9 });
    ctx.font = `500 ${13 * dpr}px "Geist Mono", monospace`; ctx.fillStyle = COL["ink-2"]; ctx.textAlign = "center";
    if (p1 < .5) { const qa = cam(la[0]), qb = cam(lb[0]); ctx.fillText("near", qa[0], qa[1] + 26 * dpr); ctx.fillText("far", qb[0], qb[1] + 22 * dpr); }
  };
};

// 5 · three kinds of gesture
function replayCanvas(c, gname, extra) {
  const g = byName(gname);
  const pts = g.samples.slice(0, 1).flatMap(allPoints);
  let t0 = null;
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    const s = g.samples[0], d = dur(s), HOLD = extra && extra.hold || 1.2;
    t0 ??= now;
    let t = (now - t0) % (d + HOLD);
    const map = mapper(pts, w, h, 46 * dpr, 30 * dpr);
    ctx.clearRect(0, 0, w, h);
    const tt = Math.min(t, d) + s.t[0];
    for (let i = 0; i < s.t.length && s.t[i] <= tt; i += 2) handsOf(s.lm[i]).forEach(lm => drawHand(ctx, lm, map, { color: COL["ink-3"], lw: 1.2 * dpr, r: 0, alpha: .22 }));
    const cur = frameAt(s, tt);
    extra && extra.under && extra.under(ctx, map, s, tt, t, dpr, w, h);
    handsOf(cur).forEach(lm => drawHand(ctx, lm, map, { lw: 3 * dpr, r: 3.5 * dpr, tips: COL.amber }));
    extra && extra.over && extra.over(ctx, map, s, tt, t, dpr, w, h, cur);
  };
}
VIZ["kind-pose"] = c => replayCanvas(c, "app switch", {
  hold: 1.4,
  over(ctx, map, s, tt, t, dpr, w, h, cur) {
    const held = Math.min(t, 1.2), f = Math.min(1, held / 0.45);
    const pc = map(P.palmCenter(cur)), r = 34 * dpr;
    ctx.lineWidth = 5 * dpr; ctx.strokeStyle = alpha(COL["ink-3"], .3); ctx.beginPath(); ctx.arc(pc[0], pc[1], r, 0, 7); ctx.stroke();
    ctx.strokeStyle = f >= 1 ? COL.fired : COL.amber; ctx.beginPath(); ctx.arc(pc[0], pc[1], r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
    out("hold", f >= 1 ? "fired" : `held ${held.toFixed(2)} s`);
  },
});
VIZ["kind-motion"] = c => replayCanvas(c, "swipe right", {
  under(ctx, map, s, tt, t, dpr) {
    ctx.beginPath();
    for (let q = 0; q <= 40; q++) { const p = map(P.palmCenter(frameAt(s, s.t[0] + (tt - s.t[0]) * q / 40))); q ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.strokeStyle = COL.amber; ctx.lineWidth = 4 * dpr; ctx.lineCap = "round"; ctx.stroke();
  },
});
VIZ["kind-two"] = c => replayCanvas(c, "expand", {
  over(ctx, map, s, tt, t, dpr, w, h, cur) {
    const [a, b] = cur, pa = map(P.palmCenter(a)), pb = map(P.palmCenter(b));
    ctx.strokeStyle = COL.amber; ctx.lineWidth = 3 * dpr; ctx.setLineDash([8 * dpr, 6 * dpr]);
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); ctx.setLineDash([]);
    const gap = Math.hypot(P.palmCenter(b)[0] - P.palmCenter(a)[0], P.palmCenter(b)[1] - P.palmCenter(a)[1]) / ((P.handScale(a) + P.handScale(b)) / 2);
    ctx.fillStyle = COL.ink; ctx.font = `500 ${14 * dpr}px "Geist Mono", monospace`; ctx.textAlign = "center";
    ctx.fillText(`gap ${gap.toFixed(1)} hand sizes`, (pa[0] + pb[0]) / 2, Math.min(pa[1], pb[1]) - 18 * dpr);
  },
});

// 6 · DTW between two real takes
VIZ.dtw = c => {
  const g = byName("swipe left");
  const order = g.samples.map((s, i) => [s.t.length, i]).sort((a, b) => a[0] - b[0]);
  const ia = order[0][1], ib = order[order.length - 1][1];
  const sa = g.samples[ia], sb = g.samples[ib];
  const fa = P.seqFeatures(sa.t.map((t, i) => [t, sa.lm[i]])), fb = P.seqFeatures(sb.t.map((t, i) => [t, sb.lm[i]]));
  const C = P.costMatrix(fa, fb, 0.35), { dist, path } = P.dtw(C, true);
  const thr = P.compile(g).threshold;
  let cmax = 0; C.forEach(r => r.forEach(v => { cmax = Math.max(cmax, v); }));
  const band = Math.max(2, 16 >> 2);
  out("dtw-dist", `distance ${dist.toFixed(2)} · threshold ${thr.toFixed(2)}`);
  out("dtw-note", `Take ${ia + 1}: ${sa.t.length} frames in ${dur(sa).toFixed(2)} s. Take ${ib + 1}: ${sb.t.length} frames in ${dur(sb).toFixed(2)} s. Both become 16 steps; the amber route is the pairing.`);
  let hoverCell = null;
  c.addEventListener("pointermove", ev => {
    const r = c.getBoundingClientRect(), dpr = c.width / r.width, L = c._lay; if (!L) return;
    const mx = (ev.clientX - r.left) * dpr, my = (ev.clientY - r.top) * dpr;
    const j = Math.floor((mx - L.x) / L.cell), i = Math.floor((my - L.y) / L.cell);
    hoverCell = i >= 0 && j >= 0 && i < 16 && j < 16 ? [i, j] : null;
  });
  c.addEventListener("pointerleave", () => hoverCell = null);
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    ctx.clearRect(0, 0, w, h);
    const glyph = 46 * dpr;
    const size = Math.min(h - glyph - 90 * dpr, (w - glyph) * 0.58);
    const cell = size / 16, x = 40 * dpr + glyph, y = 60 * dpr + glyph;
    c._lay = { x, y, cell };
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
      if (Math.abs(i - j) > band) { ctx.fillStyle = alpha(COL["ink-3"], .06); ctx.fillRect(x + j * cell + 1, y + i * cell + 1, cell - 2, cell - 2); continue; }
      ctx.fillStyle = alpha(COL.ink, 0.06 + 0.7 * Math.pow(C[i][j] / cmax, .8));
      ctx.fillRect(x + j * cell + 1, y + i * cell + 1, cell - 2, cell - 2);
    }
    // the route, drawn over time
    const prog = reduce ? 1 : Math.min(1, (now % 6) / 4);
    const upto = Math.max(1, Math.round(prog * path.length));
    ctx.strokeStyle = COL.amber; ctx.lineWidth = 4 * dpr; ctx.lineJoin = ctx.lineCap = "round"; ctx.beginPath();
    path.slice(0, upto).forEach(([i, j], q) => { const px = x + (j + .5) * cell, py = y + (i + .5) * cell; q ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
    const [ci, cj] = hoverCell || path[upto - 1];
    ctx.strokeStyle = COL.fired; ctx.lineWidth = 2.5 * dpr; ctx.strokeRect(x + cj * cell, y + ci * cell, cell, cell);
    // glyph strips: take A down the left, take B across the top
    const mini = (flat, cx, cy, sz, color, lw) => {
      const lm = vecToLm(flat);
      const m = mapper(lm, sz, sz, 3 * dpr);
      drawHand(ctx, lm, p => { const q = m(p); return [cx - sz / 2 + q[0], cy - sz / 2 + q[1]]; }, { color, lw, r: 0 });
    };
    for (let k = 0; k < 16; k++) {
      mini(fa.poses[k], x - glyph / 2 - 4 * dpr, y + (k + .5) * cell, Math.min(glyph, cell * 1.1), k === ci ? COL.ink : COL["ink-3"], (k === ci ? 1.8 : 1) * dpr);
      mini(fb.poses[k], x + (k + .5) * cell, y - glyph / 2 - 4 * dpr, Math.min(glyph, cell * 1.1), k === cj ? COL.amber : COL["ink-3"], (k === cj ? 1.8 : 1) * dpr);
    }
    ctx.font = `500 ${13 * dpr}px "Geist Mono", monospace`; ctx.fillStyle = COL["ink-2"]; ctx.textAlign = "left";
    ctx.fillText(`take ${ib + 1} →`, x, y - glyph - 12 * dpr);
    ctx.save(); ctx.translate(x - glyph - 12 * dpr, y); ctx.rotate(-Math.PI / 2); ctx.textAlign = "right"; ctx.fillText(`← take ${ia + 1}`, 0, 0); ctx.restore();
    // the paired step, large
    const rx = x + size + 40 * dpr, rw = w - rx - 30 * dpr;
    if (rw > 120 * dpr) {
      const la = vecToLm(fa.poses[ci]), lb = vecToLm(fb.poses[cj]);
      const m = mapper(la.concat(lb), rw, size * .8, 10 * dpr);
      const sh = p => { const q = m(p); return [rx + q[0], y + size * .1 + q[1]]; };
      drawHand(ctx, lb, sh, { color: COL.amber, lw: 3 * dpr, r: 3 * dpr });
      drawHand(ctx, la, sh, { color: COL.ink, lw: 3 * dpr, r: 3 * dpr, alpha: .85 });
      ctx.textAlign = "center"; ctx.fillStyle = COL["ink-2"];
      ctx.fillText(`step ${ci + 1} ↔ step ${cj + 1}`, rx + rw / 2, y + size + 6 * dpr);
      ctx.fillText(`cost ${C[ci][cj].toFixed(2)}`, rx + rw / 2, y + size + 26 * dpr);
    }
  };
};

// 7 · thresholds from the takes
VIZ.threshold = c => {
  const names = ["swipe left", "swipe right", "expand", "pointer", "app switch"];
  const comp = Object.fromEntries(names.map(n => [n, P.compile(byName(n))]));
  let sel = "swipe left";
  const tabs = $('[data-tabs="thr"]');
  tabs.innerHTML = names.map(n => `<button type="button" aria-pressed="${n === sel}" data-n="${n}">${n}</button>`).join("");
  tabs.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; sel = b.dataset.n; tabs.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); });
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    ctx.clearRect(0, 0, w, h);
    const cg = comp[sel], f = cg.formula;
    const loo = cg.loo, max = Math.max(1.3, Math.max(...loo) * 1.1);
    const x0 = 60 * dpr, x1 = w - 50 * dpr, y = h * .62;
    const X = v => x0 + v / max * (x1 - x0);
    // floor..ceiling band
    ctx.fillStyle = alpha(COL.amber, .09); ctx.fillRect(X(f.lo), y - 130 * dpr, X(f.hi) - X(f.lo), 196 * dpr);
    ctx.strokeStyle = COL.line; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.font = `500 ${13 * dpr}px "Geist Mono", monospace`; ctx.fillStyle = COL["ink-3"]; ctx.textAlign = "center";
    for (let v = 0; v <= max + 1e-9; v += .25) { ctx.fillText(v.toFixed(2), X(v), y + 26 * dpr); ctx.fillRect(X(v) - .5 * dpr, y - 4 * dpr, 1 * dpr, 8 * dpr); }
    ctx.fillText(`floor ${f.lo}`, X(f.lo), y + 84 * dpr); ctx.fillText(`ceiling ${f.hi}`, X(f.hi), y + 84 * dpr);
    // threshold
    ctx.strokeStyle = COL.amber; ctx.lineWidth = 4 * dpr; ctx.beginPath(); ctx.moveTo(X(cg.threshold), y - 130 * dpr); ctx.lineTo(X(cg.threshold), y + 40 * dpr); ctx.stroke();
    ctx.fillStyle = COL.amber; ctx.fillText(`threshold ${cg.threshold.toFixed(2)}`, X(cg.threshold), y + 62 * dpr);
    // spread
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([5 * dpr, 5 * dpr]);
    ctx.beginPath(); ctx.moveTo(X(cg.spread), y - 110 * dpr); ctx.lineTo(X(cg.spread), y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.ink; ctx.fillText(`spread ${cg.spread.toFixed(2)}`, X(cg.spread), y - 118 * dpr);
    // the takes: dots on the line, a glyph of each take in a row above, joined by leader lines
    const order = loo.map((d, i) => [d, i]).sort((a, b) => a[0] - b[0]);
    const gw = Math.min(70 * dpr, (x1 - x0) / order.length), rowY = y - 250 * dpr;
    order.forEach(([d, i], q) => {
      const kept = cg.keep.includes(i), cx = X(d), gx = x0 + gw * (q + .5) + ((x1 - x0) - gw * order.length) / 2;
      ctx.strokeStyle = alpha(kept ? COL["ink-3"] : COL.fired, .55); ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.moveTo(gx, rowY + 30 * dpr); ctx.bezierCurveTo(gx, rowY + 120 * dpr, cx, y - 120 * dpr, cx, y - 8 * dpr); ctx.stroke();
      ctx.fillStyle = kept ? COL.ink : COL.surface; ctx.strokeStyle = kept ? COL.ink : COL.fired; ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath(); ctx.arc(cx, y, 7 * dpr, 0, 7); ctx.fill(); ctx.stroke();
      const sm = byName(sel).samples[i], lm0 = handsOf(sm.lm[Math.floor(sm.lm.length / 2)]);
      const m = mapper(lm0.flat(), gw - 8 * dpr, 52 * dpr, 2 * dpr);
      lm0.forEach(lm => drawHand(ctx, lm, p => { const qq = m(p); return [gx - (gw - 8 * dpr) / 2 + qq[0], rowY - 26 * dpr + qq[1]]; }, { color: kept ? COL["ink-2"] : COL.fired, lw: 1.3 * dpr, r: 0 }));
      ctx.fillStyle = kept ? COL["ink-3"] : COL.fired; ctx.textAlign = "center";
      ctx.fillText(kept ? `take ${i + 1}` : "set aside", gx, rowY - 38 * dpr);
    });
    out("thr-formula", `clip(${cg.spread.toFixed(2)} × ${f.k} + ${f.c}, ${f.lo}, ${f.hi}) = ${cg.threshold.toFixed(2)}`);
    const flag = cg.dropped > 0 || cg.spread > (cg.kind === "pose" ? 0.3 : 0.8);
    out("thr-note", cg.dropped ? `${cg.dropped} of ${loo.length} takes sat far from the rest and were set aside (red). The threshold comes from the other ${cg.keep.length}.`
      : flag ? `These six takes disagree (spread ${cg.spread.toFixed(2)}), so the threshold hits its ceiling. Precog flags a gesture like this so it can be recorded again.`
      : `All ${loo.length} takes agree, so the threshold sits just above their spread.`);
  };
};

// 8 · mode glyphs
VIZ.mode = c => {
  const which = c.dataset.pose, color = c.dataset.color;
  let lms;
  if (which === "spread") lms = spreadPair(1);
  else { const s = byName(which).samples[0]; lms = handsOf(s.lm[Math.floor(s.lm.length / 2)]); }
  return () => {
    const { ctx, w, h, dpr } = fit(c);
    ctx.clearRect(0, 0, w, h);
    const m = mapper(lms.flat(), w, h, 22 * dpr);
    lms.forEach(lm => drawHand(ctx, lm, m, { color: COL[color], lw: 2.6 * dpr, r: 2.6 * dpr }));
  };
};

// 9 · dock swipe: Began / Changed / Ended or Cancelled
VIZ.spaces = c => {
  let desk = 1, p = 0, drag = null, anim = null, log = [], idleSince = 0, demo = 0;
  const push = (txt, cls = "") => { log.push([txt, cls]); log = log.slice(-5); $('[data-out="swipe-log"]').innerHTML = log.map(([t, k]) => `<div class="${k}">${t}</div>`).join(""); };
  let lastLogged = 0;
  const begin = x => { drag = { x0: x, t0: performance.now(), last: x, lt: performance.now(), v: 0 }; push("Began"); lastLogged = 0; };
  const move = (x, w) => {
    if (!drag) return;
    const now = performance.now();
    drag.v = (x - drag.last) / Math.max(1, now - drag.lt) * 1000 / w; drag.last = x; drag.lt = now;
    p = Math.max(-1, Math.min(1, -(x - drag.x0) / w));
    if (Math.abs(p - lastLogged) > .12) { push(`Changed  ${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(2)}`); lastLogged = p; }
  };
  const end = () => {
    if (!drag) return;
    const flick = Math.abs(drag.v) > 1.4 && Math.sign(-drag.v) === Math.sign(p);
    const target = desk + Math.sign(p);
    if ((Math.abs(p) > 1 / 3 || flick) && target >= 0 && target <= 2) { push(`Ended → desktop ${target + 1}`, "ok"); anim = { from: p, to: Math.sign(p), t0: performance.now(), commit: target }; }
    else { push("Cancelled · springs back", "no"); anim = { from: p, to: 0, t0: performance.now() }; }
    drag = null; idleSince = performance.now();
  };
  c.addEventListener("pointerdown", e => { c.setPointerCapture(e.pointerId); demo = 0; begin(e.clientX); });
  c.addEventListener("pointermove", e => { if (drag && !demo) move(e.clientX, c.getBoundingClientRect().width * .8); });
  c.addEventListener("pointerup", () => { if (!demo) end(); });
  c.style.touchAction = "none"; c.style.cursor = "grab";
  // a scripted hand when nobody is dragging: a short swipe (cancelled), then a long one (commits)
  let script = null;
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    const ms = performance.now();
    if (!drag && !anim && !reduce && ms - idleSince > 2200) {
      const dir = desk >= 2 ? 1 : desk <= 0 ? -1 : (demo % 2 ? -1 : 1);
      const len = demo % 3 === 0 ? .22 : .55;
      script = { t0: ms, dir, len }; demo++; begin(0);
    }
    if (script && drag) {
      const k = Math.min(1, (ms - script.t0) / 900);
      move(-script.dir * script.len * (k * k * (3 - 2 * k)) * 1000, 1000);
      if (k >= 1) { drag.v = 0; end(); script = null; }
    }
    if (anim) {
      const k = Math.min(1, (ms - anim.t0) / 380), e = 1 - Math.pow(1 - k, 3);
      p = anim.from + (anim.to - anim.from) * e;
      if (k >= 1) { if (anim.commit !== undefined) desk = anim.commit; p = 0; anim = null; idleSince = ms; }
    }
    out("swipe-p", `progress ${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(2)}`);
    ctx.clearRect(0, 0, w, h);
    const sw = w * .62, sh = sw * 10 / 16, sx = (w - sw) / 2, sy = (h - sh) / 2 - 10 * dpr;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 14 * dpr); ctx.clip();
    ctx.fillStyle = COL.sunk; ctx.fillRect(sx, sy, sw, sh);
    for (let d = 0; d < 3; d++) {
      const ox = sx + (d - desk - p) * (sw + 24 * dpr);
      ctx.fillStyle = COL.bg; ctx.fillRect(ox, sy, sw, sh);
      ctx.fillStyle = alpha([COL.amber, COL.green, COL.violet][d], .14); ctx.fillRect(ox, sy, sw, sh);
      ctx.fillStyle = COL["ink-3"]; ctx.font = `500 ${15 * dpr}px "Geist Mono", monospace`; ctx.textAlign = "left";
      ctx.fillText(`Desktop ${d + 1}`, ox + 18 * dpr, sy + 30 * dpr);
      const wins = [[[.08, .2, .5, .6], [.5, .32, .42, .5]], [[.12, .18, .76, .7]], [[.06, .2, .4, .34], [.06, .58, .4, .3], [.5, .2, .44, .68]]][d];
      wins.forEach(([a, b, c2, d2], q) => {
        ctx.fillStyle = q === 0 ? COL.surface : alpha(COL.ink, .08); ctx.strokeStyle = COL.line; ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath(); ctx.roundRect(ox + a * sw, sy + b * sh, c2 * sw, d2 * sh, 8 * dpr); ctx.fill(); ctx.stroke();
      });
    }
    ctx.restore();
    ctx.strokeStyle = COL.line; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 14 * dpr); ctx.stroke();
    // progress bar with the one-third mark
    const by = sy + sh + 34 * dpr;
    ctx.fillStyle = COL.sunk; ctx.fillRect(sx, by, sw, 6 * dpr);
    ctx.fillStyle = Math.abs(p) > 1 / 3 ? COL.green : COL.amber;
    const mid = sx + sw / 2; ctx.fillRect(Math.min(mid, mid + p * sw / 2), by, Math.abs(p) * sw / 2, 6 * dpr);
    ctx.fillStyle = COL.ink; [-1 / 3, 1 / 3].forEach(m => ctx.fillRect(mid + m * sw / 2 - 1 * dpr, by - 6 * dpr, 2 * dpr, 18 * dpr));
    ctx.font = `500 ${12 * dpr}px "Geist Mono", monospace`; ctx.fillStyle = COL["ink-3"]; ctx.textAlign = "center";
    ctx.fillText("⅓ commits", mid + sw / 6, by + 30 * dpr);
  };
};

// 10 · pinch hysteresis (illustrative signal, real thresholds)
VIZ.pinch = c => {
  const ON = .32, OFF = .48, SLOW = .6, T = 6;
  const sig = t => {
    const s = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
    let r = .95 - .72 * s((t - .7) / .9) + .65 * s((t - 3.3) / .7);
    if (t > 1.7 && t < 3.3) r += .07 * Math.sin((t - 1.7) * 9) + .06 * Math.sin((t - 1.7) * 23); // a trembling pinch
    return r;
  };
  const N = 600, rs = Array.from({ length: N }, (_, i) => sig(i / (N - 1) * T));
  let pressed = false; const st = rs.map(r => (pressed = pressed ? r < OFF : r < ON));
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    ctx.clearRect(0, 0, w, h);
    const x0 = 70 * dpr, x1 = w - 40 * dpr, y0 = 70 * dpr, y1 = h - 70 * dpr;
    const X = i => x0 + i / (N - 1) * (x1 - x0), Y = r => y1 - (r - .1) / (1.05 - .1) * (y1 - y0);
    const head = reduce ? N - 1 : Math.floor(((now % (T + 1.2)) / T) * (N - 1));
    // pressed spans
    for (let i = 0; i < N; i++) if (st[i]) { let j = i; while (j < N && st[j]) j++; ctx.fillStyle = alpha(COL.fired, .1); ctx.fillRect(X(i), y0, X(j) - X(i), y1 - y0); i = j; }
    ctx.font = `500 ${13 * dpr}px "Geist Mono", monospace`; ctx.textAlign = "left";
    [[SLOW, "0.60 cursor slows", COL["ink-3"]], [OFF, "0.48 release", COL.green], [ON, "0.32 press", COL.fired]].forEach(([v, l, col]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([6 * dpr, 6 * dpr]);
      ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.fillText(l, x0 + 8 * dpr, Y(v) - 8 * dpr);
    });
    ctx.strokeStyle = alpha(COL["ink-3"], .45); ctx.lineWidth = 2 * dpr; ctx.beginPath();
    rs.forEach((r, i) => i ? ctx.lineTo(X(i), Y(r)) : ctx.moveTo(X(i), Y(r))); ctx.stroke();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 3 * dpr; ctx.beginPath();
    for (let i = 0; i <= Math.min(head, N - 1); i++) i ? ctx.lineTo(X(i), Y(rs[i])) : ctx.moveTo(X(i), Y(rs[i]));
    ctx.stroke();
    const i = Math.min(head, N - 1), r = rs[i];
    ctx.fillStyle = st[i] ? COL.fired : COL.ink; ctx.beginPath(); ctx.arc(X(i), Y(r), 7 * dpr, 0, 7); ctx.fill();
    const rel = st.findIndex((s, k) => k > 0 && !s && st[k - 1]);
    if (rel > 0 && head >= rel) { ctx.fillStyle = COL.green; ctx.textAlign = "center"; ctx.fillText("click (on release)", X(rel), y0 - 14 * dpr); ctx.fillRect(X(rel) - 1 * dpr, y0 - 6 * dpr, 2 * dpr, y1 - y0 + 6 * dpr); }
    ctx.fillStyle = COL["ink-3"]; ctx.textAlign = "center"; ctx.fillText("time →", (x0 + x1) / 2, y1 + 34 * dpr);
    out("pinch-state", st[i] ? `pressed · cursor frozen · ${r.toFixed(2)}` : r < SLOW ? `cursor slowed × 0.25 · ${r.toFixed(2)}` : `cursor free · ${r.toFixed(2)}`);
  };
};

// 11 · ten spread fingers. A real open hand from a recording, fingers fanned out progressively.
// a real open hand (expand, take 3, frame 18), mirrored for the other side, fingers and thumb fanned out
let SPREAD = null;
const gapOf = lm => { const s = P.handScale(lm); return [[8, 12], [12, 16], [16, 20]].map(([a, b]) => Math.hypot(lm[a][0] - lm[b][0], lm[a][1] - lm[b][1]) / s).reduce((a, b) => a + b) / 3; };
const thumbOf = lm => Math.hypot(lm[4][0] - lm[5][0], lm[4][1] - lm[5][1]) / P.handScale(lm);
function fan(src, fa, ta) {
  const lm = src.map(p => [p[0], p[1], p[2]]);
  const rot = (chain, pivot, ang) => {
    const [px, py] = lm[pivot], cs = Math.cos(ang), sn = Math.sin(ang);
    for (const i of chain) { const dx = lm[i][0] - px, dy = lm[i][1] - py; lm[i] = [px + dx * cs - dy * sn, py + dx * sn + dy * cs, lm[i][2]]; }
  };
  rot([6, 7, 8], 5, fa); rot([10, 11, 12], 9, fa * .3); rot([14, 15, 16], 13, -fa * .3); rot([18, 19, 20], 17, -fa);
  rot([2, 3, 4], 1, ta);
  return lm;
}
function calibrateSpread() {
  const right = byName("expand").samples[2].lm[18][1];
  const sF = gapOf(fan(right, .1, 0)) > gapOf(fan(right, -.1, 0)) ? 1 : -1;
  const sT = thumbOf(fan(right, 0, .1)) > thumbOf(fan(right, 0, -.1)) ? 1 : -1;
  let fa = 0, ta = 0;
  while (gapOf(fan(right, sF * fa, 0)) < 0.46 * 1.12 && fa < 1) fa += .01;
  while (thumbOf(fan(right, 0, sT * ta)) < 0.85 * 1.08 && ta < 1.5) ta += .01;
  SPREAD = { right, fa: sF * fa, ta: sT * ta };
}
function spreadPair(f) {
  if (!SPREAD) calibrateSpread();
  const R = fan(SPREAD.right, SPREAD.fa * f, SPREAD.ta * f);
  const cx = R[0][0], gap = P.handScale(R) * 4.2;
  const L = R.map(p => [2 * cx - p[0] - gap, p[1], p[2]]);
  return [L, R];
}
VIZ.standby = c => {
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    ctx.clearRect(0, 0, w, h);
    const live = cam.on && cam.hands.length;
    let hands, f = 0, t = 0;
    if (live) hands = cam.hands.map(x => x.lm);
    else { t = reduce ? 3 : now % 5; f = Math.min(1, Math.max(0, (t - .6) / 1.2)); hands = spreadPair(f); }
    const m = mapper(spreadPair(1).flat().concat(spreadPair(0).flat()), w, h, 60 * dpr, 40 * dpr);
    const mm = live ? mapper(hands.flat(), w, h, 60 * dpr, 40 * dpr) : m;
    const wide = hands.length === 2 && hands.every(lm => P.spreadWide(lm));
    const gaps = hands.map(lm => { const s = P.handScale(lm); return [[8, 12], [12, 16], [16, 20]].map(([a, b]) => Math.hypot(lm[a][0] - lm[b][0], lm[a][1] - lm[b][1]) / s).reduce((a, b) => a + b) / 3; });
    const thumbs = hands.map(lm => Math.hypot(lm[4][0] - lm[5][0], lm[4][1] - lm[5][1]) / P.handScale(lm));
    let prog = 0;
    if (!live && wide) prog = Math.min(1, (t - 1.8) / 0.8);
    if (live) prog = cam.ten.progress;
    const on = live ? cam.standby : prog >= 1;
    hands.forEach(lm => drawHand(ctx, lm, mm, { color: on ? COL.fired : wide ? COL.amber : COL.ink, lw: 3 * dpr, r: 3.5 * dpr }));
    const cx = w / 2, cy = h - 90 * dpr;
    ctx.lineWidth = 6 * dpr; ctx.strokeStyle = alpha(COL["ink-3"], .25); ctx.beginPath(); ctx.arc(cx, cy, 30 * dpr, 0, 7); ctx.stroke();
    ctx.strokeStyle = on ? COL.fired : COL.amber; ctx.beginPath(); ctx.arc(cx, cy, 30 * dpr, -Math.PI / 2, -Math.PI / 2 + (on ? 1 : prog) * Math.PI * 2); ctx.stroke();
    ctx.font = `600 ${15 * dpr}px "Geist Mono", monospace`; ctx.textAlign = "center"; ctx.fillStyle = on ? COL.fired : COL["ink-2"];
    ctx.fillText(on ? "STANDBY" : wide ? "hold still…" : "spread wider", cx, cy + 58 * dpr);
    out("spread-read", `finger gap ${Math.min(...gaps).toFixed(2)} (≥ 0.46) · thumb ${Math.min(...thumbs).toFixed(2)} (≥ 0.85)`);
  };
};

// 12 · the recogniser, live (camera) or on a stream of recordings
const demo = { R: new P.Recognizer(G), queue: [], cur: null, t0: 0, fired: null, firedAt: -9, hands: [] };
function nextDemo(now) {
  if (!demo.queue.length) demo.queue = ["swipe left", "swipe right", "app switch", "expand", "pointer", "swipe left"].map(n => [n, Math.floor(Math.random() * 6)]);
  const [n, k] = demo.queue.shift(), g = byName(n), s = g.samples[k];
  demo.cur = { g, s, n, d: dur(s), pose: g.kind === "pose" };
  demo.t0 = now;
}
function demoStep(now) {
  if (!demo.cur || now - demo.t0 > (demo.cur.pose ? 1.4 : demo.cur.d) + 0.8) nextDemo(now);
  const { g, s, pose } = demo.cur, local = now - demo.t0;
  let hands = [];
  if (local <= (pose ? 1.4 : demo.cur.d)) {
    const tt = pose ? s.t[0] + (local % demo.cur.d) * 0.15 : s.t[0] + local;
    const lm = frameAt(s, tt);
    hands = g.kind === "motion2" ? [{ label: "Left", lm: lm[0] }, { label: "Right", lm: lm[1] }] : [{ label: "Right", lm }];
  }
  demo.hands = hands;
  const r = demo.R.update(now, hands);
  if (r) { demo.fired = r.gesture.name; demo.firedAt = now; }
  return demo.R;
}
VIZ.live = c => {
  const names = G.map(g => g.name);
  const bars = $('[data-out="bars"]');
  bars.innerHTML = names.map(n => `<div class="bar" data-g="${n}"><span>${n}</span><div class="track"><i class="fill"></i><i class="thr"></i></div><output>—</output></div>`).join("");
  const rows = Object.fromEntries(names.map(n => [n, bars.querySelector(`[data-g="${n}"]`)]));
  return now => {
    const { ctx, w, h, dpr } = fit(c);
    ctx.clearRect(0, 0, w, h);
    const live = cam.on;
    const R = live ? cam.recog : demoStep(now);
    const hands = live ? cam.hands : demo.hands;
    const fired = live ? cam.lastFired : demo.fired, firedAt = live ? cam.lastFiredAt : demo.firedAt;
    out("live-tag", live ? (cam.standby ? "camera · standby" : "camera · your hands") : `demo stream · take of “${demo.cur ? demo.cur.n : ""}”`);
    const m = mapper([[0.15, 0.1], [1.63, 1]], w, h, 30 * dpr, 30 * dpr);
    hands.forEach(hd => drawHand(ctx, hd.lm, m, { lw: 3 * dpr, r: 3.5 * dpr, tips: COL.amber, color: live && cam.standby ? COL.fired : COL.ink }));
    const recent = now - firedAt < 1.2;
    out("live-fired", recent ? `fired: ${fired}` : "");
    for (const n of names) {
      const sc = R.scores[n], row = rows[n], cg = R.gestures.find(g => g.name === n);
      const fill = row.querySelector(".fill"), o = row.querySelector("output");
      if (!sc) { fill.style.width = "100%"; fill.style.opacity = ".25"; o.textContent = "—"; row.className = "bar"; continue; }
      const [d, thr] = sc;
      fill.style.opacity = "1"; fill.style.width = Math.min(100, d / (1.5 * thr) * 100) + "%";
      o.textContent = d.toFixed(2);
      row.className = "bar" + (recent && fired === n ? " fired" : d < thr ? " hot" : "");
    }
  };
};

// ---------- story engine: scenes, contents, progress ----------
const scenes = $$(".scene");
let cur = 0;
const views = new Map();
function ensureViz(scene) {
  scene.querySelectorAll("canvas[data-viz]").forEach(c => { if (!views.has(c)) views.set(c, VIZ[c.dataset.viz](c)); });
}
function go(i) {
  i = Math.max(0, Math.min(scenes.length - 1, i));
  scenes[i].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
// the current scene: the one crossing the middle of the window
function track() {
  const mid = innerHeight * 0.45;
  let best = 0;
  scenes.forEach((s, k) => { if (s.getBoundingClientRect().top < mid) best = k; });
  if (best !== cur) { cur = best; $$("#grid button").forEach((b, k) => b.classList.toggle("cur", k === cur)); }
  const max = document.documentElement.scrollHeight - innerHeight;
  $("#prog").style.width = (max > 0 ? scrollY / max * 100 : 0) + "%";
  const story = $("#story").getBoundingClientRect();
  $("#railfill").style.height = Math.max(0, Math.min(story.height, mid - story.top)) + "px";
  $$("#rail i").forEach(d => d.classList.toggle("on", d._el.getBoundingClientRect().top < mid));
}
addEventListener("scroll", track, { passive: true }); addEventListener("resize", () => { placeRail(); track(); });
function placeRail() {
  const top = $("#story").getBoundingClientRect().top;
  $$("#rail i").forEach(d => { d.style.top = (d._el.getBoundingClientRect().top - top + 8) + "px"; });
}
$$(".act, .cover").forEach(el => { const d = document.createElement("i"); d._el = el; $("#rail").appendChild(d); });
document.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "o" || e.key === "O") toggleContents();
  else if (e.key === "Escape") toggleContents(false);
});
$("#grid").innerHTML = scenes.map((s, k) => `<button type="button"><span>${String(k + 1).padStart(2, "0")}</span><b>${s.dataset.title}</b></button>`).join("");
$$("#grid button").forEach((b, k) => b.onclick = () => { toggleContents(false); go(k); });
function toggleContents(force) { document.body.classList.toggle("contents", force); }
$("#ovbtn").onclick = () => toggleContents();

let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1600); }

// ---------- camera: your hands steer the page ----------
const cam = { on: false, standby: false, hands: [], recog: new P.Recognizer(G), ten: new P.TenFingers(), laser: false, lastFired: null, lastFiredAt: -9, busy: false };
const video = document.createElement("video"); video.playsInline = true; video.muted = true;
let landmarker = null, lastVideoTime = -1;
async function startCam() {
  if (cam.busy) return;
  if (cam.on) { stopCam(); return; }
  cam.busy = true; setCamUi("starting");
  try {
    const base = new URL("../../assets/mediapipe/", location.href).href;
    const { FilesetResolver, HandLandmarker } = await import(base + "vision_bundle.mjs");
    const fs = await FilesetResolver.forVisionTasks(base + "wasm");
    const make = delegate => HandLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: base + "hand_landmarker.task", delegate }, runningMode: "VIDEO", numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.5,
    });
    landmarker ||= await make("GPU").catch(() => make("CPU"));
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = stream; await video.play();
    cam.on = true; $("#pip").hidden = false; setCamUi("on");
    toast("Swipe left for the next section");
  } catch (e) {
    console.warn(e);
    setCamUi("off");
    toast(e && e.name === "NotAllowedError" ? "Camera blocked. Use ← → instead." : "Hand tracking could not start here. Use ← → instead.");
  }
  cam.busy = false;
}
function stopCam() {
  const s = video.srcObject; if (s) s.getTracks().forEach(t => t.stop());
  video.srcObject = null; cam.on = false; cam.hands = []; cam.laser = false; $("#laser").hidden = true; $("#pip").hidden = true; setCamUi("off");
}
function setCamUi(state) {
  const b = $("#cambtn"); b.dataset.state = state === "on" && cam.standby ? "standby" : state;
  out("cam-label", state === "on" ? (cam.standby ? "Standby" : "Hands on") : state === "starting" ? "Starting…" : "Camera off");
  $$(".cta [data-cam]").forEach(x => x.lastChild.textContent = state === "on" ? "Turn the camera off" : state === "starting" ? "Starting the camera…" : x.closest(".cover") ? "Steer this page with your hands" : "Use my camera");
}
$$("[data-cam]").forEach(b => b.addEventListener("click", startCam));
function camStep(now) {
  if (!cam.on || !landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const res = landmarker.detectForVideo(video, performance.now());
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  // mirror like Precog does (it flips the frame before tracking), so handedness swaps
  cam.hands = (res.landmarks || []).map((lms, k) => {
    const lab = res.handedness && res.handedness[k] && res.handedness[k][0] ? res.handedness[k][0].categoryName : "Right";
    return { label: lab === "Left" ? "Right" : "Left", lm: lms.map(p => [(1 - p.x) * aspect, p.y, p.z * aspect]) };
  });
  if (cam.ten.update(now, cam.hands)) { cam.standby = !cam.standby; setCamUi("on"); out("pip-tag", cam.standby ? "standby" : "gesture mode"); toast(cam.standby ? "Standby: ten fingers again to wake" : "Awake"); return; }
  if (cam.standby) return;
  const r = cam.recog.update(now, cam.hands);
  if (r) {
    cam.lastFired = r.gesture.name; cam.lastFiredAt = now;
    const n = r.gesture.name;
    if (n === "swipe left") { go(cur + 1); toast("← swipe left · next section"); }
    else if (n === "swipe right") { go(cur - 1); toast("swipe right → · previous section"); }
    else if (n === "expand") { toggleContents(); toast("expand · contents"); }
    else if (n === "pointer") { cam.laser = !cam.laser; $("#laser").hidden = !cam.laser; out("pip-tag", cam.laser ? "pointer" : "gesture mode"); toast(cam.laser ? "pointer on" : "pointer off"); }
    else toast(`${n} · recognised`);
  }
  if (cam.laser && cam.hands.length) {
    const tip = cam.hands[0].lm[8], m = 0.18;
    const x = Math.min(1, Math.max(0, (tip[0] / aspect - m) / (1 - 2 * m))), y = Math.min(1, Math.max(0, (tip[1] - m) / (1 - 2 * m)));
    const L = $("#laser"); L.style.left = x * innerWidth + "px"; L.style.top = y * innerHeight + "px";
  }
}
function drawPip() {
  if (!cam.on) return;
  const c = $("#pipc"), { ctx, w, h, dpr } = fit(c);
  ctx.clearRect(0, 0, w, h);
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  const m = mapper([[0, 0], [aspect, 1]], w, h, 8 * dpr, 14 * dpr);
  const col = cam.standby ? COL.fired : cam.laser ? COL.amber : COL.ink;
  cam.hands.forEach(hd => drawHand(ctx, hd.lm, m, { color: col, lw: 2 * dpr, r: 2 * dpr }));
  if (cam.ten.progress > 0) { ctx.strokeStyle = COL.fired; ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.arc(w - 20 * dpr, 20 * dpr, 10 * dpr, -Math.PI / 2, -Math.PI / 2 + cam.ten.progress * 6.283); ctx.stroke(); }
}

// ---------- render loop: only what is on screen ----------
const visible = new Set();
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { visible.add(e.target); ensureViz(e.target); } else visible.delete(e.target);
}), { rootMargin: "200px" });
scenes.forEach(s => io.observe(s));
function loop() {
  const now = performance.now() / 1000;
  camStep(now);
  let liveShown = false;
  for (const [c, draw] of views) {
    const s = c.closest(".scene");
    if (visible.has(s)) { draw(now); if (c.dataset.viz === "live") liveShown = true; }
  }
  if (!liveShown) demoStep(now); // keep the demo stream warm
  drawPip();
  requestAnimationFrame(loop);
}
placeRail(); track();
addEventListener("load", () => { placeRail(); track(); });
requestAnimationFrame(loop);
})();
