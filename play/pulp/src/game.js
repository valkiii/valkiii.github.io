// The game world: pure state + physics, no drawing. Rendering and audio read `events`.
import { KINDS, FRUIT_NAMES } from './kinds.js';
import { segCircleHit, lerp, clamp, makeRng } from './geom.js';

// How the game feels per input. Eyes are slower and noisier than hands, so fruit is
// bigger, floatier and fewer, and a bomb costs a life instead of the whole game.
export const PROFILES = {
  hands: { gravity: 1.25, radius: 0.066, interval: [1.9, 0.85], perWave: [2, 5], bombs: [0.06, 0.2], bombKills: true, hitPad: 1.0 },
  mouse: { gravity: 1.25, radius: 0.066, interval: [1.9, 0.85], perWave: [2, 5], bombs: [0.06, 0.2], bombKills: true, hitPad: 1.0 },
  eyes:  { gravity: 0.62, radius: 0.092, interval: [2.6, 1.5], perWave: [1, 3], bombs: [0.04, 0.12], bombKills: false, hitPad: 1.25 },
};

const ZEN_SECONDS = 90;
const LIVES = 3;

export class World {
  constructor({ w, h, mode = 'classic', profile = 'hands', seed } = {}) {
    this.rng = makeRng(seed);
    this.mode = mode;               // 'classic' | 'zen' | 'menu'
    this.profile = profile;
    this.p = PROFILES[profile] || PROFILES.hands;
    this.resize(w, h);
    this.fruits = [];
    this.halves = [];
    this.particles = [];
    this.splats = [];
    this.popups = [];
    this.events = [];
    this.score = 0;
    this.misses = 0;
    this.lives = LIVES;
    this.time = 0;                  // seconds of play
    this.timeLeft = ZEN_SECONDS;
    this.over = false;
    this.overAt = null;
    this.nextWave = mode === 'menu' ? Infinity : 0.8;
    this.id = 0;
    this.swipeCuts = new Map();     // blade -> {swipe, cuts, x, y}
    this.shake = 0;
    this.flash = 0;
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.base = Math.min(w, h) * this.p.radius;
    this.g = h * this.p.gravity;
  }

  get difficulty() { return clamp(this.time / 150, 0, 1); }

  // ---- spawning -----------------------------------------------------------------------
  launch({ kind, bomb = false, x, apex, delay = 0 }) {
    const rng = this.rng;
    const r = bomb ? this.base * 0.95 : this.base * KINDS[kind].size;
    const y0 = this.h + r;
    const top = apex ?? rng.range(0.12, 0.42) * this.h;          // apex y from the top
    const vy = -Math.sqrt(2 * this.g * (y0 - top));
    const flight = (2 * -vy) / this.g;
    const x0 = x ?? rng.range(0.14, 0.86) * this.w;
    const xEnd = clamp(x0 + rng.range(-0.3, 0.3) * this.w, 0.12 * this.w, 0.88 * this.w);
    const f = {
      id: ++this.id, kind: bomb ? 'bomb' : kind, bomb, r,
      x: x0, y: y0, vx: (xEnd - x0) / flight, vy,
      rot: rng.range(0, Math.PI * 2), vr: rng.range(-2.5, 2.5),
      wait: delay, dwell: 0, cut: false, gone: false,
    };
    this.fruits.push(f);
    return f;
  }

  pickKind() {
    const total = FRUIT_NAMES.reduce((s, k) => s + KINDS[k].weight, 0);
    let u = this.rng() * total;
    for (const k of FRUIT_NAMES) { u -= KINDS[k].weight; if (u <= 0) return k; }
    return FRUIT_NAMES[0];
  }

  spawnWave() {
    const d = this.difficulty, p = this.p, rng = this.rng;
    const max = Math.round(lerp(p.perWave[0], p.perWave[1], d));
    const n = rng.int(1, max);
    const bombP = this.mode === 'zen' || this.time < 6 ? 0 : lerp(p.bombs[0], p.bombs[1], d);
    const burst = rng() < 0.5;                         // all at once, or one after another
    let bombs = 0;
    for (let i = 0; i < n; i++) {
      const bomb = bombs < 1 + Math.floor(d * 1.5) && rng() < bombP;
      if (bomb) bombs++;
      this.launch({ kind: this.pickKind(), bomb, delay: burst ? rng.range(0, 0.12) : i * rng.range(0.22, 0.4) });
    }
    this.events.push({ type: 'wave', n });
  }

