// A floating network sphere: projects, technologies and use cases on a slowly turning globe, with faint
// "idea dust" in between. WebGL with a 2D canvas fallback. No frame or box: it draws on a transparent canvas.
//
//   const s = PortfolioSphere(canvas, data, { colors: { play: "#…", … }, dim: "#…", labels: el, onOpen: id => … })
//   s.focus("games" | null)          turn that use case towards the viewer and dim the rest
//   s.glide({ x, y, r }, ms)         move/resize the sphere (CSS pixels, relative to the canvas)
//   s.spin(on)                       idle rotation
(function (root) {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hex = h => { h = String(h).trim().replace("#", ""); if (h.length === 3) h = [...h].map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  function PortfolioSphere(canvas, data, opts = {}) {
    const N = data.nodes.length, E = data.edges.length;
    const P = new Float32Array(N * 3);
    data.nodes.forEach((n, i) => P.set(n.p, 3 * i));
    const EP = new Float32Array(E * 6);
    data.edges.forEach(([a, b], k) => { EP.set(P.subarray(3 * a, 3 * a + 3), 6 * k); EP.set(P.subarray(3 * b, 3 * b + 3), 6 * k + 3); });
    let colors = {}, DIM = [0.5, 0.5, 0.5];
    const nodeKind = data.nodes.map(n => n.k);
    const boost = opts.boost || 1;   // > 1 on light backgrounds, where faint points disappear
    let focusUc = null;

    function arrays() {
      const nodes = new Float32Array(N * 5), ecol = new Float32Array(E * 8);
      const col = data.nodes.map(n => colors[n.uc] || DIM);
      data.nodes.forEach((n, i) => {
        const on = !focusUc || (n.ucs ? n.ucs.includes(focusUc) : n.uc === focusUc);
        let c = col[i], a, s;
        if (n.k === "uc") { s = 15; a = 1; }
        else if (n.k === "p") { s = n.f ? 12 : 9; a = 1; }
        else if (n.k === "tech") { s = 6; a = .85; }
        else { s = 2.6; a = .55; }
        if (!on) { c = DIM; a *= n.k === "d" ? .6 : .55; s *= .85; }
        else if (focusUc && n.k !== "d") s *= 1.25;
        nodes.set([c[0], c[1], c[2], Math.min(1, a * boost), s * (n.k === "d" ? Math.sqrt(boost) : 1)], 5 * i);
      });
      data.edges.forEach(([a, b], k) => {
        const dust = nodeKind[a] === "d" || nodeKind[b] === "d";
        const on = !focusUc || (data.nodes[a].uc === focusUc && data.nodes[b].uc === focusUc) || (data.nodes[b].k === "uc" && data.nodes[b].uc === focusUc);
        const ea = Math.min(1, (dust ? .1 : .32) * (on ? 1 : .25) * boost);
        const ca = on ? col[a] : DIM, cb = on ? col[b] : DIM;
        ecol.set([ca[0], ca[1], ca[2], ea, cb[0], cb[1], cb[2], ea], 8 * k);
      });
      return { nodes, ecol };
    }

    // ---------- WebGL ----------
    let gl = null, prog, eprog, buf = {}, ctx2d = null;
    const VS = `attribute vec3 p; attribute vec4 ca; attribute vec4 cb; attribute float sa; attribute float sb;
      uniform mat3 R; uniform vec2 C; uniform vec2 K; uniform float t; uniform float PS; varying vec4 vc;
      void main() { vec3 q = R * p; float f = 3.0 / (4.0 - q.z); float depth = (q.z + 1.0) * 0.5;
        vc = mix(ca, cb, t); vc.a *= mix(0.12, 1.0, depth);
        gl_PointSize = mix(sa, sb, t) * PS * f * mix(0.7, 1.12, depth); gl_Position = vec4(C + q.xy * f * K, 0.0, 1.0); }`;
    const FS = `precision mediump float; varying vec4 vc;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.32, d); float core = smoothstep(0.2, 0.0, d) * 0.35;
        gl_FragColor = vec4(min(vc.rgb + core, 1.0), vc.a * a); }`;
    const EVS = `attribute vec3 p; attribute vec4 ca; attribute vec4 cb; uniform mat3 R; uniform vec2 C; uniform vec2 K; uniform float t; varying vec4 vc;
      void main() { vec3 q = R * p; float f = 3.0 / (4.0 - q.z); vc = mix(ca, cb, t); vc.a *= mix(0.08, 1.0, (q.z + 1.0) * 0.5);
        gl_Position = vec4(C + q.xy * f * K, 0.0, 1.0); }`;
    const EFS = `precision mediump float; varying vec4 vc; void main() { gl_FragColor = vc; }`;
    function compile(vs, fs) {
      const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p;
    }
    const attrib = (p, name, b, n, stride, off) => { const loc = gl.getAttribLocation(p, name); if (loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride * 4, off * 4); };

    let A, B, mixT = 1, mixT0 = 0;
    function upload() {
      if (!gl) return;
      for (const [k, v] of [["na", A.nodes], ["nb", B.nodes], ["ea", A.ecol], ["eb", B.ecol]]) { gl.bindBuffer(gl.ARRAY_BUFFER, buf[k]); gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW); }
    }
    function recolor(instant) {
      const m = mixT, now = arrays();
      if (A && B && !instant) {
        const n = new Float32Array(A.nodes.length), e = new Float32Array(A.ecol.length);
        for (let i = 0; i < n.length; i++) n[i] = A.nodes[i] + (B.nodes[i] - A.nodes[i]) * m;
        for (let i = 0; i < e.length; i++) e[i] = A.ecol[i] + (B.ecol[i] - A.ecol[i]) * m;
        A = { nodes: n, ecol: e }; B = now; mixT = 0; mixT0 = performance.now();
      } else { A = now; B = now; mixT = 1; }
      upload();
    }
    function setColors(c, dim) { colors = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, hex(v)])); DIM = hex(dim || "#7f8590"); recolor(true); }
    setColors(opts.colors || {}, opts.dim);
    try {
      gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
      if (gl) {
        prog = compile(VS, FS); eprog = compile(EVS, EFS);
        const mk = d => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); return b; };
        buf = { pos: mk(P), epos: mk(EP), na: mk(A.nodes), nb: mk(B.nodes), ea: mk(A.ecol), eb: mk(B.ecol) };
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
    } catch (e) { console.warn("sphere: WebGL unavailable", e); gl = null; }
    if (!gl) ctx2d = canvas.getContext("2d");

    // ---------- geometry, rotation ----------
    let W = 1, H = 1, dpr = 1;
    let geo = { x: .5, y: .5, r: .4 }, gFrom = null, gTo = null, g0 = 0, gDur = 1;
    let yaw = .7, pitch = .25, spinning = !reduce, drag = null, target = null, last = 0;
    function resize() {
      const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    }
    function rot() { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); return [cy, sp * sy, -cp * sy, 0, cp, sp, sy, -sp * cy, cp * cy]; }
    function project(i, R) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      const qx = R[0] * x + R[3] * y + R[6] * z, qy = R[1] * x + R[4] * y + R[7] * z, qz = R[2] * x + R[5] * y + R[8] * z;
      const f = 3 / (4 - qz), r = geo.r * Math.min(W, H);
      return [geo.x * W + qx * f * r, geo.y * H - qy * f * r, qz];
    }
    // turn so that the centre of a use case faces the viewer
    function lookAt(uc) {
      let x = 0, y = 0, z = 0;
      data.nodes.forEach((n, i) => { if (n.k !== "d" && (n.ucs ? n.ucs.includes(uc) : n.uc === uc)) { x += P[3 * i]; y += P[3 * i + 1]; z += P[3 * i + 2]; } });
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      let ty = Math.atan2(-x, z); const u = -Math.sin(ty) * x + Math.cos(ty) * z; const tp = Math.atan2(y, u);
      while (ty - yaw > Math.PI) ty -= 2 * Math.PI; while (yaw - ty > Math.PI) ty += 2 * Math.PI;
      target = { yaw: ty, pitch: Math.max(-1.1, Math.min(1.1, tp)) };
    }

    // ---------- labels and hover ----------
    const labelsEl = opts.labels || null, labels = [];
    if (labelsEl) data.nodes.forEach((n, i) => {
      if (n.k !== "p" && n.k !== "uc") return;
      const el = document.createElement(n.k === "p" ? "a" : "span");
      el.className = "sph-label " + (n.k === "p" ? "sph-p" : "sph-uc");
      el.textContent = n.label;
      if (n.k === "p" && opts.href) { el.href = opts.href(n.id); el.tabIndex = -1; }
      el.style.setProperty("--c", opts.colors[n.uc] || "#888");
      labelsEl.appendChild(el); labels.push([i, el, n]);
    });
    let hover = -1, scr = [];
    function pick(cx, cy) {
      let best = -1, bd = 26 * 26;
      scr.forEach(([i, x, y, z]) => { if (z < -.15) return; const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; best = i; } });
      return best;
    }
    canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); target = null; });
    canvas.addEventListener("pointermove", e => {
      const r = canvas.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
      if (drag && drag.id === e.pointerId) {
        yaw += (e.clientX - drag.x) * .006; pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - drag.y) * .006));
        drag.x = e.clientX; drag.y = e.clientY; return;
      }
      const h = pick(cx, cy);
      if (h !== hover) { hover = h; canvas.style.cursor = h >= 0 && data.nodes[h].k === "p" ? "pointer" : "grab"; opts.onHover && opts.onHover(h >= 0 ? data.nodes[h] : null, cx, cy); }
    });
    canvas.addEventListener("pointerup", e => {
      const moved = drag ? Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) : 99; drag = null;
      if (moved < 6) { const r = canvas.getBoundingClientRect(), h = pick(e.clientX - r.left, e.clientY - r.top); if (h >= 0) opts.onOpen && opts.onOpen(data.nodes[h]); }
    });
    canvas.addEventListener("pointerleave", () => { if (hover >= 0) { hover = -1; opts.onHover && opts.onHover(null); } });
    canvas.style.touchAction = "pan-y"; canvas.style.cursor = "grab";

    // ---------- frame ----------
    function frame(ts) {
      requestAnimationFrame(frame);
      const dt = Math.min(.05, (ts - (last || ts)) / 1000); last = ts;
      if (document.hidden) return;
      if (target) { yaw += (target.yaw - yaw) * Math.min(1, dt * 3); pitch += (target.pitch - pitch) * Math.min(1, dt * 3); if (Math.abs(target.yaw - yaw) < .002) target = null; }
      else if (spinning && !drag) yaw += dt * (focusUc ? .02 : .07);
      if (gTo) { const k = Math.min(1, (ts - g0) / gDur), q = ease(k); for (const key of ["x", "y", "r"]) geo[key] = gFrom[key] + (gTo[key] - gFrom[key]) * q; if (k >= 1) gTo = null; }
      if (mixT < 1) mixT = reduce ? 1 : Math.min(1, (ts - mixT0) / 900);
      const R = rot(), rr = geo.r * Math.min(W, H);
      scr = labels.map(([i]) => { const [x, y, z] = project(i, R); return [i, x, y, z]; });
      if (gl) {
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        const C = [geo.x * 2 - 1, 1 - geo.y * 2], K = [rr / W * 2, rr / H * 2];
        gl.useProgram(eprog);
        gl.uniformMatrix3fv(gl.getUniformLocation(eprog, "R"), false, R); gl.uniform2fv(gl.getUniformLocation(eprog, "C"), C); gl.uniform2fv(gl.getUniformLocation(eprog, "K"), K); gl.uniform1f(gl.getUniformLocation(eprog, "t"), ease(mixT));
        attrib(eprog, "p", buf.epos, 3, 3, 0); attrib(eprog, "ca", buf.ea, 4, 4, 0); attrib(eprog, "cb", buf.eb, 4, 4, 0);
        gl.drawArrays(gl.LINES, 0, E * 2);
        gl.useProgram(prog);
        gl.uniformMatrix3fv(gl.getUniformLocation(prog, "R"), false, R); gl.uniform2fv(gl.getUniformLocation(prog, "C"), C); gl.uniform2fv(gl.getUniformLocation(prog, "K"), K);
        gl.uniform1f(gl.getUniformLocation(prog, "t"), ease(mixT)); gl.uniform1f(gl.getUniformLocation(prog, "PS"), dpr * Math.max(.55, Math.min(1.35, rr / 300)));
        attrib(prog, "p", buf.pos, 3, 3, 0); attrib(prog, "ca", buf.na, 4, 5, 0); attrib(prog, "sa", buf.na, 1, 5, 4); attrib(prog, "cb", buf.nb, 4, 5, 0); attrib(prog, "sb", buf.nb, 1, 5, 4);
        gl.drawArrays(gl.POINTS, 0, N);
      } else if (ctx2d) {
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0); ctx2d.clearRect(0, 0, W, H);
        const t = ease(mixT), pts = [];
        for (let i = 0; i < N; i++) pts.push(project(i, R));
        ctx2d.lineWidth = 1;
        data.edges.forEach(([a, b], k) => { const al = (A.ecol[8 * k + 3] + (B.ecol[8 * k + 3] - A.ecol[8 * k + 3]) * t) * (.1 + .9 * (pts[a][2] + 1) / 2); ctx2d.strokeStyle = `rgba(${(B.ecol[8 * k] * 255) | 0},${(B.ecol[8 * k + 1] * 255) | 0},${(B.ecol[8 * k + 2] * 255) | 0},${al})`; ctx2d.beginPath(); ctx2d.moveTo(pts[a][0], pts[a][1]); ctx2d.lineTo(pts[b][0], pts[b][1]); ctx2d.stroke(); });
        for (let i = 0; i < N; i++) { const o = 5 * i, a = B.nodes[o + 3] * (.12 + .88 * (pts[i][2] + 1) / 2); ctx2d.fillStyle = `rgba(${(B.nodes[o] * 255) | 0},${(B.nodes[o + 1] * 255) | 0},${(B.nodes[o + 2] * 255) | 0},${a})`; ctx2d.beginPath(); ctx2d.arc(pts[i][0], pts[i][1], B.nodes[o + 4] * .45, 0, 7); ctx2d.fill(); }
      }
      // labels follow their nodes; back-facing ones fade out
      for (let k = 0; k < labels.length; k++) {
        const [i, el, n] = labels[k], [, x, y, z] = scr[k];
        const on = !focusUc || (n.ucs ? n.ucs.includes(focusUc) : n.uc === focusUc);
        const vis = z > (n.k === "uc" ? -.2 : .05) && on;
        // whole globe: use cases and featured projects only; in a chapter: that chapter's projects
        const quiet = !focusUc && n.k === "p" && !n.f && i !== hover;
        const op = vis && !quiet ? Math.min(1, (z + .2) * 1.6) * (i === hover ? 1 : n.k === "uc" ? .95 : (focusUc ? 1 : .85)) : 0;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        el.style.opacity = op.toFixed(2);
        el.classList.toggle("hot", i === hover);
        el.style.pointerEvents = op > .5 && n.k === "p" ? "auto" : "none";
      }
    }
    resize(); addEventListener("resize", resize);
    requestAnimationFrame(frame);

    return {
      focus(uc) { focusUc = uc || null; recolor(false); if (uc) lookAt(uc); },
      glide(g, ms = 1100) { gFrom = { ...geo }; gTo = { x: g.x ?? geo.x, y: g.y ?? geo.y, r: g.r ?? geo.r }; g0 = performance.now(); gDur = reduce ? 1 : ms; },
      place(g) { Object.assign(geo, g); gTo = null; },
      spin(on) { spinning = on && !reduce; },
      setColors, resize,
      get webgl() { return !!gl; },
    };
  }
  root.PortfolioSphere = PortfolioSphere;
})(window);
