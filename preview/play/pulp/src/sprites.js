// Procedurally drawn fruit: a "whole" sprite (skin) and a "cut" sprite (the inside you
// see on each half). Drawn once at a large size, then scaled when rendering.
import { makeRng } from './geom.js';

const R = 120;               // sprite radius in px
const PAD = 1.35;            // room for leaves, stems and fuses
const SIZE = Math.ceil(R * 2 * PAD);

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.translate(SIZE / 2, SIZE / 2);
  return [c, ctx];
}

const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
const ellipse = (ctx, rx, ry) => { ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); };

function radial(ctx, r, stops, ox = -0.35, oy = -0.4) {
  const g = ctx.createRadialGradient(r * ox, r * oy, r * 0.05, 0, 0, r * 1.05);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function shine(ctx, rx, ry = rx) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.38, -ry * 0.45, rx * 0.26, ry * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.15, -ry * 0.58, rx * 0.1, ry * 0.06, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rimShadow(ctx, rx, ry = rx) {
  // darkens the lower-right edge so the fruit reads as a sphere
  const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.3, rx * 0.4, 0, 0, rx * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g;
  ellipse(ctx, rx, ry);
  ctx.fill();
}

function leaf(ctx, x, y, len, ang, color = '#4fa83a') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len * 0.85, 0); ctx.stroke();
  ctx.restore();
}

