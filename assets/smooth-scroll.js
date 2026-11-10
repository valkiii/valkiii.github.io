/* Smooth scrolling for the portfolio, using Lenis 1.3.26 (MIT, vendored next to this file as lenis.min.js / lenis.css).
   - does nothing when the visitor prefers reduced motion, or if Lenis did not load
   - mouse wheel and keyboard are smoothed, touch stays native (syncTouch: false)
   - Lenis scrolls with window.scrollTo, so native scroll events and IntersectionObserver keep working for the
     existing scroll code (motion.js, the home sphere); lenis.on('scroll') is not needed.
   Parts that must keep their own wheel/scroll (map canvas, tables, code blocks, comments) are listed in PREVENT;
   any element can also opt out with the data-lenis-prevent attribute. */
(() => {
  if (typeof Lenis === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const PREVENT = [
    "[data-lenis-prevent]", "canvas[data-lenis-prevent]",
    ".sg-map", "[class*='sg-map'] canvas", "#mapcanvas",   // study-group map: the wheel zooms
    ".xp-more", ".sg-tablewrap", ".sg-preview", ".prose pre", ".prose table", ".sg-snip pre",
    ".giscus", ".giscus-frame", ".comments iframe",          // comments
    ".sg-filter-panel", "[data-filters]", "[role='listbox']", "textarea", "select",
  ].join(",");
  const OFFSET = -80;   // the fixed header

  const style = document.createElement("style");
  style.textContent = "html.lenis, html.lenis body { height: auto; } html.lenis { scroll-behavior: auto !important; }" +
    " .lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; } .lenis.lenis-stopped { overflow: clip; }" +
    " .lenis.lenis-smooth iframe { pointer-events: auto; }";   // keep embedded games and comments clickable
  document.head.appendChild(style);

  const lenis = new Lenis({
    lerp: 0.1, smoothWheel: true, syncTouch: false, anchors: false, autoRaf: false,
    prevent: node => !!(node.closest && node.closest(PREVENT)),
  });
  window.lenis = lenis;
  const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);

  const go = (hash, immediate) => {
    let el = null;
    try { el = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; } catch (e) {}
    if (hash === "#" || hash === "") { lenis.scrollTo(0, { immediate }); return true; }
    if (!el) return false;
    lenis.scrollTo(el, { offset: OFFSET, immediate });
    return true;
  };
  document.addEventListener("click", e => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href*='#']");
    if (!a || (a.target && a.target !== "_self")) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname !== location.pathname || u.search !== location.search) return;
    if (go(u.hash)) { e.preventDefault(); history.pushState(null, "", u.hash || location.pathname + location.search); }
  });
  if (location.hash) addEventListener("load", () => go(location.hash, true));
})();
