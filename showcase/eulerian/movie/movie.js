/* The film engine: scroll position -> (chapter, progress) -> one canvas that paints the page.
   render(ch, p) is a pure function of scroll, UI state and the clip clock. No scroll hijacking. */
(function () {
"use strict";
const E = window.EVM, SC = window.EVMScenes;
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d"), track = $("track"), movie = $("movie");
const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
const params = new URLSearchParams(location.search);
const S = {                       // engine state
  W: 0, H: 0, dpr: 1, phone: false, chapters: [], steps: [], ch: 0, p: 0, g: 0,
  clipT: params.has("t") ? +params.get("t") : 0.25, playing: true, dirty: true, lastFi: -1, visible: true,
  reduce: reduceMQ.matches, hits: [], pointer: null, drag: null,
};
// ---------- UI state, shared with scenes ----------
const ui = {
  coldView: null, ghostAlpha: 50, trackErr: 0.5, probe: { x: 64, y: 40 }, sines: [true, true, true, true],
  bandLo: 0.83, bandHi: 1.0, bandMode: null, edgeAlpha: 4, ladderAlpha: 20, motionMix: null, levelHover: -1, specHover: null,
  tAlpha: 100, tLo: 0.83, tHi: 1.0, tLam: 16, tMode: "ideal", tRamp: false, tSplit: 0.5, tPreset: "pulse", tPlay: true,
};
const PRESETS = {   // ILLUSTRATIVE demo settings (technical.md chapter 8), measured in the node test
  pulse: { tAlpha: 100, tLo: 0.83, tHi: 1.0, tMode: "ideal", tLam: 16, tRamp: false },
  breath: { tAlpha: 10, tLo: 0.2, tHi: 0.5, tMode: "ideal", tLam: 48, tRamp: true },
  wrong: { tAlpha: 100, tLo: 2.0, tHi: 3.0, tMode: "ideal", tLam: 16, tRamp: false },
  much: { tAlpha: 300, tLo: 0.83, tHi: 1.0, tMode: "ideal", tLam: 4, tRamp: false },
};

// ---------- data: the synthetic clip and its magnifiers ----------
const D = { ready: false, progress: 0, clip: null, bank: null, mag: {}, cache: {} };
D.series = function (x, y, c) {            // raw values of one pixel over the whole clip
  const k = x + "," + y + "," + c; if (D.cache[k]) return D.cache[k];
  const { P, n, frames, w } = D.clip, out = new Float64Array(n), i = (y * w + x) * 3 + c;
  for (let t = 0; t < n; t++) out[t] = frames[t * P * 3 + i];
  return (D.cache[k] = out);
};
D.userMag = function () {
  const m = D.mag.user;
  m.set({ mode: ui.tMode, lo: Math.min(ui.tLo, ui.tHi - 0.05), hi: ui.tHi, lambdaC: ui.tLam, ramp: ui.tRamp, chrom: 1 });
  return m;
};
function buildData() {
  const gen = E.clipBuilder(20120701);
  const slice = () => {
    const t0 = performance.now();
    let r;
    while (performance.now() - t0 < 14) { r = gen.next(); if (r.done) break; D.progress = r.value; }
    if (r && r.done) {
      $("loading").hidden = true;
      const clip = r.value;
      D.clip = clip; D.bank = E.DFTBank(clip.frames, clip.n, clip.P * 3);
      D.mag.pulse = E.Magnifier(clip, D.bank); D.mag.pulse.set({ mode: "ideal", lo: 0.83, hi: 1.0, lambdaC: 16, ramp: false, chrom: 1 });
      D.mag.breath = E.Magnifier(clip, D.bank); D.mag.breath.set({ mode: "ideal", lo: 0.2, hi: 0.5, lambdaC: 48, ramp: true, chrom: 1 });
      D.mag.user = E.Magnifier(clip, D.bank);
      D.mag.free = E.Magnifier(clip, D.bank);
      // DFT bins for the pulse band, then the breathing band, in idle slices
      const ks = [9, 10, 2, 3, 4, 5]; let j = 0;
      const binSlice = () => { if (j < ks.length) { D.bank.bin(ks[j++]); setTimeout(binSlice, 0); } else { D.ready = true; $("loading").classList.add("done"); afterReady(); } };
      binSlice();
      return;
    }
    $("loading").textContent = "preparing the synthetic clip " + Math.round(D.progress * 100) + "%";
    S.dirty = true;
    setTimeout(slice, 0);
  };
  setTimeout(slice, 0);
}

// ---------- palette ----------
const hex = s => { s = s.trim(); if (s.startsWith("#")) { const v = s.length === 4 ? s.slice(1).split("").map(c => c + c).join("") : s.slice(1); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)); } const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; };
let PAL = null;
function readPalette() {
  const cs = getComputedStyle(document.documentElement), g = n => hex(cs.getPropertyValue(n));
  const dark = g("--paper")[0] < 60;
  PAL = [
    { bg: g("--paper"), ink: g("--ink"), ink2: g("--ink-2"), ink3: g("--ink-3"), rule: g("--rule"), skin: g("--skin"), sway: g("--sway"),
      heart: dark ? [255, 110, 110] : [204, 54, 60], amber: dark ? [240, 180, 64] : [176, 116, 0], green: dark ? [92, 200, 140] : [30, 130, 84], dark },
    { bg: g("--night"), ink: g("--nink"), ink2: g("--nink-2"), ink3: g("--nink-3"), rule: g("--nrule"), skin: hex("#e48d6a"), sway: hex("#6d9bff"),
      heart: [255, 110, 110], amber: [240, 180, 64], green: [92, 200, 140], dark: true },
  ];
  S.dirty = true;
}
const mixC = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function palAt(tone) {
  const a = PAL[0], b = PAL[1], o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? mixC(a[k], b[k], tone) : (tone > .5 ? b[k] : a[k]);
  o.c = (k, al) => { const v = o[k] || k; return al == null ? `rgb(${v[0]},${v[1]},${v[2]})` : `rgba(${v[0]},${v[1]},${v[2]},${al})`; };
  o.tone = tone;
  return o;
}