  // Floating fruit used as buttons on menus: slice it to choose.
  addButton(kind, x, y, action, label) {
    const r = this.base * KINDS[kind].size * 1.25;
    const f = { id: ++this.id, kind, bomb: false, r, x, y, x0: x, y0: y, vx: 0, vy: 0, rot: 0, vr: 0.4,
      wait: 0, dwell: 0, cut: false, gone: false, button: { action, label }, phase: this.rng() * 6 };
    this.fruits.push(f);
    return f;
  }

  // ---- cutting ------------------------------------------------------------------------
  // A blade segment: cut everything it passes through.
  slice(seg) {
    if (this.over) return 0;
    let n = 0;
    const pad = this.p.hitPad;
    for (const f of this.fruits) {
      if (f.cut || f.wait > 0) continue;
      const r = f.r * (f.bomb ? 0.8 : 0.95) * pad;
      if (segCircleHit(seg.ax, seg.ay, seg.bx, seg.by, f.x, f.y, r)) {
        this.cut(f, Math.atan2(seg.by - seg.ay, seg.bx - seg.ax), seg.blade);
        n++;
      }
    }
    return n;
  }

  // Eyes: looking at a fruit long enough cuts it. Returns the fruit being looked at.
  dwell(x, y, dt, needed = 0.38) {
    if (this.over) return null;
    let target = null;
    for (const f of this.fruits) {
      if (f.cut || f.wait > 0) continue;
      const r = f.r * 1.15 * this.p.hitPad;
      if ((f.x - x) ** 2 + (f.y - y) ** 2 <= r * r && (!target || f.y < target.y)) target = f;
    }
    for (const f of this.fruits) {
      if (f === target) f.dwell += dt;
      else f.dwell = Math.max(0, f.dwell - dt * 2);
    }
    if (target && target.dwell >= needed * (target.button ? 2 : 1)) {
      this.cut(target, this.rng.range(-0.6, 0.6) + (this.rng() < 0.5 ? 0 : Math.PI), null);
    }
    return target;
  }

