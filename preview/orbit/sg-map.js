/* The map of papers: a dependency-free canvas network with pan, zoom and pinch, filters and a list view.
   Data (nodes, edges, clusters, topics) is computed at build time and read from #mapdata. State lives in the URL hash:
   #focus=<slug-or-arxiv-id>&tag=a|b&status=..&kind=..&level=..&radar=0&view=topics */
(() => {
  const root = document.getElementById("sgmap"), cv = document.getElementById("mapcanvas");
  if (!root || !cv) return;
  const D = JSON.parse(document.getElementById("mapdata").textContent);
  const nodes = D.nodes, edges = D.edges, topics = D.topics, L = D.labels;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const cs = getComputedStyle(document.documentElement);
  const css = n => cs.getPropertyValue(n).trim();
  const ink = css("--ink") || "#eef1f7", ink2 = css("--ink-2") || "#a9b1c3", bg = css("--bg") || "#080b12";
  const tcol = {}; topics.forEach(t => (tcol[t.id] = css("--uc-" + t.colour) || ink2));
  const colOf = n => (n.tg.length && tcol[n.tg[0]]) || ink2;
  const stage = document.getElementById("mapstage"), card = document.getElementById("mapcard"), ctx = cv.getContext("2d");
  const list = document.getElementById("maplist"), count = document.getElementById("mapcount"), bar = document.getElementById("mapbar");
  const base = root.dataset.papers;
  const urlOf = n => (n.slug ? base + n.slug + "/" : n.u);
  L.status = Object.assign({}, L.status, { radar: "On the radar" });
  const lab = (k, v) => (L[k] || {})[v] || v;
  root.classList.add("sg-live");

  const S = { view: "papers", radar: true, hide: false, list: false, sel: { tag: new Set(), status: new Set(), kind: new Set(), level: new Set() }, focus: null, hover: null };
  const T = { k: 1, x: 0, y: 0 }; let fitK = 1, W = 0, H = 0, dpr = 1, queued = false, hits = [];
  nodes.forEach((n, i) => { n.i = i; n.wx = n.x * 1000; n.wy = n.yy * 1000; });
  topics.forEach(t => { t.wx = t.x * 1000; t.wy = t.y * 1000; });

  const inRadar = n => S.radar || n.st !== "radar";
  const matches = n => inRadar(n) && (!S.sel.tag.size || n.tg.some(t => S.sel.tag.has(t))) && (!S.sel.status.size || S.sel.status.has(n.st)) &&
    (!S.sel.kind.size || S.sel.kind.has(n.kd)) && (!S.sel.level.size || S.sel.level.has(String(n.lv)));
  const shown = n => inRadar(n) && (!S.hide || matches(n));

  // ---- panel
  const btn = (text, pressed, on, cls) => { const b = document.createElement("button"); b.type = "button"; b.className = cls || "sg-toggle"; b.textContent = text; b.setAttribute("aria-pressed", !!pressed); b.addEventListener("click", on); return b; };
  const fdet = document.createElement("details"); fdet.className = "sg-disclosure sg-fdet";
  fdet.innerHTML = "<summary>Filter by topic, status, kind and level <span class=\"sg-nact\"></span></summary>"; fdet.open = matchMedia("(min-width: 861px)").matches;
  function facet(key, label, values) {
    if (!values.length) return;
    const g = document.createElement("div"); g.className = "sg-fgroup"; g.setAttribute("role", "group"); g.setAttribute("aria-label", label);
    g.innerHTML = '<span class="meta"></span>'; g.firstChild.textContent = label;
    values.forEach(v => {
      const b = btn(lab(key, v), false, () => { const s = S.sel[key]; s.has(v) ? s.delete(v) : s.add(v); sync(); });
      b.dataset.k = key; b.dataset.v = v; if (key === "tag") b.style.setProperty("--c", tcol[v]); g.append(b);
    });
    fdet.append(g);
  }
  const uniq = f => [...new Set(nodes.map(f).filter(v => v !== null && v !== undefined && v !== ""))];
  const ctl = document.createElement("div"); ctl.className = "sg-fgroup";
  const bView = btn("Topics view", false, () => { S.view = S.view === "papers" ? "topics" : "papers"; fit(); sync(); });
  const bRadar = btn("Show radar", true, () => { S.radar = !S.radar; fit(); sync(); });
  const bHide = btn("Hide others", false, () => { S.hide = !S.hide; sync(); });
  const bList = btn("List view", false, () => { S.list = !S.list; sync(); });
  const bClear = btn("Clear filters", false, () => { Object.values(S.sel).forEach(s => s.clear()); S.focus = null; sync(); }, "sg-clear");
  bClear.style.marginLeft = "0";
  ctl.append(bView, bRadar, bHide, bList, bClear); bar.append(ctl);
  bar.append(fdet);
  const order = (key, vals) => { const o = Object.keys(L[key] || {}); return vals.sort((a, b) => (o.indexOf(a) < 0 ? 99 : o.indexOf(a)) - (o.indexOf(b) < 0 ? 99 : o.indexOf(b))); };
  facet("tag", "Topic", order("tag", uniq(n => n.tg).length ? [...new Set(nodes.flatMap(n => n.tg))] : []));
  facet("status", "Status", order("status", [...new Set(nodes.map(n => n.st))]));
  facet("kind", "Kind", order("kind", uniq(n => n.kd)));
  facet("level", "Level", uniq(n => n.lv).map(String).sort());

  // ---- legend
  const lg = document.getElementById("maplegend");
  const lgi = (cls, text, col) => { const s = document.createElement("span"); s.className = "sg-lgi"; const d = document.createElement("i"); d.className = "sg-lgd " + cls; if (col) d.style.setProperty("--c", col); s.append(d, text); lg.append(s); };
  lgi("presented", "presented"); lgi("scheduled", "scheduled"); lgi("shortlisted", "shortlisted"); lgi("radar", "radar candidate");
  const sz = document.createElement("span"); sz.className = "meta"; sz.textContent = "Colour is the first topic. Size is the number of links, or the score for radar papers. Lines are stronger the closer the topics."; lg.append(sz);
  const dotrow = document.createElement("div"); dotrow.className = "sg-lgrow";
  topics.forEach(t => { if (nodes.some(n => n.tg[0] === t.id)) { const s = document.createElement("span"); s.className = "sg-lgi"; const d = document.createElement("i"); d.className = "sg-lgd shortlisted"; d.style.setProperty("--c", tcol[t.id]); s.append(d, t.label); dotrow.append(s); } });
  lg.append(dotrow);

  // ---- geometry
  function resize() {
    const r = cv.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fit(true);
  }
  const pts = () => (S.view === "topics" ? topics : nodes.filter(shown));
  function fit(keep) {
    const p = pts(); if (!p.length || !W) return;
    const xs = p.map(a => a.wx), ys = p.map(a => a.wy), pad = Math.min(60, W / 8);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    fitK = Math.min((W - 2 * pad) / Math.max(x1 - x0, 60), (H - 2 * pad) / Math.max(y1 - y0, 60));
    T.k = fitK; T.x = W / 2 - ((x0 + x1) / 2) * T.k; T.y = H / 2 - ((y0 + y1) / 2) * T.k; draw();
  }
  const sx = n => n.wx * T.k + T.x, sy = n => n.wy * T.k + T.y;
  const zoomAt = (px, py, f) => { const k = Math.max(fitK * .5, Math.min(fitK * 14, T.k * f)); f = k / T.k; T.x = px - (px - T.x) * f; T.y = py - (py - T.y) * f; T.k = k; hideHoverCard(); draw(); };
  const grow = r => r * (.85 + .15 * Math.min(3, Math.sqrt(T.k / fitK)));
  const tr = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  // ---- drawing
  function draw() { if (!queued) { queued = true; requestAnimationFrame(render); } }
  function render() {
    queued = false; if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); hits = [];
    if (S.view === "topics") return renderTopics();
    const vis = nodes.filter(shown), act = S.hover !== null ? S.hover : S.focus;
    // soft cluster halos and labels
    D.clusters.forEach(c => {
      const m = vis.filter(n => n.c === c.id); if (m.length < 2) return;
      const cx = m.reduce((a, n) => a + sx(n), 0) / m.length, cy = m.reduce((a, n) => a + sy(n), 0) / m.length;
      const rad = Math.max(...m.map(n => Math.hypot(sx(n) - cx, sy(n) - cy))) + 46, col = tcol[c.tag] || ink2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, col + "26"); g.addColorStop(1, col + "00");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill();
      const fade = Math.max(0, Math.min(1, 1.6 - T.k / (fitK * 3)));
      if (fade > 0) {
        ctx.globalAlpha = .62 * fade; ctx.fillStyle = ink2; ctx.font = "500 " + (coarse ? 13 : 14) + 'px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(c.label, cx, cy); ctx.fillText(c.label, cx, cy); ctx.globalAlpha = 1;
      }
    });
    // edges
    edges.forEach(([a, b, w]) => {
      const A = nodes[a], B = nodes[b]; if (!shown(A) || !shown(B)) return;
      const hot = act !== null && (a === act || b === act), ok = matches(A) && matches(B);
      ctx.strokeStyle = hot ? ink : ink2; ctx.globalAlpha = (hot ? .35 + .6 * w : .07 + .45 * w) * (ok ? 1 : .18);
      ctx.lineWidth = hot ? 1.6 : .8 + w * 1.6; ctx.beginPath(); ctx.moveTo(sx(A), sy(A)); ctx.lineTo(sx(B), sy(B)); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // nodes
    const labelAll = T.k >= fitK * 2.6, labelLib = T.k >= fitK * 1.25;
    vis.slice().sort((a, b) => (a.st === "radar") - (b.st === "radar")).forEach(n => {
      const x = sx(n), y = sy(n), r = grow(n.r), col = colOf(n), on = matches(n), cur = n.i === S.focus || n.i === S.hover;
      hits.push({ n, x, y, r });
      ctx.globalAlpha = on ? 1 : .13; ctx.lineWidth = 1.6;
      if (n.st === "radar") { ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); }
      else if (n.st === "presented") { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, 7); ctx.stroke(); }
      else if (n.st === "scheduled") { ctx.fillStyle = col + "40"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke(); }
      else { ctx.fillStyle = col + "a6"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      if (cur) { ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 7); ctx.stroke(); }
      if (on && (cur || labelAll || (labelLib && n.st !== "radar"))) {
        ctx.globalAlpha = 1; ctx.font = '12.5px "Schibsted Grotesk", system-ui, sans-serif'; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        const s = tr(n.t, cur ? 60 : 34); ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(s, x + r + 7, y); ctx.fillStyle = cur ? ink : ink2; ctx.fillText(s, x + r + 7, y);
      }
    });
    ctx.globalAlpha = 1;
  }
  function topicCounts() {
    const cnt = {}, co = {};
    nodes.filter(inRadar).forEach(n => n.tg.forEach(a => { cnt[a] = (cnt[a] || 0) + 1; n.tg.forEach(b => { if (a < b) co[a + "|" + b] = (co[a + "|" + b] || 0) + 1; }); }));
    return { cnt, co };
  }
  function renderTopics() {
    const { cnt, co } = topicCounts(), byId = Object.fromEntries(topics.map(t => [t.id, t]));
    Object.entries(co).forEach(([k, c]) => {
      const [a, b] = k.split("|").map(i => byId[i]); ctx.strokeStyle = ink2; ctx.globalAlpha = Math.min(.8, .12 + c * .09); ctx.lineWidth = 1 + Math.min(c, 12) * .7;
      ctx.beginPath(); ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b)); ctx.stroke();
    });
    topics.forEach(t => {
      const n = cnt[t.id] || 0, x = sx(t), y = sy(t), r = 9 + 5 * Math.sqrt(n), col = tcol[t.id], on = S.sel.tag.has(t.id);
      t.n = n; hits.push({ t, x, y, r });
      ctx.globalAlpha = n ? 1 : .3; ctx.fillStyle = col + (on ? "ff" : "88"); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (on || S.hover === t.id) { ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = bg; ctx.font = '600 13px "IBM Plex Mono", monospace'; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(n, x, y);
      ctx.font = '13px "Schibsted Grotesk", system-ui, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(t.label, x, y + r + 14); ctx.fillStyle = ink; ctx.fillText(t.label, x, y + r + 14);
    });
    ctx.globalAlpha = 1;
  }

  // ---- card
  function showCard(h, pinned) {
    card.textContent = ""; card.hidden = false; card.classList.toggle("pinned", !!pinned);
    const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; card.append(e); return e; };
    if (h.label) { add("p", "kicker", "Topic · " + h.n + " papers"); add("p", "sg-cardt", h.label); add("p", "meta", h.blurb + " Click to filter the paper map."); }
    else {
      add("p", "kicker", (h.st === "radar" ? "On the radar" : lab("status", h.st)) + (h.y ? " · " + h.y : "") + (h.kd ? " · " + lab("kind", h.kd) : "") + (h.lv ? " · level " + h.lv : ""));
      add("p", "sg-cardt", h.t); if (h.au) add("p", "meta", h.au);
      if (h.tg.length) { const w = add("p", "tags sg-tags"); h.tg.forEach(t => { const s = document.createElement("span"); s.style.setProperty("--c", tcol[t]); s.textContent = lab("tag", t); w.append(s); }); }
      if (pinned) { const a = add("a", "btn primary", h.slug ? "Open paper page" : "Open on arXiv ↗"); a.href = urlOf(h); if (!h.slug) { a.target = "_blank"; a.rel = "noopener"; } }
      else add("p", "meta", "Click to open");
    }
    if (pinned) { const x = add("button", "sg-clear", "Close"); x.type = "button"; x.addEventListener("click", () => { S.focus = null; hideHoverCard(); sync(); }); }
    place(h);
  }
  function place(h) {
    const hit = hits.find(a => a.n === h || a.t === h); if (!hit) return;
    const w = card.offsetWidth, hgt = card.offsetHeight;
    if (W < 600) { card.style.left = "8px"; card.style.width = "calc(100% - 72px)"; card.style.top = Math.max(8, H - hgt - 8) + "px"; return; }
    let x = hit.x + hit.r + 12, y = hit.y - hgt / 2;
    if (x + w > W - 8) x = hit.x - hit.r - 12 - w;
    card.style.left = Math.max(8, Math.min(W - w - 8, x)) + "px"; card.style.top = Math.max(8, Math.min(H - hgt - 8, y)) + "px";
  }
  const hideHoverCard = () => { if (S.focus === null) card.hidden = true; };
  const hitAt = (px, py) => { let best = null, bd = 1e9; const pad = coarse ? 16 : 5; hits.forEach(h => { const d = Math.hypot(h.x - px, h.y - py); if (d <= h.r + pad && d < bd) { bd = d; best = h; } }); return best; };

  // ---- interaction
  const ptrs = new Map(); let moved = false, pinch0 = null, start = null;
  const at = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener("pointerdown", e => { try { cv.setPointerCapture(e.pointerId); } catch (_) {} ptrs.set(e.pointerId, at(e)); if (ptrs.size === 1) { moved = false; start = at(e); } pinch0 = null; });
  cv.addEventListener("pointermove", e => {
    const p = at(e);
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === "mouse") hover(p); return; }
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (pinch0) zoomAt(m[0], m[1], d / pinch0); pinch0 = d; moved = true;
    } else {
      if (!moved && Math.hypot(p[0] - start[0], p[1] - start[1]) < 6) return;
      moved = true; T.x += p[0] - prev[0]; T.y += p[1] - prev[1]; if (S.focus === null) card.hidden = true; draw();
    }
  });
  const end = e => {
    const was = ptrs.size, p = at(e); ptrs.delete(e.pointerId); pinch0 = null;
    if (e.type === "pointerup" && !moved && was === 1) click(p, e.pointerType);
    if (!ptrs.size) moved = false;
  };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("pointerleave", () => { if (S.hover !== null && S.view === "papers") { S.hover = null; hideHoverCard(); draw(); } });
  cv.addEventListener("wheel", e => { e.preventDefault(); const p = at(e); zoomAt(p[0], p[1], Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0016))); }, { passive: false });
  function hover(p) {
    const h = hitAt(p[0], p[1]); const id = h ? (h.n ? h.n.i : h.t.id) : null;
    cv.style.cursor = h ? "pointer" : "grab";
    if (id === S.hover) return; S.hover = id; draw();
    if (h) { if (S.focus === null) requestAnimationFrame(() => showCard(h.n || h.t, false)); } else hideHoverCard();
  }
  function click(p, type) {
    const h = hitAt(p[0], p[1]);
    if (!h) { if (S.focus !== null) { S.focus = null; card.hidden = true; sync(); } return; }
    if (h.t) { const s = S.sel.tag; s.has(h.t.id) ? s.delete(h.t.id) : s.add(h.t.id); if (s.size) { S.view = "papers"; fit(); } sync(); return; }
    if (type === "touch" || type === "pen") { if (S.focus !== h.n.i) { S.focus = h.n.i; sync(); showCard(h.n, true); return; } }
    open_(h.n);
  }
  function open_(n) { if (n.slug) location.href = urlOf(n); else window.open(urlOf(n), "_blank", "noopener"); }
  cv.addEventListener("keydown", e => {
    const step = 48, k = e.key;
    if (k === "ArrowLeft") T.x += step; else if (k === "ArrowRight") T.x -= step; else if (k === "ArrowUp") T.y += step; else if (k === "ArrowDown") T.y -= step;
    else if (k === "+" || k === "=") zoomAt(W / 2, H / 2, 1.3); else if (k === "-") zoomAt(W / 2, H / 2, 1 / 1.3); else if (k === "0") fit();
    else if (k === "[" || k === "]") { const v = nodes.filter(n => shown(n) && matches(n)).sort((a, b) => a.c - b.c || a.i - b.i); if (!v.length) return; const i = v.findIndex(n => n.i === S.focus); S.focus = v[(i + (k === "]" ? 1 : -1) + v.length) % v.length].i; centre(nodes[S.focus]); sync(); showCard(nodes[S.focus], true); }
    else if (k === "Enter" && S.focus !== null) open_(nodes[S.focus]); else return;
    e.preventDefault(); draw();
  });
  document.getElementById("zin").addEventListener("click", () => zoomAt(W / 2, H / 2, 1.4));
  document.getElementById("zout").addEventListener("click", () => zoomAt(W / 2, H / 2, 1 / 1.4));
  document.getElementById("zfit").addEventListener("click", () => fit());

  // ---- camera
  let raf = 0;
  function centre(n, k) {
    const k1 = k || Math.max(T.k, fitK * 2.2), x1 = W / 2 - n.wx * k1, y1 = H * (W < 600 ? .3 : .5) - n.wy * k1;
    cancelAnimationFrame(raf);
    if (still) { T.k = k1; T.x = x1; T.y = y1; return draw(); }
    const k0 = T.k, x0 = T.x, y0 = T.y, t0 = performance.now();
    const step = t => { const u = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - u, 3); T.k = k0 + (k1 - k0) * e; T.x = x0 + (x1 - x0) * e; T.y = y0 + (y1 - y0) * e; render(); if (u < 1) raf = requestAnimationFrame(step); else place(n) ; };
    raf = requestAnimationFrame(step);
  }

  // ---- state
  function sync() {
    bar.querySelectorAll("button[data-k]").forEach(b => b.setAttribute("aria-pressed", S.sel[b.dataset.k].has(b.dataset.v)));
    const nact = Object.values(S.sel).reduce((a, x) => a + x.size, 0); fdet.querySelector(".sg-nact").textContent = nact ? "(" + nact + ")" : "";
    bView.setAttribute("aria-pressed", S.view === "topics"); bView.textContent = S.view === "topics" ? "Paper view" : "Topics view";
    bRadar.setAttribute("aria-pressed", S.radar); bHide.setAttribute("aria-pressed", S.hide); bList.setAttribute("aria-pressed", S.list);
    root.classList.toggle("is-list", S.list); list.classList.toggle("is-list", S.list);
    const vis = nodes.filter(n => shown(n) && matches(n));
    count.textContent = (S.view === "topics" ? "Topic network, " : "") + vis.length + " of " + nodes.filter(inRadar).length + " papers match";
    list.querySelectorAll("li[data-id]").forEach(li => { const n = nodes.find(x => x.id === li.dataset.id); li.hidden = !(n && shown(n) && matches(n)); });
    if (S.focus !== null && !shown(nodes[S.focus])) S.focus = null;
    if (S.focus === null && S.view === "papers" && S.hover === null) card.hidden = true;
    const p = new URLSearchParams();
    if (S.focus !== null) p.set("focus", nodes[S.focus].slug || nodes[S.focus].aid || nodes[S.focus].id);
    Object.entries(S.sel).forEach(([k, s]) => s.size && p.set(k, [...s].join("|")));
    if (!S.radar) p.set("radar", "0"); if (S.view === "topics") p.set("view", "topics"); if (S.hide) p.set("hide", "1"); if (S.list) p.set("list", "1");
    history.replaceState(null, "", p.toString() ? "#" + p : location.pathname + location.search);
    draw();
  }
  function read() {
    const p = new URLSearchParams(location.hash.slice(1));
    Object.keys(S.sel).forEach(k => { S.sel[k] = new Set((p.get(k) || "").split("|").filter(Boolean)); });
    S.radar = p.get("radar") !== "0"; S.view = p.get("view") === "topics" ? "topics" : "papers"; S.hide = p.get("hide") === "1"; S.list = p.get("list") === "1";
    const f = p.get("focus"), n = f && nodes.find(x => x.slug === f || x.aid === f || x.id === f);
    S.focus = n ? n.i : null;
    if (n && n.st === "radar") S.radar = true;
  }
  addEventListener("hashchange", () => { read(); fit(); sync(); focusNow(); });
  function focusNow() { if (S.focus !== null && S.view === "papers") { const n = nodes[S.focus]; centre(n); setTimeout(() => showCard(n, true), still ? 0 : 450); } }
  new ResizeObserver(() => resize()).observe(cv);
  read(); if (Object.values(S.sel).some(x => x.size)) fdet.open = true;
  resize(); sync(); focusNow();
  if (S.focus !== null) stage.scrollIntoView({ block: "start" });
  window.__sgmap = { S, T, nodes, hits: () => hits, fit };
})();
