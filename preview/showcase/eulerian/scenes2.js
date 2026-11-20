/* Scenes for chapters 6 to 14. Same contract as scenes.js: draw(env, p) is a pure function of p, UI state and the clip clock. */
(function () {
"use strict";
const L = window.EVMLib, SC = window.EVMScenes, EV = window.EVM;
const { cl, sm, seg, lerp, lerpR, K, mid, into, text, withAlpha, line, arrow, rrect, frame, series, drawRGBA, clipFrame, waiting, square, heroRect, clipToRect, rectToClip, PIX, SPEC, specPlot, timePlot, specHoverTip, TAU } = L;

// ---------- helpers ----------
const memo = new Map();
function cache(key, fn) { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); }
const fmt = (v, d) => (+v).toFixed(d == null ? 2 : d);
// a grey clip drawn straight onto the page: background value bg maps to transparent, fgv to the tint;
// values below the background (overshoot from amplification) show in the warning colour
function greyToPage(e, arr, w, h, bg, fgv, tint) {
  const out = new Uint8ClampedArray(w * h * 4), T = e.pal[tint || "sway"], R = e.pal.heart, B = e.pal.bg;
  for (let i = 0; i < w * h; i++) {
    const a = (arr[i] - bg) / (fgv - bg);
    let c, al;
    if (a >= 0) { c = a > 1 ? T.map(v => v + (255 - v) * Math.min(1, (a - 1) * 1.5)) : T; al = Math.min(1, a); }
    else { c = R; al = Math.min(1, -a * 1.6); }
    out[i * 4] = B[0] + (c[0] - B[0]) * al; out[i * 4 + 1] = B[1] + (c[1] - B[1]) * al; out[i * 4 + 2] = B[2] + (c[2] - B[2]) * al; out[i * 4 + 3] = 255;
  }
  return out;
}
function drawGrey(e, arr, w, h, r, bg, fgv, tint) {
  drawRGBA(e, greyToPage(e, arr, w, h, bg, fgv, tint), r, { w, h });
}
function ideal1Dc(key, x, lo, hi) { return cache("i1" + key + lo + "|" + hi, () => EV.ideal1D(x, lo, hi, 30)); }
function iir1Dc(key, x, lo, hi) { return cache("ii" + key + lo + "|" + hi, () => EV.iir1D(x, lo, hi, 30, 5)); }
function amp1(x, f) { const s = EV.ampSpectrum(Array.from(x)); return s[Math.round(f * 10)]; }

// ===== 6. keep one band, drop the rest =====
SC[6] = {
  desc: "The pixel spectrum again. A window is cut around 0.83 to 1 Hz; every bar outside it shrinks to zero and the noisy line above becomes a clean 1 Hz wave. Then the softer response of a cheap IIR filter is drawn beside the sharp window.",
  draw(e, p) {
    const F = e.F, g = e.ctx, ui = e.ui;
    const tr = { x: F.x + 40, y: F.y + F.h * .08, w: F.w - 54, h: F.h * (e.phone ? .24 : .3) };
    const sr = { x: F.x + 40, y: F.y + F.h * (e.phone ? .48 : .56), w: F.w - 54, h: F.h * (e.phone ? .32 : .28) };
    const w = into(e, p, 1, .08), cut = into(e, p, 2, .08), iir = into(e, p, 4, .07);
    const mode = iir > .5 ? (ui.bandMode || "iir") : "ideal";
    const lo = lerp(.4, ui.bandLo, w), hi = lerp(4, ui.bandHi, w);
    const gIdeal = f => (f >= ui.bandLo - 1e-9 && f <= ui.bandHi + 1e-9) ? 1 : 0;
    const gIIR = f => EV.iirResponse(f, .4, 3, 30);
    const gain = f => lerp(1, mode === "iir" ? gIIR(f) : gIdeal(f), cut);
    // time view: the raw line morphs into the filtered one
    const raw = PIX.x.map(v => v - 190);
    const fid = ideal1Dc("pix", PIX.x, ui.bandLo, ui.bandHi), fii = iir1Dc("pix", PIX.x, .4, 3);
    const filt = mode === "iir" ? fii : fid;
    const yr = lerp(9, 2.2, cut);
    const ys = raw.map((v, i) => lerp(v, filt[i], cut));
    const m = frame(e, tr, { x0: 0, x1: 10, y0: -yr, y1: yr, xt: [0, 2, 4, 6, 8, 10], xf: v => v + " s", yl: cut < .5 ? "one pixel, illustrative · change in grey level" : "after the filter · change in grey level" });
    if (iir > .02 && mode === "iir") withAlpha(e, iir * cut, () => series(e, m, i => i / 30, Array.from(fid), e.pal.c("ink2"), 1.6));
    g.save(); g.beginPath(); g.rect(tr.x - 2, tr.y - 2, tr.w + 4, tr.h + 4); g.clip();
    series(e, m, i => i / 30, ys, e.pal.c(cut > .5 ? "heart" : "ink"), cut > .5 ? 2 : 1.4);
    g.restore();
    withAlpha(e, cut, () => {
      const a = amp1(filt, 1);
      text(e, mode === "iir" ? `IIR output: a bit rougher (1 Hz amplitude ${fmt(a)})` : `ideal output: a 1 Hz wave, amplitude ${fmt(a)}`, tr.x + tr.w, e.phone ? tr.y + tr.h + 36 : tr.y - 8, { size: 12, align: "right", color: e.pal.c("heart") });
    });
    // spectrum with the window
    const sm_ = specPlot(e, sr, { gain, colour: { heart: true } });
    const x0 = sm_.X(lo), x1 = sm_.X(hi);
    g.fillStyle = e.pal.c("heart", .1); g.fillRect(x0, sr.y - 4, x1 - x0, sr.h + 4);
    g.strokeStyle = e.pal.c("heart"); g.lineWidth = 2; g.beginPath(); g.moveTo(x0, sr.y + sr.h); g.lineTo(x0, sr.y - 4); g.lineTo(x1, sr.y - 4); g.lineTo(x1, sr.y + sr.h); g.stroke();
    withAlpha(e, w * (1 - iir), () => text(e, `ideal filter: a brick wall · ${fmt(ui.bandLo)} to ${fmt(ui.bandHi)} Hz`, e.phone ? sr.x + sr.w : Math.min(x1 + 10, sr.x + sr.w - 250), e.phone ? sr.y + 16 : sr.y - 14, { size: 12, color: e.pal.c("heart"), halo: true, align: e.phone ? "right" : "left" }));
    // drag handles on the window edges
    if (w > .5) {
      const hw = 22;
      [["bandLo", x0], ["bandHi", x1]].forEach(([k, x]) => {
        g.fillStyle = e.pal.c("heart"); rrect(g, x - 4, sr.y + sr.h * .35, 8, sr.h * .3, 4); g.fill();
        e.hit({ x: x - hw, y: sr.y - 10, w: hw * 2, h: sr.h + 20 }, "band", { cursor: "ew-resize", drag: true, move: (px) => {
          const f = Math.round(cl((px - sr.x) / sr.w) * 5.05 * 100) / 100;
          if (k === "bandLo") ui.bandLo = Math.max(.1, Math.min(f, ui.bandHi - .05)); else ui.bandHi = Math.min(5, Math.max(f, ui.bandLo + .05));
        } });
      });
    }
    // IIR response curve (the true response of the implemented filter)
    withAlpha(e, iir, () => {
      const pts = []; for (let k = 0; k <= 200; k++) { const f = .01 + k / 200 * 5.04; pts.push([sm_.X(f), sm_.Y(gIIR(f))]); }
      line(e, pts, e.pal.c("sway"), 2.2);
      text(e, "cheap IIR: softer edges, runs frame by frame", sm_.X(3.1), sm_.Y(gIIR(3)) - 12, { size: 12, color: e.pal.c("sway"), halo: true });
      text(e, "gain 1", sr.x - 6, sm_.Y(1) + 4, { size: 11, align: "right", color: e.pal.c("ink3") });
    });
    text(e, "B(t) = bandpass of I(t), keeping f between wl and wh", sr.x, sr.y + sr.h + 40, { size: 12, color: e.pal.c("ink3") });
  },
};

// ===== 7. split the picture first =====
function levelsOf(e) {
  return cache("lev" + e.fi, () => {
    const D = e.D, P = D.clip.P, o = e.fi * P * 3, out = [];
    const planes = [0, 1, 2].map(c => { const a = new Float32Array(P); for (let i = 0; i < P; i++) a[i] = D.clip.frames[o + i * 3 + c]; return EV.lapBuild(a, EV.W, EV.W, 5); });
    for (let l = 0; l < 5; l++) {
      const [w, h] = planes[0].sizes[l], rgba = new Uint8ClampedArray(w * h * 4), top = l === 4;
      for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) rgba[i * 4 + c] = top ? planes[c].bands[l][i] : 128 + planes[c].bands[l][i] * 3;
      for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = 255;
      out.push({ w, h, rgba });
    }
    if (memo.size > 400) memo.clear();
    return out;
  });
}
function g3series(e) {          // green value of Gaussian level 3 (16 x 16) at the forehead, every frame
  return cache("g3", () => {
    const D = e.D, P = D.clip.P, out = new Float64Array(300);
    for (let t = 0; t < 300; t++) {
      let a = new Float32Array(P); const o = t * P * 3; for (let i = 0; i < P; i++) a[i] = D.clip.frames[o + i * 3 + 1];
      let w = EV.W; for (let l = 0; l < 3; l++) { a = EV.blurDown(a, w, w); w >>= 1; }
      const LF = D.clip.model.L.forehead; out[t] = a[(LF.y >> 3) * w + (LF.x >> 3)];
    }
    return out;
  });
}
function noiseSd(x) {             // white-noise sigma estimated from 3 to 15 Hz, where none of the synthetic signals live
  const hi = EV.ideal1D(Array.from(x), 3, 15, 30); let s = 0; for (const v of hi) s += v * v;
  return Math.sqrt(s / x.length * 15 / 12);
}
SC[7] = {
  desc: "The face splits into five pictures of shrinking size: fine edges and grain at the bottom level, soft blobs at the top. Then one forehead pixel is compared at the finest scale and averaged at a coarse level: the noise drops and the 1 Hz pulse shows.",
  anim: true,
  draw(e, p) {
    const F = e.F, g = e.ctx;
    if (!e.D.ready) { waiting(e, F); return; }
    const split = into(e, p, 1, .1), noise = into(e, p, 2, .08), fine = into(e, p, 3, .07);
    const hero = heroRect(e, .9);
    const lv = levelsOf(e);
    // target slots: a row of shrinking pictures
    const S0 = e.phone ? Math.min(F.w * .3, F.h * .36) : Math.min(F.w * .3, F.h * .34), gap = e.phone ? 10 : 22;
    const sizes = [0, 1, 2, 3, 4].map(l => S0 * Math.pow(.74, l));
    const total = sizes.reduce((a, b) => a + b, 0) + gap * 4;
    let x = F.x + (F.w - total) / 2; const rowY = F.y + (e.phone ? F.h * .08 : F.h * .14) + S0 * .1;
    const slots = sizes.map(s => { const r = { x, y: rowY + (S0 - s), w: s, h: s }; x += s + gap; return r; });
    withAlpha(e, 1 - split, () => drawRGBA(e, clipFrame(e, 0), hero, { matte: true }));
    if (split > .01) {
      for (let l = 4; l >= 0; l--) {
        let r = lerpR(hero, slots[l], split);
        const hov = e.ui.levelHover === l;
        if (hov) { const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }, s = r.w * 1.35; r = { x: c.x - s / 2, y: r.y + r.h - s, w: s, h: s }; }
        withAlpha(e, split, () => drawRGBA(e, lv[l].rgba, r, { w: lv[l].w, h: lv[l].h, pixel: l >= 3 && !hov }));
        if (fine > .01 && l < 2) withAlpha(e, fine * .35, () => { g.fillStyle = e.pal.c("heart"); g.fillRect(r.x, r.y, r.w, r.h); });
        e.hit(slots[l], "level", { cursor: "pointer", move: () => { e.ui.levelHover = l; } });
        withAlpha(e, split, () => {
          const lam = EV.levelLambda(l);
          text(e, l === 4 ? "residual" : `level ${l}`, slots[l].x, rowY + S0 + 20, { size: 12, color: e.pal.c("ink") });
          text(e, `${lv[l].w} px`, slots[l].x, rowY + S0 + 36, { size: 11, color: e.pal.c("ink3") });
          if (!e.phone || l < 4) text(e, `λ ≈ ${lam}`, slots[l].x, rowY + S0 + 52, { size: 11, color: e.pal.c("ink3") });
          if (l < 4) text(e, "+", slots[l].x + slots[l].w + gap / 2, rowY + S0 * .55, { size: 18, align: "center", color: e.pal.c("ink2") });
        });
      }
      withAlpha(e, split, () => {
        text(e, "fine: edges and grain  →  coarse: broad blobs   ·   all five added together = the original frame", F.x + F.w / 2, rowY - 16, { size: e.phone ? 10.5 : 12, align: "center", color: e.pal.c("ink2") });
        withAlpha(e, 1 - noise, () => text(e, "wavelengths λ in original pixels are illustrative", F.x + F.w / 2, rowY + S0 + 74, { size: 11, align: "center", color: e.pal.c("ink3") }));
      });
    }
    withAlpha(e, fine, () => {
      text(e, "fine levels: amplify gently, they break first", slots[0].x, rowY - 38, { size: 12, color: e.pal.c("heart") });
      text(e, "coarse levels: cleaner, safe to amplify", slots[4].x + slots[4].w, rowY - 38, { size: 12, align: "right", color: e.pal.c("green") });
    });
    // noise demo: one pixel at full resolution versus the same place at a coarse level
    if (noise > .01) withAlpha(e, noise, () => {
      const top = rowY + S0 + (e.phone ? 84 : 116), hh = (F.y + F.h - top - (e.phone ? 34 : 50)) / 2;
      const LF = e.D.clip.model.L.forehead, raw = e.D.series(LF.x, LF.y, 1), g3 = g3series(e);
      const rows = [["level 0: one pixel", raw], ["level 3: about 8 by 8 pixels pooled", g3]];
      rows.forEach(([lab, ser], j) => {
        const r = { x: F.x + 40, y: top + j * (hh + 18) + 14, w: F.w - 54, h: hh - 18 };
        let mean = 0; for (let i = 0; i < 150; i++) mean += ser[i]; mean /= 150;
        const mm = frame(e, r, { x0: 0, x1: 5, y0: mean - 4, y1: mean + 4, xt: j ? [0, 1, 2, 3, 4, 5] : [], xf: v => v + " s", axis: true });
        series(e, mm, i => i / 30, Array.from(ser).slice(0, 150), e.pal.c(j ? "skin" : "ink2"), j ? 2.2 : 1.1);
        text(e, `${lab} · noise σ ≈ ${fmt(noiseSd(ser))} (measured)`, r.x, r.y - 4, { size: 12, color: e.pal.c(j ? "skin" : "ink2") });
      });
      text(e, "Pooling pixels cancels noise, not the pulse.", F.x + 40, top - 8, { size: 14, color: e.pal.c("ink"), font: "body", weight: 500 });
    });
  },
};

