// The Connect 4 ensemble in plain JavaScript: five CNN dueling DQNs, weighted Q-value averaging.
// Same maths as CNNDuelingNetwork._forward_m1_optimized (eval mode); checked against PyTorch with tests.json.
(function (root) {
  "use strict";
  const ROWS = 6, COLS = 7;

  function conv(x, C, H, W, w, b, K, KH, KW, pad, sh) {
    const OH = Math.floor((H + 2 * pad - KH) / sh) + 1, OW = W + 2 * pad - KW + 1;
    const out = new Float32Array(K * OH * OW);
    for (let k = 0; k < K; k++)
      for (let oy = 0; oy < OH; oy++)
        for (let ox = 0; ox < OW; ox++) {
          let s = b[k];
          for (let c = 0; c < C; c++)
            for (let ky = 0; ky < KH; ky++) {
              const y = oy * sh + ky - pad; if (y < 0 || y >= H) continue;
              for (let kx = 0; kx < KW; kx++) {
                const xx = ox + kx - pad; if (xx < 0 || xx >= W) continue;
                s += x[(c * H + y) * W + xx] * w[((k * C + c) * KH + ky) * KW + kx];
              }
            }
          out[(k * OH + oy) * OW + ox] = s;
        }
    return { out, OH, OW };
  }
  function reluBn(x, C, HW, g, b, m, v) {
    for (let c = 0; c < C; c++) {
      const s = g[c] / Math.sqrt(v[c] + 1e-5);
      for (let i = 0; i < HW; i++) { const j = c * HW + i, r = x[j] > 0 ? x[j] : 0; x[j] = (r - m[c]) * s + b[c]; }
    }
    return x;
  }
  function linear(x, w, b, O, relu) {
    const I = x.length, out = new Float32Array(O);
    for (let o = 0; o < O; o++) { let s = b[o]; for (let i = 0; i < I; i++) s += w[o * I + i] * x[i]; out[o] = relu && s < 0 ? 0 : s; }
    return out;
  }
  function forward(p, x) {
    let h = conv(x, 2, ROWS, COLS, p["conv_block.0.weight"], p["conv_block.0.bias"], 32, 3, 3, 1, 1).out;
    reluBn(h, 32, 42, p["conv_block.2.weight"], p["conv_block.2.bias"], p["conv_block.2.running_mean"], p["conv_block.2.running_var"]);
    h = conv(h, 32, ROWS, COLS, p["conv_block.3.weight"], p["conv_block.3.bias"], 64, 3, 3, 1, 1).out;
    reluBn(h, 64, 42, p["conv_block.5.weight"], p["conv_block.5.bias"], p["conv_block.5.running_mean"], p["conv_block.5.running_var"]);
    h = conv(h, 64, ROWS, COLS, p["spatial_reduce.weight"], p["spatial_reduce.bias"], 32, 3, 1, 0, 2).out; // 32 x 2 x 7
    h = linear(h, p["feature_fc.0.weight"], p["feature_fc.0.bias"], 96, true);
    h = linear(h, p["feature_fc.3.weight"], p["feature_fc.3.bias"], 48, true);
    const v = linear(h, p["value_head.weight"], p["value_head.bias"], 1, false)[0];
    const a = linear(h, p["advantage_head.weight"], p["advantage_head.bias"], 7, false);
    const am = a.reduce((s, t) => s + t, 0) / 7;
    return Array.from(a, t => Math.max(-100, Math.min(100, v + t - am)));
  }
  // board: 6x7, row 0 at the top; me / them: player ids. Channel 0 = my tokens.
  function encode(board, me) {
    const x = new Float32Array(84);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (board[r][c] === me) x[r * COLS + c] = 1;
      else if (board[r][c] !== 0) x[42 + r * COLS + c] = 1;
    }
    return x;
  }
  async function load(base) {
    const meta = await (await fetch(base + "ensemble.json")).json();
    const buf = new Float32Array(await (await fetch(base + "ensemble.f32")).arrayBuffer());
    const models = meta.models.map(m => ({
      name: m.name, weight: m.weight,
      p: Object.fromEntries(Object.entries(m.layout).map(([k, [o, n]]) => [k, buf.subarray(o, o + n)])),
    }));
    const total = models.reduce((s, m) => s + m.weight, 0);
    return {
      name: meta.name, models,
      // per-model and weighted Q-values for player `me`
      think(board, me) {
        const x = encode(board, me);
        const each = models.map(m => forward(m.p, x));
        const q = Array.from({ length: 7 }, (_, c) => each.reduce((s, e, k) => s + models[k].weight / total * e[c], 0));
        return { q, each };
      },
    };
  }
  root.C4Net = { load, forward, encode };
})(typeof window !== "undefined" ? window : globalThis);
