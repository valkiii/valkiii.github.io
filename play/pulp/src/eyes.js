// Eyes → one blade. Gaze comes from the calibrated regression; eye movements are
// jumps (saccades), so a fast jump across a fruit cuts it. Blinks are gated out
// because the iris landmarks jump while the lids close.
import { Blade } from './blade.js';
import { OneEuro2 } from './filters.js';
import { eyeFeatures } from './gaze.js';
import { clamp } from './geom.js';

export class EyeInput {
  constructor() {
    this.model = null;               // from fitGaze()
    this.offset = [0, 0];            // drift correction, px
    this.blade = new Blade('eyes', { color: '#ffd36b', minSpeed: 1400, trailMs: 220 });
    this.filter = new OneEuro2({ minCutoff: 0.9, beta: 0.004, dCutoff: 1 });
    this.features = null;
    this.gaze = null;                // filtered screen point
    this.raw = null;
    this.blinking = false;
    this.blinkUntil = 0;
    this.lastSeen = -Infinity;
    this.lm = null;
    this.closedSince = null;         // both eyes closed (long blink = pause)
  }

  get blades() { return [this.blade]; }

  // Saccade speed threshold from the jitter measured during validation.
  tune(noisePx) {
    this.blade.minSpeed = clamp(noisePx * 22, 900, 3200);
  }

  process(result, t, w, h, aspect) {
    const lm = result?.faceLandmarks?.[0];
    const blend = result?.faceBlendshapes?.[0]?.categories;
    this.lm = lm || null;
    const f = lm ? eyeFeatures(lm, blend, aspect) : null;
    this.features = f;
    if (!f) { if (t - this.lastSeen > 0.3) { this.blade.lose(); this.gaze = null; } return []; }
    this.lastSeen = t;
    const closed = Math.max(f.blinkL, f.blinkR) > 0.55;
    if (closed) this.blinkUntil = t + 0.16;
    this.blinking = closed || t < this.blinkUntil;
    if (f.blinkL > 0.55 && f.blinkR > 0.55) this.closedSince ??= t; else this.closedSince = null;
    if (!this.model || this.blinking) {
      this.blade.enabled = false;
      return [];
    }
    let [x, y] = this.model.predict(f);
    x = clamp(x + this.offset[0], -0.05 * w, 1.05 * w);
    y = clamp(y + this.offset[1], -0.05 * h, 1.05 * h);
    this.raw = [x, y];
    const wasGated = !this.blade.enabled;
    this.blade.enabled = true;
    const p = this.filter.filter(x, y, t);
    this.gaze = { x: p[0], y: p[1] };
    if (wasGated) { this.blade.lose(); }          // don't cut across a blink
    const seg = this.blade.add(p[0], p[1], t);
    return seg ? [seg] : [];
  }
}
