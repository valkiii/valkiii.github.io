/* Bookshelf card wall (orbit). The page is a plain grid of cards until this script runs. On wide screens without
   reduced motion it adds .cw-3d, which turns the section into a tall scroll with one sticky stage, and then every
   frame places each card (CSS 3D transforms only) between two poses:

     ribbon  a sinuous helix that tumbles and drifts with the clock t, blurred where it is far away
     wall    shelves as receding rows of upright, leaning cards

   Card i has its own local progress  q_i = ease( (p*k - delay_i) / span )  with delay_i growing with i, so scrolling
   makes the ribbon settle into the wall as a cascade. pose = lerp(ribbon, wall, q_i) plus a small arc towards the
   camera while it travels. Hover (or keyboard focus) lifts one card to face the viewer and dims its neighbours.
   Scroll position is only read from the section's bounding rect, so Lenis needs nothing special. */
(() => {
  const sec = document.querySelector(".cw");
  if (!sec) return;
  const stage = sec.querySelector(".cw-stage"), world = sec.querySelector(".cw-world"), hero = sec.querySelector(".cw-hero");
  const floor = sec.querySelector(".cw-floor");
  const items = [...sec.querySelectorAll(".cw-item")], cards = items.map(li => li.querySelector(".cw-card"));
  const shelfEls = [...sec.querySelectorAll(".cw-shelf")];
  const labels = shelfEls.map(s => s.querySelector(".cw-label"));
  const shelfOf = items.map(li => shelfEls.indexOf(li.closest(".cw-shelf")));
  const panel = document.querySelector(".cw-panel");
  const N = items.length;
  const wide = matchMedia("(min-width: 861px)"), still = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const rad = d => d * Math.PI / 180;

  let on = false, running = false, raf = 0, W = 0, H = 0, cw = 150, wall = [], lab = [];
  let p = 0, ps = 0, last = 0, hovered = -1, active = -1, mx = 0, my = 0, tx = 0, ty = 0;
  const hv = new Float32Array(N), dm = new Float32Array(N), cache = new Array(N + 20).fill("");
  const fall = items.map(() => ({}));

  // ---------- 3D mode on/off ----------
  function splitHeadline() {
    const h = hero.querySelector(".cw-title-big");
    if (!h || h.dataset.split) return;
    h.dataset.split = "1"; h.setAttribute("aria-label", h.textContent.trim());
    h.textContent = h.textContent.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "");  // the big headline is type only
    let k = 0;
    h.innerHTML = h.textContent.trim().split(/\s+/).map(w => `<span class="cw-w" aria-hidden="true">${[...w].map(c => `<span class="cw-l" style="--k:${k++}">${c}</span>`).join("")}</span>`).join(" ");
  }
  function enable() {
    if (on) return;
    on = true; sec.classList.add("cw-3d"); splitHeadline(); measure(); wake();
  }
  function disable() {
    if (!on) return;
    on = false; sec.classList.remove("cw-3d"); cancelAnimationFrame(raf); running = false;
    [...items, ...labels, hero, world].forEach(e => e && e.removeAttribute("style"));
    cache.fill(""); stage.style.removeProperty("--cw");
  }
  const sync = () => (wide.matches && !still.matches ? enable : disable)();

  // ---------- the wall pose ----------
  function measure() {
    W = stage.clientWidth; H = stage.clientHeight;
    const sizes = shelfEls.map((s, i) => items.filter((_, j) => shelfOf[j] === i).length);
    let size = clamp(H * .2, 100, 200), per = 5, rows = 3;
    for (let it = 0; it < 4; it++) {
      per = Math.max(3, Math.floor(W * .72 / (size * 1.34)));
      rows = sizes.reduce((a, n) => a + Math.ceil(n / per), 0);
      size = Math.min(clamp(H * .2, 100, 200), ((H * .78) / rows - 40) / 1.56);
    }
    cw = size; stage.style.setProperty("--cw", cw.toFixed(1) + "px");
    const ch = cw * 1.5, pitchX = cw * 1.34, pitchY = ch * 1.04 + 38, widest = Math.min(per, Math.max(...sizes));
    const x0 = -((widest - 1) / 2) * pitchX + pitchX * .28, y0 = -(rows * pitchY) / 2 + pitchY / 2 + H * .06;
    let r = 0; wall = new Array(N); lab = new Array(shelfEls.length);
    sizes.forEach((n, si) => {
      const idx = items.map((_, j) => j).filter(j => shelfOf[j] === si);
      for (let c = 0; c < Math.ceil(n / per); c++, r++) {
        const row = idx.slice(c * per, c * per + per), m = row.length, y = y0 + r * pitchY;
        row.forEach((j, k) => {
          // depth grows along the row (left end nearest); each card yawed ~11deg, staggered and leaning a touch
          wall[j] = { x: x0 + k * pitchX + (r % 2) * pitchX * .45, y: y + (k % 2 ? 10 : -6) + Math.sin(j * 2.3) * 5, z: -k * cw * .8 + 160 - r * 40,
            rx: -2 + Math.sin(j * 1.7) * 1.5, ry: 17 + Math.sin(j * 3.1) * 4, rz: Math.sin(j * 2.1) * 1.8 };
        });
        if (c === 0) lab[si] = { x: x0 - cw / 2, y: y - ch / 2 - 30, z: wall[row[0]].z };
      }
    });
  }

  // ---------- the ribbon pose (alive on its own through t) ----------
  function ribbon(i, t) {
    const s = N > 1 ? i / (N - 1) : .5, a = s * Math.PI * 2 * 1.2 + t * .32;
    return { x: (s - .5) * W * 1.22 + Math.sin(a * .6 + t * .2) * W * .035, y: Math.sin(a) * H * .25 + Math.sin(t * .5 + i) * 8, z: Math.cos(a) * 340 - 140,
      rx: 42 * Math.sin(a * 1.1 + t * .45 + i), ry: 58 * Math.cos(a + t * .27), rz: -9 + 24 * Math.sin(a * .8 + i * .7 + t * .3) };
  }

  // ---------- one frame ----------
  function frame(now) {
    raf = 0;
    if (!on) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    const t = now / 1000, r = sec.getBoundingClientRect(), range = Math.max(1, r.height - H);
    p = clamp(-r.top / range / .9);
    ps += (p - ps) * (1 - Math.exp(-dt * 12));
    if (Math.abs(p - ps) < .0005) ps = p;
    const wallReady = ps > .92;
    // pointer parallax on the whole wall
    tx += (mx - tx) * (1 - Math.exp(-dt * 5)); ty += (my - ty) * (1 - Math.exp(-dt * 5));
    const par = wallReady ? 1 : .4;
    const wt = `rotateY(${(tx * 4 * par).toFixed(2)}deg) rotateX(${(-ty * 2.4 * par).toFixed(2)}deg)`;
    if (cache[N] !== wt) { cache[N] = wt; world.style.transform = wt; }

    const k = 1 - Math.exp(-dt * 9), focus = active >= 0 ? active : hovered;
    for (let i = 0; i < N; i++) {
      hv[i] += ((focus === i && wallReady ? 1 : 0) - hv[i]) * k;
      dm[i] += ((focus >= 0 && focus !== i && wallReady ? 1 : 0) - dm[i]) * k;
      const q = ease(clamp((ps * 1.0 - .06 - .42 * (i / Math.max(1, N - 1))) / .5));
      const a = ribbon(i, t), w = wall[i], arc = Math.sin(Math.PI * q);
      let x = lerp(a.x, w.x, q), y = lerp(a.y, w.y, q) - arc * 50, z = lerp(a.z, w.z, q) + arc * 240;
      let rx = lerp(a.rx, w.rx, q), ry = lerp(a.ry, w.ry, q), rz = lerp(a.rz, w.rz, q);
      const h = hv[i];
      if (h > .002) { z += 190 * h; y -= 12 * h; rx *= 1 - h; ry *= 1 - h; rz *= 1 - h; }
      const far = clamp((-z - 60) / 380) * (1 - q), blur = far * 2.4 + dm[i] * 1, op = 1 - far * .42 - dm[i] * .3;
      const sc = 1 + .05 * h;
      const s = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      if (cache[i] !== s) { cache[i] = s; items[i].style.transform = s; }
      const f = fall[i], bq = Math.round(blur * 2) / 2, oq = Math.round(op * 50) / 50;
      if (f.b !== bq) { f.b = bq; items[i].style.filter = bq > 0 ? `blur(${bq}px)` : "none"; }
      if (f.o !== oq) { f.o = oq; items[i].style.opacity = oq; }
      const hot = h > .15;
      if (f.h !== hot) { f.h = hot; items[i].classList.toggle("is-hover", hot); }
    }
    // shelf labels float above their rows once the wall has formed
    const lo = clamp((ps - .72) / .2), le = lo * lo * (3 - 2 * lo);
    labels.forEach((el, si) => {
      const l = lab[si]; if (!l) return;
      const s = `translate3d(${l.x.toFixed(1)}px,${l.y.toFixed(1)}px,${l.z.toFixed(1)}px) translateY(-50%) rotateY(17deg)`;
      if (cache[N + 1 + si] !== s) { cache[N + 1 + si] = s; el.style.transform = s; el.style.marginLeft = "0px"; }
      const o = le.toFixed(2); if (cache[N + 10 + si] !== o) { cache[N + 10 + si] = o; el.style.opacity = o; }
    });
    // the headline drifts up and away
    const hp = clamp(ps / .3), hs = `translate3d(0,${(-hp * 14).toFixed(2)}vh,0) scale(${(1 + hp * .12).toFixed(3)})`;
    if (cache[N + 9] !== hs) { cache[N + 9] = hs; hero.style.transform = hs; hero.style.opacity = (1 - hp).toFixed(3); hero.style.filter = hp > .02 ? `blur(${(hp * 10).toFixed(1)}px)` : "none"; hero.classList.toggle("gone", hp > .96); }
    if (open) placePanel();
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (on && !raf && !document.hidden && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  let visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) wake(); else { cancelAnimationFrame(raf); raf = 0; } }, { rootMargin: "100px" }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else wake(); });
  addEventListener("resize", () => { sync(); if (on) measure(); });
  wide.addEventListener("change", sync); still.addEventListener("change", sync);

  stage.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return;
    mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5;
  }, { passive: true });
  stage.addEventListener("pointerleave", () => { mx = my = 0; });
  cards.forEach((c, i) => {
    c.addEventListener("pointerenter", e => { if (e.pointerType !== "touch") hovered = i; });
    c.addEventListener("pointerleave", () => { if (hovered === i) hovered = -1; });
    c.addEventListener("focus", () => {
      if (!on) return;
      hovered = i;
      if (ps < .9) { const y = sec.offsetTop + (sec.offsetHeight - H) * .9; (window.lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo({ top: y, behavior: "instant" })); ps = p = 1; }
    });
    c.addEventListener("blur", () => { if (hovered === i) hovered = -1; });
    c.addEventListener("click", () => (open && active === i ? close(true) : openPanel(i)));
  });
  // the floor glows in the colour of the hovered card
  const setFloor = () => floor && floor.style.setProperty("--floor", (hovered >= 0 ? getComputedStyle(items[hovered]).getPropertyValue("--bg") : "#c9a05a"));
  cards.forEach((c, i) => { c.addEventListener("pointerenter", setFloor); c.addEventListener("pointerleave", setFloor); });

  // ---------- the detail panel ----------
  let open = false;
  const $ = s => panel.querySelector(s);
  function fill(i) {
    const c = cards[i], d = c.dataset, cov = $(".cw-p-cover");
    cov.innerHTML = ""; cov.style.setProperty("--bg", items[i].style.getPropertyValue("--bg")); cov.style.setProperty("--fg", items[i].style.getPropertyValue("--fg"));
    cov.style.setProperty("--ts", items[i].style.getPropertyValue("--ts"));
    const face = c.querySelector(".cw-face").cloneNode(true); face.querySelectorAll(".cw-pill").forEach(x => x.remove()); cov.appendChild(face);
    $(".cw-p-shelf").textContent = d.shelf; $(".cw-p-title").textContent = d.title; $(".cw-p-author").textContent = d.author;
    $(".cw-p-chip").innerHTML = `<span data-s="${d.status}">${d.statusLabel}</span>`; $(".cw-p-note").textContent = d.note;
    const a = $(".cw-p-link"); a.hidden = !d.link; if (d.link) a.href = d.link;
  }
  function placePanel() {
    if (!open || innerWidth < 700) { panel.style.left = ""; panel.style.top = ""; return; }
    const r = cards[active].getBoundingClientRect(), pw = panel.offsetWidth, ph = panel.offsetHeight, gap = 26;
    let left = r.right + gap; if (left + pw > innerWidth - 16) left = r.left - gap - pw; if (left < 16) left = clamp(r.left + r.width / 2 - pw / 2, 16, innerWidth - pw - 16);
    const top = clamp(r.top + r.height / 2 - ph / 2, 72, Math.max(72, innerHeight - ph - 16));
    panel.style.left = left.toFixed(0) + "px"; panel.style.top = top.toFixed(0) + "px";
  }
  let openY = 0;
  function openPanel(i, keepFocus) {
    active = i; fill(i);
    if (!open) { open = true; panel.hidden = false; panel.style.animation = "none"; void panel.offsetWidth; panel.style.animation = ""; openY = scrollY; }
    placePanel();
    if (!keepFocus) $(".cw-p-title").focus({ preventScroll: true });
    if (!on) addEventListener("scroll", scrollClose, { passive: true });
  }
  function scrollClose() { if (Math.abs(scrollY - openY) > 260) close(false); }
  function close(refocus) {
    if (!open) return;
    const c = cards[active]; open = false; panel.hidden = true; active = -1; removeEventListener("scroll", scrollClose);
    if (refocus) c.focus({ preventScroll: true });
  }
  $(".cw-x").addEventListener("click", () => close(true));
  document.addEventListener("pointerdown", e => { if (open && !panel.contains(e.target) && !e.target.closest(".cw-card")) close(false); });

  // ---------- keyboard: arrows move between cards (focus or panel), Esc closes ----------
  function neighbour(i, key) {
    if (key === "ArrowRight") return Math.min(N - 1, i + 1);
    if (key === "ArrowLeft") return Math.max(0, i - 1);
    const r = cards[i].getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dir = key === "ArrowDown" ? 1 : -1;
    let best = -1, bd = 1e9;
    cards.forEach((c, j) => {
      const b = c.getBoundingClientRect(), dy = (b.top + b.height / 2 - cy) * dir; if (dy < r.height * .4) return;
      const d = dy + Math.abs(b.left + b.width / 2 - cx) * 2; if (d < bd) { bd = d; best = j; }
    });
    return best < 0 ? i : best;
  }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && open) { e.preventDefault(); close(true); return; }
    if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const cur = open ? active : cards.indexOf(document.activeElement);
    if (cur < 0) return;
    e.preventDefault();
    const n = neighbour(cur, e.key);
    if (n === cur) return;
    if (open) { openPanel(n, true); hovered = n; } else cards[n].focus({ preventScroll: on });
  });

  sync();
})();
