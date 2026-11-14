/* Filters for the study group library and radar. Without JavaScript the lists simply show everything.
   Items carry data-f-<facet>="a|b" (values), data-s-<sort>, data-text; the panel is built from #filters[data-config].
   State lives in the URL hash, so a filtered view can be bookmarked or shared. */
(() => {
  const root = document.getElementById("filters"), list = document.getElementById("papers");
  if (!root || !list) return;
  let reread = null;
  // the radar page replaces its list with a fresher one and announces it; the panel is then rebuilt on the new items
  addEventListener("sg:radar-updated", () => init(root.querySelector("details")));
  addEventListener("hashchange", () => reread && reread());
  init(null);
  function init(prev) {
  root.textContent = "";
  const cfg = JSON.parse(root.dataset.config), items = [...list.children].filter(li => li.matches(".sg-paper"));
  const count = document.getElementById("count"), none = document.getElementById("none");
  const vals = (li, k) => (li.getAttribute("data-f-" + k) || "").split("|").filter(Boolean);
  const label = (k, v) => (cfg.labels[k] || {})[v] || v;
  const facets = cfg.facets.map(f => {
    const present = new Set(); items.forEach(li => vals(li, f.key).forEach(v => present.add(v)));
    let order = Object.keys(cfg.labels[f.key] || {}).filter(v => present.has(v));
    [...present].filter(v => !order.includes(v)).sort((a, b) => f.desc ? b.localeCompare(a) : a.localeCompare(b)).forEach(v => order.push(v));
    return { ...f, options: order, sel: new Set() };
  }).filter(f => f.options.length);
  let q = "", mode = "or", sort = "default";

  // the panel
  const panel = document.createElement("div"); panel.className = "sg-panel";
  const search = document.createElement("label"); search.className = "sg-search";
  search.innerHTML = '<span class="meta">Search</span><input type="search" placeholder="Title, author, topic" autocomplete="off">';
  const input = search.querySelector("input");
  const sorter = document.createElement("label"); sorter.className = "sg-search";
  sorter.innerHTML = '<span class="meta">Sort</span><select class="sg-select">' + cfg.sorts.map(s => `<option value="${s[0]}">${s[1]}</option>`).join("") + "</select>";
  const select = sorter.querySelector("select");
  const top = document.createElement("div"); top.className = "sg-toprow"; top.append(search, sorter);
  panel.append(top);
  facets.forEach(f => {
    const g = document.createElement("div"); g.className = "sg-fgroup"; g.setAttribute("role", "group"); g.setAttribute("aria-label", f.label);
    g.innerHTML = `<span class="meta">${f.label}</span>`;
    f.buttons = f.options.map(v => {
      const b = document.createElement("button"); b.type = "button"; b.className = "sg-toggle"; b.dataset.v = v; b.setAttribute("aria-pressed", "false");
      b.style.setProperty("--c", f.key === "tag" ? "var(--uc-tools)" : "var(--ink-2)");
      b.innerHTML = `${label(f.key, v)} <span class="sg-n"></span>`;
      b.addEventListener("click", () => { f.sel.has(v) ? f.sel.delete(v) : f.sel.add(v); paint(); });
      g.append(b); return b;
    });
    if (f.modes) {
      const m = document.createElement("button"); m.type = "button"; m.className = "sg-mode"; m.setAttribute("aria-live", "polite");
      m.addEventListener("click", () => { mode = mode === "or" ? "and" : "or"; paint(); });
      f.modeBtn = m; g.append(m);
    }
    panel.append(g);
  });
  const active = document.createElement("div"); active.className = "sg-active"; active.setAttribute("aria-label", "Active filters");
  const details = document.createElement("details"); details.className = "sg-disclosure";
  details.open = prev ? prev.open : innerWidth > 860;
  details.innerHTML = '<summary>Filters <span class="sg-nact"></span></summary>';
  details.append(panel);
  root.append(details, active);
  root.hidden = !items.length;

  const matches = (li, skip) => {
    if (q && !q.toLowerCase().split(/\s+/).every(w => li.dataset.text.includes(w))) return false;
    return facets.every(f => {
      if (f === skip || !f.sel.size) return true;
      const have = vals(li, f.key), want = [...f.sel];
      return f.modes && mode === "and" ? want.every(v => have.includes(v)) : want.some(v => have.includes(v));
    });
  };
  const rank = { core: 0, adjacent: 1, general: 2 };
  const num = (li, k, d) => { const v = li.getAttribute("data-s-" + k); return v === null || v === "" ? d : v; };
  const sorters = {
    default: null,
    newest: (a, b) => num(b, "date", "").localeCompare(num(a, "date", "")),
    relevant: (a, b) => (rank[num(a, "rel", "")] ?? 3) - (rank[num(b, "rel", "")] ?? 3),
    level: (a, b) => num(a, "level", 9) - num(b, "level", 9),
    added: (a, b) => num(b, "added", "").localeCompare(num(a, "added", "")),
  };

  function hash() {
    const p = new URLSearchParams();
    facets.forEach(f => f.sel.size && p.set(f.key, [...f.sel].join("|")));
    if (mode === "and") p.set("mode", "and");
    if (q) p.set("q", q);
    if (sort !== "default") p.set("sort", sort);
    history.replaceState(null, "", p.toString() ? "#" + p : location.pathname + location.search);
  }
  function paint() {
    let n = 0;
    items.forEach(li => { const ok = matches(li); li.hidden = !ok; n += ok; });
    facets.forEach(f => {
      f.buttons.forEach(b => {
        const on = f.sel.has(b.dataset.v), skip = f.modes && mode === "and" ? null : f;
        const c = items.filter(li => vals(li, f.key).includes(b.dataset.v) && matches(li, skip)).length;
        b.setAttribute("aria-pressed", on); b.classList.toggle("empty", !c && !on);
        b.querySelector(".sg-n").textContent = c;
      });
      if (f.modeBtn) { f.modeBtn.textContent = mode === "and" ? "Match all" : "Match any"; f.modeBtn.setAttribute("aria-label", "Topics: " + (mode === "and" ? "match all selected" : "match any selected") + ". Press to switch"); }
    });
    const arr = items.slice();
    if (sorters[sort]) arr.sort(sorters[sort]); else arr.sort((a, b) => items.indexOf(a) - items.indexOf(b));
    if (sort !== "default") arr.forEach(li => list.append(li)); else items.forEach(li => list.append(li));
    count.textContent = n === items.length ? items.length + " papers" : n + " of " + items.length + " papers";
    none.hidden = n > 0 || !items.length;
    // active chips
    active.textContent = "";
    const chip = (text, undo) => { const b = document.createElement("button"); b.type = "button"; b.className = "sg-chip sg-x"; b.textContent = text + " ×"; b.setAttribute("aria-label", "Remove filter " + text); b.addEventListener("click", undo); active.append(b); };
    facets.forEach(f => f.sel.forEach(v => chip(f.label + ": " + label(f.key, v), () => { f.sel.delete(v); paint(); })));
    if (q) chip("Search: " + q, () => { q = ""; input.value = ""; paint(); });
    const na = active.children.length;
    if (na) { const c = document.createElement("button"); c.type = "button"; c.className = "sg-clear"; c.textContent = "Clear all"; c.addEventListener("click", () => { facets.forEach(f => f.sel.clear()); q = ""; input.value = ""; paint(); }); active.append(c); }
    details.querySelector(".sg-nact").textContent = na ? "(" + na + ")" : "";
    select.value = sort; hash();
  }
  function read() {
    const p = new URLSearchParams(location.hash.slice(1) || (location.search.slice(1)));
    facets.forEach(f => { f.sel = new Set((p.get(f.key) || "").split("|").filter(v => f.options.includes(v))); });
    mode = p.get("mode") === "and" ? "and" : "or"; q = p.get("q") || ""; input.value = q;
    sort = sorters[p.get("sort")] !== undefined ? p.get("sort") : "default";
  }
  input.addEventListener("input", () => { q = input.value.trim(); paint(); });
  select.addEventListener("change", () => { sort = select.value; paint(); });
  reread = () => { read(); paint(); };
  read(); paint();
  }
})();
