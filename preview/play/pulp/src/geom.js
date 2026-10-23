// Small geometry / math helpers shared by the game and the input layers.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const hypot = Math.hypot;

// Does segment A→B pass within r of the point C?
export function segCircleHit(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / L2 : 0;
  t = clamp(t, 0, 1);
  const px = ax + t * dx - cx, py = ay + t * dy - cy;
  return px * px + py * py <= r * r;
}

// Deterministic PRNG (mulberry32) so tests and demos are reproducible.
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}
