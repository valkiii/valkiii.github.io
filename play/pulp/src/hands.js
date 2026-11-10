// Hands → blades. Each tracked index fingertip is a blade; the camera is mirrored and
// only its central "reach zone" maps to the whole screen, so you don't have to stretch.
import { Blade } from './blade.js';
import { OneEuro2 } from './filters.js';
import { clamp } from './geom.js';

const TIP = 8;
const COLORS = ['#7df9ff', '#ff7df0'];

export function mapToScreen(nx, ny, zone, w, h) {
  const u = (1 - nx - zone.x0) / (zone.x1 - zone.x0);     // mirrored
  const v = (ny - zone.y0) / (zone.y1 - zone.y0);
  return [clamp(u, -0.05, 1.05) * w, clamp(v, -0.05, 1.05) * h];
}

export class HandInput {
  constructor({ zone = { x0: 0.12, x1: 0.88, y0: 0.08, y1: 0.78 }, minSpeed = 0.75 } = {}) {
    this.zone = zone;
    this.minSpeedFrac = minSpeed;       // × min(w, h) per second
    this.tracks = [];                   // {blade, filter, lastSeen, lm}
    this.nextId = 0;
    this.lastSeen = -Infinity;
  }

  get blades() { return this.tracks.map((t) => t.blade); }

  // result: HandLandmarkerResult-like {landmarks: [[{x,y,z}...]]}; t in seconds.
  // Returns the cut segments produced by this frame.
  process(result, t, w, h) {
    const segs = [];
    const pts = (result?.landmarks || []).map((lm) => ({ lm, p: mapToScreen(lm[TIP].x, lm[TIP].y, this.zone, w, h) }));
    if (pts.length) this.lastSeen = t;
    const free = new Set(this.tracks);
    const reach = Math.min(w, h) * 0.45;
    for (const { lm, p } of pts) {
      let best = null, bd = reach;
      for (const tr of free) {
        const q = tr.blade.pos;
        const d = q ? Math.hypot(q.x - p[0], q.y - p[1]) : reach * 0.99;
        if (d < bd) { bd = d; best = tr; }
      }
      if (!best) {
        const used = new Set(this.tracks.map((tr) => tr.color));
        const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
        best = { blade: new Blade(`hand${this.nextId++}`, { color }), color,
          filter: new OneEuro2({ minCutoff: 2.2, beta: 0.012, dCutoff: 1.2 }) };
        this.tracks.push(best);
      } else free.delete(best);
      best.blade.minSpeed = this.minSpeedFrac * Math.min(w, h);
      best.lastSeen = t;
      best.lm = lm;
      const [x, y] = best.filter.filter(p[0], p[1], t);
      const seg = best.blade.add(x, y, t);
      if (seg) segs.push(seg);
    }
    // Drop hands that vanished.
    this.tracks = this.tracks.filter((tr) => {
      if (t - tr.lastSeen < 0.3) return true;
      tr.blade.lose();
      return false;
    });
    return segs;
  }
}