// ===== 8. amplify, add, and why it works =====
const EDGE = x => 100 / (1 + Math.exp(-(x - 32) / 3.64));        // a blurry edge: 0 to 100 over about 16 px
SC[8] = {
  desc: "First a 0.5 grey-level wave multiplied by 50 becomes 25. Then a blurry edge shifts by 1 pixel; the brightness change at one pixel on the slope, multiplied by alpha and added back, makes the edge look shifted (1 + alpha) times further. Finally three patterns of wavelength 64, 16 and 4 pixels: the trick holds for the smooth one and breaks for the sharp one, with the safe alpha for each scale.",
  draw(e, p) {
    const F = e.F, g = e.ctx, ui = e.ui;
    const a1 = 1 - into(e, p, 2, .07), a2 = into(e, p, 2, .07) * (1 - into(e, p, 4, .07)), a3 = into(e, p, 4, .07);
    if (a1 > .01) withAlpha(e, a1, () => {
      const w2 = (F.w - 60) / 2, r1 = { x: F.x + 30, y: F.y + F.h * .3, w: w2 * .8, h: F.h * .34 }, r2 = { x: F.x + 50 + w2, y: r1.y, w: w2 * .8, h: r1.h };
      const m1 = frame(e, r1, { x0: 0, x1: 3, y0: -30, y1: 30, xt: [0, 1, 2, 3], xf: v => v + " s", yl: "band-passed change: 0.5 grey levels" });
      const m2 = frame(e, r2, { x0: 0, x1: 3, y0: -30, y1: 30, xt: [0, 1, 2, 3], xf: v => v + " s", yl: "× 50 = 25 grey levels" });
      const pts = k => Array.from({ length: 181 }, (_, i) => { const t = i / 60; return [k.X(t), k.Y((k === m1 ? .5 : 25) * Math.sin(TAU * t))]; });
      line(e, pts(m1), e.pal.c("ink"), 2); line(e, pts(m2), e.pal.c("skin"), 2.4);
      arrow(e, r1.x + r1.w + 8, r1.y + r1.h / 2, r2.x - 8, r2.y + r2.h / 2, e.pal.c("skin"), 2);
      text(e, "× α", (r1.x + r1.w + r2.x) / 2, r1.y + r1.h / 2 - 12, { size: 15, align: "center", color: e.pal.c("skin") });
      text(e, "output = original + α × filtered", F.x + F.w / 2, r1.y + r1.h + 70, { size: 14, align: "center", color: e.pal.c("ink") });
    });
    if (a2 > .01) withAlpha(e, a2, () => {
      const r = { x: F.x + 40, y: F.y + F.h * .1, w: F.w - 60, h: F.h * (e.phone ? .5 : .52) };
      const m = frame(e, r, { x0: 8, x1: 56, y0: -10, y1: 115, xt: [10, 20, 30, 40, 50], xf: v => v + " px", yl: "intensity along a row of pixels" });
      const al = ui.edgeAlpha * into(e, p, 3, .08), d = 1, x0 = 30;
      const P = fn => Array.from({ length: 241 }, (_, i) => { const x = 8 + i * .2; return [m.X(x), m.Y(fn(x))]; });
      line(e, P(EDGE), e.pal.c("ink3"), 1.5);
      line(e, P(x => EDGE(x - d)), e.pal.c("ink"), 2);
      if (al > 0.01) {
        line(e, P(x => EDGE(x - (1 + al) * d)), e.pal.c("ink2"), 1.3, [5, 5]);
        line(e, P(x => EDGE(x) + (1 + al) * (EDGE(x - d) - EDGE(x))), e.pal.c("heart"), 2.6);
      }
      // the probe pixel and the change B
      const yf = EDGE(x0), yi = EDGE(x0 - d);
      line(e, [[m.X(x0), r.y], [m.X(x0), r.y + r.h]], e.pal.c("skin", .5), 1, [2, 4]);
      arrow(e, m.X(x0) + 14, m.Y(yf), m.X(x0) + 14, m.Y(yi), e.pal.c("skin"), 2);
      text(e, `B = ${fmt(yi - yf, 1)}`, m.X(x0) + 22, (m.Y(yf) + m.Y(yi)) / 2 + 4, { size: 13, color: e.pal.c("skin"), halo: true });
      text(e, "probe pixel", m.X(x0), r.y + r.h + 34, { size: 12, align: "center", color: e.pal.c("skin") });
      const lx = r.x + 6, ly = r.y + 18, sz = e.phone ? 11 : 12.5;
      text(e, "grey: f(x), the edge at rest", lx, ly, { size: sz, color: e.pal.c("ink3") });
      text(e, "black: I(x,t) = f(x − δ), shifted δ = 1 px", lx, ly + 20, { size: sz, color: e.pal.c("ink") });
      text(e, "B(x,t) = I − f ≈ −δ ∂f/∂x", lx, ly + 40, { size: sz, color: e.pal.c("skin") });
      withAlpha(e, al > .01 ? 1 : 0, () => {
        text(e, `red: I + αB with α = ${fmt(al, 1)}`, lx, ly + 60, { size: sz, color: e.pal.c("heart") });
        text(e, `dashed: f(x − (1+α)δ), a true shift of ${fmt((1 + al) * d, 1)} px`, lx, ly + 80, { size: sz, color: e.pal.c("ink2") });
      });
      text(e, "brightness change = shift in disguise", F.x + F.w / 2, r.y + r.h + (e.phone ? 58 : 70), { size: 15, align: "center", color: e.pal.c("ink"), font: "body", weight: 500 });
    });
    if (a3 > .01) withAlpha(e, a3, () => ladder(e));
  },
};
function ladder(e) {
  const F = e.F, g = e.ctx, al = e.ui.ladderAlpha, d = .1;
  const lw = e.phone ? F.w - 20 : F.w * .56, rows = [64, 16, 4], rh = (e.phone ? F.h * .55 : F.h * .8) / 3;
  rows.forEach((lam, j) => {
    const r = { x: F.x + 20, y: F.y + 18 + j * rh + 16, w: lw - 20, h: rh - 46 };
    const amax = lam / (8 * d) - 1, ok = al <= amax;
    const f = x => 50 + 50 * Math.cos(TAU * x / lam);
    const m = frame(e, r, { x0: 0, x1: 2 * lam, y0: -40, y1: 140, xt: [], axis: true });
    g.fillStyle = e.pal.c("ink", .05); g.fillRect(r.x, m.Y(100), r.w, m.Y(0) - m.Y(100));
    const P = fn => Array.from({ length: 241 }, (_, i) => { const x = i / 240 * 2 * lam; return [m.X(x), m.Y(fn(x))]; });
    g.save(); g.beginPath(); g.rect(r.x - 4, r.y + 4, r.w + 8, r.h - 4); g.clip();
    line(e, P(x => f(x - (1 + al) * d)), e.pal.c("ink2"), 1.4, [5, 4]);
    line(e, P(x => f(x) + (1 + al) * (f(x - d) - f(x))), e.pal.c(ok ? "green" : "heart"), 2.3);
    g.restore();
    const over = Math.max(...P(x => f(x) + (1 + al) * (f(x - d) - f(x))).map(q => q[1] < r.y + 4 ? 1 : 0));
    if (over) text(e, "overshoots off the scale", r.x + r.w, r.y + r.h + 14, { size: 11, align: "right", color: e.pal.c("heart") });
    text(e, `λ = ${lam} px · safe α up to ${fmt(amax, 0)} · ${ok ? "within the bound" : "beyond the bound"}`, r.x, r.y - 6, { size: 12, color: e.pal.c(ok ? "green" : "heart") });
  });
  // alpha against wavelength (paper Fig. 6 style)
  const cr = e.phone ? { x: F.x + 40, y: F.y + F.h * .68, w: F.w - 60, h: F.h * .2 } : { x: F.x + lw + 50, y: F.y + F.h * .2, w: F.w - lw - 60, h: F.h * .5 };
  const X = lam => cr.x + (Math.log2(lam) - 2) / 5 * cr.w, Y = a => cr.y + cr.h - a / 100 * cr.h;
  g.strokeStyle = e.pal.c("rule"); g.lineWidth = 1; g.beginPath(); g.moveTo(cr.x, cr.y + cr.h); g.lineTo(cr.x + cr.w, cr.y + cr.h); g.moveTo(cr.x, cr.y); g.lineTo(cr.x, cr.y + cr.h); g.stroke();
  [4, 8, 16, 32, 64, 128].forEach(l => text(e, String(l), X(l), cr.y + cr.h + 16, { size: 11, align: "center", color: e.pal.c("ink3") }));
  text(e, "λ (px)", cr.x + cr.w, cr.y + cr.h + 32, { size: 11, align: "right", color: e.pal.c("ink3") });
  [0, 50, 100].forEach(a => text(e, String(a), cr.x - 8, Y(a) + 4, { size: 11, align: "right", color: e.pal.c("ink3") }));
  text(e, "α", cr.x - 30, cr.y + cr.h / 2, { size: 12, align: "right", color: e.pal.c("ink3") });
  const bound = []; for (let k = 0; k <= 100; k++) { const l = 4 * Math.pow(2, k / 20); bound.push([X(l), Y(Math.min(100, l / (8 * d) - 1))]); }
  line(e, bound, e.pal.c("ink3"), 1.2, [4, 4]);
  const lc = 8 * d * (1 + al);                                   // where the bound meets the chosen alpha
  const sched = []; for (let k = 0; k <= 100; k++) { const l = 4 * Math.pow(2, k / 20); sched.push([X(l), Y(l >= lc ? al : al * l / lc)]); }
  line(e, sched, e.pal.c("skin"), 2.6);
  [[64, 79], [32, 39], [16, 19], [8, 9], [4, 4]].forEach(([l, a]) => { const gx = X(l), gy = Y(a); g.beginPath(); g.arc(gx, gy, 3.5, 0, TAU); g.fillStyle = e.pal.c("ink"); g.fill(); text(e, String(a), gx - 6, gy - 7, { size: 11, align: "right", color: e.pal.c("ink2"), halo: true }); });
  text(e, "(1 + α) δ < λ / 8, δ = 0.1 px", cr.x, cr.y - 26, { size: 12, color: e.pal.c("ink") });
  text(e, `orange: α per scale for α = ${al}`, cr.x, cr.y - 8, { size: 12, color: e.pal.c("skin") });
}

