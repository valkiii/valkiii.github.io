/* Bookshelf card wall (orbit). The page is a plain grid of book buttons until this script runs. On wide screens without
   reduced motion it adds .cw-3d: the section becomes a tall scroll with one sticky stage, and the books hang on ONE
   straight line that runs away from the camera (CSS 3D transforms only, one rAF loop):

     the hang     every book is the same rectangle at the same shared yaw and rake; each one steps right, up and back
                  from the one in front, so a single perspective divide makes the near books big and spilling off the
                  bottom-left and the far ones small in the top-right, fading into the dark. Each book is a real box:
                  a bone page block shows along its top and its fore-edge.
     the loop     the books (cloned until the line holds two dozen) sit at slot u = (e + offset) mod C. Scrolling down
                  raises the offset, so the line travels left to right, near to far; scrolling up runs it back. When
                  nobody is scrolling, hovering or reading, a slow drift keeps it going the same way. A book wraps from
                  the far end (already faded out) to the near end (still outside the frame), so the loop has no seam.
                  Arrow keys and a vertical drag nudge the line by whole books.
     put up       on load the wall is hung one book at a time, nearest first, each rising from below with too much
                  angle and opening onto the shared rake as it lands.
     hover        the book pushes toward the lens, lifts out of the dark, and the wall label (left column) shows it.
     click        THE LINE PARTS: books in front run on off the bottom-left, books behind run off the top-right, the
                  split rippling outward from the clicked book, which then squares up to the lens, overshoots a hair
                  and settles beside its full label while the camera widens. One timeline value drives all of it, so
                  Esc / Back / a click outside plays it backwards frame for frame.

   Scroll is only read from the section's bounding rect, so Lenis needs nothing special. */
