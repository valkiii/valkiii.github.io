// Drawing: background, fruit, halves, juice, blades and HUD. Reads the World, never changes it.
import { sprites, SPRITE } from './sprites.js';
import { makeRng } from './geom.js';

export const FONT = '"Bungee", "Avenir Next Condensed", "Arial Black", Impact, sans-serif';

let bg = null;

// Dark wooden board, drawn once per size.
function background(w, h, dpr) {
  if (bg && bg.w === w && bg.h === h && bg.dpr === dpr) return bg.c;
  const c = document.createElement('canvas');
  c.width = w * dpr; c.height = h * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const rng = makeRng(7);
  const plank = Math.max(110, w / 9);
  for (let x = 0, i = 0; x < w; x += plank, i++) {
    const tone = 26 + rng.range(-4, 5);
    const g = ctx.createLinearGradient(x, 0, x + plank, 0);
    g.addColorStop(0, `hsl(24 38% ${tone - 3}%)`);
    g.addColorStop(0.5, `hsl(26 40% ${tone}%)`);
    g.addColorStop(1, `hsl(22 38% ${tone - 5}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, plank, h);
    ctx.strokeStyle = 'rgba(20,8,2,0.28)';
    for (let k = 0; k < 9; k++) {
      ctx.lineWidth = rng.range(0.6, 2.2);
      const gx = x + rng.range(6, plank - 6), amp = rng.range(2, 9), f = rng.range(0.004, 0.012), ph = rng() * 9;
      ctx.beginPath();
      for (let y = 0; y <= h; y += 12) ctx.lineTo(gx + Math.sin(y * f + ph) * amp, y);
      ctx.stroke();
    }
    if (rng() < 0.7) {                      // a knot
      const kx = x + rng.range(20, plank - 20), ky = rng.range(40, h - 40);
      ctx.strokeStyle = 'rgba(20,8,2,0.35)'; ctx.lineWidth = 1.5;
      for (let r = 4; r < 22; r += 4) { ctx.beginPath(); ctx.ellipse(kx, ky, r * 0.6, r * 1.6, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(8,3,0,0.7)';
    ctx.fillRect(x - 2, 0, 4, h);
  }
  const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  bg = { w, h, dpr, c };
  return c;
}

function drawSprite(ctx, img, x, y, r, rot) {
  const s = (r / SPRITE.R);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.drawImage(img, -SPRITE.SIZE / 2, -SPRITE.SIZE / 2);
  ctx.restore();
}

function splat(ctx, s) {
  const a = Math.max(0, 1 - s.age / 5) * 0.55;
  if (a <= 0) return;
  const rng = makeRng(s.seed);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 14; i++) {
    const dir = s.angle + (i % 2 ? Math.PI / 2 : -Math.PI / 2) + rng.range(-1.2, 1.2);
    const d = s.r * rng.range(0.35, 1.5), rr = s.r * rng.range(0.05, 0.22) * (1.4 - d / (s.r * 1.6));
    ctx.beginPath();
    ctx.ellipse(s.x + Math.cos(dir) * d, s.y + Math.sin(dir) * d, rr * 1.6, rr, dir, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function half(ctx, hf, img) {
  const s = hf.r / SPRITE.R;
  ctx.save();
  ctx.translate(hf.x, hf.y);
  ctx.rotate(hf.angle + hf.spin);
  ctx.beginPath();
  ctx.rect(-hf.r * 1.5, 0, hf.r * 3, hf.side * hf.r * 1.5);
  ctx.clip();
  ctx.rotate(hf.frot - hf.angle);
  ctx.scale(s, s);
  ctx.drawImage(img, -SPRITE.SIZE / 2, -SPRITE.SIZE / 2);
  ctx.restore();
}

// Tapered glowing ribbon through the recent blade points.
function ribbon(ctx, pts, now, width) {
  const n = pts.length, L = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, n - 1)], o = pts[Math.max(i - 1, 0)];
    let dx = q.x - o.x, dy = q.y - o.y;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const age = Math.min(1, (now - p.t) / 0.2);
    const w = width * Math.pow(i / (n - 1), 0.7) * (1 - age * 0.5);
    L.push([p.x - dy * w, p.y + dx * w]); Rt.push([p.x + dy * w, p.y - dx * w]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (const p of L) ctx.lineTo(p[0], p[1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(Rt[i][0], Rt[i][1]);
  ctx.closePath();
}

function bladeTrail(ctx, pts, color, now) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 24;
  ctx.fillStyle = color;
  ribbon(ctx, pts, now, 11); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ribbon(ctx, pts, now, 5); ctx.fill();
  ctx.restore();
}

export function drawText(ctx, text, x, y, size, { color = '#fff', align = 'center', alpha = 1, stroke = true, glow = null } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.5; }
  if (stroke) { ctx.lineWidth = Math.max(3, size * 0.12); ctx.strokeStyle = 'rgba(25,10,2,0.9)'; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawWorld(ctx, world, view) {
  const { w, h, dpr, now, video, ghost, blades = [], gazeRing = null, dwellTarget = null } = view;
  const S = sprites();
  ctx.save();
  if (world.shake > 0) {
    const k = world.shake * world.shake * 18;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }
  ctx.drawImage(background(w, h, dpr), 0, 0, w, h);
  if (ghost && video && video.readyState >= 2) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.translate(w, 0); ctx.scale(-1, 1);
    const vw = video.videoWidth, vh = video.videoHeight, sc = Math.max(w / vw, h / vh);
    ctx.drawImage(video, (w - vw * sc) / 2, (h - vh * sc) / 2, vw * sc, vh * sc);
    ctx.restore();
  }
  for (const s of world.splats) splat(ctx, s);

  for (const hf of world.halves) half(ctx, hf, S[hf.kind].cut);
  for (const f of world.fruits) {
    if (f.wait > 0) continue;
    if (f.bomb) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 12 + f.id);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.3 * pulse;
      const g = ctx.createRadialGradient(f.x, f.y, f.r * 0.6, f.x, f.y, f.r * 1.7);
      g.addColorStop(0, 'rgba(255,40,40,0.7)'); g.addColorStop(1, 'rgba(255,40,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    drawSprite(ctx, S[f.kind].whole, f.x, f.y, f.r, f.rot);
    if (f.bomb) {                               // fuse spark
      const s = f.r / SPRITE.R, c = Math.cos(f.rot), sn = Math.sin(f.rot);
      const [fx, fy] = SPRITE.fuse;
      const x = f.x + (fx * c - fy * sn) * s, y = f.y + (fx * sn + fy * c) * s;
      ctx.save();
      ctx.shadowColor = '#ffcf4a'; ctx.shadowBlur = 18;
      ctx.fillStyle = Math.random() < 0.5 ? '#fff6c0' : '#ffb02e';
      ctx.beginPath(); ctx.arc(x, y, f.r * (0.1 + Math.random() * 0.07), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (f.dwell > 0.02) {                      // eyes: dwell ring
      const need = f.button ? 0.76 : 0.38;
      ctx.save();
      ctx.strokeStyle = f.bomb ? '#ff5a4a' : '#ffd36b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 1.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, f.dwell / need));
      ctx.stroke();
      ctx.restore();
    }
    if (f.button) {
      drawText(ctx, f.button.label, f.x, f.y + f.r * 1.45, Math.max(18, f.r * 0.34), { color: '#fff4dc' });
    }
  }

  for (const p of world.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const p of world.popups) {
    const k = p.age / p.life, a = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    const pop = Math.min(1, p.age / 0.12);
    const size = (p.big ? 30 : 22) * (0.6 + 0.4 * pop) * (view.scale || 1);
    drawText(ctx, p.text, p.x, p.y - k * 40, size, { color: p.color || '#ffe36b', alpha: a, glow: '#ff9a1a' });
    if (p.sub) drawText(ctx, p.sub, p.x, p.y - k * 40 + size * 1.2, size * 1.3, { color: '#fff', alpha: a });
  }

  for (const b of blades) bladeTrail(ctx, b.trail(now), b.color, now);
  for (const b of blades) {
    if (!b.pos || now - b.pos.t > 0.3 || b.hideCursor) continue;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = b.color; ctx.shadowBlur = 14;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = b.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  if (gazeRing) {
    ctx.save();
    ctx.strokeStyle = gazeRing.blink ? 'rgba(255,255,255,0.25)' : 'rgba(255,211,107,0.8)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(gazeRing.x, gazeRing.y, gazeRing.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  if (world.flash > 0) {
    ctx.fillStyle = `rgba(255,245,220,${world.flash * 0.85})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function heart(ctx, x, y, s, on) {
  // the classic red X for lives
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.28;
  ctx.strokeStyle = on ? '#ff2d3a' : 'rgba(255,255,255,0.22)';
  if (on) { ctx.shadowColor = '#ff2d3a'; ctx.shadowBlur = 12; }
  ctx.beginPath(); ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.moveTo(s / 2, -s / 2); ctx.lineTo(-s / 2, s / 2); ctx.stroke();
  ctx.restore();
}

export function drawHud(ctx, world, { w, best, scale = 1 }) {
  const S = sprites();
  const s = scale;
  drawSprite(ctx, S.watermelon.cut, 44 * s, 46 * s, 24 * s, -0.4);
  drawText(ctx, String(world.score), 80 * s, 48 * s, 42 * s, { align: 'left', color: '#ffd54a' });
  drawText(ctx, `BEST ${best}`, 82 * s, 88 * s, 16 * s, { align: 'left', color: '#f5e6c8', alpha: 0.75 });
  if (world.mode === 'classic') {
    for (let i = 0; i < 3; i++) heart(ctx, w - (40 + i * 44) * s, 46 * s, (22 + i * 4) * s, i < world.misses);
  } else if (world.mode === 'zen') {
    const t = Math.ceil(world.timeLeft);
    drawText(ctx, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, w - 30 * s, 48 * s, 40 * s,
      { align: 'right', color: t <= 10 ? '#ff6a5a' : '#fff4dc' });
  }
}

// Small mirrored camera thumbnail with the tracked landmarks.
export function drawPreview(ctx, video, { w, h, hands = [], face = null, label = '', scale = 1 }) {
  if (!video || video.readyState < 2) return;
  const pw = 220 * scale, ph = pw * (video.videoHeight / video.videoWidth || 0.5625);
  const x = w - pw - 16, y = h - ph - 16;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, pw, ph, 12); ctx.clip();
  ctx.globalAlpha = 0.85;
  ctx.translate(x + pw, y); ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, pw, ph);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#7df9ff';
  for (const lm of hands) {
    ctx.strokeStyle = 'rgba(125,249,255,0.8)'; ctx.lineWidth = 1.5;
    for (const [a, b] of HAND_EDGES) {
      ctx.beginPath(); ctx.moveTo(lm[a].x * pw, lm[a].y * ph); ctx.lineTo(lm[b].x * pw, lm[b].y * ph); ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(lm[8].x * pw, lm[8].y * ph, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (face) {
    ctx.fillStyle = 'rgba(255,211,107,0.9)';
    for (const i of [33, 133, 362, 263, 159, 145, 386, 374]) { ctx.beginPath(); ctx.arc(face[i].x * pw, face[i].y * ph, 1.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#7df9ff';
    for (const i of [468, 473]) { ctx.beginPath(); ctx.arc(face[i].x * pw, face[i].y * ph, 2.5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,240,210,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x, y, pw, ph, 12); ctx.stroke();
  ctx.restore();
  if (label) drawText(ctx, label, x + 10, y + 14, 11 * scale, { align: 'left', stroke: false, alpha: 0.8 });
}

const HAND_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