function seedsRing(ctx, n, ring, len, wid, color, rng, jitter = 0.08) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-jitter, jitter);
    const rr = ring * rng.range(0.9, 1.1);
    ctx.save();
    ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function citrusInside(ctx, rx, ry, peel, pith, flesh, light) {
  ctx.fillStyle = peel; ellipse(ctx, rx, ry); ctx.fill();
  ctx.fillStyle = pith; ellipse(ctx, rx * 0.92, ry * 0.92); ctx.fill();
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + 0.04, a1 = ((i + 1) / n) * Math.PI * 2 - 0.04;
    ctx.beginPath();
    ctx.moveTo(Math.cos((a0 + a1) / 2) * rx * 0.1, Math.sin((a0 + a1) / 2) * ry * 0.1);
    ctx.ellipse(0, 0, rx * 0.86, ry * 0.86, 0, a0, a1);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.86);
    g.addColorStop(0, light); g.addColorStop(1, flesh);
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.fillStyle = pith; circle(ctx, 0, 0, rx * 0.08); ctx.fill();
  // juice sacs
  ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n + 0.05) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * rx * 0.3, Math.sin(a) * ry * 0.3);
    ctx.lineTo(Math.cos(a + 0.12) * rx * 0.7, Math.sin(a + 0.12) * ry * 0.7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const DRAW = {
  watermelon: {
    whole(ctx, rng) {
      const rx = R * 1.06, ry = R * 0.96;
      ctx.fillStyle = radial(ctx, R, [[0, '#6fd36a'], [0.6, '#2f8f35'], [1, '#14501d']]);
      ellipse(ctx, rx, ry); ctx.fill();
      ctx.save(); ellipse(ctx, rx, ry); ctx.clip();
      ctx.strokeStyle = 'rgba(10,55,18,0.85)';
      for (let i = -4; i <= 4; i++) {
        ctx.lineWidth = rng.range(8, 14);
        ctx.beginPath();
        for (let y = -ry; y <= ry; y += 8) {
          const x = i * rx * 0.24 + Math.sin(y * 0.09 + i) * 6 + (i * rx * 0.08) * Math.cos((y / ry) * Math.PI / 2) * 0;
          const bulge = Math.cos((y / ry) * Math.PI / 2);
          y === -ry ? ctx.moveTo(x * bulge, y) : ctx.lineTo(x * bulge, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      rimShadow(ctx, rx, ry); shine(ctx, rx, ry);
    },
    cut(ctx, rng) {
      const rx = R * 1.06, ry = R * 0.96;
      ctx.fillStyle = '#1f7a2a'; ellipse(ctx, rx, ry); ctx.fill();
      ctx.fillStyle = '#d9f2c4'; ellipse(ctx, rx * 0.91, ry * 0.91); ctx.fill();
      ctx.fillStyle = radial(ctx, R, [[0, '#ff6b7f'], [0.7, '#f0283f'], [1, '#c8122a']], 0, 0);
      ellipse(ctx, rx * 0.86, ry * 0.86); ctx.fill();
      seedsRing(ctx, 12, R * 0.52, 8, 4.5, '#1a1010', rng, 0.15);
      seedsRing(ctx, 7, R * 0.28, 7, 4, '#2a1a12', rng, 0.3);
    },
  },
  orange: {
    whole(ctx, rng) {
      ctx.fillStyle = radial(ctx, R, [[0, '#ffd27a'], [0.55, '#ff9a1f'], [1, '#d86108']]);
      circle(ctx, 0, 0, R); ctx.fill();
      ctx.fillStyle = 'rgba(160,70,0,0.25)';
      for (let i = 0; i < 220; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * R * 0.95;
        circle(ctx, Math.cos(a) * d, Math.sin(a) * d, 1.6); ctx.fill();
      }
      rimShadow(ctx, R); shine(ctx, R);
      ctx.fillStyle = '#5a7d2a'; circle(ctx, R * 0.05, -R * 0.93, 7); ctx.fill();
      leaf(ctx, R * 0.08, -R * 0.95, R * 0.45, -0.5);
    },
    cut(ctx) { citrusInside(ctx, R, R, '#f07d10', '#fff1d6', '#ff9415', '#ffc86a'); },
  },
  lemon: {
    whole(ctx, rng) {
      const rx = R * 1.12, ry = R * 0.86;
      ctx.fillStyle = '#e8c414';
      ctx.beginPath(); ctx.ellipse(rx * 0.98, 0, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-rx * 0.98, 0, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = radial(ctx, R, [[0, '#fff7a0'], [0.55, '#ffe12e'], [1, '#c9a10a']]);
      ellipse(ctx, rx, ry); ctx.fill();
      ctx.fillStyle = 'rgba(170,130,0,0.22)';
      for (let i = 0; i < 160; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 0.95;
        circle(ctx, Math.cos(a) * d * rx, Math.sin(a) * d * ry, 1.5); ctx.fill();
      }
      rimShadow(ctx, rx, ry); shine(ctx, rx, ry);
    },
    cut(ctx) { citrusInside(ctx, R * 1.12, R * 0.86, '#f2cf1a', '#fffbe0', '#ffe74a', '#fff6b0'); },
  },
  apple: {
    whole(ctx) {
      ctx.fillStyle = radial(ctx, R, [[0, '#ff7a6b'], [0.5, '#e0202a'], [1, '#8c0c16']]);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.72);
      ctx.bezierCurveTo(R * 0.55, -R * 1.12, R * 1.18, -R * 0.6, R * 0.98, R * 0.15);
      ctx.bezierCurveTo(R * 0.85, R * 0.8, R * 0.4, R * 1.02, 0, R * 0.86);
      ctx.bezierCurveTo(-R * 0.4, R * 1.02, -R * 0.85, R * 0.8, -R * 0.98, R * 0.15);
      ctx.bezierCurveTo(-R * 1.18, -R * 0.6, -R * 0.55, -R * 1.12, 0, -R * 0.72);
      ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(255,220,120,0.07)';
      ctx.beginPath(); ctx.ellipse(R * 0.45, R * 0.2, R * 0.35, R * 0.55, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      shine(ctx, R * 0.95);
      ctx.strokeStyle = '#5b3417'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -R * 0.68); ctx.quadraticCurveTo(R * 0.05, -R * 1.0, R * 0.16, -R * 1.12); ctx.stroke();
      leaf(ctx, R * 0.12, -R * 0.95, R * 0.5, -0.35, '#5cb83c');
    },
    cut(ctx, rng) {
      ctx.fillStyle = '#c81822'; circle(ctx, 0, 0, R * 0.98); ctx.fill();
      ctx.fillStyle = radial(ctx, R, [[0, '#fffbe8'], [1, '#f3e2b0']], 0, 0);
      circle(ctx, 0, 0, R * 0.92); ctx.fill();
      ctx.fillStyle = 'rgba(214,180,110,0.55)';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, r = i % 2 ? R * 0.16 : R * 0.3;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      seedsRing(ctx, 5, R * 0.18, 9, 5, '#4a2a12', rng, 0.02);
    },
  },
  kiwi: {
    whole(ctx, rng) {
      const rx = R * 1.08, ry = R * 0.9;
      ctx.fillStyle = radial(ctx, R, [[0, '#b58a55'], [0.6, '#8a6235'], [1, '#4f3519']]);
      ellipse(ctx, rx, ry); ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 400; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 0.97;
        const x = Math.cos(a) * d * rx, y = Math.sin(a) * d * ry;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.range(-4, 4), y + rng.range(-4, 4)); ctx.stroke();
      }
      rimShadow(ctx, rx, ry); shine(ctx, rx, ry);
    },
    cut(ctx, rng) {
      const rx = R * 1.08, ry = R * 0.9;
      ctx.fillStyle = '#6b4a26'; ellipse(ctx, rx, ry); ctx.fill();
      ctx.fillStyle = radial(ctx, R, [[0, '#d8f59a'], [0.45, '#9fdc3a'], [1, '#5ea81c']], 0, 0);
      ellipse(ctx, rx * 0.94, ry * 0.94); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,230,0.5)'; ctx.lineWidth = 2;
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * rx * 0.3, Math.sin(a) * ry * 0.3);
        ctx.lineTo(Math.cos(a) * rx * 0.85, Math.sin(a) * ry * 0.85); ctx.stroke();
      }
      ctx.fillStyle = '#fbffe8'; ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.26, ry * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.scale(1, ry / rx);
      seedsRing(ctx, 30, rx * 0.36, 5, 2.6, '#1b1408', rng, 0.08);
      ctx.restore();
    },
  },
  plum: {
    whole(ctx) {
      ctx.fillStyle = radial(ctx, R, [[0, '#c46ad8'], [0.55, '#7a1f86'], [1, '#3a0a44']]);
      circle(ctx, 0, 0, R); ctx.fill();
      ctx.strokeStyle = 'rgba(30,0,40,0.4)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(R * 0.05, -R * 0.95); ctx.quadraticCurveTo(R * 0.45, 0, R * 0.1, R * 0.95); ctx.stroke();
      ctx.globalAlpha = 0.15; ctx.fillStyle = '#e8e0ff'; circle(ctx, 0, 0, R); ctx.fill(); ctx.globalAlpha = 1;
      shine(ctx, R);
      ctx.strokeStyle = '#4c3a1a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(R * 0.05, -R * 0.92); ctx.lineTo(R * 0.12, -R * 1.12); ctx.stroke();
    },
    cut(ctx) {
      ctx.fillStyle = '#5e1468'; circle(ctx, 0, 0, R); ctx.fill();
      ctx.fillStyle = radial(ctx, R, [[0, '#ffd27a'], [0.6, '#f2a83a'], [1, '#d0452e']], 0, 0);
      circle(ctx, 0, 0, R * 0.93); ctx.fill();
      ctx.fillStyle = '#8a4a20'; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.36, R * 0.26, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(60,25,8,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.26, R * 0.16, 0.4, 0, Math.PI * 2); ctx.stroke();
    },
  },
  coconut: {
    whole(ctx, rng) {
      ctx.fillStyle = radial(ctx, R, [[0, '#9a6a3c'], [0.6, '#6a4320'], [1, '#3a220d']]);
      circle(ctx, 0, 0, R); ctx.fill();
      ctx.save(); circle(ctx, 0, 0, R); ctx.clip();
      ctx.strokeStyle = 'rgba(205,160,110,0.35)'; ctx.lineWidth = 1.6;
      for (let i = 0; i < 260; i++) {
        const a = rng() * Math.PI * 2, d = rng() * R;
        const x = Math.cos(a) * d, y = Math.sin(a) * d, l = rng.range(8, 22), b = rng.range(-0.5, 0.5);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b + 1.2) * l, y + Math.sin(b + 1.2) * l); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#24140a';
      [[-0.18, -0.55], [0.12, -0.6], [-0.03, -0.38]].forEach(([x, y]) => { circle(ctx, x * R, y * R, R * 0.07); ctx.fill(); });
      rimShadow(ctx, R); shine(ctx, R);
    },
    cut(ctx) {
      ctx.fillStyle = '#4e3016'; circle(ctx, 0, 0, R); ctx.fill();
      ctx.fillStyle = '#fbfaf4'; circle(ctx, 0, 0, R * 0.84); ctx.fill();
      ctx.fillStyle = radial(ctx, R, [[0, '#e9f2f6'], [1, '#bccdd6']], 0, 0);
      circle(ctx, 0, 0, R * 0.62); ctx.fill();
    },
  },
};