// ---------- layout ----------
function measure() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  S.vh = innerHeight; S.phone = innerWidth <= 860;
  S.W = cv.clientWidth || innerWidth; S.H = cv.clientHeight || innerHeight; S.dpr = dpr;
  const bw = Math.round(S.W * dpr), bh = Math.round(S.H * dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  // anchor line: desktop, the middle of the screen; phone, just under the picture band
  S.ref = S.phone ? S.H + Math.min(28, S.vh * .03) : S.vh * 0.5;
  const sy = scrollY;
  S.chapters = [...document.querySelectorAll(".chap")].map((sec, i) => {
    const r = sec.getBoundingClientRect(), top = r.top + sy, height = r.height;
    const steps = [...sec.querySelectorAll(":scope > .step")].map(st => {
      const q = st.getBoundingClientRect(), t = st.querySelector(".txt").getBoundingClientRect();
      return { el: st, txt: st.querySelector(".txt"), top: q.top + sy, h: q.height, ttop: t.top + sy, th: t.height };
    });
    // a step is "on" when its text centre (desktop) or its text top (phone) reaches the anchor line
    const keys = steps.map(s => ((S.phone ? s.ttop + 4 : s.ttop + s.th / 2) - top) / height);
    return { i, el: sec, top, height, steps, keys, tone: sec.dataset.tone === "night" ? 1 : 0, scene: SC[i] };
  });
  // focus rect: where the picture lives (beside the type on desktop, the whole band on a phone)
  if (S.phone) S.F = { x: 14, y: 54, w: S.W - 28, h: S.H - 54 - 14 };
  else { const x0 = Math.min(S.W * 0.42, S.W * 0.05 + 31 * 16 * 1.12); S.F = { x: x0, y: S.H * 0.08, w: S.W - x0 - 96, h: S.H * 0.84 }; }
  S.dirty = true;
}
function applyWeights() {
  document.querySelectorAll(".step").forEach(st => { if (st.dataset.w) st.style.setProperty("--w", st.dataset.w); });
}

// ---------- scroll to (chapter, progress) ----------
function locate() {
  const y = scrollY + S.ref, C = S.chapters;
  let i = 0;
  for (let k = 0; k < C.length; k++) if (C[k].top <= y) i = k;
  const c = C[i], p = Math.max(0, Math.min(1, (y - c.top) / c.height));
  S.ch = i; S.p = p; S.g = (i + p) / C.length;
}
function snapP(c, p) {          // reduced motion: hold each step's key frame, switch instantly
  return S.reduce ? c.keys[stepAt(c, p)] : p;
}
function stepAt(c, p) { const ks = c.keys; let s = 0; for (let k = 0; k < ks.length; k++) if (p >= (k ? (ks[k - 1] + ks[k]) / 2 : 0)) s = k; return s; }

