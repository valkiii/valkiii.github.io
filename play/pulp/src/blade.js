// A blade is one cutting input (a fingertip, the gaze, the mouse). It turns a stream of
// screen points into cut segments: only fast movement cuts, like a real swipe.

export class Blade {
  constructor(id, { color = '#9ff', minSpeed = 900, trailMs = 170 } = {}) {
    this.id = id;
    this.color = color;
    this.minSpeed = minSpeed;   // px/s needed to start cutting
    this.trailMs = trailMs;
    this.points = [];           // {x, y, t, on}
    this.pos = null;            // latest position (shown as the cursor)
    this.active = false;
    this.swipe = 0;             // increments each time a new swipe starts
    this.lastOn = -1;
    this.enabled = true;        // eyes: false while blinking
  }

  // Add a point; returns a cut segment {ax, ay, bx, by, speed, blade} or null.
  add(x, y, t) {
    const prev = this.pos;
    this.pos = { x, y, t };
    if (!prev || t - prev.t > 0.25) {            // first point, or tracking gap: no cut
      this.active = false;
      this.points.push({ x, y, t, on: false });
      return null;
    }
    const dt = Math.max(t - prev.t, 1 / 240);
    const speed = Math.hypot(x - prev.x, y - prev.y) / dt;
    const threshold = this.active ? this.minSpeed * 0.55 : this.minSpeed;   // hysteresis
    const on = this.enabled && speed >= threshold;
    if (on && !this.active && t - this.lastOn > 0.12) this.swipe++;
    this.active = on;
    if (on) this.lastOn = t;
    if (on && this.points.length) this.points[this.points.length - 1].on = true;
    this.points.push({ x, y, t, on });
    return on ? { ax: prev.x, ay: prev.y, bx: x, by: y, speed, blade: this } : null;
  }

  // A swipe has ended when the blade has been slow for a moment.
  swipeEnded(t) { return !this.active && this.lastOn > 0 && t - this.lastOn > 0.12; }

  trim(t) {
    const cut = t - this.trailMs / 1000;
    let i = 0;
    while (i < this.points.length - 2 && this.points[i].t < cut) i++;
    if (i) this.points.splice(0, i);
    if (this.points.length && t - this.points[this.points.length - 1].t > this.trailMs / 1000) this.points.length = 0;
  }

  // The recent cutting part of the trail, oldest first.
  trail(t) {
    const cut = t - this.trailMs / 1000;
    return this.points.filter((p) => p.on && p.t >= cut);
  }

  lose() { this.pos = null; this.active = false; this.points.length = 0; }
}
