// Calibration: the player follows a dot with their eyes while we record features.
import { trimFixation } from './gaze.js';

export const CALIB_POINTS = [
  [0.5, 0.5],
  [0.07, 0.09], [0.5, 0.09], [0.93, 0.09],
  [0.93, 0.5], [0.93, 0.91], [0.5, 0.91], [0.07, 0.91], [0.07, 0.5],
  [0.28, 0.3], [0.72, 0.3], [0.72, 0.7], [0.28, 0.7],
];
export const VALID_POINTS = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.5, 0.25], [0.5, 0.75]];

// Walks through targets; each one shows for `dwell` s, sampling after `settle` s.
export class DotRun {
  constructor(points, { dwell = 1.5, settle = 0.55, intro = 1.2 } = {}) {
    Object.assign(this, { points, dwell, settle, intro });
    this.t = -intro;
    this.samples = points.map(() => []);
    this.done = false;
  }
  get index() { return this.t < 0 ? 0 : Math.floor(this.t / this.dwell); }
  // Progress within the current dot, 0..1 (negative during the intro).
  get phase() { return this.t < 0 ? this.t / this.intro : (this.t % this.dwell) / this.dwell; }
  step(dt, features) {
    if (this.done) return;
    this.t += dt;
    if (this.t >= this.points.length * this.dwell) { this.done = true; return; }
    const local = this.t - this.index * this.dwell;
    if (this.t >= 0 && local >= this.settle && features && Math.max(features.blinkL, features.blinkR) < 0.55) {
      this.samples[this.index].push(features);
    }
  }
  // [{f, x, y, group}] in screen px.
  dataset(w, h) {
    const out = [];
    this.samples.forEach((fs, g) => {
      const [u, v] = this.points[g];
      for (const f of trimFixation(fs)) out.push({ f, x: u * w, y: v * h, group: g });
    });
    return out;
  }
}

// Accuracy (mean distance to the target) and precision (jitter around each fixation's mean).
export function scoreValidation(run, predict, w, h) {
  let err = 0, n = 0, jit = 0, jn = 0;
  run.samples.forEach((fs, g) => {
    const ps = trimFixation(fs).map(predict);
    if (!ps.length) return;
    const [u, v] = run.points[g];
    const mx = ps.reduce((s, p) => s + p[0], 0) / ps.length, my = ps.reduce((s, p) => s + p[1], 0) / ps.length;
    for (const p of ps) { err += Math.hypot(p[0] - u * w, p[1] - v * h); n++; jit += Math.hypot(p[0] - mx, p[1] - my); jn++; }
  });
  return { accuracy: n ? err / n : Infinity, precision: jn ? jit / jn : Infinity, samples: n };
}
