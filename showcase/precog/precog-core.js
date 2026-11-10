// Precog's recogniser, ported from precog/features.py and precog/recognizer.py.
// Landmarks are arrays of 21 [x, y, z] with x in [0, aspect], y in [0, 1], as Precog records them.
(function (root) {
  "use strict";
  const PALM = [0, 5, 9, 13, 17];
  const N_RESAMPLE = 16;
  const FINGERS = { index: [5, 6, 8], middle: [9, 10, 12], ring: [13, 14, 16], pinky: [17, 18, 20] };
  const SETTINGS = { cooldown: 0.8, pose_hold: 0.45, motion_traj_weight: 0.35 };

  const hypot2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const handScale = lm => hypot2(lm[9], lm[0]) + 1e-6;
  function palmCenter(lm) {
    let x = 0, y = 0;
    for (const i of PALM) { x += lm[i][0]; y += lm[i][1]; }
    return [x / PALM.length, y / PALM.length];
  }
  function poseVec(lm) {
    const s = handScale(lm), w = lm[0];
    return lm.map(p => [(p[0] - w[0]) / s, (p[1] - w[1]) / s]);
  }
  function poseDist(a, b) {
    let d = 0;
    for (let i = 0; i < a.length; i++) d += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
    return d / a.length;
  }
  function extended(lm, finger) {
    const [, pip, tip] = FINGERS[finger], w = lm[0];
    return hypot2(lm[tip], w) > 1.25 * hypot2(lm[pip], w);
  }
  const d3 = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (0.5 * (a[2] - b[2])) ** 2);
  const pinchRatio = (lm, tip = 8) => d3(lm[4], lm[tip]) / (d3(lm[9], lm[0]) + 1e-6);

  function windowPair(frames, window) {
    const [t1, lm1] = frames[frames.length - 1];
    let t0 = t1, lm0 = lm1;
    for (let k = frames.length - 1; k >= 0; k--) { [t0, lm0] = frames[k]; if (t1 - t0 >= window) break; }
    return [t0, lm0, t1, lm1];
  }
  function palmSpeed(frames, window = 0.15) {
    if (frames.length < 2) return 0;
    const [t0, lm0, t1, lm1] = windowPair(frames, window);
    if (t1 - t0 <= 1e-3) return 0;
    return hypot2(palmCenter(lm1), palmCenter(lm0)) / handScale(lm1) / (t1 - t0);
  }
  const isPair = lm => Array.isArray(lm[0][0]);
  const splitPair = frames => [frames.map(([t, lm]) => [t, lm[0]]), frames.map(([t, lm]) => [t, lm[1]])];
  function pathLength(frames) {
    if (frames.length < 2) return 0;
    const c = frames.map(([, lm]) => palmCenter(lm));
    const s = median(frames.map(([, lm]) => handScale(lm)));
    let L = 0;
    for (let i = 1; i < c.length; i++) L += hypot2(c[i], c[i - 1]);
    return L / s;
  }
  function motionAmount(frames) {
    if (frames.length < 2) return 0;
    if (isPair(frames[0][1])) {
      const [a, b] = splitPair(frames);
      const gap = a.map(([, x], i) => hypot2(palmCenter(b[i][1]), palmCenter(x)) / handScale(x));
      return Math.max(motionAmount(a), motionAmount(b), Math.max(...gap) - Math.min(...gap));
    }
    const p0 = poseVec(frames[0][1]);
    let shape = 0;
    for (const [, lm] of frames) shape = Math.max(shape, poseDist(poseVec(lm), p0));
    return Math.max(pathLength(frames), 2 * shape);
  }
  function median(v) {
    const s = v.slice().sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  // linear interpolation of a list of flat vectors onto `grid`
  function resample(u, grid, rows) {
    return grid.map(g => {
      let k = 0;
      while (k < u.length - 2 && u[k + 1] < g) k++;
      const span = u[k + 1] - u[k], f = span > 0 ? Math.min(1, Math.max(0, (g - u[k]) / span)) : 0;
      const a = rows[k], b = rows[Math.min(k + 1, rows.length - 1)];
      return a.map((v, j) => v + (b[j] - v) * f);
    });
  }
  // movement -> n steps of (hand shape, trajectory); see features.seq_features
  function seqFeatures(frames, n = N_RESAMPLE) {
    const ts = frames.map(f => f[0]);
    const span = Math.max(ts[ts.length - 1] - ts[0], 1e-6);
    const u = ts.map(t => (t - ts[0]) / span);
    const grid = Array.from({ length: n }, (_, i) => i / (n - 1));
    let poses, traj;
    if (!isPair(frames[0][1])) {
      const scale = median(frames.map(([, lm]) => handScale(lm)));
      const c0 = palmCenter(frames[0][1]);
      traj = frames.map(([, lm]) => { const c = palmCenter(lm); return [(c[0] - c0[0]) / scale, (c[1] - c0[1]) / scale]; });
      poses = frames.map(([, lm]) => poseVec(lm).flat());
    } else {
      const scale = median(frames.map(([, [a, b]]) => (handScale(a) + handScale(b)) / 2));
      const mids = frames.map(([, [a, b]]) => { const ca = palmCenter(a), cb = palmCenter(b); return [ca, cb, [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2]]; });
      const m0 = mids[0][2];
      traj = mids.map(([ca, cb, m]) => [(cb[0] - ca[0]) / scale, (cb[1] - ca[1]) / scale, (m[0] - m0[0]) / scale, (m[1] - m0[1]) / scale]);
      poses = frames.map(([, [a, b]]) => poseVec(a).concat(poseVec(b)).flat());
    }
    return { poses: resample(u, grid, poses), traj: resample(u, grid, traj) };
  }
  function costMatrix(A, B, tw) {
    const n = A.poses.length, m = B.poses.length, C = [];
    for (let i = 0; i < n; i++) {
      const row = new Float64Array(m), pa = A.poses[i], ta = A.traj[i];
      for (let j = 0; j < m; j++) {
        const pb = B.poses[j], tb = B.traj[j];
        let pc = 0;
        for (let k = 0; k < pa.length; k += 2) pc += Math.hypot(pa[k] - pb[k], pa[k + 1] - pb[k + 1]);
        pc /= pa.length / 2;
        let tc = 0;
        for (let k = 0; k < ta.length; k++) tc += (ta[k] - tb[k]) ** 2;
        row[j] = pc + tw * Math.sqrt(tc);
      }
      C.push(row);
    }
    return C;
  }
  // banded DTW; returns {dist, path} (path only when asked)
  function dtw(C, withPath = false) {
    const n = C.length, m = C[0].length, band = Math.max(2, n >> 2);
    const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
    D[0][0] = 0;
    for (let i = 1; i <= n; i++)
      for (let j = Math.max(1, i - band); j <= Math.min(m, i + band); j++)
        D[i][j] = C[i - 1][j - 1] + Math.min(D[i - 1][j - 1], D[i - 1][j], D[i][j - 1]);
    const out = { dist: D[n][m] / n };
    if (withPath) {
      const path = [];
      let i = n, j = m;
      while (i > 0 && j > 0) {
        path.push([i - 1, j - 1]);
        const a = D[i - 1][j - 1], b = D[i - 1][j], c = D[i][j - 1];
        if (a <= b && a <= c) { i--; j--; } else if (b <= c) i--; else j--;
      }
      out.path = path.reverse();
    }
    return out;
  }
  const seqDist = (a, b, tw) => dtw(costMatrix(a, b, tw)).dist;

  // a recorded gesture ready for matching (recognizer.Compiled)
  function compile(g, tw = SETTINGS.motion_traj_weight) {
    const samples = g.samples.map(s => s.t.map((t, i) => [t, s.lm[i]])).filter(s => s.length >= 2);
    let templates, dist, slack, def, lo, hi, k, c;
    if (g.kind === "pose") {
      templates = samples.map(s => {
        const vs = s.map(([, lm]) => poseVec(lm));
        return vs[0].map((_, i) => [vs.reduce((a, v) => a + v[i][0], 0) / vs.length, vs.reduce((a, v) => a + v[i][1], 0) / vs.length]);
      });
      dist = poseDist; [slack, def, lo, hi, k, c] = [0.25, 0.30, 0.18, 0.45, 1.6, 0.10];
    } else {
      templates = samples.map(s => seqFeatures(s));
      dist = (a, b) => seqDist(a, b, tw); [slack, def, lo, hi, k, c] = [0.5, 0.9, 0.35, 1.2, 1.4, 0.15];
    }
    const loo = templates.length < 2 ? null : templates.map((a, i) => Math.min(...templates.map((b, j) => j === i ? Infinity : dist(a, b))));
    let keep = templates.map((_, i) => i);
    if (loo) {
      const med = median(loo);
      const good = keep.filter(i => loo[i] <= Math.max(3 * med, med + slack));
      if (good.length >= 2) keep = good;
    }
    const spread = loo ? Math.max(...keep.map(i => loo[i])) : null;
    const base = spread === null ? def : Math.min(hi, Math.max(lo, spread * k + c));
    const cg = {
      g, name: g.name, kind: g.kind, action: g.action, loo, keep, spread,
      dropped: templates.length - keep.length, threshold: base * (g.sensitivity || 1),
      templates: keep.map(i => templates[i]), formula: { k, c, lo, hi },
    };
    if (g.kind !== "pose") {
      cg.durations = keep.map(i => samples[i][samples[i].length - 1][0] - samples[i][0][0]);
      cg.paths = keep.map(i => motionAmount(samples[i]));
    }
    return cg;
  }

  class Recognizer {
    constructor(gestures, settings = SETTINGS) {
      this.s = settings; this.tw = settings.motion_traj_weight;
      this.gestures = gestures.filter(g => g.samples.length).map(g => compile(g, this.tw));
      this.buffers = {}; this.pair = []; this.pairSeen = -9; this.lastSeen = {};
      this.hasPair = this.gestures.some(g => g.kind === "motion2");
      this.hold = {}; this.latched = new Set(); this.cooldownUntil = 0; this.scores = {}; this.frame = 0;
    }
    update(t, hands) {
      this.frame++;
      for (const h of hands) {
        if (t - (this.lastSeen[h.label] || 0) > 0.35) this.buffers[h.label] = [];
        const buf = (this.buffers[h.label] ||= []);
        buf.push([t, h.lm]);
        while (buf.length && t - buf[0][0] > 3.5) buf.shift();
        this.lastSeen[h.label] = t;
      }
      if (hands.length >= 2) {
        const [a, b] = hands.slice(0, 2).sort((x, y) => palmCenter(x.lm)[0] - palmCenter(y.lm)[0]);
        if (t - this.pairSeen > 0.35) this.pair = [];
        this.pair.push([t, [a.lm, b.lm]]);
        while (this.pair.length && t - this.pair[0][0] > 3.5) this.pair.shift();
        this.pairSeen = t;
      }
      const twoHanded = this.hasPair && t - this.pairSeen < 0.5;
      if (t < this.cooldownUntil) return null;
      const present = Object.fromEntries(hands.map(h => [h.label, h]));
      let best = null;
      const scores = {};
      for (const cg of this.gestures) {
        let labels;
        if (cg.kind === "motion2") labels = t - this.pairSeen < 0.1 ? ["both"] : [];
        else if (cg.kind === "motion" && twoHanded) labels = [];
        else labels = cg.g.hand === "any" ? Object.keys(present) : (present[cg.g.hand] ? [cg.g.hand] : []);
        for (const label of labels) {
          let d;
          if (cg.kind === "pose") d = this._pose(cg, label, present[label], t);
          else {
            if (this.frame % 2) continue; // DTW every other frame is plenty
            d = this._motion(cg, label === "both" ? this.pair : (this.buffers[label] || []), t);
          }
          if (d == null) continue;
          if (!scores[cg.name] || d < scores[cg.name][0]) scores[cg.name] = [d, cg.threshold];
          if (d < cg.threshold && (cg.kind !== "pose" || this._held(cg, label, t))) {
            const r = d / cg.threshold;
            if (!best || r < best[0]) best = [r, cg, label];
          }
        }
      }
      Object.assign(this.scores, scores);
      if (this.frame % 2 === 0) for (const k of Object.keys(this.scores)) if (!scores[k]) delete this.scores[k];
      if (!best) return null;
      const [, cg, label] = best;
      this.cooldownUntil = t + this.s.cooldown;
      if (cg.kind === "pose") this.latched.add(cg.name + "|" + label);
      else if (label === "both") { this.pair = []; this.buffers = {}; }
      else this.buffers[label] = [];
      this.hold = {};
      return { gesture: cg, label };
    }
    _pose(cg, label, hand, t) {
      const pv = poseVec(hand.lm);
      const d = Math.min(...cg.templates.map(tpl => poseDist(pv, tpl)));
      const key = cg.name + "|" + label;
      const still = palmSpeed((this.buffers[label] || []).slice(-8)) < 1.2;
      if (d < cg.threshold && still) { if (!(key in this.hold)) this.hold[key] = t; } else delete this.hold[key];
      if (d > cg.threshold * 1.25) this.latched.delete(key);
      return d;
    }
    _held(cg, label, t) {
      const key = cg.name + "|" + label;
      return !this.latched.has(key) && key in this.hold && t - this.hold[key] >= this.s.pose_hold;
    }
    _motion(cg, buf, t) {
      if (buf.length < 6) return null;
      let best = null;
      cg.templates.forEach((tpl, i) => {
        for (const k of [0.7, 1.0, 1.4]) {
          const win = buf.filter(f => f[0] >= t - cg.durations[i] * k);
          if (win.length < 5 || motionAmount(win) < 0.5 * cg.paths[i]) continue;
          const d = seqDist(seqFeatures(win), tpl, this.tw);
          if (best === null || d < best) best = d;
        }
      });
      return best;
    }
  }

  // ten spread fingers on both hands, held still -> standby (precog/standby.py)
  function spreadWide(lm, gap = 0.46, thumb = 0.85) {
    const s = handScale(lm);
    if (!["index", "middle", "ring", "pinky"].every(f => extended(lm, f))) return false;
    const gaps = [[8, 12], [12, 16], [16, 20]].map(([a, b]) => hypot2(lm[a], lm[b]) / s);
    return gaps.reduce((a, b) => a + b) / 3 >= gap && hypot2(lm[4], lm[5]) / s >= thumb;
  }
  class TenFingers {
    constructor(hold = 0.8) { this.hold = hold; this.since = null; this.latched = false; this.progress = 0; }
    update(t, hands) {
      const ok = hands.length === 2 && hands.every(h => spreadWide(h.lm));
      if (!ok) { this.since = null; this.progress = 0; this.latched = false; return false; }
      if (this.latched) { this.progress = 0; return false; }
      this.since ??= t;
      this.progress = Math.min(1, (t - this.since) / this.hold);
      if (this.progress >= 1) { this.latched = true; this.progress = 0; return true; }
      return false;
    }
  }

  root.Precog = { PALM, N_RESAMPLE, SETTINGS, handScale, palmCenter, poseVec, poseDist, pinchRatio, extended, spreadWide,
    seqFeatures, costMatrix, dtw, seqDist, motionAmount, compile, Recognizer, TenFingers, median };
})(typeof window !== "undefined" ? window : globalThis);
