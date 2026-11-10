/* All work as a vortex that resolves into an endless chain. Built from the plain list of cards further down the page
   (#work-cards), which stays the crawlable, no-JavaScript and reduced-motion version (CSS hides the stage then).

   Choreography
   1 Bloom (~2.9 s)  every cover curls out of the centre. Chip i: e = easeOutQuart(t), r = R·e, θ = θi + SWIRL·(1−e)²,
                     staggered 35 ms. The angle unwinds while the radius grows, so the circle opens like a vortex that
                     decelerates into place, never a fan. The title rises in the middle.
   2 Ring (waits)    radius breathes on a wave travelling round the ring (±3 %), the ring spins with an eased-in speed,
                     one hairline thread runs through the chips, a "Scroll" cue waits in the corner. Nothing auto-advances.
   3 Handover (1.1 s) first wheel / swipe / arrow, or a click on a chip: the ring zooms open (R × 2.6) and clears while the
                     chain rises out of .86 scale.
   4 Chain           one cover held at the centre, neighbours peek in from top and bottom, tilted. pos glides to the target
                     (1 s easeOutQuart, re-targetable mid-glide). Targets are unbounded integers, project = k mod N, so it
                     loops forever both ways with no seam. The thread above the focus inks its colour on after arrival.
                     The focus photo drifts (Ken Burns) and lifts under the pointer. Each step the caption skews in
                     (CSS wx-liquid) and the index top-right ticks.
   5 Iris            click the centred cover: a circle grows from the click point (clip-path, 850 ms), the photo
                     counter-zooms 1.35 → 1, the credit rises line by line. Esc / Close contracts it back to that point.
   Input: while the stage fills the window (scrollY ≈ 0) it owns wheel, touch and arrow keys, one step per gesture
   (trackpad inertia is swallowed until the wheel is quiet for 180 ms). The "list" link, PageDown or End go to the plain
   list below, which leads on to the footer; back at the top the stage takes the wheel again after a short pause.
   One rAF loop, asleep while the stage is off screen or the tab is hidden. */