function drawBomb(ctx) {
  ctx.fillStyle = radial(ctx, R, [[0, '#5a5a66'], [0.45, '#1d1d24'], [1, '#050507']]);
  circle(ctx, 0, R * 0.05, R * 0.95); ctx.fill();
  shine(ctx, R * 0.9);
  ctx.fillStyle = '#8a8f98';
  ctx.fillRect(-R * 0.22, -R * 1.0, R * 0.44, R * 0.22);
  ctx.fillStyle = '#5b6068';
  ctx.fillRect(-R * 0.22, -R * 0.82, R * 0.44, R * 0.05);
  ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -R * 1.0); ctx.quadraticCurveTo(R * 0.1, -R * 1.3, R * 0.38, -R * 1.22); ctx.stroke();
  ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 6; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(-R * 0.25, -R * 0.1); ctx.lineTo(R * 0.25, R * 0.4); ctx.moveTo(R * 0.25, -R * 0.1); ctx.lineTo(-R * 0.25, R * 0.4); ctx.stroke();
  ctx.globalAlpha = 1;
}

export const SPRITE = { R, SIZE, fuse: [R * 0.38, -R * 1.22] };
let cache = null;

export function sprites() {
  if (cache) return cache;
  cache = {};
  for (const [kind, d] of Object.entries(DRAW)) {
    const [w, wc] = canvas(); d.whole(wc, makeRng(kind.length * 977));
    const [c, cc] = canvas(); d.cut(cc, makeRng(kind.length * 131));
    cache[kind] = { whole: w, cut: c };
  }
  const [b, bc] = canvas(); drawBomb(bc);
  cache.bomb = { whole: b, cut: b };
  return cache;
}