  cut(f, angle, blade) {
    f.cut = true;
    const rng = this.rng;
    if (f.bomb) {
      this.events.push({ type: 'bomb', x: f.x, y: f.y });
      this.shake = 1; this.flash = 1;
      f.gone = true;
      for (let i = 0; i < 40; i++) {
        const a = rng.range(0, Math.PI * 2), s = rng.range(0.2, 1.1) * this.h;
        this.particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng.range(0.4, 1), age: 0,
          r: rng.range(2, 6), color: rng() < 0.5 ? '#ffd27a' : '#ff6a2a', g: 0.3 });
      }
      if (this.mode !== 'menu') {
        if (this.p.bombKills || this.mode === 'zen') this.endGame('bomb');
        else this.loseLife(f.x, f.y);
      }
      return;
    }
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    const sep = this.h * 0.22;
    const tx = Math.cos(angle) * this.h * 0.12, ty = Math.sin(angle) * this.h * 0.12;
    for (const side of [1, -1]) {
      this.halves.push({ kind: f.kind, r: f.r, x: f.x, y: f.y, frot: f.rot, spin: 0, angle, side,
        vx: f.vx * 0.6 + side * nx * sep + tx, vy: Math.min(f.vy, 0) * 0.4 + side * ny * sep + ty - this.h * 0.08,
        vr: side * rng.range(1.5, 4), age: 0 });
    }
    const juice = KINDS[f.kind].juice;
    for (let i = 0; i < 18; i++) {
      const side = i % 2 ? 1 : -1, s = rng.range(0.1, 0.55) * this.h;
      const a = angle + side * Math.PI / 2 + rng.range(-0.9, 0.9);
      this.particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * s + tx, vy: Math.sin(a) * s + ty, life: rng.range(0.35, 0.8),
        age: 0, r: rng.range(f.r * 0.04, f.r * 0.11), color: juice, g: 1 });
    }
    this.splats.push({ x: f.x, y: f.y, r: f.r * rng.range(0.9, 1.3), color: juice, angle, age: 0, seed: rng() * 1e9 | 0 });
    if (this.splats.length > 30) this.splats.shift();
    f.gone = true;
    this.events.push({ type: 'cut', kind: f.kind, x: f.x, y: f.y, angle, button: f.button || null });
    if (f.button) return;
    this.score += 1;
    if (blade) {
      const s = this.swipeCuts.get(blade);
      if (s && s.swipe === blade.swipe) { s.cuts++; s.x = f.x; s.y = f.y; }
      else this.swipeCuts.set(blade, { swipe: blade.swipe, cuts: 1, x: f.x, y: f.y });
    }
  }

  // Combos are scored when the swipe ends, like the original.
  endSwipes(blades, t) {
    for (const [blade, s] of this.swipeCuts) {
      if (blade.swipe === s.swipe && !blade.swipeEnded(t) && blades.includes(blade)) continue;
      this.swipeCuts.delete(blade);
      if (s.cuts >= 3 && !this.over) {
        this.score += s.cuts;
        this.popups.push({ text: `${s.cuts} FRUIT COMBO`, sub: `+${s.cuts}`, x: s.x, y: s.y, age: 0, life: 1.3, big: true });
        this.events.push({ type: 'combo', n: s.cuts });
      }
    }
  }

  loseLife(x, y) {
    this.misses++;
    this.lives = LIVES - this.misses;
    this.events.push({ type: 'miss', x, y });
    if (this.lives <= 0) this.endGame('lives');
  }

  endGame(reason) {
    if (this.over) return;
    this.over = true;
    this.overReason = reason;
    this.overAt = this.time;
    this.events.push({ type: 'gameover', reason, score: this.score });
  }

  // ---- simulation ---------------------------------------------------------------------
  update(dt) {
    const g = this.g;
    if (this.mode !== 'menu' && !this.over) {
      this.time += dt;
      if (this.mode === 'zen') {
        this.timeLeft = Math.max(0, ZEN_SECONDS - this.time);
        if (this.timeLeft <= 0) this.endGame('time');
      }
      this.nextWave -= dt;
      const live = this.fruits.filter((f) => !f.cut).length;
      if (this.nextWave <= 0 && !this.over) {
        if (live < 2 || this.nextWave < -1.2) {
          this.spawnWave();
          const [a, b] = this.p.interval;
          this.nextWave = lerp(a, b, this.difficulty) * this.rng.range(0.85, 1.15);
        }
      }
    } else if (this.over) {
      this.time += dt;
    }

    for (const f of this.fruits) {
      if (f.gone) continue;
      if (f.wait > 0) { f.wait -= dt; continue; }
      if (f.button) {
        f.phase += dt;
        f.y = f.y0 + Math.sin(f.phase * 1.6) * f.r * 0.12;
        f.rot += f.vr * dt * Math.sin(f.phase * 0.7);
        continue;
      }
      f.vy += g * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
      if (f.vy > 0 && f.y - f.r > this.h) {
        f.gone = true;
        if (!f.bomb && !f.cut && this.mode === 'classic' && !this.over) this.loseLife(clamp(f.x, 40, this.w - 40), this.h);
      }
    }
    this.fruits = this.fruits.filter((f) => !f.gone);

    for (const hf of this.halves) {
      hf.age += dt; hf.vy += g * dt; hf.x += hf.vx * dt; hf.y += hf.vy * dt; hf.spin += hf.vr * dt;
    }
    this.halves = this.halves.filter((hf) => hf.y - hf.r < this.h + 50 && hf.age < 6);

    for (const p of this.particles) {
      p.age += dt; p.vy += g * p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const s of this.splats) s.age += dt;
    this.splats = this.splats.filter((s) => s.age < 5);
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < p.life);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 1.6);
  }

  takeEvents() { const e = this.events; this.events = []; return e; }
}
