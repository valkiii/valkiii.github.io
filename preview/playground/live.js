// Live tiles: each one animates real material from the project it links to.
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
  function fit(c) {
    const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return { ctx: c.getContext("2d"), w, h, dpr };
  }
  const lerp = (a, b, f) => Array.isArray(a) ? a.map((x, i) => lerp(x, b[i], f)) : a + (b - a) * f;
  function at(s, t) {
    const T = s.t; if (t <= T[0]) return s.lm[0]; if (t >= T[T.length - 1]) return s.lm[T.length - 1];
    let k = 0; while (T[k + 1] < t) k++; return lerp(s.lm[k], s.lm[k + 1], (t - T[k]) / Math.max(1e-6, T[k + 1] - T[k]));
  }

  const LIVE = {};
  // a real recorded swipe, as a chronophotograph with fingertip trails
  LIVE.hand = c => {
    const G = (window.PRECOG_GESTURES || []).filter(g => g.name.startsWith("swipe"));
    if (!G.length) return () => {};
    const takes = G.flatMap(g => g.samples);
    let k = 0, t0 = null;
    return now => {
      const { ctx, w, h, dpr } = fit(c), s = takes[k], d = s.t[s.t.length - 1] - s.t[0];
      t0 ??= now; let t = now - t0; if (t > d + 1.2) { k = (k + 1) % takes.length; t0 = now; t = 0; }
      const pts = s.lm.flat(); let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const sc = Math.min(w * .8 / (x1 - x0), h * .7 / (y1 - y0)), ox = (w - (x1 - x0) * sc) / 2 - x0 * sc, oy = (h * .82 - (y1 - y0) * sc) / 2 - y0 * sc;
      const M = p => [ox + p[0] * sc, oy + p[1] * sc];
      ctx.clearRect(0, 0, w, h);
      const tt = s.t[0] + Math.min(t, d);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let i = 0; i < s.t.length && s.t[i] <= tt; i += 2) { ctx.globalAlpha = .18; drawHand(ctx, s.lm[i], M, 1.2 * dpr); }
      ctx.globalAlpha = 1;
      for (const tip of [4, 8, 12, 16, 20]) {
        ctx.beginPath();
        for (let q = 0; q <= 30; q++) { const p = M(at(s, s.t[0] + (tt - s.t[0]) * q / 30)[tip]); q ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
        ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = (tip === 8 ? 3 : 1.6) * dpr; ctx.stroke();
      }
      drawHand(ctx, at(s, tt), M, 3.4 * dpr, true);
    };
  };
  function drawHand(ctx, lm, M, lw, joints) {
    ctx.strokeStyle = "#fff"; ctx.lineWidth = lw; ctx.beginPath();
    for (const [a, b] of BONES) { const p = M(lm[a]), q = M(lm[b]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    ctx.stroke();
    if (joints) { ctx.fillStyle = "#fff"; for (const p of lm) { const q = M(p); ctx.beginPath(); ctx.arc(q[0], q[1], lw * .9, 0, 7); ctx.fill(); } }
  }

  // the run from the heartbeat page: an ECG sweep paced by the real heart rate, and the number
  LIVE.heart = c => {
    const D = window.HEART; if (!D) return () => {};
    let idx = 0, last = 0, lastBeat = -9, col = null, sweep = 0, prev = null;
    const g = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));
    const ecg = (tau, s) => { const x = tau / s; return .12 * g(x, .08, .025) - .12 * g(x, .17, .009) + g(x, .2, .012) - .26 * g(x, .226, .011) + .28 * g(x, .42, .05); };
    return now => {
      const { ctx, w, h, dpr } = fit(c);
      if (!col || col.length !== w) { col = new Float32Array(w).fill(NaN); sweep = 0; }
      const dt = prev === null ? 0 : Math.min(.05, now - prev); prev = now;
      if (now - last > .25) { idx = (idx + 1) % D.hr.length; last = now; }
      const bpm = D.hr[idx], iv = 60 / bpm, s = Math.max(.55, Math.min(1, iv / .75));
      if (now - lastBeat > iv) lastBeat = now;
      const pxps = 160 * dpr, adv = Math.min(w, pxps * dt);
      for (let k = 0; k < adv; k++) { const tau = now - (adv - k) / pxps - lastBeat; col[(Math.floor(sweep) + k) % w] = tau >= 0 ? ecg(tau, s) : 0; }
      sweep = (sweep + adv) % w;
      for (let k = 0; k < 24 * dpr; k++) col[(Math.floor(sweep) + k) % w] = NaN;
      ctx.clearRect(0, 0, w, h);
      const mid = h * .62, amp = h * .34;
      ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2.4 * dpr; ctx.lineJoin = "round"; ctx.beginPath(); let pen = false;
      for (let x = 0; x < w; x++) { const v = col[x]; if (Number.isNaN(v)) { pen = false; continue; } const y = mid - v * amp; pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }
      ctx.stroke();
      const pulse = Math.max(0, 1 - (now - lastBeat - .2 * s) / .25);
      ctx.fillStyle = "#fff"; ctx.font = `800 ${Math.round(h * .26)}px "Bricolage Grotesque", sans-serif`; ctx.textBaseline = "top";
      ctx.fillText(bpm, 22 * dpr, 18 * dpr);
      ctx.font = `600 ${Math.round(12 * dpr)}px "JetBrains Mono", monospace`; ctx.globalAlpha = .8;
      ctx.fillText(`BPM · minute ${Math.floor(D.secs[idx] / 60)}`, 24 * dpr, 18 * dpr + h * .27); ctx.globalAlpha = 1;
      const hx = w - 48 * dpr, hy = 46 * dpr, r = (16 + pulse * 6) * dpr;
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) { const t = k / 60 * Math.PI * 2, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); k ? ctx.lineTo(hx + x / 17 * r, hy - y / 17 * r) : ctx.moveTo(hx + x / 17 * r, hy - y / 17 * r); }
      ctx.fill();
    };
  };

  // a game of four in a row playing itself
  LIVE.c4 = c => {
    let board, discs, turn, t0 = 0, nextAt = 0, done = 0;
    const reset = now => { board = Array.from({ length: 6 }, () => Array(7).fill(0)); discs = []; turn = 1; nextAt = now + .4; done = 0; };
    const win = (r, cc, p) => [[0, 1], [1, 0], [1, 1], [1, -1]].some(([dr, dc]) => { let n = 1; for (const s of [1, -1]) { let rr = r + dr * s, c2 = cc + dc * s; while (rr >= 0 && rr < 6 && c2 >= 0 && c2 < 7 && board[rr][c2] === p) { n++; rr += dr * s; c2 += dc * s; } } return n >= 4; });
    return now => {
      if (!board) reset(now);
      const { ctx, w, h, dpr } = fit(c);
      if (done && now > done + 2.2) reset(now);
      if (!done && now > nextAt) {
        const legal = [0, 1, 2, 3, 4, 5, 6].filter(x => board[0][x] === 0);
        if (!legal.length) done = now; else {
          const cc = legal.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3) + (Math.random() - .5) * 4)[0];
          let r = 5; while (board[r][cc]) r--; board[r][cc] = turn;
          discs.push({ r, c: cc, p: turn, y: -1, vy: 0 });
          if (win(r, cc, turn)) done = now + .6;
          turn = 3 - turn; nextAt = now + .65;
        }
      }
      ctx.clearRect(0, 0, w, h);
      const cell = Math.min(w * .78 / 7, h * .78 / 6), bx = (w - cell * 7) / 2, by = (h - cell * 6) / 2 - 8 * dpr;
      for (const d of discs) {
        const ty = d.r; d.vy += .045; d.y = Math.min(ty, d.y + d.vy); if (d.y >= ty && d.vy > .25) { d.vy *= -.3; d.y = ty - .01; }
        ctx.fillStyle = d.p === 1 ? "#ffd23f" : "#ffffff";
        ctx.beginPath(); ctx.arc(bx + (d.c + .5) * cell, by + (d.y + .5) * cell, cell * .38, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2 * dpr;
      for (let r = 0; r < 6; r++) for (let x = 0; x < 7; x++) { ctx.beginPath(); ctx.arc(bx + (x + .5) * cell, by + (r + .5) * cell, cell * .42, 0, 7); ctx.stroke(); }
    };
  };

  // points that sort themselves: raw data → explanations → personas
  LIVE.clusters = c => {
    const N = 180, K = 5, pts = [];
    const centers = [[.25, .3], [.7, .25], [.8, .7], [.3, .75], [.52, .5]];
    for (let i = 0; i < N; i++) { const k = i % K, a = Math.random() * 6.28, r = Math.random() ** .6 * .1; pts.push({ k, mx: .15 + Math.random() * .7, my: .15 + Math.random() * .7, cx: centers[k][0] + Math.cos(a) * r, cy: centers[k][1] + Math.sin(a) * r }); }
    const cols = ["#ffffff", "#ffd23f", "#9df2ff", "#ffb3d1", "#b8ffcf"];
    return now => {
      const { ctx, w, h, dpr } = fit(c);
      const phase = (now % 6) / 6, f = phase < .5 ? Math.min(1, phase * 4 - .6) : Math.max(0, 1 - (phase - .5) * 4 + .6);
      const e = f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f);
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        const x = (p.mx + (p.cx - p.mx) * e) * w, y = (p.my + (p.cy - p.my) * e) * h * .86;
        ctx.fillStyle = e > .02 ? cols[p.k] : "rgba(255,255,255,.85)"; ctx.globalAlpha = .9;
        ctx.beginPath(); ctx.arc(x, y, 3.4 * dpr, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  };

  const items = [...document.querySelectorAll("canvas[data-live]")].map(c => ({ c, draw: (LIVE[c.dataset.live] || (() => () => {}))(c), on: true }));
  const io = new IntersectionObserver(es => es.forEach(e => { const it = items.find(i => i.c === e.target); if (it) it.on = e.isIntersecting; }));
  items.forEach(i => io.observe(i.c));
  if (reduce) { setTimeout(() => items.forEach(i => i.draw(2.5)), 300); return; }
  (function loop() { const now = performance.now() / 1000; items.forEach(i => i.on && i.draw(now)); requestAnimationFrame(loop); })();
})();