// ---------- grey clips, built on first use ----------
const sigm = x => 1 / (1 + Math.exp(-x));
function bigMotion() {      // a chest moving 6 px: far beyond the small-motion bound
  return cache("big", () => {
    const c = EV.greyClip(64, 64, 300, 30, (x, y, t) => { const top = 30 + .012 * (x - 32) ** 2 - 6 * Math.sin(TAU * .3 * t); return 40 + 110 * sigm((y - top) / 1.6); }, 5, 1);
    return { c, run: EV.greyMagnifier(c, .2, .5) };
  });
}
function smallClips() {
  return cache("small", () => {
    const chest = EV.greyClip(96, 40, 300, 30, (x, y, t) => { const top = 30 - 16 * Math.exp(-(((x - 48) / 24) ** 2)) - .4 * Math.sin(TAU * .3 * t); return 40 + 120 * sigm((y - top) / 1.8); }, 11, .2);
    const string = EV.greyClip(96, 32, 300, 30, (x, y, t) => { const d = .15 * Math.sin(Math.PI * x / 95) * Math.sin(TAU * 3 * t); return 40 + 170 * Math.exp(-((y - 16 - d) ** 2) / (2 * 3 * 3)); }, 12, .2);
    const tower = EV.greyClip(32, 96, 300, 30, (x, y, t) => { const d = .06 * ((96 - y) / 96) * Math.sin(TAU * .3 * t); return 40 + 130 * sigm((4.5 - Math.abs(x - 16 - d)) / 1.4) * sigm((y - 6) / 1.2); }, 13, .2);
    return [
      { c: chest, run: EV.greyMagnifier(chest, .2, .5), a: 10, lab: "breathing chest · α 10 · 0.2 to 0.5 Hz" },
      { c: string, run: EV.greyMagnifier(string, 2.5, 3.5), a: 8, lab: "string · α 8 · 3 Hz" },
      { c: tower, run: EV.greyMagnifier(tower, .2, .4), a: 75, lab: "tower · α 75 · 0.2 to 0.4 Hz" },
    ];
  });
}
function freeMag(e) { const m = e.D.mag.free; m.set({ mode: "ideal", lo: .83, hi: 1, lambdaC: 4, ramp: false, chrom: 1 }); return m; }
function dial(e, cx, cy, R, val, max, label, col) {
  const g = e.ctx, a0 = Math.PI * .8, a1 = Math.PI * 2.2, v = Math.min(1, Math.log10(1 + val) / Math.log10(1 + max));
  g.lineCap = "round"; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, R, a0, a1); g.strokeStyle = e.pal.c("rule"); g.stroke();
  g.beginPath(); g.arc(cx, cy, R, a0, a0 + (a1 - a0) * v); g.strokeStyle = e.pal.c(col || "skin"); g.stroke();
  const an = a0 + (a1 - a0) * v; line(e, [[cx, cy], [cx + (R - 6) * Math.cos(an), cy + (R - 6) * Math.sin(an)]], e.pal.c("ink"), 2);
  text(e, label, cx, cy + R + 16, { size: 12, align: "center", color: e.pal.c("ink2") });
}