// ---------- drawing ----------
const layers = [document.createElement("canvas"), document.createElement("canvas")];
function env(c, p, target) {
  const pal = palAt(c.tone);
  return {
    ctx: target, W: S.W, H: S.H, F: S.F, phone: S.phone, dpr: S.dpr, pal, ui, D, E, t: S.clipT,
    fi: Math.floor(S.clipT * E.FS) % E.N, keys: c.keys, n: c.keys.length, step: stepAt(c, p), reduce: S.reduce,
    hit: (r, kind, data) => S.hits.push({ r, kind, data, ch: c.i }), playing: S.playing,
  };
}
function paint(target, c, p) {
  const g = target;
  g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  const e = env(c, p, g);
  g.fillStyle = e.pal.c("bg"); g.fillRect(0, 0, S.W, S.H);
  if (c.scene) { g.save(); try { c.scene.draw(e, p); } catch (err) { console.error("scene " + c.i, err); } g.restore(); }
  return e.pal;
}
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
function render(chIndex, p) {
  const C = S.chapters; if (!C.length) return;
  const c = C[chIndex]; S.hits = [];
  const pp = snapP(c, p);
  const zone = Math.min(0.2, (S.H * 0.28) / c.height);   // cross-fade window, in chapter progress
  let other = null, w = 0;
  if (!S.reduce) {
    if (pp < zone && chIndex > 0) { other = [C[chIndex - 1], 1]; w = 1 - smooth(0.5 + pp / (2 * zone)); }
    else if (pp > 1 - zone && chIndex < C.length - 1) { other = [C[chIndex + 1], 0]; w = smooth((pp - (1 - zone)) / (2 * zone)); }
  }
  let tone = c.tone;
  if (other && w > 0.002) {
    const [L0, L1] = layers;
    for (const L of layers) if (L.width !== cv.width || L.height !== cv.height) { L.width = cv.width; L.height = cv.height; }
    const keepHits = S.hits; paint(L0.getContext("2d"), c, pp);
    const mine = S.hits; S.hits = []; paint(L1.getContext("2d"), other[0], other[1]); S.hits = w < .5 ? mine : S.hits;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(L0, 0, 0);
    ctx.globalAlpha = w; ctx.drawImage(L1, 0, 0); ctx.globalAlpha = 1;
    tone = c.tone + (other[0].tone - c.tone) * w;
    void keepHits;
  } else paint(ctx, c, pp);
  if (S.phone) {          // the band's lower edge melts into the page so type slides under it softly
    const P = palAt(tone); ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.globalAlpha = 1;
    const gr = ctx.createLinearGradient(0, S.H - 18, 0, S.H); gr.addColorStop(0, P.c("bg", 0)); gr.addColorStop(1, P.c("bg", 1));
    ctx.fillStyle = gr; ctx.fillRect(0, S.H - 18, S.W, 18);
  }
  setTone(tone);
}
let lastToneKey = "";
function setTone(t) {
  const P = palAt(t), key = P.bg.join() + P.ink.join();
  if (key === lastToneKey) return; lastToneKey = key;
  const st = movie.style, b = document.body.style;
  st.setProperty("--bg", P.c("bg")); st.setProperty("--fg", P.c("ink")); st.setProperty("--fg-2", P.c("ink2")); st.setProperty("--fg-3", P.c("ink3"));
  st.setProperty("--acc", P.c("skin")); st.setProperty("--acc2", P.c("sway"));
  for (const k of ["--bg", "--fg", "--fg-2", "--fg-3", "--acc", "--acc2"]) document.documentElement.style.setProperty(k, st.getPropertyValue(k));
  b.background = P.c("bg");
}
// fade the type as it leaves the reading zone (no layout reads: positions are cached)
function fadeSteps() {
  const y0 = scrollY, H = S.vh;
  for (const c of S.chapters) for (const s of c.steps) {
    const mid = s.ttop + s.th / 2 - y0;
    if (mid < -H || mid > 2 * H) continue;
    let o;
    if (S.phone) o = 1;                      // the picture band covers the type as it scrolls under it
    else o = Math.min(1, Math.max(0, Math.min(mid - H * 0.04, H * 0.98 - mid) / (H * 0.2)));
    if (s.el.classList.contains("console")) o = 1;
    const v = o.toFixed(2);
    if (s.o !== v) { s.o = v; s.txt.style.opacity = v; s.txt.style.visibility = o < 0.02 ? "hidden" : ""; }
  }
}

