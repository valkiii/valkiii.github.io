// One Euro filter (Casiez et al. 2012): heavy smoothing when still, little lag when fast.

class LowPass {
  constructor() { this.y = null; }
  filter(x, a) { this.y = this.y === null ? x : a * x + (1 - a) * this.y; return this.y; }
}

const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuro {
  constructor({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() { this.x = new LowPass(); this.dx = new LowPass(); this.t = null; this.prev = null; }
  filter(x, t) {
    if (this.t === null) { this.t = t; this.prev = x; this.x.filter(x, 1); this.dx.filter(0, 1); return x; }
    const dt = Math.max(t - this.t, 1e-3);
    this.t = t;
    const d = this.dx.filter((x - this.prev) / dt, alpha(this.dCutoff, dt));
    this.prev = x;
    return this.x.filter(x, alpha(this.minCutoff + this.beta * Math.abs(d), dt));
  }
}

// A 2D point filter that shares the speed estimate between axes (avoids diagonal wobble).
export class OneEuro2 {
  constructor(opts) { this.opts = { minCutoff: 1, beta: 0, dCutoff: 1, ...opts }; this.reset(); }
  reset() { this.p = null; this.t = null; this.raw = null; this.speed = new LowPass(); }
  filter(x, y, t) {
    const { minCutoff, beta, dCutoff } = this.opts;
    if (this.t === null) { this.t = t; this.p = [x, y]; this.raw = [x, y]; this.speed.filter(0, 1); return [x, y]; }
    const dt = Math.max(t - this.t, 1e-3);
    this.t = t;
    const v = this.speed.filter(Math.hypot(x - this.raw[0], y - this.raw[1]) / dt, alpha(dCutoff, dt));
    this.raw = [x, y];
    const a = alpha(minCutoff + beta * v, dt);
    this.p = [a * x + (1 - a) * this.p[0], a * y + (1 - a) * this.p[1]];
    return this.p;
  }
}