// ===== 9. the whole pipeline =====
const STAGES = ["input video", "spatial decomposition", "temporal bandpass", "× α per level", "add to original", "collapse pyramid", "output video"];
function unitImage(e, gain) {
  const u = e.D.mag.pulse.unit(e.fi), out = new Uint8ClampedArray(EV.W * EV.W * 4);
  for (let i = 0; i < EV.W * EV.W; i++) { out[i * 4] = 128 + gain * u[i * 3]; out[i * 4 + 1] = 128 + gain * u[i * 3 + 1]; out[i * 4 + 2] = 128 + gain * u[i * 3 + 2]; out[i * 4 + 3] = 255; }
  return out;
}
SC[9] = {
  desc: "A seven-stage diagram lights up stage by stage: input, spatial decomposition, temporal bandpass, multiply by alpha per level, add to the original, collapse, output. Then the face is magnified as a dial turns alpha from 1 to 100, and it flushes with each beat. Side by side: colour magnification of the face and motion magnification of the breathing chest. Last, what goes wrong: grain and clipping at alpha 300 and 1000, and ghosts when a large motion is amplified.",
  anim: true,
  draw(e, p) {
    const F = e.F, g = e.ctx;
    if (!e.D.ready) { waiting(e, F); return; }
    const sDiag = 1 - into(e, p, 2, .07), sFace = into(e, p, 2, .07) * (1 - into(e, p, 4, .07)), sTwo = into(e, p, 4, .07) * (1 - into(e, p, 5, .07)), sBad = into(e, p, 5, .07);
    if (sDiag > .01) withAlpha(e, sDiag, () => {
      const lit = 1 + Math.floor(6.99 * seg(p, mid(e, 1) - .02, K(e, 1) + .05));
      const n = STAGES.length, cols = e.phone ? 4 : 7, gap = e.phone ? 8 : 12;
      const bw = (F.w - gap * (cols - 1)) / cols, bh = bw * 1.55, rowsY = [F.y + F.h * (e.phone ? .06 : .28), F.y + F.h * .06 + bh + 30];
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols), col = i % cols, x = F.x + col * (bw + gap), y = rowsY[row];
        const on = i < lit, now = i === lit - 1;
        g.globalAlpha = on ? 1 : .35;
        rrect(g, x, y, bw, bh, 12); g.strokeStyle = e.pal.c(now ? "skin" : "ink3"); g.lineWidth = now ? 2.2 : 1; g.stroke();
        const tr = { x: x + 6, y: y + 6, w: bw - 12, h: bw - 12 };
        if (i === 0) drawRGBA(e, e.D.mag.pulse.raw(e.fi), tr, {});
        else if (i === 1) { for (let l = 0; l < 3; l++) { const s = tr.w * Math.pow(.62, l); drawRGBA(e, e.D.mag.pulse.raw(e.fi), { x: tr.x + tr.w - s, y: tr.y + tr.h - s, w: s, h: s }, { alpha: 1 - l * .2 }); } }
        else if (i === 2) drawRGBA(e, unitImage(e, 60), tr, {});
        else if (i === 3) drawRGBA(e, unitImage(e, 160), tr, {});
        else drawRGBA(e, e.D.mag.pulse.frame(e.fi, 100), tr, {});
        const words = STAGES[i].split(" "); let ly = y + bw + 6;
        const half = Math.ceil(words.length / 2);
        [words.slice(0, half).join(" "), words.slice(half).join(" ")].forEach(t => { if (t) { text(e, t, x + bw / 2, ly + 10, { size: e.phone ? 10.5 : 12, align: "center", color: e.pal.c(now ? "skin" : "ink") }); ly += 16; } });
        g.globalAlpha = 1;
        if (i < n - 1 && col < cols - 1) arrow(e, x + bw + 1, y + bh / 2, x + bw + gap - 1, y + bh / 2, e.pal.c("ink3"), 1);
      }
      text(e, "out(level l, pixel p, t) = in + α_l × bandpass(in), then collapse the pyramid", F.x, rowsY[e.phone ? 1 : 0] + (e.phone ? bh + 40 : bh + 46), { size: e.phone ? 11 : 13, color: e.pal.c("ink2") });
    });
    if (sFace > .01) withAlpha(e, sFace, () => {
      const al = 1 + 99 * seg(p, mid(e, 2) - .02, K(e, 2) + .03);
      const r = heroRect(e, .95);
      drawRGBA(e, e.D.mag.pulse.frame(e.fi, al), r, { matte: true });
      dial(e, e.phone ? F.x + 40 : F.x + F.w - 50, e.phone ? F.y + 40 : F.y + F.h * .2, 30, al, 100, `α = ${Math.round(al)}`);
      text(e, "band 0.83 to 1 Hz · finest two levels at α 0", e.phone ? F.x + F.w - 4 : F.x + F.w - 4, e.phone ? F.y + 12 : F.y + F.h * .2 + 76, { size: 12, align: "right", color: e.pal.c("ink3"), halo: true });
    });
    if (sTwo > .01) withAlpha(e, sTwo, () => {
      const s = e.phone ? Math.min((F.w - 12) / 2, F.h * .8) : Math.min((F.w - 30) / 2, F.h * .7), y = F.y + (e.phone ? 26 : F.h * .14);
      const a = { x: F.x, y, w: s, h: s }, b = { x: F.x + F.w - s, y, w: s, h: s };
      drawRGBA(e, e.D.mag.pulse.frame(e.fi, 100), a, { matte: true });
      drawRGBA(e, e.D.mag.breath.frame(e.fi, 10), b, { matte: true });
      const LM = e.D.clip.model.L, rp = clipToRect(b, LM.chestX, LM.shoulderY(LM.chestX)), rx0 = clipToRect(b, LM.chestX - 22, 0).x, rx1 = clipToRect(b, LM.chestX + 22, 0).x, ry = rp.y;
      line(e, [[rx0, ry], [rx1, ry]], e.pal.c("sway", .9), 1.2, [4, 4]);
      text(e, "rest line", rx0, ry - 6, { size: 11, color: e.pal.c("sway"), halo: true });
      text(e, "COLOUR", a.x, y - 8, { size: 12, color: e.pal.c("skin") });
      text(e, "MOTION", b.x, y - 8, { size: 12, color: e.pal.c("sway") });
      const sz = e.phone ? 10.5 : 12;
      text(e, "ideal 0.83 to 1 Hz · α 100", a.x, a.y + a.h + 18, { size: sz, color: e.pal.c("ink2") });
      text(e, "ideal 0.2 to 0.5 Hz · α 10, ramped below λc 48", b.x, b.y + b.h + 18, { size: sz, color: e.pal.c("ink2") });
      text(e, "chest sway about 0.4 px in, about 4.4 px out (measured)", b.x, b.y + b.h + 36, { size: sz, color: e.pal.c("ink3") });
    });
    if (sBad > .01) withAlpha(e, sBad, () => {
      const m = freeMag(e), cols = e.phone ? 2 : 4, gap = 14, s = Math.min((F.w - gap * (cols - 1)) / cols, F.h * (e.phone ? .4 : .42)), y = F.y + F.h * (e.phone ? .06 : .2);
      [100, 300, 1000].forEach((al, i) => {
        const r = { x: F.x + (i % cols) * (s + gap), y: y + Math.floor(i / cols) * (s + 46), w: s, h: s };
        drawRGBA(e, m.frame(e.fi, al), r, {});
        text(e, `α ${al}, every level`, r.x, r.y + r.h + 16, { size: 12, color: e.pal.c(al > 100 ? "heart" : "ink2") });
      });
      const bm = bigMotion(), out = bm.run(e.fi, 10), i = 3, r = { x: F.x + (i % cols) * (s + gap), y: y + Math.floor(i / cols) * (s + 46), w: s, h: s };
      drawGrey(e, out, 64, 64, r, 40, 150, "sway");
      text(e, "6 px motion × 10: ghosts", r.x, r.y + r.h + 16, { size: 12, color: e.pal.c("heart") });
      text(e, "noise grows with α · the bound is (1 + α) δ < λ / 8", F.x, y - 14, { size: 13, color: e.pal.c("ink") });
    });
  },
};