// ---------- rail, step cue, live description ----------
const railLinks = [...document.querySelectorAll(".rail a")];
let liveTimer = 0, lastLive = -1, lastRail = -1;
function updateChrome() {
  if (S.ch !== lastRail) {
    lastRail = S.ch;
    railLinks.forEach((a, i) => { a.classList.toggle("on", i === S.ch); a.classList.toggle("seen", i < S.ch); if (i === S.ch) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current"); });
    $("stepcue").textContent = `Step ${S.ch + 1} of ${S.chapters.length}`;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (lastLive === S.ch) return; lastLive = S.ch;
      const sc = SC[S.ch]; const d = sc && sc.desc ? sc.desc : "";
      $("live").textContent = `${railLinks[S.ch].textContent}. ${d}`;
      cv.setAttribute("aria-label", `Animated figure, ${railLinks[S.ch].textContent}: ${d}`);
    }, 600);
  }
}

// ---------- loop ----------
let raf = 0, lastNow = 0;
function animActive() {
  const c = S.chapters[S.ch]; if (!c || !c.scene) return false;
  const a = c.scene.anim; return typeof a === "function" ? a(S.p, ui) : !!a;
}
function frame(now) {
  raf = 0;
  const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0; lastNow = now;
  const anim = animActive() && S.playing && !S.reduce && S.visible && D.ready;
  if (anim) S.clipT = (S.clipT + dt) % (E.N / E.FS);
  const fi = Math.floor(S.clipT * E.FS) % E.N;
  if (S.dirty || fi !== S.lastFi) { S.lastFi = fi; renderNow(); }
  if (anim) raf = requestAnimationFrame(frame); else lastNow = 0;
}
function kick() { S.dirty = true; if (!raf) raf = requestAnimationFrame(frame); }
function renderNow() { S.dirty = false; locate(); render(S.ch, S.p); fadeSteps(); updateChrome(); }

// ---------- goto ----------
function goto(ch, p, instant) {
  const c = S.chapters[ch]; if (!c) return;
  const y = c.top + (p || 0) * c.height - S.ref;
  window.scrollTo({ top: Math.max(0, y), behavior: instant || S.reduce ? "auto" : "smooth" });
  if (instant) renderNow();
}

// ---------- UI wiring ----------
const fmtHz = v => (+v).toFixed(2) + " Hz";
const OUT = { ghostAlpha: v => v, trackErr: v => v < .2 ? "low" : v < .6 ? "medium" : "high", bandLo: fmtHz, bandHi: fmtHz, edgeAlpha: v => v, ladderAlpha: v => v,
  motionMix: v => Math.round(v * 100) + "%", tAlpha: v => v, tLo: fmtHz, tHi: fmtHz, tLam: v => v + " px" };