(() => {
  const sec = document.querySelector(".cw");
  if (!sec) return;
  const stage = sec.querySelector(".cw-stage"), world = sec.querySelector(".cw-world"), hero = sec.querySelector(".cw-hero");
  const floor = sec.querySelector(".cw-floor"), wl = sec.querySelector(".cw-wl");
  const items = [...sec.querySelectorAll(".cw-item")], cards = items.map(li => li.querySelector(".cw-card"));
  const panel = document.querySelector(".cw-panel");
  const N = items.length;
  if (!N) return;
  const wide = matchMedia("(min-width: 861px)"), still = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const mod = (a, n) => ((a % n) + n) % n;
  const eo = x => 1 - Math.pow(1 - x, 3), eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  // the line: C slots (clones fill it), K0 slots wait unseen in front of the lens, books are gone by FAR
  const REPS = Math.max(2, Math.ceil(34 / N)), C = N * REPS, K0 = 4, FAR = 25;
  const RY = -24, RX = -7, RZ = 1.5;                  // the shared yaw / rake / roll of the whole hang (deg)
  const DRIFT = .2;                                   // idle drift, books per second, left to right
  let els = items, all = cards;                       // originals + clones while in 3D

  let on = false, raf = 0, W = 0, H = 0, P = 1400, cw = 200, step = 160;
  let z0 = 0, dz = 0, x0 = 0, dx = 0, y0 = 0, dy = 0;
  let last = 0, sOff = 0, base = 0, bT = 0, dv = 0, frozen = null, sc = 0, hp = 0;
  let hovered = -1, focused = -1, act = -1, open = false, pt = 0, openSc = 0, quiet = false;
  let mx = 0, my = 0, tx = 0, ty = 0, t0 = 0, introEnd = 0, delay = [], drag = null, dragged = false, shown = -2;
  let lock = 0, hv = new Float32Array(0), cache = [], st = [];
  const p3 = [0, 0, 0];

  // ---------- 3D mode on/off ----------
  function splitHeadline() {
    const h = hero.querySelector(".cw-title-big");
    if (!h || h.dataset.split) return;
    h.dataset.split = "1"; h.setAttribute("aria-label", h.textContent.trim());
    h.textContent = h.textContent.replace(/[\p{Extended_Pictographic}️]/gu, "");  // the big headline is type only
    let k = 0;
    h.innerHTML = h.textContent.trim().split(/\s+/).map(w => `<span class="cw-w" aria-hidden="true">${[...w].map(c => `<span class="cw-l" style="--k:${k++}">${c}</span>`).join("")}</span>`).join(" ");
  }
  function enable() {
    if (on) return;
    on = true; sec.classList.add("cw-3d"); splitHeadline(); close(false);
    // clones: visible and clickable, but hidden from assistive tech and the tab order
    const list = items[N - 1].parentNode, extra = [];
    for (let r = 1; r < REPS; r++) items.forEach(li => {
      const c = li.cloneNode(true); c.classList.add("cw-clone"); c.setAttribute("aria-hidden", "true");
      c.querySelector(".cw-card").tabIndex = -1; list.appendChild(c); extra.push(c);
    });
    els = [...items, ...extra]; all = els.map(li => li.querySelector(".cw-card"));
    all.forEach((c, e) => { if (e >= N) bindCard(c, e); });
    hv = new Float32Array(C); cache = new Array(C + 4).fill(""); st = els.map(() => ({}));
    measure(); readScroll(); sOff = sc / step;
    base = bT = 0; dv = 0; pt = 0; act = -1; hovered = focused = -1; shown = -2;
    // put the wall up nearest first, starting a beat after the headline letters
    const off = sOff;
    delay = els.map((_, e) => { const u = mod(e + off, C) - K0; return u < -1.5 ? 0 : (u + 1.5) * .06; });
    t0 = performance.now() / 1000 + .3; introEnd = t0 + Math.max(...delay) + 1.1;
    label(-1); wake();
  }
  function disable() {
    if (!on) return;
    on = false; sec.classList.remove("cw-3d"); cancelAnimationFrame(raf); raf = 0;
    els.slice(N).forEach(li => li.remove()); els = items; all = cards; open = false; act = -1;
    [...items, hero, world, stage, wl].forEach(e => e && e.removeAttribute("style"));
    items.forEach(li => li.classList.remove("is-hover"));
    wl.classList.remove("is-open", "is-on");
  }
  const sync = () => (wide.matches && !still.matches ? enable : disable)();
  function measure() {
    W = stage.clientWidth; H = stage.clientHeight;
    P = clamp(H * 1.9, 1100, 2000);
    // anchor the near book (slot 0) and a far book (slot 14) on screen, then solve the straight world line through them
    const s0 = 1.08, s1 = .2, near = [-W * .27, H * .3], far = [W * .44, -H * .37], U = 21;
    cw = clamp(H * .52 / 1.5 / s0, 120, 330); step = H * .2;
    z0 = P * (1 - 1 / s0); const z1 = P * (1 - 1 / s1); dz = (z0 - z1) / U;
    x0 = near[0] / s0; dx = (far[0] / s1 - x0) / U;
    y0 = near[1] / s0; dy = (y0 - far[1] / s1) / U;
    stage.style.setProperty("--cw", cw.toFixed(1) + "px");
  }
  function line(u) {
    // past the lens the book keeps sliding down-left at a fixed depth, so nothing ever crosses the camera plane
    const v = Math.max(u, -2.2);
    p3[0] = x0 + u * dx; p3[1] = y0 - u * dy; p3[2] = z0 - v * dz;
  }
  function readScroll() {
    const r = sec.getBoundingClientRect();
    sc = clamp(-r.top, 0, Math.max(1, r.height - H));
    return r;
  }

  // ---------- one frame ----------
  function frame(now) {
    raf = 0;
    if (!on) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    const t = now / 1000, r = readScroll();
    sOff += (sc / step - sOff) * (1 - Math.exp(-dt * 9));
    hp = clamp(sc / (H * .45));
    if (open && Math.abs(sc - openSc) > H * .3) close(false);

    // the line offset: scroll + drift + nudges; frozen while a book is taken down
    const intro = t < introEnd, idle = hovered < 0 && focused < 0 && !open && pt === 0 && !drag && !intro;
    dv += ((idle ? DRIFT : 0) - dv) * (1 - Math.exp(-dt * 2));
    bT += dv * dt; base += dv * dt;
    base += (bT - base) * (1 - Math.exp(-dt * 6));
    if (focused >= 0 && t < lock) { const u = mod(focused + sc / step + bT, C) - K0; bT += mod(1 - u + C / 2, C) - C / 2; }
    if (open || pt > 0) { if (frozen === null) frozen = sOff + base; base = bT = frozen - sOff; } else frozen = null;
    const off = sOff + base;

    // the parting timeline (one value, so closing is the same film backwards) and the camera that widens with it
    pt = clamp(pt + (open ? dt : -dt) / 1.6);
    if (!open && pt === 0 && act >= 0) { act = -1; wl.classList.remove("is-open"); label(hovered); }
    const cam = eio(clamp(pt / .8)), Pc = P * (1 - .16 * cam);
    const ps = Pc.toFixed(0) + "px";
    if (cache[C] !== ps) { cache[C] = ps; stage.style.perspective = ps; }

    // a little cursor parallax on the whole hang
    tx += (mx - tx) * (1 - Math.exp(-dt * 4)); ty += (my - ty) * (1 - Math.exp(-dt * 4));
    const wt = `rotateY(${(tx * 2.2).toFixed(2)}deg) rotateX(${(-ty * 1.4).toFixed(2)}deg)`;
    if (cache[C + 1] !== wt) { cache[C + 1] = wt; world.style.transform = wt; }

    const uAct = act >= 0 ? mod(act + off, C) - K0 : 0, k = 1 - Math.exp(-dt * 10);
    const sq = clamp((pt - .42) / .58), sqe = eio(sq);
    for (let e = 0; e < C; e++) {
      let u = mod(e + off, C) - K0;
      if (act >= 0 && e !== act) {                     // the split ripples outward from the clicked book
        const d = Math.abs(u - uAct), q = eio(clamp((pt - .045 * Math.min(d, 9)) / .5));
        u += Math.sign(u - uAct || 1) * q * 30;
      }
      line(u);
      let x = p3[0], y = p3[1], z = p3[2], ry = RY, rx = RX, rz = RZ, o = 1;
      if (intro) {                                     // rises from below carrying too much angle, then lands
        const a = clamp((t - t0 - delay[e]) / .95), b = eo(a);
        y += (1 - b) * H * .8; ry -= (1 - b) * 38; rx -= (1 - b) * 26; rz += (1 - b) * 6; o = clamp(a * 3);
      }
      hv[e] += ((e === hovered && !open && pt === 0 ? 1 : 0) - hv[e]) * k;
      z += hv[e] * cw * .55; y -= hv[e] * cw * .06;
      let dk = Math.pow(clamp((u - 1.5) / (FAR - 6)), .8) * .94 * (1 - hv[e] * .8);
      o *= 1 - clamp((u - FAR + 3) / 3);
      if (u < -7) o = 0;
      if (e === act) {                                 // squares up to the lens, a hair too close, then settles
        const s = H * .7 / (cw * 1.5), zM = Pc * (1 - 1 / s);
        x = lerp(x, W * .12 / s, sqe); y = lerp(y, H * .03 / s, sqe); z = lerp(z, zM, sqe) + Math.sin(Math.PI * clamp((sq - .5) / .5)) * cw * .3;
        ry = lerp(ry, -9, sqe); rx = lerp(rx, -2, sqe); rz = lerp(rz, 0, sqe);   // squared up, with just enough turn to keep its pages dk *= 1 - sqe;
      }
      const li = els[e], tr = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
      if (cache[e] !== tr) { cache[e] = tr; li.style.transform = tr; }
      const s = st[e], dq = Math.round(dk * 40) / 40, oq = Math.round(o * 40) / 40, hot = hv[e] > .2;
      if (s.d !== dq) { s.d = dq; li.style.setProperty("--dk", dq); }
      if (s.o !== oq) { s.o = oq; li.style.setProperty("--o", oq); li.style[e < N ? "pointerEvents" : "visibility"] = oq > 0 ? "" : e < N ? "none" : "hidden"; }
      if (s.h !== hot) { s.h = hot; li.classList.toggle("is-hover", hot); }
    }

    // the headline drifts up and away over the first stretch of scroll
    const hs = `translate3d(0,${(-hp * 16).toFixed(2)}vh,0) scale(${(1 + hp * .1).toFixed(3)})`;
    if (cache[C + 2] !== hs) { cache[C + 2] = hs; hero.style.transform = hs; hero.style.opacity = (1 - hp).toFixed(3); hero.style.filter = hp > .02 ? `blur(${(hp * 10).toFixed(1)}px)` : "none"; hero.classList.toggle("gone", hp > .96); }
    wl.classList.toggle("is-on", open || pt > 0 || hovered >= 0 || hp > .6);
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (on && !raf && !document.hidden && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  let visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) wake(); else { cancelAnimationFrame(raf); raf = 0; } }, { rootMargin: "100px" }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else wake(); });
  addEventListener("resize", () => { sync(); if (on) { measure(); cache.fill(""); } });
  wide.addEventListener("change", sync); still.addEventListener("change", sync);

  // ---------- the wall label (3D) ----------
  const L = s => wl.querySelector(s);
  function label(e) {
    if (e === shown) return;
    shown = e;
    wl.classList.toggle("is-empty", e < 0);
    const d = e >= 0 ? all[e].dataset : null;
    L(".cw-wl-shelf").textContent = d ? d.shelf : "";
    L(".cw-wl-title").textContent = d ? d.title : "";
    L(".cw-wl-by").textContent = d ? d.author : "";
    L(".cw-wl-chip").innerHTML = d ? `<span data-s="${d.status}">${d.statusLabel}</span>` : "";
    L(".cw-wl-note").textContent = d ? d.note : "";
    const a = L(".cw-wl-link"); a.hidden = !(d && d.link); if (d && d.link) a.href = d.link;
    if (floor) floor.style.setProperty("--floor", e >= 0 ? getComputedStyle(els[e]).getPropertyValue("--bg") : "#c9a05a");
  }
  function takeDown(e) {
    if (open) return;
    act = e; open = true; openSc = sc; hovered = -1; label(-2); label(e);
    wl.classList.add("is-open");
    L(".cw-wl-title").focus({ preventScroll: true });
  }
  L(".cw-wl-x").addEventListener("click", () => close(true));

  // ---------- pointer: hover, click, drag, parallax ----------
  function bindCard(c, e) {
    c.addEventListener("pointerenter", ev => { if (ev.pointerType !== "touch" && on && !open && pt === 0) { hovered = e; label(e); } });
    c.addEventListener("pointerleave", () => { if (hovered === e) { hovered = -1; if (!open && pt === 0) label(-1); } });
    c.addEventListener("click", () => {
      if (!on) return open && active === e ? close(true) : openPanel(e);
      if (open) return close(e === act && e < N);
      if (pt === 0) takeDown(e);
    });
  }
  cards.forEach((c, i) => {
    bindCard(c, i);
    // keyboard focus brings the book to the front of the line (and the stage into view)
    c.addEventListener("focus", () => {
      if (!on || quiet || open) return;
      focused = i;
      const r = sec.getBoundingClientRect();
      if (-r.top < H * .45 || r.bottom < H - 1) {     // past the headline, with the stage filling the screen
        const y = sec.offsetTop + H * .5;
        window.lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo({ top: y, behavior: "instant" });
        sc = H * .5; sOff = sc / step;                 // Lenis may only move on its next frame
      }
      lock = performance.now() / 1000 + .5;           // the browser may still scroll the focused book into view
      hovered = i; label(i);
    });
    c.addEventListener("blur", () => { if (focused === i) { focused = -1; if (hovered === i) hovered = -1; if (!open) label(-1); } });
  });

  stage.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return;
    mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5;
  }, { passive: true });
  stage.addEventListener("pointerleave", () => { mx = my = 0; });
  stage.addEventListener("pointerdown", e => { if (on && !open && pt === 0 && e.button === 0 && !wl.contains(e.target)) { drag = { y: e.clientY, b: bT }; dragged = false; } });
  addEventListener("pointermove", e => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 6) dragged = true;
    if (dragged) bT = drag.b - dy / (H * .12);       // drag up = scroll down = the line runs left to right
  }, { passive: true });
  addEventListener("pointerup", () => { drag = null; });
  // a drag that ends on a book must not count as a click on it
  stage.addEventListener("click", e => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  document.addEventListener("pointerdown", e => {
    if (!open || e.target.closest(".cw-card")) return;
    if (on ? !wl.contains(e.target) : !panel.contains(e.target)) close(false);
  });

  // ---------- the detail panel (grid mode only) ----------
  let active = -1, panelOpen = false;
  const $ = s => panel.querySelector(s);
  function fill(i) {
    const c = cards[i], d = c.dataset, cov = $(".cw-p-cover");
    cov.innerHTML = ""; ["--bg", "--fg", "--ts"].forEach(v => cov.style.setProperty(v, items[i].style.getPropertyValue(v)));
    const face = c.querySelector(".cw-face").cloneNode(true); face.querySelectorAll(".cw-pill").forEach(x => x.remove()); cov.appendChild(face);
    $(".cw-p-shelf").textContent = d.shelf; $(".cw-p-title").textContent = d.title; $(".cw-p-author").textContent = d.author;
    $(".cw-p-chip").innerHTML = `<span data-s="${d.status}">${d.statusLabel}</span>`; $(".cw-p-note").textContent = d.note;
    const a = $(".cw-p-link"); a.hidden = !d.link; if (d.link) a.href = d.link;
  }
  function placePanel() {
    if (!panelOpen || innerWidth < 700) { panel.style.left = ""; panel.style.top = ""; return; }
    const r = cards[active].getBoundingClientRect(), pw = panel.offsetWidth, ph = panel.offsetHeight, gap = 26;
    let left = r.right + gap; if (left + pw > innerWidth - 16) left = r.left - gap - pw; if (left < 16) left = clamp(r.left + r.width / 2 - pw / 2, 16, innerWidth - pw - 16);
    const top = clamp(r.top + r.height / 2 - ph / 2, 72, Math.max(72, innerHeight - ph - 16));
    panel.style.left = left.toFixed(0) + "px"; panel.style.top = top.toFixed(0) + "px";
  }
  let openY = 0;
  function openPanel(i, keepFocus) {
    active = i; fill(i); open = true;
    if (!panelOpen) { panelOpen = true; panel.hidden = false; panel.style.animation = "none"; void panel.offsetWidth; panel.style.animation = ""; openY = scrollY; }
    placePanel();
    if (!keepFocus) $(".cw-p-title").focus({ preventScroll: true });
    addEventListener("scroll", scrollClose, { passive: true });
  }
  function scrollClose() { if (Math.abs(scrollY - openY) > 260) close(false); }
  // close either view: the panel at once, the 3D take-down by running its timeline backwards
  function close(refocus) {
    if (panelOpen) {
      const c = cards[active]; panelOpen = open = false; panel.hidden = true; active = -1; removeEventListener("scroll", scrollClose);
      if (refocus) c.focus({ preventScroll: true });
      return;
    }
    if (!open) return;
    open = false;
    if (refocus && act >= 0 && act < N) { quiet = true; cards[act].focus({ preventScroll: true }); quiet = false; }
    else if (wl.contains(document.activeElement)) document.activeElement.blur();
  }
  $(".cw-x").addEventListener("click", () => close(true));

  // ---------- keyboard: arrows move between books (grid) or along the line (3D), Esc closes ----------
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
    const cur = panelOpen ? active : cards.indexOf(document.activeElement);
    if (on) {
      if (open) return;
      const fwd = e.key === "ArrowRight" || e.key === "ArrowDown";
      if (cur >= 0) { e.preventDefault(); cards[mod(cur + (fwd ? -1 : 1), N)].focus({ preventScroll: true }); return; }
      // nothing focused: left / right step the line while the stage fills the screen (up / down scroll the page)
      const r = sec.getBoundingClientRect();
      if (/Left|Right/.test(e.key) && r.top <= 1 && r.bottom >= H - 1 && !e.target.closest("input, textarea, select")) { e.preventDefault(); bT += fwd ? 1 : -1; }
      return;
    }
    if (cur < 0) return;
    const n = neighbour(cur, e.key);
    if (n === cur) return;
    e.preventDefault();
    if (panelOpen) openPanel(n, true); else cards[n].focus();
  });

  sync();
})();