// ===== 10. interlude: motion nobody could see =====
SC[10] = {
  desc: "Three generated shapes that look still: a breathing chest, a vibrating string and a tall tower. As you scroll, or with the slider, the amplification rises and each one visibly moves.",
  anim: true,
  draw(e, p) {
    const F = e.F;
    const mix = e.ui.motionMix != null ? e.ui.motionMix : seg(p, mid(e, 1), K(e, 1) + .05);
    const cl3 = smallClips();
    const tw = e.phone ? F.w * .22 : F.w * .2, lw = F.w - tw - 30;
    const chest = { x: F.x, y: F.y + F.h * .06, w: lw, h: lw * 40 / 96 }, str = { x: F.x, y: chest.y + chest.h + 54, w: lw, h: lw * 32 / 96 };
    const tow = { x: F.x + F.w - tw, y: F.y + F.h * .06, w: tw, h: Math.min(tw * 3, F.h * .82) };
    [chest, str, tow].forEach((r, i) => {
      const c = cl3[i], al = c.a * mix, out = c.run(e.fi, al);
      drawGrey(e, out, c.c.w, c.c.h, r, 40, i === 1 ? 210 : 160, "sway");
      text(e, c.lab, r.x, r.y + r.h + 16, { size: e.phone ? 10.5 : 12, color: e.pal.c("ink2") });
      text(e, `now × ${Math.round(al)}`, r.x, r.y + r.h + 32, { size: 12, color: e.pal.c("sway") });
    });
    text(e, "generated shapes · frequencies illustrative, slowed for 30 fps", F.x, F.y + F.h - 4, { size: 11, color: e.pal.c("ink3") });
  },
};