(() => {
  const st = document.getElementById("wx");
  if (!st || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const src = [...document.querySelectorAll("#work-cards .card")], N = src.length;
  if (!N) return;
  const $ = (s, r = st) => r.querySelector(s);
  const ringEl = $(".wx-ring"), chainEl = $(".wx-chain"), cv = $(".wx-threads"), ctx = cv.getContext("2d"), head = $(".wx-head");
  const capL = $(".wx-cap-l"), capR = $(".wx-cap-r"), idxEl = $(".wx-index");
  const iris = document.querySelector(".wx-iris"), irisPh = iris.querySelector(".wx-iris-ph"), credit = iris.querySelector(".wx-credit"), closeBtn = iris.querySelector(".wx-close");
  document.body.appendChild(iris);   // above the fixed header, out of main's stacking
  const pad = n => String(n).padStart(2, "0"), mod = k => ((k % N) + N) % N, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const qOut = t => 1 - Math.pow(1 - t, 4), cInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const txt = (a, s) => { const el = a.querySelector(s); return el ? el.textContent.trim() : ""; };
  const W = src.map((a, i) => ({
    i, href: a.getAttribute("href"), media: a.querySelector(".cimg img, .cimg svg"), name: txt(a, ".nm"), title: txt(a, ".ctitle"),
    tag: txt(a, ".cdesc"), year: txt(a, ".yr"), uc: a.dataset.uc || "", c: getComputedStyle(a).getPropertyValue("--c").trim() || "#6fe3ff",
    tilt: (((i * 37) % 11) - 5) * 1.4 * Math.PI / 180, dx: (((i * 53) % 7) - 3) * 7,
  }));
  const pic = w => { const m = w.media.cloneNode(true); if (m.tagName === "IMG") { m.loading = "eager"; m.decoding = "async"; m.alt = ""; m.draggable = false; } return m; };
  const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

  // ---- DOM: ring chips, chain cards, index, counter
  const chips = W.map(w => { const c = el("div", "wx-chip", ringEl); c.appendChild(pic(w)); c.addEventListener("click", () => handover(w.i)); return c; });
  const cards = W.map(w => {
    const a = el("a", "wx-card", chainEl); a.href = w.href; a.tabIndex = -1; a.style.setProperty("--c", w.c);
    a.setAttribute("aria-label", w.name + ": " + w.title); el("span", "kb", a).appendChild(pic(w));
    a.addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;   // new tab still works
      e.preventDefault();
      const k = near(w.i, target);
      if (k !== target) return go(k);
      const r = a.getBoundingClientRect();
      openIris(w, e.detail ? e.clientX : r.left + r.width / 2, e.detail ? e.clientY : r.top + r.height / 2, a);
    });
    a.addEventListener("pointerenter", () => { hover = w.i; }); a.addEventListener("pointerleave", () => { if (hover === w.i) hover = -1; });
    return a;
  });
  const lis = W.map(w => { const li = el("li", "", idxEl), b = el("button", "", li); b.type = "button"; b.textContent = w.name; b.addEventListener("click", () => go(near(w.i, target))); return li; });
  const count = el("p", "wx-count meta", st);

  // ---- state
  const SWIRL = Math.PI * 1.3, BLOOM = 2200, STAGGER = 35;
  let phase = "ring", T0 = performance.now(), now = T0, last = T0, spin = 0, spinV = 0, outT = -1, chainA = 0;
  let pos = 0, target = 0, glide = null, ink = 0, hover = -1, lift = 0, raf = 0, seen = true;
  let vw, vh, cx, cy, R, chipW, chipH, cw, ch, gap, phone, capH = 0;
  let irisOpen = false, irisV = 0, irisA = 0, irisB = 0, irisT0 = 0, irisD = 1, irisX = 0, irisY = 0, irisCard = null;
  const near = (i, ref) => i + N * Math.round((ref - i) / N);   // the copy of project i closest to ref on the endless rail

  const size = () => {
    vw = st.clientWidth; vh = st.clientHeight; phone = vw < 760; cx = vw / 2;
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = vw * dpr; cv.height = vh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const topH = (document.querySelector(".top") || {}).offsetHeight || 60;
    R = phone ? Math.min(vw * .4, vh * .3) : Math.min(vw * .32, vh * .33);
    chipW = Math.min(124, 2 * Math.PI * R / N * .8); chipH = chipW * .64;
    if (phone) { cw = Math.min(vw - 64, (vh - topH - 250) * .72); ch = cw / .72; }
    else { cw = Math.min(vw * .33, vh * .58 * 1.6); ch = cw / 1.6; }
    chips.forEach(c => { c.style.width = chipW + "px"; c.style.height = chipH + "px"; });
    cards.forEach(c => { c.style.width = cw + "px"; c.style.height = ch + "px"; });
    placeCaps();
  };
  const placeCaps = () => {
    st.classList.remove("stack");
    if (phone) {
      const hL = capL.offsetHeight, hR = capR.offsetHeight, topH = (document.querySelector(".top") || {}).offsetHeight || 60;
      capH = hL + hR + 22;
      cy = topH + (vh - topH - 108 - (ch + capH)) / 2 + ch / 2;   // 108 = list/counter row + the peek
      capL.style.top = cy + ch / 2 + 18 + "px"; capR.style.top = cy + ch / 2 + 18 + hL + 4 + "px";
      gap = vh - 52 - cy + ch / 2;   // the next card peeks 52px off the bottom edge
    } else {
      cy = vh / 2 + 8; gap = ch + Math.max(110, vh * .2); capH = 0;
      capL.style.top = cy - 30 + "px";
      let rTop = cy + ch / 2 - capR.offsetHeight, ilh = (rTop - 24 - 92) / N;
      if (ilh < 15) { st.classList.add("stack"); rTop = cy - 30 + capL.offsetHeight + 22; ilh = (vh - 140) / N; }
      ilh = clamp(ilh, 12, 20);
      idxEl.style.setProperty("--ilh", ilh + "px"); idxEl.style.setProperty("--ifs", Math.min(13.5, ilh * .72) + "px");
      capR.style.top = rTop + "px";
    }
  };
  const lines = (box, arr) => { box.innerHTML = arr.map((h, i) => `<span class="ln liquid" style="--i:${i}"><span>${h}</span></span>`).join(""); };
  const caption = w => {
    lines(capL, [`<span class="wx-no">${pad(w.i + 1)}</span><span class="wx-nm">${esc(w.name)}</span>`, `<span class="wx-tl">${esc(w.title)}</span>`]);
    lines(capR, [`<span class="wx-uc">${w.uc.split(" · ").map(esc).join(" <i>&middot;</i> ")}</span><span class="wx-yr">${esc(w.year)}</span>`]);
    capL.style.setProperty("--c", w.c); capR.style.setProperty("--c", w.c); idxEl.style.setProperty("--c", w.c); st.style.setProperty("--wc", w.c);
    lis.forEach((li, i) => li.classList.toggle("on", i === w.i));
    count.textContent = pad(w.i + 1) + " / " + pad(N);
    placeCaps();
  };

  // ---- beats
  function handover(i = 0) {
    if (phase !== "ring" || now - T0 < 1100) return;
    phase = "out"; outT = now; pos = target = i; ink = 0; caption(W[i]);
  }
  function go(k) {
    if (phase === "ring") return handover(mod(k));
    if (k === target) return;
    target = k; glide = { from: pos, t0: now }; ink = 0; caption(W[mod(k)]);
  }
  const step = d => (phase === "ring" ? d > 0 && handover(0) : go(target + d));
  function openIris(w, x, y, card) {
    irisOpen = true; irisCard = card; irisX = x; irisY = y;
    irisPh.innerHTML = ""; irisPh.appendChild(pic(w)); iris.style.setProperty("--c", w.c); iris.setAttribute("aria-label", w.name);
    const L = [`<span class="t">${esc(w.name)}</span>`, `<span class="h">${esc(w.title)}</span>`, `<span class="u">${w.uc.split(" · ").map(esc).join(" &middot; ")} &middot; ${esc(w.year)}</span>`,
      `<span class="d">${esc(w.tag)}</span>`, `<span class="cn">${pad(w.i + 1)} / ${pad(N)}</span>`, `<a class="btn primary" href="${esc(w.href)}">Open the project &rarr;</a>`];
    credit.innerHTML = L.map((h, i) => `<span class="ln" style="--i:${i}">${h}</span>`).join("");
    iris.hidden = false; tweenIris(1, 850);
    requestAnimationFrame(() => requestAnimationFrame(() => iris.classList.add("on")));
    setTimeout(() => { const b = credit.querySelector(".btn"); if (irisOpen && b) b.focus({ preventScroll: true }); }, 500);
    wake();
  }
  const closeIris = () => { if (!irisOpen || irisB === 0) return; iris.classList.remove("on"); tweenIris(0, 650); };
  const tweenIris = (to, d) => { irisA = irisV; irisB = to; irisT0 = now; irisD = d; };
  closeBtn.addEventListener("click", closeIris);

  // ---- the one loop
  const frame = t => {
    raf = 0; const dt = Math.min(50, t - last); last = now = t; const s = (t - T0) / 1000;
    ctx.clearRect(0, 0, vw, vh);
    // ring: bloom, breath, spin, handover zoom
    if (phase !== "chain") {
      const bloomDone = now - T0 > BLOOM + STAGGER * N;
      if (bloomDone) spinV += (.055 - spinV) * clamp(dt / 1600);
      spin += spinV * dt / 1000;
      const o = phase === "out" ? clamp((now - outT) / 1100) : 0, oe = cInOut(o);
      const hp = clamp((now - T0 - 500) / 1000);
      head.style.opacity = qOut(hp) * (1 - clamp(oe * 1.6));
      head.style.transform = `translate(-50%, -50%) translateY(${(1 - qOut(hp)) * 24}px) scale(${1 + oe * .5})`;
      const pts = [];
      W.forEach((w, i) => {
        const tb = clamp((now - T0 - i * STAGGER) / BLOOM), e = qOut(tb);
        const th0 = -Math.PI / 2 + i * 2 * Math.PI / N + spin, th = th0 + SWIRL * (1 - e) * (1 - e);
        const r = R * e * (1 + .03 * Math.sin(s * 1.1 - 3 * th0)) * (1 + oe * 1.6);
        const x = cx + Math.cos(th) * r, y = vh / 2 + Math.sin(th) * r;
        pts.push([x, y]);
        chips[i].style.opacity = clamp(tb * 5) * (1 - oe);
        chips[i].style.transform = `translate(${x - chipW / 2}px, ${y - chipH / 2}px) rotate(${th + Math.PI / 2}rad) scale(${(.15 + .85 * e) * (1 + oe * 1.4)})`;
      });
      ctx.beginPath();   // one hairline through every chip, closed and smoothed through the midpoints
      pts.forEach((p, i) => { const q = pts[(i + 1) % N], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; i ? ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]) : ctx.moveTo(m[0], m[1]); });
      ctx.quadraticCurveTo(pts[0][0], pts[0][1], (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
      ctx.strokeStyle = `rgba(255,255,255,${.2 * clamp((now - T0) / BLOOM) * (1 - oe)})`; ctx.lineWidth = 1; ctx.stroke();
      chainA = qOut(clamp((o - .35) / .65));
      if (o > .45) st.classList.add("chain");
      if (o >= 1) { phase = "chain"; ringEl.style.display = "none"; }
    }
    // chain: glide, threads, Ken Burns, lift
    if (phase !== "ring") {
      if (glide) { const g = clamp((now - glide.t0) / 1000); pos = glide.from + (target - glide.from) * qOut(g); if (g >= 1) { pos = target; glide = null; } }
      if (Math.abs(pos - target) < .08) ink = clamp(ink + dt / 750);
      const fi = mod(target);
      lift += ((hover === fi && !irisOpen ? 1 : 0) - lift) * clamp(dt / 140);
      const geo = k => { const d = k - pos, a = Math.min(1, Math.abs(d)), w = W[mod(k)]; return { d, a, x: cx + w.dx * a, y: cy + d * gap, rot: w.tilt * a, sc: (1 - .05 * a) * (.86 + .14 * chainA) }; };
      W.forEach((w, i) => {
        const k = near(i, pos), g = geo(k), c = cards[i], vis = Math.abs(g.d) < 2.4;
        c.style.visibility = vis ? "visible" : "hidden";
        const focus = k === target; c.classList.toggle("focus", focus); c.tabIndex = focus ? 0 : -1;
        if (!vis) return;
        const l = focus ? lift : 0;
        c.classList.toggle("lift", l > .5);
        c.style.opacity = chainA * clamp(2.4 - Math.abs(g.d));
        c.style.transform = `translate(${g.x - cw / 2}px, ${g.y - ch / 2 - l * 10}px) rotate(${g.rot}rad) scale(${g.sc * (1 + l * .025)})`;
        c.firstChild.style.transform = `scale(${1.1 + .05 * Math.sin(s * .17 + i) + l * .03}) translate(${Math.sin(s * .13 + i) * 1.8}%, ${Math.cos(s * .11 + i * 2) * 1.3}%)`;
      });
      // threads: bottom-centre of card k to top-centre of card k+1; the one above the focus inks the focus colour
      const k0 = Math.floor(pos) - 2;
      for (let k = k0; k < k0 + 5; k++) {
        const A = geo(k), B = geo(k + 1);
        const hA = ch / 2 * A.sc + (phone ? capH * (1 - A.a) : 0), hB = ch / 2 * B.sc;
        const p0 = [A.x - Math.sin(A.rot) * hA, A.y + Math.cos(A.rot) * hA], p1 = [B.x + Math.sin(B.rot) * hB, B.y - Math.cos(B.rot) * hB];
        const L = p1[1] - p0[1]; if (L < 8) continue;
        const sw = Math.sin(s * .8 + k) * 10;
        const path = () => { ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.bezierCurveTo(p1[0] - sw, p1[1] - L * .45, p0[0] + sw, p0[1] + L * .45, p0[0], p0[1]); };
        ctx.setLineDash([]); ctx.globalAlpha = chainA; path(); ctx.strokeStyle = "rgba(255,255,255,.2)"; ctx.lineWidth = 1; ctx.stroke();
        if (k + 1 === target && ink > 0) { path(); ctx.setLineDash([L * 1.15 * qOut(ink), 1e4]); ctx.strokeStyle = W[mod(target)].c; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
        ctx.globalAlpha = 1;
      }
    }
    // iris
    if (irisOpen) {
      const p = clamp((now - irisT0) / irisD); irisV = irisA + (irisB - irisA) * cInOut(p);
      const maxR = Math.hypot(Math.max(irisX, innerWidth - irisX), Math.max(irisY, innerHeight - irisY));
      iris.style.clipPath = `circle(${irisV * maxR}px at ${irisX}px ${irisY}px)`;
      irisPh.style.transformOrigin = `${irisX}px ${irisY}px`; irisPh.style.transform = `scale(${1.35 - .35 * irisV})`;
      if (p >= 1 && irisB === 0) { irisOpen = false; iris.hidden = true; if (irisCard) irisCard.focus({ preventScroll: true }); }
    }
    if ((seen && !document.hidden) || irisOpen) raf = requestAnimationFrame(frame);
  };
  const wake = () => { if (!raf && ((seen && !document.hidden) || irisOpen)) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(es => { seen = es[0].isIntersecting; wake(); }).observe(st);
  document.addEventListener("visibilitychange", wake);
  addEventListener("resize", size);

  // ---- input: the stage owns the wheel, touch and arrows while it fills the window
  let reengage = 0, away = false, wLock = false, wTimer = 0, wStepT = 0, acc = 0;
  addEventListener("scroll", () => { if (scrollY > 4) away = true; else if (away) { away = false; reengage = performance.now() + 500; } }, { passive: true });
  const owns = () => scrollY < 4 && performance.now() > reengage;
  addEventListener("wheel", e => {
    if (irisOpen) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!owns() || e.ctrlKey) return;
    e.preventDefault(); e.stopImmediatePropagation();   // capture phase on window: smooth-scroll (Lenis) never sees it
    const d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * (e.deltaMode ? 30 : 1);
    clearTimeout(wTimer); wTimer = setTimeout(() => { wLock = false; acc = 0; }, 180);
    if (wLock && !(performance.now() - wStepT > 1100 && Math.abs(d) > 40)) return;
    acc += d;
    if (Math.abs(acc) > 24) { step(Math.sign(acc)); acc = 0; wLock = true; wStepT = performance.now(); }
  }, { passive: false, capture: true });
  let ty = null;
  st.addEventListener("touchstart", e => { ty = owns() ? e.touches[0].clientY : null; }, { passive: true });
  st.addEventListener("touchmove", e => { if (ty !== null) e.preventDefault(); }, { passive: false });
  st.addEventListener("touchend", e => { if (ty === null) return; const dy = ty - e.changedTouches[0].clientY; ty = null; if (Math.abs(dy) > 40) step(Math.sign(dy)); });
  addEventListener("keydown", e => {
    if (irisOpen) {
      if (e.key === "Escape") { e.preventDefault(); closeIris(); }
      else if (e.key === "Tab") { const f = [credit.querySelector(".btn"), closeBtn]; e.preventDefault(); (f[0] === document.activeElement ? f[1] : f[0]).focus(); }
      else if ([" ", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(e.key)) e.preventDefault();
      return;
    }
    if (!owns() || e.altKey || e.metaKey || e.ctrlKey || (e.target.closest && e.target.closest("input, textarea, select"))) return;
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowRight" || (k === " " && !e.shiftKey)) { e.preventDefault(); step(1); }
    else if (k === "ArrowUp" || k === "ArrowLeft" || (k === " " && e.shiftKey)) { e.preventDefault(); step(-1); }
    else if (k === "PageDown" || k === "End") { e.preventDefault(); const t = document.getElementById("work-list"); window.lenis ? window.lenis.scrollTo(t, { offset: -80 }) : t.scrollIntoView({ behavior: "smooth" }); }
    else if (k === "Enter" && phase === "chain" && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); cards[mod(target)].click(); }
  });

  caption(W[0]); size(); wake();
  addEventListener("load", size);
})();
