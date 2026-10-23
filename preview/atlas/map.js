// The atlas: use cases as hubs, projects linked to the hubs they serve and to projects that share a technology.
(() => {
  const P = window.ATLAS, meta = JSON.parse(document.getElementById("mapdata").textContent);
  const svg = d3.select("#map"), tip = document.getElementById("maptip");
  const tech = s => s.toLowerCase().replace(/\(.*?\)/g, "").trim();
  const hubs = meta.usecases.map((id, i) => ({ id: "uc:" + id, uc: id, label: meta.labels[i], hub: true }));
  const nodes = hubs.concat(P.map(p => ({ id: p.slug, p, uc: p.uc[0] })));
  const links = [];
  P.forEach(p => p.uc.forEach((u, k) => links.push({ source: p.slug, target: "uc:" + u, kind: "uc", w: k ? .5 : 1 })));
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = new Set(P[i].stack.map(tech)), shared = P[j].stack.map(tech).filter(x => a.has(x) && !["python", "javascript"].includes(x));
    if (shared.length) links.push({ source: P[i].slug, target: P[j].slug, kind: "tech", shared });
  }
  let W = 0, H = 0;
  const g = svg.append("g");
  const lk = g.append("g").selectAll("line").data(links).join("line").attr("class", d => "l " + d.kind);
  const nd = g.append("g").selectAll("g").data(nodes).join("g").attr("class", d => d.hub ? "n hub" : "n proj").style("--c", d => `var(--uc-${d.uc})`);
  nd.filter(d => d.hub).append("circle").attr("r", 30);
  nd.filter(d => d.hub).append("text").attr("class", "hl").attr("text-anchor", "middle").attr("dy", "0.35em").text(d => d.label);
  nd.filter(d => !d.hub).append("circle").attr("r", d => d.p.featured ? 9 : 6);
  nd.filter(d => !d.hub).append("text").attr("class", "pl").attr("x", 12).attr("dy", "0.35em").text(d => d.p.title);
  function size() {
    const r = svg.node().getBoundingClientRect(); W = r.width; H = r.height;
    svg.attr("viewBox", `${-W / 2} ${-H / 2} ${W} ${H}`);
  }
  size();
  // the layout runs inside the real frame: forces scale with its area, nodes stay within its bounds
  const small = W < 600, area = Math.sqrt(W * H / (800 * 680)), HUB = small ? 22 : 30;
  nd.filter(d => d.hub).select("circle").attr("r", HUB);
  if (small) nd.selectAll("text").style("font-size", "10.5px");
  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => (d.kind === "uc" ? 125 : 85) * area).strength(d => d.kind === "uc" ? .55 * d.w : .12))
    .force("charge", d3.forceManyBody().strength(d => (d.hub ? -1500 : -340) * area * area))
    .force("collide", d3.forceCollide(d => d.hub ? HUB + 16 : (small ? 20 : 34)))
    .force("x", d3.forceX(0).strength(.03)).force("y", d3.forceY(0).strength(small ? .02 : .05))
    .stop();
  hubs.forEach((h, i) => { const a = i / hubs.length * Math.PI * 2; h.x = Math.cos(a) * W * .28; h.y = Math.sin(a) * H * .3; });
  function clamp() {
    const padX = small ? 18 : 30, padY = small ? 26 : 34;
    nodes.forEach(d => { d.x = Math.max(-W / 2 + padX + (d.hub ? HUB : 0), Math.min(W / 2 - (d.hub ? padX + HUB : padX), d.x)); d.y = Math.max(-H / 2 + padY, Math.min(H / 2 - padY, d.y)); });
  }
  for (let i = 0; i < 600; i++) { sim.tick(); clamp(); }
  nodes.forEach(d => { d.rx = d.x / W; d.ry = d.y / H; });
  // on resize, stretch the settled layout to the new frame
  function fit() { nodes.forEach(d => { d.x = d.rx * W; d.y = d.ry * H; }); }
  function draw() {
    lk.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    nd.attr("transform", d => `translate(${d.x},${d.y})`);
    // labels near the right edge go on the left of their dot
    nd.select("text.pl").each(function (d) { const flip = d.x + this.getComputedTextLength() + 20 > W / 2; d.flip = flip; this.setAttribute("x", flip ? -12 : 12); this.setAttribute("text-anchor", flip ? "end" : "start"); });
    declutter();
  }
  // hide project labels that would collide: hubs first, then featured projects, then the rest (shown on hover)
  function declutter() {
    const placed = [];
    const boxes = nodes.map(d => {
      const t = d.hub ? null : nd.filter(n => n === d).select("text.pl").node();
      if (!t) return null;
      const w = t.getComputedTextLength() + 14;
      return d.flip ? { d, t, x0: d.x - w, x1: d.x + 8, y0: d.y - 9, y1: d.y + 9 } : { d, t, x0: d.x - 8, x1: d.x + w, y0: d.y - 9, y1: d.y + 9 };
    });
    hubs.forEach(h => placed.push({ x0: h.x - HUB - 4, x1: h.x + HUB + 4, y0: h.y - HUB - 4, y1: h.y + HUB + 4 }));
    boxes.filter(Boolean).sort((a, b) => (b.d.p.featured ? 1 : 0) - (a.d.p.featured ? 1 : 0)).forEach(b => {
      const hit = placed.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
      b.t.classList.toggle("hide", hit);
      if (!hit) placed.push(b);
    });
  }
  draw();
  // hover: the node, its links and neighbours
  const nb = new Map(nodes.map(n => [n.id, new Set([n.id])]));
  links.forEach(l => { nb.get(l.source.id).add(l.target.id); nb.get(l.target.id).add(l.source.id); });
  function focus(d) {
    const s = d ? nb.get(d.id) : null;
    nd.classed("dim", n => s && !s.has(n.id));
    lk.classed("dim", l => s && !(l.source.id === d.id || l.target.id === d.id)).classed("on", l => s && (l.source.id === d.id || l.target.id === d.id));
  }
  nd.on("pointerenter", (e, d) => {
    focus(d);
    if (d.hub) { tip.hidden = true; return; }
    const shared = links.filter(l => l.kind === "tech" && (l.source.id === d.id || l.target.id === d.id)).flatMap(l => l.shared);
    tip.innerHTML = `<span class="mono">${d.p.date}</span><b>${d.p.title}</b><span>${d.p.q}</span>${shared.length ? `<span class="mono">shares ${[...new Set(shared)].slice(0, 3).join(", ")}</span>` : ""}`;
    tip.hidden = false;
    const r = svg.node().getBoundingClientRect(), fr = svg.node().parentNode.getBoundingClientRect();
    const x = d.x + W / 2 + (r.left - fr.left), y = d.y + H / 2 + (r.top - fr.top);
    tip.style.left = Math.min(x + 16, fr.width - 260) + "px"; tip.style.top = Math.max(8, y - 20) + "px";
  }).on("pointerleave", () => { focus(null); tip.hidden = true; })
    .on("click", (e, d) => { if (!d.hub) location.href = d.p.href; else filter(d.uc); })
    .style("cursor", "pointer");
  // use-case filter shared by the map, the cards and the index
  const buttons = document.querySelectorAll(".filters .f");
  function filter(uc) {
    buttons.forEach(b => b.setAttribute("aria-pressed", b.dataset.uc === uc));
    const on = el => uc === "all" || el.dataset.uc.split(" ").includes(uc);
    document.querySelectorAll(".index tbody tr").forEach(tr => tr.hidden = !on(tr));
    document.querySelectorAll(".feat .card").forEach(c => c.classList.toggle("off", !on(c)));
    nd.classed("faded", n => uc !== "all" && (n.hub ? n.uc !== uc : !n.p.uc.includes(uc)));
    lk.classed("faded", l => uc !== "all" && !(l.source.uc === uc || l.target.uc === uc || (l.source.p && l.source.p.uc.includes(uc) && l.target.p && l.target.p.uc.includes(uc))));
  }
  buttons.forEach(b => b.addEventListener("click", () => filter(b.dataset.uc)));
  addEventListener("resize", () => { size(); fit(); draw(); });
})();