// ===== 11. try it =====
function trySpectrum(e, r) {
  const ui = e.ui, pb = ui.probe, key = "ts" + pb.x + "," + pb.y;
  const S = cache(key, () => EV.ampSpectrum(Array.from(e.D.series(pb.x, pb.y, 1))));
  const g = e.ctx, m = frame(e, r, { x0: 0, x1: 4.05, y0: 0, y1: 1.6, xt: [0, 1, 2, 3, 4], xf: v => v + " Hz", yl: `spectrum of pixel (${pb.x}, ${pb.y}), green` });
  const bw = Math.max(2, r.w / 41 * .6);
  for (let k = 1; k <= 40; k++) { const f = k / 10, inb = f >= ui.tLo - 1e-9 && f <= ui.tHi + 1e-9; g.fillStyle = e.pal.c(inb ? "skin" : "ink3"); g.fillRect(m.X(f) - bw / 2, m.Y(Math.min(1.6, S[k])), bw, r.y + r.h - m.Y(Math.min(1.6, S[k]))); }
  const x0 = m.X(ui.tLo), x1 = m.X(ui.tHi);
  g.fillStyle = e.pal.c("skin", .14); g.fillRect(x0, r.y, x1 - x0, r.h);
  if (ui.tMode === "iir") { const pts = []; for (let k = 0; k <= 160; k++) { const f = .01 + k / 160 * 4.04; pts.push([m.X(f), m.Y(EV.iirResponse(f, ui.tLo, ui.tHi, 30))]); } line(e, pts, e.pal.c("sway"), 1.8); }
  [["tLo", x0], ["tHi", x1]].forEach(([k, x]) => {
    line(e, [[x, r.y], [x, r.y + r.h]], e.pal.c("skin"), 2);
    e.hit({ x: x - 22, y: r.y - 8, w: 44, h: r.h + 16 }, "band", { cursor: "ew-resize", drag: true, move: (px) => {
      const f = Math.round(cl((px - r.x) / r.w) * 4.05 * 100) / 100;
      if (k === "tLo") ui.tLo = Math.max(.1, Math.min(f, ui.tHi - .05)); else ui.tHi = Math.min(4, Math.max(f, ui.tLo + .05));
      ui.tPreset = null;
    } });
  });
}
SC[11] = {
  desc: "The synthetic clip, split: original on the left of a draggable line, magnified on the right, with your band and alpha. Below, the spectrum of one pixel with your band shaded, and the safe alpha for each pyramid level.",
  anim: true,
  draw(e, p) {
    const F = e.F, g = e.ctx, ui = e.ui;
    if (!e.D.ready) { waiting(e, F); return; }
    const m = e.D.userMag();
    const s = e.phone ? Math.min(F.w * .64, F.h * .7) : Math.min(F.h * .64, F.w * .6);
    const v = { x: F.x, y: F.y, w: s, h: s };
    const sx = v.x + v.w * ui.tSplit;
    drawRGBA(e, m.raw(e.fi), v, {});         // original everywhere, magnified only right of the split
    g.save(); g.beginPath(); g.rect(sx, v.y, v.x + v.w - sx, v.h); g.clip(); drawRGBA(e, m.frame(e.fi, ui.tAlpha), v, {}); g.restore();
    line(e, [[sx, v.y - 6], [sx, v.y + v.h + 6]], e.pal.c("ink"), 2);
    g.beginPath(); g.arc(sx, v.y + v.h / 2, 13, 0, TAU); g.fillStyle = e.pal.c("ink"); g.fill();
    text(e, "‹ ›", sx, v.y + v.h / 2 + 4, { size: 12, align: "center", color: e.pal.c("bg") });
    e.hit({ x: v.x, y: v.y, w: v.w, h: v.h }, "split", { cursor: "ew-resize", drag: true, move: (px, py, r, type) => { ui.tSplit = cl((px - v.x) / v.w); } });
    text(e, "original", v.x + 6, v.y + 16, { size: 12, color: "#fff", halo: false });
    text(e, `magnified × ${ui.tAlpha}`, v.x + v.w - 6, v.y + 16, { size: 12, align: "right", color: "#fff" });
    // safe alpha per level for the chest motion delta = 0.5 px
    const rx = v.x + v.w + (e.phone ? 12 : 30), al = EV.levelAlphas(ui.tAlpha, ui.tLam, ui.tRamp);
    text(e, "safe α per level", rx, v.y + 12, { size: 12, color: e.pal.c("ink") });
    text(e, "for δ = 0.5 px", rx, v.y + 28, { size: 11, color: e.pal.c("ink3") });
    for (let l = 4; l >= 0; l--) {
      const lam = EV.levelLambda(l), amax = Math.max(0, lam / (8 * .5) - 1), over = al[l] > amax + 1e-9, y = v.y + 56 + (4 - l) * (e.phone ? 26 : 30);
      text(e, `λ ${lam}`, rx, y, { size: 12, color: e.pal.c("ink2") });
      text(e, `α ${Math.round(al[l])} / ${amax}`, rx + (e.phone ? 44 : 56), y, { size: 12, color: e.pal.c(over ? "heart" : "green") });
    }
    text(e, "used / safe", rx, v.y + 56 + 5 * (e.phone ? 26 : 30), { size: 11, color: e.pal.c("ink3") });
    const sr = { x: F.x + 34, y: v.y + v.h + 40, w: F.w - 74, h: Math.max(50, F.y + F.h - (v.y + v.h + 40) - 30) };
    trySpectrum(e, sr);
    if (!e.playing) text(e, "paused", v.x + v.w / 2, v.y + v.h + 18, { size: 12, align: "center", color: e.pal.c("ink3") });
  },
};


