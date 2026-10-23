// Webcam gaze estimation: face-mesh landmarks → a small feature vector → screen point,
// via a ridge regression fitted during calibration. Pure functions, testable in Node.

// Face-mesh indices (478-point model with irises).
const EYE_R = { outer: 33, inner: 133, up: 159, down: 145, iris: 468 };   // subject's right eye
const EYE_L = { inner: 362, outer: 263, up: 386, down: 374, iris: 473 };  // subject's left eye
const NOSE = 1, CHEEK_R = 234, CHEEK_L = 454, FOREHEAD = 10, CHIN = 152;

function eye(P, a, b, e) {
  // a→b both point to the image right, so both eyes agree on direction.
  const [ax, ay] = P(a), [bx, by] = P(b), [ix, iy] = P(e.iris);
  const w = Math.hypot(bx - ax, by - ay) || 1e-6;
  const ux = (bx - ax) / w, uy = (by - ay) / w;
  const dx = ix - (ax + bx) / 2, dy = iy - (ay + by) / 2;
  const [, upY] = P(e.up), [, downY] = P(e.down);
  return { h: (dx * ux + dy * uy) / w, v: (-dx * uy + dy * ux) / w, open: (downY - upY) / w };
}

const blendScore = (cats, name) => {
  if (!cats) return 0;
  for (const c of cats) if (c.categoryName === name) return c.score;
  return 0;
};

// lm: 478 normalized landmarks; blend: faceBlendshapes[0].categories; aspect = width / height.
export function eyeFeatures(lm, blend, aspect = 16 / 9) {
  if (!lm || lm.length < 478) return null;
  const P = (i) => [lm[i].x * aspect, lm[i].y];
  const r = eye(P, EYE_R.outer, EYE_R.inner, EYE_R);
  const l = eye(P, EYE_L.inner, EYE_L.outer, EYE_L);
  const [nx, ny] = P(NOSE), [cxr] = P(CHEEK_R), [cxl] = P(CHEEK_L);
  const [, fy] = P(FOREHEAD), [, chy] = P(CHIN);
  const faceW = Math.abs(cxl - cxr) || 1e-6, faceH = Math.abs(chy - fy) || 1e-6;
  const b = (n) => blendScore(blend, n);
  return {
    ix: (r.h + l.h) / 2,
    iy: (r.v + l.v) / 2,
    open: (r.open + l.open) / 2,
    // Blendshape gaze: + = looking to the image right / up.
    bh: (b('eyeLookInRight') - b('eyeLookOutRight') + b('eyeLookOutLeft') - b('eyeLookInLeft')) / 2,
    bv: (b('eyeLookUpLeft') + b('eyeLookUpRight') - b('eyeLookDownLeft') - b('eyeLookDownRight')) / 2,
    yaw: (nx - (cxr + cxl) / 2) / faceW,
    pitch: (ny - (fy + chy) / 2) / faceH,
    fx: (cxr + cxl) / 2,
    fy: (fy + chy) / 2,
    scale: faceW,
    blinkL: b('eyeBlinkLeft'),
    blinkR: b('eyeBlinkRight'),
  };
}

const LINEAR = ['ix', 'iy', 'open', 'bh', 'bv', 'yaw', 'pitch', 'fx', 'fy', 'scale'];

export function featureVector(f, quad = false) {
  const v = LINEAR.map((k) => f[k]);
  if (quad) v.push(f.ix * f.ix, f.iy * f.iy, f.ix * f.iy, f.bh * f.bh, f.bv * f.bv);
  return v;
}

// Solve (A) x = b for a small dense symmetric system (Gaussian elimination, partial pivot).
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / d;
      if (k) for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / (M[i][i] || 1e-12));
}

// Ridge regression on standardized features, one target column.
function ridge(X, y, lambda) {
  const n = X.length, d = X[0].length;
  const mu = Array(d).fill(0), sd = Array(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j++) mu[j] += x[j] / n;
  for (const x of X) for (let j = 0; j < d; j++) sd[j] += (x[j] - mu[j]) ** 2 / n;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const ym = y.reduce((s, v) => s + v, 0) / n;
  const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
  const A = Array.from({ length: d }, () => Array(d).fill(0)), b = Array(d).fill(0);
  for (let i = 0; i < n; i++) {
    const z = Z[i];
    for (let j = 0; j < d; j++) {
      b[j] += z[j] * (y[i] - ym);
      for (let k = j; k < d; k++) A[j][k] += z[j] * z[k];
    }
  }
  for (let j = 0; j < d; j++) { for (let k = 0; k < j; k++) A[j][k] = A[k][j]; A[j][j] += lambda * n; }
  const w = solve(A, b);
  return (x) => { let s = ym; for (let j = 0; j < d; j++) s += w[j] * (x[j] - mu[j]) / sd[j]; return s; };
}

// samples: [{f, x, y, group}] (group = calibration point index).
// Picks the feature set and regularisation by leave-one-point-out cross-validation.
export function fitGaze(samples, { lambdas = [0.003, 0.01, 0.03, 0.1, 0.3, 1], quads = [false, true] } = {}) {
  const groups = [...new Set(samples.map((s) => s.group))];
  let best = null;
  for (const quad of quads) {
    const X = samples.map((s) => featureVector(s.f, quad));
    for (const lambda of lambdas) {
      let err = 0, cnt = 0;
      for (const g of groups) {
        const tr = [], te = [];
        samples.forEach((s, i) => (s.group === g ? te : tr).push(i));
        if (tr.length < 4 || !te.length) continue;
        const fx = ridge(tr.map((i) => X[i]), tr.map((i) => samples[i].x), lambda);
        const fy = ridge(tr.map((i) => X[i]), tr.map((i) => samples[i].y), lambda);
        for (const i of te) { err += Math.hypot(fx(X[i]) - samples[i].x, fy(X[i]) - samples[i].y); cnt++; }
      }
      const cv = cnt ? err / cnt : Infinity;
      if (!best || cv < best.cv) best = { quad, lambda, cv };
    }
  }
  const X = samples.map((s) => featureVector(s.f, best.quad));
  const fx = ridge(X, samples.map((s) => s.x), best.lambda);
  const fy = ridge(X, samples.map((s) => s.y), best.lambda);
  return {
    ...best,
    predict: (f) => { const v = featureVector(f, best.quad); return [fx(v), fy(v)]; },
  };
}

// Robustly keep the samples of one fixation: drop the ones far from the median feature.
export function trimFixation(fs, keys = ['ix', 'iy', 'bh', 'bv']) {
  if (fs.length < 5) return fs;
  const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
  const m = keys.map((k) => med(fs.map((f) => f[k])));
  const mad = keys.map((k, j) => med(fs.map((f) => Math.abs(f[k] - m[j]))) || 1e-6);
  return fs.filter((f) => keys.every((k, j) => Math.abs(f[k] - m[j]) <= 3 * 1.4826 * mad[j]));
}
