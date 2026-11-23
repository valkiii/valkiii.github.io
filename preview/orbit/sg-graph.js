/* The knowledge graph of every paper the scout has kept since the group started.
   Topics are hubs sized by how many papers they hold; click a hub to unfold its papers around it, click a paper to open it
   on arXiv. Data: study-group/graph.json (written daily by the Pi), topics and colours from #mapdata.
   On narrow screens the page keeps the top-25 map instead (see sg-map.js); a toggle switches between them. */
(() => {
  const box = document.getElementById("sggraph"), mapRoot = document.getElementById("sgmap"), list = document.getElementById("maplist");
  if (!box) return;
  const cv = box.querySelector("canvas"), ctx = cv.getContext("2d"), card = box.querySelector(".sg-gcard"), note = box.querySelector(".sg-gnote");
  const search = box.querySelector("input[type=search]"), views = document.getElementById("sgviews");
  const D = JSON.parse(document.getElementById("mapdata").textContent);
  const cs = getComputedStyle(document.documentElement), css = n => cs.getPropertyValue(n).trim();
  const ink = css("--ink") || "#eef1f7", ink2 = css("--ink-2") || "#a9b1c3";
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lab = id => ((D.labels || {}).tag || {})[id] || id;
  const SPREAD = 1100, hubs = new Map();
  D.topics.forEach(t => hubs.set(t.id, { id: t.id, label: t.label, col: css("--uc-" + t.colour) || ink2, x: t.x * SPREAD, y: t.y * SPREAD, papers: [], open: false, k: 0 }));
  hubs.set("other", { id: "other", label: "Other", col: ink2, x: SPREAD * 0.5, y: SPREAD * 1.12, papers: [], open: false, k: 0 });

  let papers = [], W = 0, H = 0, dpr = 1, T = { k: 1, x: 0, y: 0 }, hover = null, q = "", queued = false, ready = false;
  const draw = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };
  const daysAgo = s => Math.floor((Date.now() - Date.parse(s)) / 864e5);
  const hubR = h => 34 + 9 * Math.sqrt(h.papers.length);
  const match = p => !q || p.t.toLowerCase().includes(q);

  function load(data) {
    papers = data.papers || [];
    hubs.forEach(h => (h.papers = []));
    papers.forEach(p => { const h = hubs.get(p.tg[0]) || hubs.get("other"); p.hub = h; h.papers.push(p); });
    hubs.forEach(h => {
      h.papers.sort((a, b) => (b.y > a.y) - (b.y < a.y) || b.s - a.s);
      h.papers.forEach((p, i) => { const a = i * 2.39996, r = hubR(h) + 22 + 12 * Math.sqrt(i); p.dx = Math.cos(a) * r; p.dy = Math.sin(a) * r; });
    });
    note.textContent = papers.length + " papers since the first scout run, in " + [...hubs.values()].filter(h => h.papers.length).length + " topics. Click a topic to unfold it, click a paper to open it.";
    ready = true; if (/open=all/.test(location.search + location.hash)) hubs.forEach(h => { h.open = h.papers.length > 0; h.k = +h.open; }); fit(); draw();
  }

  function resize() {
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fit(); draw();
  }
  function fit() {
    const hs = [...hubs.values()].filter(h => h.papers.length); if (!hs.length || !W) return;
    const ext = h => hubR(h) + (h.open ? 30 + 12 * Math.sqrt(h.papers.length) : 0);  // an unfolded topic reaches further
    const x0 = Math.min(...hs.map(h => h.x - ext(h))), x1 = Math.max(...hs.map(h => h.x + ext(h)));
    const y0 = Math.min(...hs.map(h => h.y - ext(h))), y1 = Math.max(...hs.map(h => h.y + ext(h)));
    const k = Math.min(W / (x1 - x0 + 160), H / (y1 - y0 + 160));
    T = { k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k };
  }
  const sx = x => x * T.k + T.x, sy = y => y * T.k + T.y;
  const pos = p => { const h = p.hub, e = h.k; return [h.x + p.dx * e, h.y + p.dy * e]; };

  function render() {
    queued = false; if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    let moving = false;
    hubs.forEach(h => { const goal = h.open ? 1 : 0; if (h.k !== goal) { h.k = still ? goal : Math.abs(goal - h.k) < 0.04 ? goal : h.k + (goal - h.k) * 0.22; moving = true; } });
    // links from unfolded papers to their other topic hubs
    ctx.lineWidth = 1; ctx.globalAlpha = 0.16;
    hubs.forEach(h => { if (h.k < 0.3) return; h.papers.forEach(p => {
      if (!match(p)) return;
      p.tg.slice(1).forEach(t => { const o = hubs.get(t); if (!o) return; const [px, py] = pos(p); ctx.strokeStyle = o.col; ctx.beginPath(); ctx.moveTo(sx(px), sy(py)); ctx.lineTo(sx(o.x), sy(o.y)); ctx.stroke(); });
    }); });
    ctx.globalAlpha = 1;
    hubs.forEach(h => {
      if (!h.papers.length) return;
      if (h.k > 0.02) h.papers.forEach(p => {
        const [px, py] = pos(p), ok = match(p); ctx.globalAlpha = (ok ? 0.95 : 0.12) * Math.min(1, h.k * 1.4);
        const isNew = p.f && daysAgo(p.f) <= 7, r = (3.2 + Math.min(2.5, p.s / 40)) * Math.min(1.4, Math.max(0.7, T.k * 1.1));
        ctx.fillStyle = h.col; ctx.beginPath(); ctx.arc(sx(px), sy(py), r, 0, 6.2832); ctx.fill();
        if (isNew && ok) { ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx(px), sy(py), r + 2.2, 0, 6.2832); ctx.stroke(); }
        if (hover === p) { ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(px), sy(py), r + 3, 0, 6.2832); ctx.stroke(); }
      });
      ctx.globalAlpha = 1;
      const R = hubR(h) * T.k, hit = q && h.papers.some(match);
      ctx.fillStyle = h.col; ctx.globalAlpha = h.open ? 0.28 : 0.85; ctx.beginPath(); ctx.arc(sx(h.x), sy(h.y), R, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = hit || hover === h ? 3 : 1.5; ctx.strokeStyle = hit || hover === h ? ink : h.col; ctx.stroke();
      ctx.fillStyle = h.open ? ink : "#0b0f19"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "600 " + Math.max(11, Math.min(20, R * 0.5)) + "px system-ui, sans-serif"; ctx.fillText(h.papers.length, sx(h.x), sy(h.y));
      ctx.fillStyle = ink; ctx.font = "600 13px system-ui, sans-serif"; ctx.fillText(h.label, sx(h.x), sy(h.y) + R + 14);
    });
    if (moving) draw();
  }

  function pick(mx, my) {
    let best = null;
    hubs.forEach(h => { if (h.k > 0.5) h.papers.forEach(p => { if (!match(p)) return; const [px, py] = pos(p); if (Math.hypot(sx(px) - mx, sy(py) - my) < 9) best = best || p; }); });
    if (best) return best;
    hubs.forEach(h => { if (h.papers.length && Math.hypot(sx(h.x) - mx, sy(h.y) - my) < hubR(h) * T.k + 4) best = h; });
    return best;
  }
  function showCard(o) {
    if (!o) { card.hidden = true; return; }
    card.hidden = false; card.textContent = "";
    const mk = (tag, text, cls) => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; card.append(e); };
    if (o.papers) { mk("strong", o.label + ", " + o.papers.length + " papers"); mk("span", o.open ? "Click to fold" : "Click to unfold", "meta"); return; }
    mk("strong", o.t); mk("span", o.au + " · " + o.y + (o.f && daysAgo(o.f) <= 7 ? " · new this week" : ""), "meta");
    mk("span", o.tg.map(lab).join(", ") + " · opens arXiv in a new tab", "meta");
  }

  // ---- pointer: drag to pan, wheel to zoom, tap to open or unfold
  let drag = null;
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, tx: T.x, ty: T.y, moved: 0 }; });
  cv.addEventListener("pointermove", e => {
    const r = cv.getBoundingClientRect();
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy)); if (drag.moved > 4) { T.x = drag.tx + dx; T.y = drag.ty + dy; draw(); } return; }
    const o = pick(e.clientX - r.left, e.clientY - r.top); if (o !== hover) { hover = o; cv.style.cursor = o ? "pointer" : "grab"; showCard(o); draw(); }
  });
  cv.addEventListener("pointerup", e => {
    const was = drag; drag = null; if (!was || was.moved > 4) return;
    const r = cv.getBoundingClientRect(), o = pick(e.clientX - r.left, e.clientY - r.top);
    if (!o) return;
    if (o.papers) { o.open = !o.open; showCard(o); draw(); } else window.open(o.u, "_blank", "noopener");
  });
  cv.addEventListener("wheel", e => {
    e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = Math.exp(-e.deltaY * 0.0015);
    const k = Math.max(0.15, Math.min(8, T.k * f)); T.x = mx - (mx - T.x) * (k / T.k); T.y = my - (my - T.y) * (k / T.k); T.k = k; draw();
  }, { passive: false });
  const zoom = f => { const k = Math.max(0.15, Math.min(8, T.k * f)); T.x = W / 2 - (W / 2 - T.x) * (k / T.k); T.y = H / 2 - (H / 2 - T.y) * (k / T.k); T.k = k; draw(); };
  box.querySelector("[data-act=in]").onclick = () => zoom(1.4);
  box.querySelector("[data-act=out]").onclick = () => zoom(1 / 1.4);
  box.querySelector("[data-act=fit]").onclick = () => { fit(); draw(); };
  box.querySelector("[data-act=all]").onclick = () => { const some = [...hubs.values()].some(h => h.papers.length && !h.open); hubs.forEach(h => (h.open = some && h.papers.length > 0)); fit(); draw(); };
  search.addEventListener("input", () => { q = search.value.trim().toLowerCase(); if (q.length < 3) q = ""; if (q) hubs.forEach(h => { if (h.papers.some(match)) h.open = true; }); draw(); });
  new ResizeObserver(resize).observe(cv);

  // ---- which view: graph on wide screens, the top-25 map on phones; the toggle overrides
  function setView(v) {
    const g = v === "graph"; box.hidden = !g; if (mapRoot) mapRoot.hidden = g; if (list) list.hidden = g;
    views.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v));
    if (g) requestAnimationFrame(resize);
    try { sessionStorage.setItem("sg-view", v); } catch (e) {}
  }
  views.querySelectorAll("button").forEach(b => b.addEventListener("click", () => setView(b.dataset.v)));
  let first = null; try { first = sessionStorage.getItem("sg-view"); } catch (e) {}
  setView(first || (matchMedia("(min-width: 861px)").matches ? "graph" : "map"));

  fetch(box.dataset.graphUrl, { cache: "no-cache" }).then(r => (r.ok ? r.json() : Promise.reject())).then(load)
    .catch(() => { note.textContent = "The knowledge graph could not be loaded. The top-25 map is still available."; setView("map"); views.hidden = true; });
  window.__sggraph = { hubs, T: () => T };
})();