// ===== 12. interlude: release, and a wider world =====
const EVENTS = [
  { y: 2005, t: ["Liu and colleagues", "motion magnified by tracking"], icon: "dots", step: 0 },
  { y: 2008, t: ["Verkruysse", "pulse rate from face video"], icon: "rate", step: 0 },
  { y: 2010, t: ["Poh", "pulse rate from face video"], icon: "rate", step: 0 },
  { y: 2012.2, t: ["live prototype on a laptop", "about 45 fps at 640 by 480, code posted"], icon: "laptop", step: 1 },
  { y: 2012.6, t: ["SIGGRAPH 2012", "ACM Transactions on Graphics, July"], icon: "paper", step: 2 },
  { y: 2013.1, t: ["press, early 2013", "New York Times, Science"], icon: "news", step: 2 },
  { y: 2013.6, t: ["phase-based magnification", "bigger boosts, less noise"], icon: "phase", step: 3 },
  { y: 2014.2, t: ["Riesz pyramids", "faster, real time"], icon: "pyr", step: 3 },
  { y: 2014.7, t: ["the Visual Microphone", "speech from a chip bag's vibrations"], icon: "mic", step: 3 },
];
function icon(e, kind, x, y, s, col, morph) {
  const g = e.ctx; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.6;
  if (kind === "laptop") { rrect(g, x - s * .5, y - s * .45, s, s * .62, 3); g.stroke(); line(e, [[x - s * .65, y + s * .24], [x + s * .65, y + s * .24]], col, 2); }
  else if (kind === "paper") { rrect(g, x - s * .36, y - s * .5, s * .72, s, 3); g.stroke(); for (let i = 0; i < 4; i++) line(e, [[x - s * .22, y - s * .28 + i * s * .18], [x + s * .22, y - s * .28 + i * s * .18]], col, 1); }
  else if (kind === "news") { rrect(g, x - s * .5, y - s * .4, s, s * .8, 3); g.stroke(); g.fillRect(x - s * .38, y - s * .28, s * .32, s * .26); for (let i = 0; i < 3; i++) line(e, [[x + s * .02, y - s * .24 + i * s * .14], [x + s * .38, y - s * .24 + i * s * .14]], col, 1); }
  else if (kind === "rate") { const pts = []; for (let i = 0; i <= 30; i++) { const u = i / 30; pts.push([x - s * .5 + u * s, y - (Math.abs(u - .5) < .08 ? (u < .5 ? s * .4 : -s * .3) : 0)]); } line(e, pts, col, 1.6); }
  else if (kind === "dots") { for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x - s * .4 + i * s * .2, y + Math.sin(i) * s * .15, 2.6, 0, TAU); g.fill(); } }
  else if (kind === "phase") { const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([x - s * .5 + u * s, y - Math.exp(-(((u - .5) / .22) ** 2)) * Math.cos(TAU * 2 * (u - .5)) * s * .35]); } line(e, pts, col, 1.6); }
  else if (kind === "pyr") { for (let i = 0; i < 3; i++) { const w = s * (1 - i * .28); g.strokeRect(x - w / 2, y + s * .3 - i * s * .28 - s * .2, w, s * .22); } }
  else if (kind === "mic") {      // a waveform that reshapes into a speaker cone
    const m = morph || 0, pts = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40, wav = Math.sin(u * TAU * 3) * s * .25 * (1 - m); pts.push([x - s * .5 + u * s * (1 - m * .5), y + wav]); }
    line(e, pts, col, 1.6);
    withAlpha(e, m, () => { g.beginPath(); g.moveTo(x - s * .1, y - s * .14); g.lineTo(x + s * .35, y - s * .42); g.lineTo(x + s * .35, y + s * .42); g.lineTo(x - s * .1, y + s * .14); g.closePath(); g.stroke(); g.strokeRect(x - s * .3, y - s * .14, s * .2, s * .28); });
  }
}
SC[12] = {
  desc: "A timeline ribbon slides past: tracking-based motion magnification in 2005, pulse rates from video in 2008 and 2010, the live laptop prototype and SIGGRAPH 2012, press in early 2013, then phase-based magnification, Riesz pyramids and the Visual Microphone.",
  draw(e, p) {
    const F = e.F, g = e.ctx;
    const gap = e.phone ? 150 : Math.max(190, F.w / 3.4), y0 = F.y + F.h * .5;
    const total = gap * (EVENTS.length - 1);
    const startX = F.x + gap * .5, off = -seg(p, K(e, 0), K(e, e.n - 1)) * Math.max(0, total - F.w + gap);
    const cur = e.step;
    const left = e.phone ? 0 : F.x - 30;
    g.save(); g.beginPath(); g.rect(left, F.y - 10, e.W - left, F.h + 20); g.clip();
    line(e, [[left, y0], [e.W, y0]], e.pal.c("ink3"), 1.2);
    EVENTS.forEach((ev, i) => {
      const x = startX + off + i * gap, on = ev.step <= Math.max(1, cur), hot = ev.step === cur;
      const up = i % 2 === 0, yy = up ? y0 - 64 : y0 + 92;
      g.globalAlpha = on ? 1 : .3;
      g.beginPath(); g.arc(x, y0, hot ? 6 : 4, 0, TAU); g.fillStyle = e.pal.c(hot ? "skin" : "ink"); g.fill();
      text(e, String(Math.floor(ev.y)), x, up ? y0 + 22 : y0 - 12, { size: 12, align: "center", color: e.pal.c("ink3") });
      icon(e, ev.icon, x, up ? yy - 44 : yy + 44, 34, e.pal.c(hot ? "skin" : "ink2"), ev.icon === "mic" ? into(e, p, 3, .1) : 0);
      text(e, ev.t[0], x, up ? yy : yy + 80, { size: e.phone ? 12 : 13, align: "center", color: e.pal.c(hot ? "ink" : "ink2"), weight: 500 });
      text(e, ev.t[1], x, up ? yy + 16 : yy + 96, { size: e.phone ? 10.5 : 11.5, align: "center", color: e.pal.c("ink3") });
      g.globalAlpha = 1;
    });
    g.restore();
    if (!e.phone) {            // the ribbon dissolves before it reaches the type
      const gr = g.createLinearGradient(left, 0, left + 90, 0); gr.addColorStop(0, e.pal.c("bg", 1)); gr.addColorStop(1, e.pal.c("bg", 0));
      g.fillStyle = gr; g.fillRect(left, F.y - 10, 90, F.h + 20);
    }
  },
};