function syncControls() {
  document.querySelectorAll("input[data-ui]").forEach(inp => {
    const k = inp.dataset.ui; let v = ui[k];
    if (k === "motionMix" && v == null) v = 1;
    if (v != null && +inp.value !== +v) inp.value = v;
    const o = inp.parentElement.querySelector("output"); if (o && OUT[k]) o.textContent = OUT[k](+inp.value);
  });
  document.querySelectorAll("button[data-ui]").forEach(b => {
    const k = b.dataset.ui, v = b.dataset.v;
    if (k === "sine") b.setAttribute("aria-pressed", ui.sines[+v]);
    else if (k === "tPlay") { b.setAttribute("aria-pressed", S.playing); b.textContent = S.playing ? "Pause" : "Play"; }
    else if (k === "bandMode") b.setAttribute("aria-pressed", (ui.bandMode || "iir") === v);
    else b.setAttribute("aria-pressed", ui[k] === v);
  });
  document.querySelectorAll("button[data-preset]").forEach(b => b.setAttribute("aria-pressed", ui.tPreset === b.dataset.preset));
}
document.addEventListener("input", e => {
  const k = e.target.dataset && e.target.dataset.ui; if (!k) return;
  ui[k] = +e.target.value;
  if (k === "tLo" && ui.tLo > ui.tHi - 0.05) ui.tHi = Math.min(4, ui.tLo + 0.05);
  if (k === "tHi" && ui.tHi < ui.tLo + 0.05) ui.tLo = Math.max(0.1, ui.tHi - 0.05);
  if (k === "bandLo" && ui.bandLo > ui.bandHi - 0.05) ui.bandHi = ui.bandLo + 0.05;
  if (k === "bandHi" && ui.bandHi < ui.bandLo + 0.05) ui.bandLo = Math.max(0.1, ui.bandHi - 0.05);
  if (k[0] === "t") ui.tPreset = null;
  syncControls(); kick();
});
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-ui], button[data-preset]"); if (!b) return;
  if (b.dataset.preset) { Object.assign(ui, PRESETS[b.dataset.preset]); ui.tPreset = b.dataset.preset; }
  else {
    const k = b.dataset.ui, v = b.dataset.v;
    if (k === "sine") ui.sines[+v] = !ui.sines[+v];
    else if (k === "tPlay") { S.playing = !S.playing; }
    else if (k === "coldView") ui.coldView = ui.coldView === v ? null : v;
    else ui[k] = v;
    if (k === "tMode") ui.tPreset = null;
  }
  syncControls(); kick();
});
// pointer on the picture: scenes register hit regions while drawing
function hitAt(x, y) { for (let i = S.hits.length - 1; i >= 0; i--) { const h = S.hits[i], r = h.r; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return h; } return null; }
function pointer(type, ev) {
  const x = ev.clientX, y = ev.clientY;
  if (S.drag) { S.drag.data.move && S.drag.data.move(x, y, S.drag.r, type); if (type === "up") S.drag = null; syncControls(); kick(); return; }
  const h = hitAt(x, y);
  cv.style.cursor = h ? (h.data && h.data.cursor) || "pointer" : "";
  if (!h) { if (ui.specHover || ui.levelHover >= 0) { ui.specHover = null; ui.levelHover = -1; kick(); } return; }
  if (type === "down" && h.data.drag) { S.drag = h; ev.preventDefault(); cv.setPointerCapture && cv.setPointerCapture(ev.pointerId); }
  if (h.data.move && (type !== "move" || ev.pointerType === "mouse" || S.drag)) h.data.move(x, y, h.r, type);
  syncControls(); kick();
}
cv.addEventListener("pointermove", e => pointer("move", e));
cv.addEventListener("pointerdown", e => pointer("down", e));
cv.addEventListener("pointerup", e => pointer("up", e));
cv.addEventListener("pointerleave", () => { if (!S.drag) { ui.specHover = null; ui.levelHover = -1; cv.style.cursor = ""; kick(); } });
// the canvas sits under the type: let events reach it through the track's empty areas
track.addEventListener("pointermove", e => { if (e.target === track || e.target.classList.contains("step") || e.target.classList.contains("chap")) pointer("move", e); });

// rail
railLinks.forEach(a => {
  a.addEventListener("click", e => { e.preventDefault(); goto(+a.dataset.ch, 0.06); $("rail").classList.remove("open"); $("railbtn").setAttribute("aria-expanded", "false"); });
});
$("railbtn").addEventListener("click", () => { if (!S.phone) return; const r = $("rail"), o = !r.classList.contains("open"); r.classList.toggle("open", o); $("railbtn").setAttribute("aria-expanded", o); });

// ---------- events ----------
addEventListener("scroll", kick, { passive: true });
let rzT = 0;
addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { measure(); kick(); }, 60); });
document.addEventListener("visibilitychange", () => { S.visible = !document.hidden; if (S.visible) kick(); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readPalette(); lastToneKey = ""; kick(); });
reduceMQ.addEventListener("change", () => { S.reduce = reduceMQ.matches; kick(); });
new MutationObserver(() => { readPalette(); lastToneKey = ""; kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
// stop the clock when the film is off screen (the footer is reached)
new IntersectionObserver(es => { for (const e of es) S.visible = e.isIntersecting && !document.hidden; kick(); }).observe(movie);

let userMoved = false;
["wheel", "touchstart", "keydown"].forEach(t => addEventListener(t, () => { userMoved = true; }, { passive: true, once: true }));
function fromURL() {
  if (!params.has("ch") || userMoved) return false;
  goto(+params.get("ch"), params.has("p") ? +params.get("p") : 0, true);
  return true;
}
function afterReady() { measure(); fromURL(); renderNow(); kick(); }

// ---------- boot ----------
applyWeights();
if (S.reduce) { S.playing = false; }
readPalette(); measure(); syncControls();
fromURL(); renderNow();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); fromURL(); renderNow(); });
buildData();
kick();

window.__eulerian = {
  render: (ch, p) => render(ch, p), renderNow, goto: (ch, p) => goto(ch, p, true),
  get chapters() { return S.chapters.map(c => ({ index: c.i, title: railLinks[c.i].textContent, oneLiner: railLinks[c.i].title, keys: c.keys })); },
  state: S, ui, data: D,
};
})();
