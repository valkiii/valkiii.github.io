/* Contribute forms: no backend. Each form builds a prefilled "new discussion" link on GitHub and opens it in a new tab.
   The body starts with a machine-readable marker, then "**Field:** value" lines (see tools/sg_promote.py).
   Deep links: ?form=paper|presentation|notes|idea plus field names (arxiv, title, tags, kind, relevance, level, paper, session, slides, name...). */
(() => {
  const root = document.getElementById("sgc"); if (!root) return;
  const REPO = root.dataset.repo, MAX_URL = 7000;
  const forms = {}; root.querySelectorAll("form[data-form]").forEach(f => (forms[f.dataset.form] = f));
  // the forms share field ids in the markup; make them unique per form so labels point at the right control
  Object.entries(forms).forEach(([k, f]) => {
    f.querySelectorAll("[id]").forEach(e => { const o = e.id; e.id = k + "-" + o; f.querySelectorAll(`[for="${o}"]`).forEach(l => l.setAttribute("for", e.id)); f.querySelectorAll(`[aria-describedby="${o}"]`).forEach(l => l.setAttribute("aria-describedby", e.id)); });
    f.querySelectorAll("[aria-labelledby]").forEach(e => e.setAttribute("aria-labelledby", k + "-" + e.getAttribute("aria-labelledby")));
  });
  const tabs = [...root.querySelectorAll("[data-tab]")];
  // the field names the curator tool reads (keep in step with tools/sg_promote.py)
  const LABELS = { title: "Title", why: "Why it matters", tags: "Topics", kind: "Kind", relevance: "Relevance", level: "Level", present: "Would present", name: "Name",
    slides: "Slides", summary: "Summary", takeaways: "Key takeaways", link: "Link", insights: "Key insights", doubts: "Open doubts", headline: "Idea",
    papers: "Related papers", application: "Application", needs: "What we would need", paper_other: "Paper title" };
  const one = s => s.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
  const arxivId = v => { const m = v.match(/(?:arxiv\.org\/(?:abs|pdf)\/)?((?:\d{4}\.\d{4,5})|(?:[a-z\-]+(?:\.[A-Z]{2})?\/\d{7}))(?:v\d+)?(?:\.pdf)?\s*$/i); return m ? m[1] : null; };

  // ---- collecting values, in document order
  function collect(form) {
    const out = [], seen = new Set();
    const visible = el => { const f = el.closest("[data-field]"); return !(f && f.hidden); };
    form.querySelectorAll("[data-f], [data-chips]").forEach(el => {
      const name = el.dataset.f || el.dataset.chips; if (seen.has(name)) return; seen.add(name);
      const label = LABELS[name] || el.dataset.label;
      if (el.dataset.chips) { out.push({ name, label, text: false, value: [...el.querySelectorAll("[aria-pressed=true]")].map(b => b.dataset.v).join(", ") }); return; }
      if (!visible(el)) return;
      const els = [...form.querySelectorAll(`[data-f="${name}"]`)];
      if (el.type === "radio") { const c = els.find(e => e.checked); out.push({ name, label, text: false, value: c ? c.value : "" }); return; }
      if (els.length > 1) { out.push({ name, label, text: true, list: true, value: els.map(e => one(e.value)).filter(Boolean) }); return; }
      out.push({ name, label, text: el.tagName === "TEXTAREA", value: one(el.value), el });
    });
    return out;
  }
  const get = (vals, n) => (vals.find(v => v.name === n) || {}).value || "";
  const optTitle = (form, name) => { const s = form.querySelector(`[data-f="${name}"]`); const o = s && s.selectedOptions && s.selectedOptions[0]; return o ? o.dataset.title || "" : ""; };

  // ---- building the discussion
  function build(form) {
    const type = form.dataset.form, vals = collect(form), lines = [], pieces = {};
    const add = (label, value, key) => { if (value === "" || (Array.isArray(value) && !value.length)) return; lines.push({ label, value, key }); };
    let title = "";
    vals.forEach(v => {
      if (v.name === "ref") {
        const id = arxivId(v.value);
        if (id) { add("arXiv", id); add("URL", "https://arxiv.org/abs/" + id); } else add("URL", v.value);
        pieces.arxiv = id; return;
      }
      if (v.name === "paper") {
        add("Paper", v.value); if (v.value && v.value !== "other") add("Paper title", optTitle(form, "paper")); return;
      }
      if (v.name === "paper_other") { add("Paper title", v.value, "paper_other"); return; }
      if (v.name === "session") { add("Session", v.value); if (v.value && v.value !== "other") add("Session title", optTitle(form, "session")); return; }
      if (v.name === "tags") { add("Topics", v.value); return; }
      add(v.label, v.value, v.text ? v.name : null);
    });
    const name = (n) => get(vals, n);
    if (type === "paper") title = name("title") || (pieces.arxiv ? "arXiv " + pieces.arxiv : name("ref"));
    else if (type === "presentation") title = (optTitle(form, "paper") || name("paper_other") || "paper") + " (" + (optTitle(form, "session") || "session") + ")";
    else if (type === "notes") title = optTitle(form, "paper") || name("paper_other") || "paper";
    else title = name("headline");
    return { type, title: form.dataset.prefix + one(title), lines, category: form.dataset.category };
  }
  const render = d => ["<!-- sg:v1 type=" + d.type + " -->"].concat(d.lines.map(l => Array.isArray(l.value) ? "**" + l.label + ":**\n" + l.value.map(x => "- " + x).join("\n") : "**" + l.label + ":** " + l.value)).join("\n");
  const urlFor = d => `https://github.com/${REPO}/discussions/new?category=${encodeURIComponent(d.category)}&title=${encodeURIComponent(d.title)}&body=${encodeURIComponent(render(d))}`;
  const NOTICE = " … [shortened to fit a link; please paste the rest as a comment]";
  // keep the link under MAX_URL: shorten the longest free-text field until it fits
  function fitted(d) {
    let url = urlFor(d), cut = false, guard = 0;
    while (url.length > MAX_URL && guard++ < 60) {
      const free = d.lines.filter(l => l.key && typeof l.value === "string").sort((a, b) => b.value.length - a.value.length)[0];
      if (!free) break;
      const base = free.value.replace(NOTICE, ""), over = url.length - MAX_URL;
      free.value = base.slice(0, Math.max(20, base.length - Math.ceil(over / 1.5) - 10)) + NOTICE; cut = true; url = urlFor(d);
    }
    return { url, cut, tooLong: url.length > MAX_URL };
  }

  // ---- validation
  const urlOk = v => /^https?:\/\/\S+$/i.test(v);
  function validate(form) {
    let first = null;
    const bad = (el, msg) => { const f = el.closest("[data-field]"), e = f.querySelector(".sg-err"); e.textContent = msg; e.hidden = false; el.setAttribute("aria-invalid", "true"); first = first || el; };
    form.querySelectorAll(".sg-err").forEach(e => { e.hidden = true; e.textContent = ""; });
    form.querySelectorAll("[aria-invalid]").forEach(e => e.removeAttribute("aria-invalid"));
    form.querySelectorAll("[data-required]").forEach(el => {
      if (el.closest("[data-field]").hidden) return;
      if (el.type === "checkbox" ? !el.checked : !one(el.value)) bad(el, el.type === "checkbox" ? "Please confirm to continue." : "This field is required.");
    });
    const any = form.querySelector("[data-required-any]");
    if (any && ![...form.querySelectorAll(`[data-f="${any.dataset.f}"]`)].some(e => one(e.value))) bad(any, "Add at least one takeaway.");
    form.querySelectorAll('[data-kind="url"]').forEach(el => { const v = one(el.value); if (v && !urlOk(v)) bad(el, "Use a full link starting with https://"); });
    const other = form.querySelector('[data-f="paper"]'), oth = form.querySelector('[data-f="paper_other"]');
    if (other && other.value === "other" && !one(oth.value)) bad(oth, "Tell us which paper.");
    if (form.dataset.form === "paper") {
      const ref = form.querySelector('[data-f="ref"]'), v = one(ref.value);
      if (v && !arxivId(v) && !urlOk(v)) bad(ref, "Use an arXiv id (2501.12345) or a full link.");
      if (v && !arxivId(v) && !one(form.querySelector('[data-f="title"]').value)) bad(form.querySelector('[data-f="title"]'), "A title is needed when the link is not arXiv.");
    }
    return first;
  }

  // ---- wiring
  function refresh(form) {
    const d = build(form), r = fitted(d);
    form.querySelector("[data-preview]").textContent = "Title: " + d.title + "\nCategory: " + d.category + "\n\n" + render(d);
    const st = form.querySelector("[data-status]");
    st.textContent = r.tooLong ? "This is too long for a link even after shortening. Please trim it." : r.cut ? "Long text was shortened to fit the link. Paste the rest as a comment after posting." : "";
    form._url = r.url; form._d = d;
  }
  Object.values(forms).forEach(form => {
    form.addEventListener("input", () => { refresh(form); });
    form.addEventListener("change", e => {
      const sel = e.target.closest('[data-f="paper"]');
      if (sel) { const o = form.querySelector('[data-field="paper_other"]'); o.hidden = sel.value !== "other"; }
      refresh(form);
    });
    form.querySelectorAll("[data-chips] button").forEach(b => b.addEventListener("click", () => { b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"); refresh(form); }));
    form.addEventListener("submit", e => {
      e.preventDefault(); const first = validate(form); refresh(form);
      if (first) { first.focus(); return; }
      if (form._d.title.length > 250) form._d.title = form._d.title.slice(0, 247) + "…";
      if (form._url.length > MAX_URL) return;
      window.open(form._url, "_blank", "noopener");
    });
    form.querySelector("[data-copy]").addEventListener("click", async e => {
      refresh(form); const b = e.currentTarget, t = form.querySelector("[data-preview]").textContent;
      try { await navigator.clipboard.writeText(t); b.textContent = "Copied"; } catch (_) { b.textContent = "Select the preview and copy"; }
      setTimeout(() => (b.textContent = "Copy the text"), 2000);
    });
  });
  function show(name, push) {
    if (!forms[name]) return;
    Object.entries(forms).forEach(([k, f]) => (f.hidden = k !== name));
    tabs.forEach(t => t.setAttribute("aria-pressed", t.dataset.tab === name));
    refresh(forms[name]);
    if (push) { const u = new URL(location.href); u.search = "?form=" + name; history.replaceState(null, "", u); }
  }
  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.tab, true)));

  // deep links
  const q = new URLSearchParams(location.search), hq = new URLSearchParams(location.hash.slice(1));
  const P = n => q.get(n) || hq.get(n);
  const active = forms[P("form")] ? P("form") : "paper";
  const form = forms[active];
  const setv = (n, v) => {
    if (v === null || v === undefined || v === "") return;
    const el = form.querySelector(`[data-f="${n}"]`); if (!el) return;
    if (el.type === "radio") { const r = form.querySelector(`[data-f="${n}"][value="${v}"]`); if (r) r.checked = true; return; }
    if (el.tagName === "SELECT") {
      if ([...el.options].some(o => o.value === v)) el.value = v;
      else if (n === "paper") { el.value = "other"; form.querySelector('[data-field="paper_other"]').hidden = false; form.querySelector('[data-f="paper_other"]').value = v; }
      return;
    }
    el.value = v;
  };
  ["ref", "title", "why", "kind", "relevance", "level", "present", "paper", "session", "slides", "summary", "link", "insights", "doubts", "name", "headline", "papers", "application", "needs"].forEach(n => setv(n, P(n)));
  if (P("arxiv")) setv("ref", P("arxiv")); if (P("url")) setv("ref", P("url"));
  const tg = (P("tags") || "").split(",").filter(Boolean);
  form.querySelectorAll("[data-chips] button").forEach(b => b.setAttribute("aria-pressed", tg.includes(b.dataset.v)));
  show(active, false);
  if (P("form")) root.scrollIntoView({ block: "start" });
  window.__sgc = { build, render, urlFor, forms };
})();