// ===== 13. beyond the paper =====
SC[13] = {
  desc: "A small wave packet slides as its phase advances: phase says where an edge sits. Then a bump moved by the linear method overshoots and clips, while a phase-based shift moves it cleanly. Last, the mean green of a skin patch on the synthetic face, its spectrum, and the peak read as beats per minute.",
  anim: true,
  draw(e, p) {
    const F = e.F, g = e.ctx;
    const a = 1 - into(e, p, 3, .08), b = into(e, p, 3, .08);
    if (a > .01) withAlpha(e, a, () => {
      // phase: a windowed wave whose phase advances with scroll
      const r1 = { x: F.x + 30, y: F.y + F.h * .08, w: F.w - 50, h: F.h * .2 };
      const m1 = frame(e, r1, { x0: 0, x1: 64, y0: -1.2, y1: 1.2, xt: [], axis: false });
      const dl = 6 * seg(p, K(e, 1) - .1, K(e, 1) + .05), om = TAU / 12;
      const pk = x => Math.exp(-(((x - 30) / 9) ** 2)) * Math.cos(om * (x - 30) - om * dl);
      line(e, Array.from({ length: 200 }, (_, i) => { const x = i / 199 * 64; return [m1.X(x), m1.Y(Math.exp(-(((x - 30) / 9) ** 2)) * Math.cos(om * (x - 30)))]; }), e.pal.c("ink3"), 1.2, [4, 4]);
      line(e, Array.from({ length: 200 }, (_, i) => { const x = i / 199 * 64; return [m1.X(x), m1.Y(pk(x))]; }), e.pal.c("green"), 2.4);
      text(e, `phase shift = ω δ = ${fmt(om * dl, 2)} rad  ·  the wave slides ${fmt(dl, 1)} px`, r1.x, r1.y - 6, { size: 12, color: e.pal.c("green") });
      // linear versus phase, alpha 6 (schematic)
      const r2 = { x: F.x + 30, y: F.y + F.h * .42, w: F.w - 50, h: F.h * .3 };
      const m2 = frame(e, r2, { x0: 0, x1: 64, y0: -.5, y1: 1.5, xt: [], axis: true });
      const al = 6, d = .8, bump = x => Math.exp(-(((x - 24) / 4.5) ** 2));
      g.fillStyle = e.pal.c("heart", .08); g.fillRect(r2.x, r2.y, r2.w, m2.Y(1) - r2.y); g.fillRect(r2.x, m2.Y(0), r2.w, r2.y + r2.h - m2.Y(0));
      text(e, "beyond white: clipped", r2.x + r2.w - 4, r2.y + 14, { size: 11, align: "right", color: e.pal.c("heart") });
      const P = fn => Array.from({ length: 300 }, (_, i) => { const x = i / 299 * 64; return [m2.X(x), m2.Y(fn(x))]; });
      line(e, P(bump), e.pal.c("ink3"), 1.2, [4, 4]);
      line(e, P(x => bump(x) + al * (bump(x - d) - bump(x))), e.pal.c("heart"), 2.2);
      line(e, P(x => bump(x - (1 + al) * d)), e.pal.c("green"), 2.4);
      text(e, "linear, α 6: overshoots and clips", r2.x, r2.y - 26, { size: 12, color: e.pal.c("heart") });
      text(e, "phase-based, α 6: the bump simply moves", r2.x, r2.y - 8, { size: 12, color: e.pal.c("green") });
      // noise strip (schematic, after the CACM description)
      const r3y = r2.y + r2.h + 40, nz = L.noiseSeq(3, 160, 1);
      [["linear: noise grows with α", "heart", 1 + al], ["phase: noise not amplified", "green", 1]].forEach(([lab, c, k], j) => {
        const yy = r3y + j * 34; text(e, lab, r2.x, yy - 4, { size: 11.5, color: e.pal.c(c) });
        line(e, nz.map((v, i) => [r2.x + 200 + i / 159 * (r2.w - 200), yy - 8 + v * k * 1.6]), e.pal.c(c), 1);
      });
      if (e.phone) { text(e, "schematic, after the CACM overview:", r2.x, r3y + 70, { size: 11, color: e.pal.c("ink3") }); text(e, "linear supports about a quarter of the phase α", r2.x, r3y + 86, { size: 11, color: e.pal.c("ink3") }); }
      else text(e, "schematic, after the CACM overview: linear supports about a quarter of the phase method's α", r2.x, r3y + 74, { size: 11, color: e.pal.c("ink3") });
      if (!e.phone) withAlpha(e, into(e, p, 2, .07), () => {
        const bx = F.x + F.w - 4, by = F.y + F.h * .08 - 30;
        text(e, "Riesz pyramid (2014): similar idea, smaller and faster, real time on a laptop", bx, by, { size: 12, align: "right", color: e.pal.c("ink") });
      });
    });
    if (b > .01) withAlpha(e, b, () => rppg(e));
  },
};
function rppg(e) {
  const F = e.F, g = e.ctx;
  if (!e.D.ready) { waiting(e, F); return; }
  const s = e.phone ? Math.min(F.w * .42, F.h * .5) : Math.min(F.w * .36, F.h * .46);
  const face = { x: F.x, y: F.y, w: s, h: s };
  drawRGBA(e, e.D.mag.pulse.raw(e.fi), face, { matte: true });
  const [x0, y0, x1, y1] = e.D.clip.model.L.foreheadBox;
  const a = clipToRect(face, x0 - .5, y0 - .5), b = clipToRect(face, x1 - .5, y1 - .5);
  g.strokeStyle = e.pal.c("skin"); g.lineWidth = 2; g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  const series_ = cache("rppg", () => {
    const D = e.D, P = D.clip.P, out = new Float64Array(300);
    for (let t = 0; t < 300; t++) { let sum = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += D.clip.frames[t * P * 3 + (y * EV.W + x) * 3 + 1]; out[t] = sum / ((x1 - x0) * (y1 - y0)); }
    return out;
  });
  const spec = cache("rppgS", () => EV.ampSpectrum(Array.from(series_)));
  let pk = 4; for (let k = 4; k <= 40; k++) if (spec[k] > spec[pk]) pk = k;   // search 0.4 to 4 Hz
  const fpk = pk / 10, sd = cache("rppgSd", () => noiseSd(series_));
  const tr = { x: face.x + s + 40, y: F.y + 20, w: F.w - s - 60, h: s * .5 };
  let mean = 0; for (const v of series_) mean += v; mean /= 300;
  const m = frame(e, tr, { x0: 0, x1: 10, y0: mean - 1.5, y1: mean + 1.5, xt: [0, 5, 10], xf: v => v + " s", yl: `mean green of ${(x1 - x0) * (y1 - y0)} skin pixels` });
  series(e, m, i => i / 30, Array.from(series_), e.pal.c("skin"), 1.6);
  const sr = { x: F.x + 30, y: face.y + s + 50, w: F.w - 40, h: F.y + F.h - (face.y + s + 50) - 70 };
  const ms = frame(e, sr, { x0: 0, x1: 4.05, y0: 0, y1: .7, xt: [0, 1, 2, 3, 4], xf: v => v + " Hz", yl: "spectrum of that average" });
  const bw = Math.max(2, sr.w / 41 * .6);
  for (let k = 1; k <= 40; k++) { const f = k / 10; g.fillStyle = e.pal.c(k === pk ? "heart" : "ink3"); g.fillRect(ms.X(f) - bw / 2, ms.Y(Math.min(.7, spec[k])), bw, sr.y + sr.h - ms.Y(Math.min(.7, spec[k]))); }
  text(e, `peak ${fmt(fpk, 1)} Hz × 60 = ${Math.round(fpk * 60)} beats per minute`, ms.X(fpk) + 10, ms.Y(spec[pk]) + 4, { size: 14, color: e.pal.c("heart"), halo: true, weight: 500 });
  text(e, `${fmt(25 / 10, 1)} Hz bar: the lamp flicker`, ms.X(2.5) + 8, ms.Y(spec[25]) + 4, { size: 12, color: e.pal.c("amber"), halo: true });
  text(e, `noise after averaging: σ ≈ ${fmt(sd)} (measured; one pixel is about 2)`, tr.x, tr.y + tr.h + 44, { size: 12, color: e.pal.c("ink2") });
  text(e, "Average the skin, find the peak, multiply by 60.", sr.x, sr.y + sr.h + 50, { size: 14, color: e.pal.c("ink"), font: "body", weight: 500 });
}

// ===== 14. what it is not =====
SC[14] = {
  desc: "The amplification dial is turned too far: the face fills with grain and clipped colour, and a moving shape breaks into ghost double edges. Then the dial eases back and the picture settles.",
  anim: true,
  draw(e, p) {
    const F = e.F;
    if (!e.D.ready) { waiting(e, F); return; }
    const up = seg(p, mid(e, 1) - .05, K(e, 1)), down = seg(p, K(e, 1) + .06, K(e, 2));
    const env = up * (1 - down);
    const ac = lerp(60, 1000, env), am = lerp(2, 12, env);
    const s = e.phone ? Math.min((F.w - 14) / 2, F.h * .62) : Math.min((F.w - 40) / 2, F.h * .62), y = F.y + F.h * .12;
    const a = { x: F.x, y, w: s, h: s }, b = { x: F.x + F.w - s, y, w: s, h: s };
    drawRGBA(e, freeMag(e).frame(e.fi, ac), a, { matte: true });
    const bm = bigMotion(); drawGrey(e, bm.run(e.fi, am), 64, 64, b, 40, 150, "sway");
    dial(e, a.x + a.w / 2, a.y + a.h + 46, 24, ac, 1000, `colour gain α ${Math.round(ac)}`, env > .5 ? "heart" : "skin");
    dial(e, b.x + b.w / 2, b.y + b.h + 46, 24, am, 12, `motion gain α ${fmt(am, 1)} on a 6 px move`, env > .5 ? "heart" : "sway");
    withAlpha(e, down, () => text(e, "a visualization, not a clinical device", F.x + F.w / 2, Math.min(F.y + F.h - 4, a.y + a.h + 110), { size: 14, align: "center", color: e.pal.c("ink"), font: "body", weight: 500 }));
  },
};

})();
