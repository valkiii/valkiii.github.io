/* Counts a page view: sends the page, its title, where the visitor came from, the screen width and the browser
   language to the site's own logger (traffic/footfall.py), which adds the time, IP address and browser.
   No cookies, no identifiers stored in the browser. Local previews are not counted unless ?footfall=1. */
(() => {
  const s = document.currentScript, url = s && s.dataset.endpoint;
  if (!url || !navigator.sendBeacon) return;
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) && !/[?&]footfall=1/.test(location.search)) return;
  if (window.self !== window.top) return; // embedded in another page of the site: that page already counted
  const hit = { p: location.pathname, t: document.title.slice(0, 200), r: document.referrer, w: screen.width, l: navigator.language };
  try { navigator.sendBeacon(url, JSON.stringify(hit)); } catch (e) { /* counting must never break the page */ }
})();
