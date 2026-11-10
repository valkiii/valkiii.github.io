/* Movement for the reading pages: things rise into place as they scroll into view, and in a .scrolly section the
   picture on the right follows the paragraph you are reading. Without JavaScript everything is simply visible. */
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("js");

  // rise into view
  const rise = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); rise.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll("[data-reveal], .beat .prose > *, .beat figure.inline").forEach((el, i) => {
    if (still) return el.classList.add("in");
    el.style.setProperty("--d", (i % 4) * 60 + "ms");
    rise.observe(el);
  });

  // scenes: the beat nearest the middle of the window chooses the frame
  document.querySelectorAll(".scrolly").forEach(sec => {
    const beats = [...sec.querySelectorAll(".beat")], frames = [...sec.querySelectorAll(".stage .frame")];
    let cur = null;
    const show = b => {
      if (b === cur) return;
      cur = b;
      beats.forEach(x => x.classList.toggle("on", x === b));
      frames.forEach(f => f.classList.toggle("on", f.dataset.f === b.dataset.f));
    };
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && show(e.target)),
      { rootMargin: "-45% 0px -45% 0px" });
    beats.forEach(b => io.observe(b));
    // the picture drifts a little against the text while its scene is on screen
    if (!still && frames.length) {
      const stage = sec.querySelector(".stage");
      const drift = () => {
        const r = sec.getBoundingClientRect(), p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - innerHeight)));
        stage.style.setProperty("--drift", (p - .5).toFixed(3));
      };
      addEventListener("scroll", drift, { passive: true }); drift();
    }
  });

  // a slow network for scenes that have no pictures of their own
  document.querySelectorAll("canvas.netcanvas").forEach(cv => {
    const ctx = cv.getContext("2d"), css = getComputedStyle(document.documentElement);
    const col = (css.getPropertyValue("--c") || css.getPropertyValue("--uc-tools")).trim() || "#6fe3ff";
    let W, H, pts = [];
    const size = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!pts.length) pts = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, r: 1 + Math.random() * 2.4 }));
    };
    const frame = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) { if (!still) { p.x += p.vx; p.y += p.vy; } if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      ctx.strokeStyle = col; ctx.fillStyle = col;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 120) { ctx.globalAlpha = (1 - d / 120) * .35; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      for (const p of pts) { ctx.globalAlpha = .8; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      if (!still) requestAnimationFrame(frame);
    };
    size(); addEventListener("resize", size); frame();
  });
})();
