/* Live radar: the page ships with the list rendered at build time. A Raspberry Pi pushes a fresher
   study-group/candidates.json every day; if it is newer than the build, the list is redrawn from it with the same
   markup as themes/orbit/sg_radar.html. Any problem leaves the static list untouched. */
(() => {
  const box = document.getElementById("radar");
  if (!box || !box.dataset.liveUrl || !window.fetch) return;
  const MAX = 30;
  const isStr = v => typeof v === "string";
  const isNum = v => typeof v === "number" && isFinite(v);
  const web = v => isStr(v) && /^https?:\/\//i.test(v);
  const MONTHS = "January February March April May June July August September October November December".split(" ");

  // Python's urlencode filter: everything but letters, digits and _.-~/ is percent-escaped
  const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%2F/g, "/");
  // json.dumps(..., ensure_ascii=False) as the yq filter writes it
  const yq = v => Array.isArray(v) ? "[" + v.map(yq).join(", ") + "]" : JSON.stringify(v === undefined ? null : v);
  const day = d => +d.slice(8, 10) + " " + MONTHS[+d.slice(5, 7) - 1] + " " + d.slice(0, 4);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const link = (href, text, cls) => { const a = el("a", cls, text); a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; };

  // a candidate with the fields the card needs, or null
  function clean(it) {
    if (!it || typeof it !== "object" || !isStr(it.title) || !it.title || !web(it.url)) return null;
    const sg = it.signals && typeof it.signals === "object" ? it.signals : {};
    const num = v => isNum(v) ? v : null;
    return {
      id: isStr(it.id) && it.id ? it.id : null, title: it.title, url: it.url, pdf: web(it.pdf) ? it.pdf : null,
      authors: Array.isArray(it.authors) ? it.authors.filter(isStr) : [],
      published: isStr(it.published) && /^\d{4}-\d{2}-\d{2}/.test(it.published) && +it.published.slice(5, 7) >= 1 && +it.published.slice(5, 7) <= 12 ? it.published.slice(0, 10) : null,
      tags: Array.isArray(it.tags) ? it.tags.filter(isStr) : [], kind: isStr(it.kind) && it.kind ? it.kind : null,
      difficulty: Number.isInteger(it.difficulty) && it.difficulty >= 1 ? it.difficulty : null,
      score: num(it.score), why: isStr(it.why) && it.why ? it.why : null,
      hf: num(sg.hf_upvotes), hn: num(sg.hn_points), hnUrl: web(sg.hn_url) ? sg.hn_url : null, hnc: num(sg.hn_comments),
    };
  }

  function card(it, n, cfg, generated) {
    const inLib = it.id !== null && cfg.library.has(it.id);
    const li = el("li", "sg-paper");
    li.dataset.fTag = it.tags.join("|"); li.dataset.fKind = it.kind || ""; li.dataset.fLevel = it.difficulty || "";
    li.dataset.sDate = it.published || ""; li.dataset.sLevel = it.difficulty || "";
    li.dataset.text = ((it.title) + " " + it.authors.join(" ") + " " + (it.why || "")).toLowerCase();
    li.setAttribute("data-reveal", ""); li.classList.add("in");
    const main = el("div", "sg-main"), side = el("div", "sg-side sg-signals");
    const meta = el("p", "meta", (it.published ? day(it.published) : "") + (it.id ? " · arXiv " + it.id : ""));
    if (inLib) { meta.append(" "); meta.append(el("span", "sg-chip sg-scheduled", "In the library")); }
    const h = el("h2", "pt"); h.append(link(it.url, it.title)); main.append(meta, h);
    if (it.authors.length) main.append(el("p", "sum", it.authors.slice(0, 3).join(", ") + (it.authors.length > 3 ? " et al." : "")));
    if (it.why) main.append(el("p", "sg-why", "Why it might matter: " + it.why));
    const tags = it.tags.filter(t => cfg.tags[t]);
    if (tags.length) {
      const w = el("span", "tags sg-tags");
      tags.forEach(t => { const s = el("span", "", cfg.tags[t].label); s.style.setProperty("--c", "var(--uc-" + cfg.tags[t].colour + ")"); w.append(s); });
      main.append(w);
    }
    const kind = it.kind && cfg.kinds[it.kind];
    if (kind || it.difficulty) {
      const f = el("span", "sg-facets");
      if (kind) { const c = el("span", "sg-chip sg-kind", kind.label); c.title = kind.blurb; f.append(c); }
      if (it.difficulty) { const c = el("span", "sg-chip sg-level", "Level " + it.difficulty + "/5"); c.title = cfg.levels.length >= it.difficulty ? cfg.levels[it.difficulty - 1] : ""; f.append(c); }
      main.append(f);
    }
    if (!inLib) {
      const d = el("details", "sg-snip"), pre = el("pre"), btn = el("button", "btn sg-copy", "Copy YAML");
      d.append(el("summary", "", "Add to shortlist"));
      pre.id = "snip-" + n;
      pre.textContent = ["- slug: " + String(it.id || n).replace(/\./g, "-"), "  id: " + (it.id ? yq(it.id) : "null"), "  title: " + yq(it.title),
        "  authors: " + yq(it.authors), "  year: " + ((it.published || "").slice(0, 4) || "null"), "  url: " + yq(it.url), "  pdf: " + (it.pdf ? yq(it.pdf) : "null"),
        "  tags: " + yq(it.tags), "  kind: " + (it.kind ? yq(it.kind) : "null"), "  relevance: null", "  level: " + (it.difficulty || "null"),
        "  venue: arXiv preprint", "  status: shortlisted", "  session: null", "  presenter: null", "  notes: null", "  annotations: []",
        "  added: " + ((generated || "").slice(0, 10) || "YYYY-MM-DD"), "  why: " + yq(it.why || "")].join("\n") + "\n";
      btn.type = "button"; btn.dataset.target = pre.id; btn.hidden = true;
      d.append(pre, btn); main.append(d);
    }
    if (it.score !== null) {
      const b = el("button", "sg-score", it.score.toFixed(1)); b.type = "button";
      b.setAttribute("aria-describedby", "score-tip"); b.setAttribute("aria-label", "Score " + it.score.toFixed(1) + ". How is this calculated?"); side.append(b);
    }
    if (it.hf !== null) side.append(el("span", "", it.hf + " HF upvotes"));
    if (it.hn !== null) {
      const s = el("span"); if (it.hnUrl) s.append(link(it.hnUrl, it.hn + " HN points ↗")); else s.append(it.hn + " HN points");
      if (it.hnc) s.append(" · " + it.hnc + " comments"); side.append(s);
    }
    if (it.pdf) side.append(link(it.pdf, "PDF ↗"));
    if (!inLib) {
      const a = el("a", "sg-propose", "Propose / shortlist →");
      a.href = cfg.contribute + "?form=paper&arxiv=" + enc(it.id || it.url) + "&title=" + enc(it.title) + (it.tags.length ? "&tags=" + enc(it.tags.join(",")) : "")
        + (it.kind ? "&kind=" + enc(it.kind) : "") + (it.difficulty ? "&level=" + it.difficulty : "");
      side.append(a);
    }
    li.append(main, side); return li;
  }
  const getJSON = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw 0; return r.json(); });

  function apply(live, conf) {
    if (!live || typeof live !== "object" || !isStr(live.generated) || !Array.isArray(live.items)) return;
    const t = Date.parse(live.generated), built = conf.generated ? Date.parse(conf.generated) : -Infinity;
    if (isNaN(t) || (!isNaN(built) && t <= built)) return;   // only strictly newer than the build replaces it
    const items = live.items.map(clean).filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, MAX);
    if (!items.length) return;
    const cfg = { tags: conf.tags || {}, kinds: conf.kinds || {}, levels: Array.isArray(conf.levels) ? conf.levels : [],
      library: new Set(Array.isArray(conf.library_ids) ? conf.library_ids : []), contribute: box.dataset.contributeUrl };
    const list = document.getElementById("papers"), count = document.getElementById("count");
    if (!list || !count) return;
    const frag = document.createDocumentFragment();
    items.forEach((it, i) => frag.append(card(it, i + 1, cfg, live.generated)));
    const y = scrollY;
    list.replaceChildren(frag);
    list.hidden = false; count.hidden = false; count.textContent = items.length + " papers";
    const empty = document.getElementById("radar-empty"); if (empty) empty.remove();
    let meta = document.getElementById("radar-updated");
    if (!meta) { meta = el("p", "meta in"); meta.id = "radar-updated"; const l = document.querySelector(".pagehead .lede"); if (l) l.after(meta); }
    const wd = Number.isInteger(live.window_days) && live.window_days > 0 ? live.window_days : null;
    if (meta) meta.textContent = "Updated " + live.generated.slice(0, 16).replace("T", " ") + " UTC, loaded live" + (wd ? " · last " + wd + " days" : "");
    dispatchEvent(new Event("sg:radar-updated"));
    scrollTo(0, y);
  }

  Promise.all([getJSON(box.dataset.liveUrl), getJSON(box.dataset.configUrl)]).then(r => apply(r[0], r[1])).catch(() => {});
})();
